import * as SQLite from 'wa-sqlite';
// @ts-ignore
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-ignore
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import { APP_CONFIG } from '../Config';
import { metersToE7, getDistanceE7 } from '../Util';
import type { TimelineData, ImportOptions } from '../types';

interface InternalLocationPoint {
  latE7: number;
  lngE7: number;
  timestamp: string;
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
        PRAGMA page_size = ${APP_CONFIG.SQLITE_PAGE_SIZE};
        PRAGMA journal_mode = MEMORY;
        PRAGMA synchronous = NORMAL;
      `);

      await this.createTable();
    });
  }

  private async createTable() {
    if (!this.db) return;

    let needsReset = false;
    await this.sqlite3.exec(this.db, "SELECT name FROM sqlite_master WHERE type='table' AND name='signals'", (row: any[]) => {
      if (!row[0]) needsReset = true;
    });

    if (needsReset) {
      console.log("DatabaseService: Resetting database for new deduplication schema.");
      await this.sqlite3.exec(this.db, "DROP TABLE IF EXISTS locations;");
      await this.sqlite3.exec(this.db, "DROP TABLE IF EXISTS signals;");
    }

    await this.sqlite3.exec(this.db, `
      CREATE TABLE IF NOT EXISTS signals (
        lat_e7 INTEGER,
        lng_e7 INTEGER,
        timestamp INTEGER,
        PRIMARY KEY (lat_e7, lng_e7, timestamp)
      );

      CREATE TABLE IF NOT EXISTS locations (
        lat_e7 INTEGER,
        lng_e7 INTEGER,
        visit_count INTEGER DEFAULT 0,
        latest_timestamp INTEGER,
        PRIMARY KEY (lat_e7, lng_e7)
      );

      CREATE TRIGGER IF NOT EXISTS ai_signals AFTER INSERT ON signals BEGIN
        INSERT INTO locations (lat_e7, lng_e7, visit_count, latest_timestamp)
        VALUES (new.lat_e7, new.lng_e7, 1, new.timestamp)
        ON CONFLICT(lat_e7, lng_e7) DO UPDATE SET
          visit_count = visit_count + 1,
          latest_timestamp = MAX(latest_timestamp, excluded.latest_timestamp);
      END;

