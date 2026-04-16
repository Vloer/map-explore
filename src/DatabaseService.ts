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
    await this.sqlite3.exec(this.db, `
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL,
        lng REAL,
        timestamp INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(lat, lng);
    `);
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
      }

      if (points.length === 0) return;

      await this.sqlite3.exec(this.db, 'BEGIN TRANSACTION');

      try {
        const sql = 'INSERT INTO locations (lat, lng, timestamp) VALUES (?, ?, ?)';
        let insertedCount = 0;

        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          let lastLat = 0;
          let lastLng = 0;

          for (const p of points) {
            const latE7 = p.latE7 ?? p.latitudeE7;
            const lngE7 = p.lngE7 ?? p.longitudeE7;
            
            if (latE7 === undefined || lngE7 === undefined) continue;

            const lat = latE7 / 1e7;
            const lng = lngE7 / 1e7;
            
            if (Math.round(lat * 1e5) === Math.round(lastLat * 1e5) && 
                Math.round(lng * 1e5) === Math.round(lastLng * 1e5)) {
              continue;
            }

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

            lastLat = lat;
            lastLng = lng;
            insertedCount++;
          }
          break; 
        }

        await this.sqlite3.exec(this.db, 'COMMIT');
        console.log(`DatabaseService: Successfully imported ${insertedCount} points`);
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
    // Only query if DB is ready, otherwise return empty
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
