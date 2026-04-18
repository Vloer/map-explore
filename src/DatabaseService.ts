import * as SQLite from 'wa-sqlite';
// @ts-ignore
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-ignore
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { APP_CONFIG } from './Config';
import { metersToE7 } from './Util';

export interface LocationPoint {
  latE7: number;
  lngE7: number;
  timestamp: string;
}

export interface TimelineData {
  rawSignals?: Array<{
    position?: {
      LatLng?: string;
      timestamp?: string;
    };
  }>;
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

  private get snapE7() {
    return metersToE7(APP_CONFIG.DETAIL_RADIUS_METERS);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const nextLock = this.lock.then(fn);
    this.lock = nextLock.then(() => {}, () => {});
    return nextLock;
  }

  async init() {
    return this.withLock(async () => {
      if (this.db !== null) return;

      const module = await SQLiteESMFactory({
        locateFile: (file: string) => file.endsWith('.wasm') ? `/${file}` : file
      });
      this.sqlite3 = SQLite.Factory(module);

      this.vfs = new IDBBatchAtomicVFS('idb-batch');
      this.sqlite3.vfs_register(this.vfs, true);

      this.db = await this.sqlite3.open_v2('world_fog_of_war', SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE, 'idb-batch');

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

    // Primary Key uniqueness remains the same, but the data resolution
    // is controlled by the snap value during import.
    await this.sqlite3.exec(this.db, `
      CREATE TABLE IF NOT EXISTS locations (
        lat_e7 INTEGER,
        lng_e7 INTEGER,
        visit_count INTEGER DEFAULT 1,
        latest_timestamp INTEGER,
        PRIMARY KEY (lat_e7, lng_e7)
      );
      CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(lat_e7, lng_e7);
    `);
  }

  private parseLatLngToE7(s: string): {latE7: number, lngE7: number} | null {
    try {
      const parts = s.split(',');
      if (parts.length !== 2) return null;
      const lat = parseFloat(parts[0].replace(/[^\d.-]/g, ''));
      const lng = parseFloat(parts[1].replace(/[^\d.-]/g, ''));
      if (isNaN(lat) || isNaN(lng)) return null;
      return {
        latE7: Math.round(lat * 1e7),
        lngE7: Math.round(lng * 1e7)
      };
    } catch (e) {
      return null;
    }
  }

  private snap(val: number): number {
    const s = this.snapE7;
    return Math.round(val / s) * s;
  }

  async importGoogleHistory(data: TimelineData) {
    return this.withLock(async () => {
      console.log("DatabaseService: Starting import...");
      if (!this.db) throw new Error("Database not initialized");

      const points: LocationPoint[] = [];

      if (data.rawSignals) {
        for (const signal of data.rawSignals) {
          if (signal.position?.LatLng && signal.position.timestamp) {
            const coords = this.parseLatLngToE7(signal.position.LatLng);
            if (coords) {
              points.push({
                latE7: this.snap(coords.latE7),
                lngE7: this.snap(coords.lngE7),
                timestamp: signal.position.timestamp
              });
            }
          }
        }
      }

      if (data.semanticSegments) {
        for (const segment of data.semanticSegments) {
          if (segment.timelinePath) {
            for (const tp of segment.timelinePath) {
              if (tp.point && tp.time) {
                const coords = this.parseLatLngToE7(tp.point);
                if (coords) points.push({ latE7: this.snap(coords.latE7), lngE7: this.snap(coords.lngE7), timestamp: tp.time });
              }
            }
          }
          const visitLoc = segment.visit?.topCandidate?.placeLocation?.latLng;
          if (visitLoc && segment.startTime) {
            const coords = this.parseLatLngToE7(visitLoc);
            if (coords) points.push({ latE7: this.snap(coords.latE7), lngE7: this.snap(coords.lngE7), timestamp: segment.startTime });
          }
        }
      }

      console.log(`DatabaseService: Extracted ${points.length} points. Snapping to ${this.snapE7} E7 units.`);
      if (points.length === 0) return;

      await this.sqlite3.exec(this.db, 'BEGIN TRANSACTION');

      try {
        const sql = `
          INSERT INTO locations (lat_e7, lng_e7, visit_count, latest_timestamp)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(lat_e7, lng_e7) DO UPDATE SET
            visit_count = visit_count + 1,
            latest_timestamp = MAX(latest_timestamp, excluded.latest_timestamp)
        `;

        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          for (const p of points) {
            const ts = new Date(p.timestamp).getTime();
            this.sqlite3.bind_int(stmt, 1, p.latE7);
            this.sqlite3.bind_int(stmt, 2, p.lngE7);
            this.sqlite3.bind_int64(stmt, 3, BigInt(ts));
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
        console.log(`DatabaseService: Import complete. Unique grid cells: ${finalCount}`);
      } catch (e) {
        console.error("DatabaseService: Import error", e);
        await this.sqlite3.exec(this.db, 'ROLLBACK');
        throw e;
      }
    });
  }

  async getPointsInBounds(minLat: number, maxLat: number, minLng: number, maxLng: number): Promise<{lat: number, lng: number}[]> {
    if (!this.db) return [];

    return this.withLock(async () => {
      const points: {lat: number, lng: number}[] = [];
      const minLatE7 = Math.round(minLat * 1e7);
      const maxLatE7 = Math.round(maxLat * 1e7);
      const minLngE7 = Math.round(minLng * 1e7);
      const maxLngE7 = Math.round(maxLng * 1e7);

      const sql = `
        SELECT lat_e7, lng_e7 FROM locations
        WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
      `;

      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_int(stmt, 1, minLatE7);
          this.sqlite3.bind_int(stmt, 2, maxLatE7);
          this.sqlite3.bind_int(stmt, 3, minLngE7);
          this.sqlite3.bind_int(stmt, 4, maxLngE7);

          while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            points.push({
              lat: this.sqlite3.column_int(stmt, 0) / 1e7,
              lng: this.sqlite3.column_int(stmt, 1) / 1e7
            });
          }
        }
      } catch (e) {
        console.error("DatabaseService: Query error", e);
      }
      return points;
    });
  }