      CREATE TABLE IF NOT EXISTS streets_cache (
        osm_id INTEGER,
        osm_type TEXT,
        streets_json TEXT,
        last_updated INTEGER,
        PRIMARY KEY (osm_id, osm_type)
      );
    `);
  }

  async clearDatabase() {
    return this.withLock(async () => {
      if (!this.db) return;
      await this.sqlite3.exec(this.db, "DELETE FROM signals; DELETE FROM locations; DELETE FROM streets_cache; VACUUM;");
      console.log("DatabaseService: Database cleared.");
    });
  }

  async getStreetsCache(osmId: number, osmType: string): Promise<{ streets: any[], lastUpdated: number } | null> {
    if (!this.db) return null;
    return this.withLock(async () => {
      let result: { streets: any[], lastUpdated: number } | null = null;
      const sql = `SELECT streets_json, last_updated FROM streets_cache WHERE osm_id = ? AND osm_type = ?`;
      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_int64(stmt, 1, BigInt(osmId));
          this.sqlite3.bind_text(stmt, 2, osmType);
          if (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            const json = this.sqlite3.column_text(stmt, 0);
            const lastUpdated = Number(this.sqlite3.column_int64(stmt, 1));
            result = {
              streets: JSON.parse(json),
              lastUpdated
            };
          }
        }
      } catch (e) {
        console.error("DatabaseService: Cache lookup error", e);
      }
      return result;
    });
  }

  async saveStreetsCache(osmId: number, osmType: string, streets: any[]) {
    if (!this.db) return;
    return this.withLock(async () => {
      const sql = `INSERT OR REPLACE INTO streets_cache (osm_id, osm_type, streets_json, last_updated) VALUES (?, ?, ?, ?)`;
      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_int64(stmt, 1, BigInt(osmId));
          this.sqlite3.bind_text(stmt, 2, osmType);
          this.sqlite3.bind_text(stmt, 3, JSON.stringify(streets));
          this.sqlite3.bind_int64(stmt, 4, BigInt(Date.now()));
          await this.sqlite3.step(stmt);
        }
        console.debug(`Saved streets data: ${osmType} ${osmId}`)
      } catch (e) {
        console.error("DatabaseService: Cache save error", e);
      }
    });
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

  async importGoogleHistory(data: TimelineData, options: ImportOptions = { includeRawSignals: true, includeSemanticSegments: true }) {
    return this.withLock(async () => {
      console.log(`DatabaseService: Starting import (Raw: ${options.includeRawSignals}, Semantic: ${options.includeSemanticSegments})...`);
      if (!this.db) throw new Error("Database not initialized");

      const points: InternalLocationPoint[] = [];

      if (options.includeRawSignals && data.rawSignals) {
        let lastLatE7 = 0;
        let lastLngE7 = 0;
        for (const signal of data.rawSignals) {
          if (signal.position?.LatLng && signal.position.timestamp) {
            const coords = this.parseLatLngToE7(signal.position.LatLng);
            if (coords) {
              if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
                points.push({
                  latE7: coords.latE7,
                  lngE7: coords.lngE7,
                  timestamp: signal.position.timestamp
                });
                lastLatE7 = coords.latE7;
                lastLngE7 = coords.lngE7;
              }
            }
          }
        }
      }

      if (options.includeSemanticSegments && data.semanticSegments) {
        let lastLatE7 = 0;
        let lastLngE7 = 0;
        for (const segment of data.semanticSegments) {
          if (segment.timelinePath) {
            for (const tp of segment.timelinePath) {
              if (tp.point && tp.time) {
                const coords = this.parseLatLngToE7(tp.point);
                if (coords) {
                  if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
                    points.push({ latE7: coords.latE7, lngE7: coords.lngE7, timestamp: tp.time });
                    lastLatE7 = coords.latE7;
                    lastLngE7 = coords.lngE7;
                  }
                }
              }
            }
          }
          const visitLoc = segment.visit?.topCandidate?.placeLocation?.latLng;
          if (visitLoc && segment.startTime) {
            const coords = this.parseLatLngToE7(visitLoc);
            if (coords) {
              if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
                points.push({ latE7: coords.latE7, lngE7: coords.lngE7, timestamp: segment.startTime });
                lastLatE7 = coords.latE7;
                lastLngE7 = coords.lngE7;
              }
            }
          }
        }
      }

      if (points.length === 0) {
        console.warn("DatabaseService: No points found for import with current options.");
        return;
      }

      await this.sqlite3.exec(this.db, 'BEGIN TRANSACTION');

      try {
        let beforeSignalCount = 0;
        await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM signals', (row: any[]) => beforeSignalCount = row[0]);

        const sql = `INSERT OR IGNORE INTO signals (lat_e7, lng_e7, timestamp) VALUES (?, ?, ?)`;
        
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          for (const p of points) {
            const ts = new Date(p.timestamp).getTime();
            this.sqlite3.bind_int(stmt, 1, this.snap(p.latE7));
            this.sqlite3.bind_int(stmt, 2, this.snap(p.lngE7));
            this.sqlite3.bind_int64(stmt, 3, BigInt(ts));
            await this.sqlite3.step(stmt);
            this.sqlite3.reset(stmt);
          }
          break; 
        }

        await this.sqlite3.exec(this.db, 'COMMIT');
        
        let afterSignalCount = 0;
        await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM signals', (row: any[]) => afterSignalCount = row[0]);
        
        console.log(`DatabaseService: Signals before: ${beforeSignalCount}, after: ${afterSignalCount} (Added: ${afterSignalCount - beforeSignalCount})`);
        
        let finalLocationCount = 0;
        await this.sqlite3.exec(this.db, 'SELECT COUNT(*) FROM locations', (row: any[]) => {
          finalLocationCount = row[0];
        });
        console.log(`DatabaseService: Import complete. Unique grid cells: ${finalLocationCount}`);
        
        await this.sqlite3.exec(this.db, 'VACUUM');
      } catch (e) {
        console.error("DatabaseService: Import error", e);
        await this.sqlite3.exec(this.db, 'ROLLBACK');
        throw e;
      }
    });
  }

  async getPointsInBounds(minLat: number, maxLat: number, minLng: number, maxLng: number, minDetailMeters: number = 0): Promise<{lat: number, lng: number, visits: number}[]> {
    if (!this.db) return [];

    return this.withLock(async () => {
      const points: {lat: number, lng: number, visits: number}[] = [];
      const minLatE7 = Math.round(minLat * 1e7);
      const maxLatE7 = Math.round(maxLat * 1e7);
      const minLngE7 = Math.round(minLng * 1e7);
      const maxLngE7 = Math.round(maxLng * 1e7);

      const factor = Math.max(1, metersToE7(minDetailMeters));
      
      let sql: string;
      if (factor <= this.snapE7) {
        // High detail: standard query
        sql = `
          SELECT lat_e7, lng_e7, visit_count FROM locations 
          WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
        `;
      } else {
        // Low detail: Group by buckets to downsample in-database
        // We use integer division to create buckets and center the points
        sql = `
          SELECT 
            (lat_e7 / ${factor}) * ${factor} + (${factor} / 2) as lat,
            (lng_e7 / ${factor}) * ${factor} + (${factor} / 2) as lng,
            MAX(visit_count) as visits
          FROM locations 
          WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
          GROUP BY lat_e7 / ${factor}, lng_e7 / ${factor}
        `;
      }
      
      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          this.sqlite3.bind_int(stmt, 1, minLatE7);
          this.sqlite3.bind_int(stmt, 2, maxLatE7);
          this.sqlite3.bind_int(stmt, 3, minLngE7);
          this.sqlite3.bind_int(stmt, 4, maxLngE7);

          while (await this.sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
            points.push({
              lat: this.sqlite3.column_int(stmt, 0) / 1e7,
              lng: this.sqlite3.column_int(stmt, 1) / 1e7,
              visits: this.sqlite3.column_int(stmt, 2)
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
        LIMIT ${APP_CONFIG.NEAREST_QUERY_LIMIT}
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
}

export const databaseService = new DatabaseService();
