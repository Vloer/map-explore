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
    let hasUnique = false;
    
    await this.sqlite3.exec(this.db, "SELECT sql FROM sqlite_master WHERE name='locations'", (row: any[]) => {
      if (row[0]) {
        tableExists = true;
        if (row[0].includes('UNIQUE')) {
          hasUnique = true;
        }
      }
    });

    if (!tableExists) {
      console.log("DatabaseService: Creating locations table");
      await this.sqlite3.exec(this.db, `
        CREATE TABLE locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL,
          lng REAL,
          timestamp INTEGER,
          UNIQUE(lat, lng, timestamp) ON CONFLICT IGNORE
        );
        CREATE INDEX idx_locations_coords ON locations(lat, lng);
      `);
    } else if (!hasUnique) {
      console.log("DatabaseService: Migration needed - Adding UNIQUE constraint");
      await this.sqlite3.exec(this.db, `
        BEGIN TRANSACTION;
        CREATE TABLE locations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL,
          lng REAL,
          timestamp INTEGER,
          UNIQUE(lat, lng, timestamp) ON CONFLICT IGNORE
        );
        INSERT OR IGNORE INTO locations_new (lat, lng, timestamp) SELECT lat, lng, timestamp FROM locations;
        DROP TABLE locations;
        ALTER TABLE locations_new RENAME TO locations;
        CREATE INDEX idx_locations_coords ON locations(lat, lng);
        COMMIT;
      `);
    }
  }

  async debugLogSample() {
    if (!this.db) return;
    await this.sqlite3.exec(this.db, 'SELECT lat, lng FROM locations LIMIT 5', (row: any[]) => {
      console.log("DB Sample Point:", row[0], row[1]);
    });
    
    await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM locations', (row: any[]) => {
      console.log("DB Total Count:", row[0]);
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

      console.log(`DatabaseService: Parsed ${points.length} points from file.`);
      if (points.length === 0) return;

      await this.sqlite3.exec(this.db, 'BEGIN TRANSACTION');

      try {
        const sql = 'INSERT OR IGNORE INTO locations (lat, lng, timestamp) VALUES (?, ?, ?)';
        
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          for (const p of points) {
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

            let timestampValue: number = 0;
            if (p.timestampMs) {
              timestampValue = typeof p.timestampMs === 'string' ? parseInt(p.timestampMs) : p.timestampMs;
            } else if (p.timestamp) {
              timestampValue = new Date(p.timestamp).getTime();
            }

            this.sqlite3.bind_double(stmt, 1, lat);
            this.sqlite3.bind_double(stmt, 2, lng);
            this.sqlite3.bind_int64(stmt, 3, BigInt(timestampValue));

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
        console.log(`DatabaseService: Import finished. Total unique points in DB: ${finalCount}`);
      } catch (e) {
        console.error("DatabaseService: Error during import", e);
        try {
          await this.sqlite3.exec(this.db, 'ROLLBACK');
        } catch (err) {}
        throw e;
      }
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
}

export const databaseService = new DatabaseService();