  async getNearestPoint(lat: number, lng: number, radiusDegrees: number): Promise<{lat: number, lng: number, timestamp: number, visits: number} | null> {
    if (!this.db) return null;

    return this.withLock(async () => {
      let nearest: {lat: number, lng: number, timestamp: number, visits: number} | null = null;
      const latE7 = Math.round(lat * 1e7);
      const lngE7 = Math.round(lng * 1e7);
      const radE7 = Math.round(radiusDegrees * 1e7);

      const sql = `
        SELECT lat_e7, lng_e7, latest_timestamp, visit_count
        FROM locations
        WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
        LIMIT 200
      `;

      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_int(stmt, 1, latE7 - radE7);
          this.sqlite3.bind_int(stmt, 2, latE7 + radE7);
          this.sqlite3.bind_int(stmt, 3, lngE7 - radE7);
          this.sqlite3.bind_int(stmt, 4, lngE7 + radE7);

          let minBaseDist = Infinity;
          while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            const pLatE7 = this.sqlite3.column_int(stmt, 0);
            const pLngE7 = this.sqlite3.column_int(stmt, 1);
            const pTime = Number(this.sqlite3.column_int64(stmt, 2));
            const pVisits = this.sqlite3.column_int(stmt, 3);

            const dLat = pLatE7 - latE7;
            const dLng = pLngE7 - lngE7;
            const distSq = dLat * dLat + dLng * dLng;

            if (distSq < minBaseDist) {
              minBaseDist = distSq;
              nearest = { lat: pLatE7 / 1e7, lng: pLngE7 / 1e7, timestamp: pTime, visits: pVisits };
            }
          }
        }
      } catch (e) {
        console.error("DatabaseService: Nearest query error", e);
      }
      return nearest;
    });
  }

  async debugLogSample() {
    if (!this.db) return;
    await this.sqlite3.exec(this.db, 'SELECT lat_e7, lng_e7, visit_count FROM locations LIMIT 5', (row: any[]) => {
      console.log("DB Sample:", row[0]/1e7, row[1]/1e7, "Visits:", row[2]);
    });
    await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM locations', (row: any[]) => {
      console.log("DB Total Unique Coords:", row[0]);
    });
  }
}

export const databaseService = new DatabaseService();
