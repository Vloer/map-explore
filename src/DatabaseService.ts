import * as SQLite from 'wa-sqlite';
// @ts-ignore
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-ignore
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

export interface LocationPoint {
  latitudeE7?: number;
  longitudeE7?: number;
  latE7?: number;
  lngE7?: number;
  lat?: number;
  lng?: number;
  timestampMs?: string | number;
  timestamp?: string;
}

export interface TimelineData {
  timelineEdits?: Array<{
    rawSignal?: {
      signal?: {
        position?: {
          point?: {
            latE7: number;
            lngE7: number;
          };
          timestamp?: string;
        }
      }
    }
  }>;
  locations?: LocationPoint[];
  semanticSegments?: Array<{
    startTime?: string;
    endTime?: string;
    timelinePath?: Array<{
      point?: string;
      time?: string;
    }>;
    visit?: {
      topCandidate?: {
        placeLocation?: {
          latLng?: string;
        }
      }
    };
    activity?: {
      start?: { latLng?: string };
      end?: { latLng?: string };
    }
  }>;
}

export class DatabaseService {
  private sqlite3: any;
  private db: number | null = null;
  private vfs: any;
  private lock: Promise<void> = Promise.resolve();

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const nextLock = this.lock.then(fn);
    this.lock = nextLock.then(() => {}, () => {});
    return nextLock;
  }

  async init() {
    return this.withLock(async () => {
      if (this.db !== null) return;

      console.log("DatabaseService: Initializing...");
      const module = await SQLiteESMFactory({
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            return `/${file}`;
          }
          return file;
        }
      });
      this.sqlite3 = SQLite.Factory(module);

      this.vfs = new IDBBatchAtomicVFS('idb-batch');
      this.sqlite3.vfs_register(this.vfs, true);

      const flags = SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE;
      this.db = await this.sqlite3.open_v2('world_fog_of_war', flags, 'idb-batch');

      if (!this.db) {
        throw new Error("Failed to open database");
      }

      await this.sqlite3.exec(this.db, `
        PRAGMA page_size = 8192;
        PRAGMA journal_mode = MEMORY;
        PRAGMA synchronous = NORMAL;
      `);

      await this.createTable();
    });
  }

  private async createTable() {
    if (!this.db) return;

    let tableExists = false;
    let schemaSql = "";

    await this.sqlite3.exec(this.db, "SELECT sql FROM sqlite_master WHERE name='locations'", (row: any[]) => {
      if (row[0]) {
        tableExists = true;
        schemaSql = row[0];
      }
    });

    // We want a UNIQUE constraint on (lat, lng) to allow "Upserting" the timestamp.
    // If the schema is old (includes timestamp in UNIQUE or no UNIQUE), we migrate.
    const desiredUnique = 'UNIQUE(lat, lng)';
    if (!tableExists || !schemaSql.includes(desiredUnique)) {
      console.log("DatabaseService: Table creation or migration needed.");
      await this.sqlite3.exec(this.db, `
        BEGIN TRANSACTION;
        CREATE TABLE IF NOT EXISTS locations_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL,
          lng REAL,
          timestamp INTEGER,
          UNIQUE(lat, lng) ON CONFLICT REPLACE
        );
      `);

      if (tableExists) {
        // Copy old data into new table. ON CONFLICT REPLACE ensures we keep one record per coord.
        // To keep the LATEST timestamp, we should ideally sort by timestamp, but for simplicity
        // we just insert.
        await this.sqlite3.exec(this.db, `
          INSERT OR REPLACE INTO locations_v2 (lat, lng, timestamp)
          SELECT lat, lng, timestamp FROM locations ORDER BY timestamp ASC;
        `);
        await this.sqlite3.exec(this.db, `DROP TABLE locations;`);
      }

      await this.sqlite3.exec(this.db, `
        ALTER TABLE locations_v2 RENAME TO locations;
        CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(lat, lng);
        COMMIT;
      `);
    }
  }

  async importGoogleHistory(data: TimelineData) {
    return this.withLock(async () => {
      console.log("DatabaseService: Starting import...");
      if (!this.db) throw new Error("Database not initialized");

      let points: LocationPoint[] = [];

      if (data.locations) {
        points = data.locations;
      } else if (data.timelineEdits) {
        for (const edit of data.timelineEdits) {
          const point = edit.rawSignal?.signal?.position?.point;
          if (point) {
            points.push({
              latE7: point.latE7,
              lngE7: point.lngE7,
              timestamp: edit.rawSignal?.signal?.position?.timestamp
            });
          }
        }
      } else if (data.semanticSegments) {
        for (const segment of data.semanticSegments) {
          if (segment.timelinePath) {
            for (const tp of segment.timelinePath) {
              if (tp.point) {
                const p = this.parseLatLngString(tp.point);
                if (p) points.push({ lat: p.lat, lng: p.lng, timestamp: tp.time });
              }
            }
          }
          const visitLoc = segment.visit?.topCandidate?.placeLocation?.latLng;
          if (visitLoc) {
            const p = this.parseLatLngString(visitLoc);
            if (p) points.push({ lat: p.lat, lng: p.lng, timestamp: segment.startTime });
          }
          if (segment.activity) {
            if (segment.activity.start?.latLng) {
              const p = this.parseLatLngString(segment.activity.start.latLng);
              if (p) points.push({ lat: p.lat, lng: p.lng, timestamp: segment.startTime });
            }
            if (segment.activity.end?.latLng) {
              const p = this.parseLatLngString(segment.activity.end.latLng);
              if (p) points.push({ lat: p.lat, lng: p.lng, timestamp: segment.endTime });
            }
          }
        }
      }

      if (points.length === 0) return;

      // Sort points by timestamp ascending so that later points replace earlier ones during import
      const sortedPoints = points.map(p => {
        let ts = 0;
        if (p.timestampMs) ts = typeof p.timestampMs === 'string' ? parseInt(p.timestampMs) : p.timestampMs;
        else if (p.timestamp) ts = new Date(p.timestamp).getTime();
        return { ...p, calculatedTs: ts };
      }).sort((a, b) => a.calculatedTs - b.calculatedTs);

      await this.sqlite3.exec(this.db, 'BEGIN TRANSACTION');

      try {
        // ON CONFLICT REPLACE ensures we update the timestamp if coord exists
        const sql = 'INSERT OR REPLACE INTO locations (lat, lng, timestamp) VALUES (?, ?, ?)';

        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          for (const p of sortedPoints) {
            let lat: number;
            let lng: number;

            if (p.lat !== undefined && p.lng !== undefined) {
              lat = p.lat;
              lng = p.lng;
            } else {
              const latE7 = p.latE7 ?? p.latitudeE7;
              const lngE7 = p.lngE7 ?? p.longitudeE7;
              if (latE7 === undefined || lngE7 === undefined) continue;
              lat = latE7 / 1e7;
              lng = lngE7 / 1e7;
            }

            lat = Math.round(lat * 1e7) / 1e7;
            lng = Math.round(lng * 1e7) / 1e7;

            this.sqlite3.bind_double(stmt, 1, lat);
            this.sqlite3.bind_double(stmt, 2, lng);
            this.sqlite3.bind_int64(stmt, 3, BigInt(p.calculatedTs));

            await this.sqlite3.step(stmt);
            this.sqlite3.reset(stmt);
          }
          break;
        }

        await this.sqlite3.exec(this.db, 'COMMIT');

        let finalCount = 0;
        await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM locations', (row: any[]) => {
          finalCount = row[0];
        });
        console.log(`DatabaseService: Import finished. Total unique coords in DB: ${finalCount}`);
      } catch (e) {
        console.error("DatabaseService: Error during import", e);
        try {
          await this.sqlite3.exec(this.db, 'ROLLBACK');
        } catch (err) {}
        throw e;
      }
    });
  }

  async getNearestPoint(lat: number, lng: number, radiusDegrees: number): Promise<{lat: number, lng: number, timestamp: number} | null> {
    if (!this.db) return null;

    return this.withLock(async () => {
      let nearest: {lat: number, lng: number, timestamp: number} | null = null;
      const sql = `
        SELECT lat, lng, timestamp
        FROM locations
        WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
        LIMIT 200
      `;

      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_double(stmt, 1, lat - radiusDegrees);
          this.sqlite3.bind_double(stmt, 2, lat + radiusDegrees);
          this.sqlite3.bind_double(stmt, 3, lng - radiusDegrees);
          this.sqlite3.bind_double(stmt, 4, lng + radiusDegrees);

          let minBaseDist = Infinity;
          while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            const pLat = this.sqlite3.column_double(stmt, 0);
            const pLng = this.sqlite3.column_double(stmt, 1);
            const pTime = Number(this.sqlite3.column_int64(stmt, 2));

            const dLat = pLat - lat;
            const dLng = pLng - lng;
            const distSq = dLat * dLat + dLng * dLng;

            if (distSq < minBaseDist) {
              minBaseDist = distSq;
              nearest = { lat: pLat, lng: pLng, timestamp: pTime };
            }
          }
        }
      } catch (e) {
        console.error("DatabaseService: Nearest query error", e);
      }
      return nearest;
    });
  }

  async getPointsInBounds(minLat: number, maxLat: number, minLng: number, maxLng: number): Promise<{lat: number, lng: number}[]> {
    if (!this.db) return [];

    return this.withLock(async () => {
      const points: {lat: number, lng: number}[] = [];
      const sql = `SELECT lat, lng FROM locations WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;

      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_double(stmt, 1, minLat);
          this.sqlite3.bind_double(stmt, 2, maxLat);
          this.sqlite3.bind_double(stmt, 3, minLng);
          this.sqlite3.bind_double(stmt, 4, maxLng);

          while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            points.push({
              lat: this.sqlite3.column_double(stmt, 0),
              lng: this.sqlite3.column_double(stmt, 1)
            });
          }
        }
      } catch (e) {
        console.error("DatabaseService: Query error", e);
      }
      return points;
    });
  }

  private parseLatLngString(s: string): {lat: number, lng: number} | null {
    try {
      const parts = s.split(',');
      if (parts.length !== 2) return null;
      const lat = parseFloat(parts[0].replace(/[^\d.-]/g, ''));
      const lng = parseFloat(parts[1].replace(/[^\d.-]/g, ''));
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
    } catch (e) {
      return null;
    }
  }
}

export const databaseService = new DatabaseService();
