import { APP_CONFIG } from '../Config';
import { metersToE7, Logger } from '../Util';
import type { Street } from '../types';

/**
 * Represents a processed signal point to be inserted into the database.
 */
export interface SignalPoint {
  latE7: number;
  lngE7: number;
  timestamp: number;
}

interface WorkerMessage {
  id: number;
  type: string;
  result?: any;
  error?: string;
}

/**
 * Service for managing the local SQLite (Wasm) database.
 * Now acts as a proxy to a Web Worker for stability and OPFS support.
 */
export class DatabaseService {
  private worker: Worker | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  /**
   * Initializes the worker and database.
   */
  async init() {
    if (this.worker) return;

    return new Promise<void>((resolve, reject) => {
      try {
        // Initialize the worker using Vite's constructor pattern
        this.worker = new Worker(
          new URL('../workers/sqlite.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const { id, type, result, error } = event.data;
          const pending = this.pendingRequests.get(id);
          
          if (pending) {
            this.pendingRequests.delete(id);
            if (type === 'SUCCESS') {
              pending.resolve(result);
            } else {
              pending.reject(new Error(error));
            }
          }
        };

        this.worker.onerror = (err) => {
          console.error('DatabaseService: Worker error', err);
          reject(err);
        };

        // Trigger initialization with configured grid size
        this.send('init', { gridMeters: APP_CONFIG.UNLOCK_GRID_SIZE_METERS }).then(() => {
          console.log('DatabaseService: Worker initialized.');
          resolve();
        }).catch(reject);

      } catch (err) {
        console.error('DatabaseService: Failed to start worker', err);
        reject(err);
      }
    });
  }

  /**
   * Sends a message to the worker and returns a promise for the result.
   */
  private send(type: string, data?: unknown): Promise<any> {
    if (!this.worker) {
      throw new Error('DatabaseService: Worker not initialized. Call init() first.');
    }

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, data });
    });
  }

  /**
   * Implementation of checkVisitedStreets using the worker.
   */
  async checkVisitedStreets(): Promise<Set<string>> {
    const rows = await this.send('query', {
      sql: `
        SELECT DISTINCT s.street_name, s.place_name 
        FROM street_grid_index s
        JOIN locations l ON s.grid_id = l.grid_id
      `
    }) as { street_name: string, place_name: string }[];

    const visited = new Set<string>();
    for (const row of rows) {
      visited.add(`${row.street_name}|${row.place_name}`);
    }
    return visited;
  }

  /**
   * Updates the street grid index for a set of streets.
   */
  async updateStreetGridIndex(streets: Street[]) {
    Logger.start("db_grid_index_update");
    
    let totalGridCells = 0;
    // We'll process in chunks to balance message overhead vs message size
    const CHUNK_SIZE = 100;
    for (let i = 0; i < streets.length; i += CHUNK_SIZE) {
      const chunk = streets.slice(i, i + CHUNK_SIZE);
      const streetGridData = chunk.map(street => {
        const gridIds = new Set<number>();
        const targetCoords = (street.segments && street.segments.length > 0)
          ? street.segments.flatMap(s => s.coordinates)
          : street.coordinates;

        for (const coord of targetCoords) {
          gridIds.add(this.getGridId(coord.lat, coord.lng));
        }

        totalGridCells += gridIds.size;
        return {
          name: street.name,
          place: street.place,
          gridIds: Array.from(gridIds)
        };
      });

      // Send the chunk to the worker
      await this.send('batchInsertStreetGrid', { items: streetGridData });
    }

    Logger.end("db_grid_index_update", `Indexed ${streets.length} streets into ${totalGridCells} unique grid cells`);
  }

  /**
   * Performs a bulk insert of signal points.
   */
  async bulkInsertSignals(points: SignalPoint[]) {
    if (points.length === 0) return;
    
    await this.send('bulkInsertSignals', { points });
  }

  /**
   * Retrieves cached street data.
   */
  async getStreetsCache(osmId: number, osmType: string): Promise<{ streets: Street[], lastUpdated: number } | null> {
    const rows = await this.send('query', {
      sql: `SELECT last_updated FROM streets_meta WHERE osm_id = ? AND osm_type = ? LIMIT 1`,
      bind: [osmId, osmType]
    }) as { last_updated: number }[];

    if (rows.length === 0) return null;
    const lastUpdated = rows[0].last_updated;

    const dataRows = await this.send('query', {
      sql: `SELECT streets_json FROM streets_data WHERE osm_id = ? AND osm_type = ? LIMIT 1`,
      bind: [osmId, osmType]
    }) as { streets_json: string }[];

    if (dataRows.length === 0) return null;
    return {
      streets: JSON.parse(dataRows[0].streets_json),
      lastUpdated
    };
  }

  /**
   * Saves street data to the cache.
   */
  async saveStreetsCache(osmId: number, osmType: string, streets: Street[]) {
    const now = Date.now();
    await this.send('exec', {
      sql: `INSERT OR REPLACE INTO streets_meta (osm_id, osm_type, last_updated) VALUES (?, ?, ?)`,
      bind: [osmId, osmType, now]
    });
    
    await this.send('exec', {
      sql: `INSERT OR REPLACE INTO streets_data (osm_id, osm_type, streets_json) VALUES (?, ?, ?)`,
      bind: [osmId, osmType, JSON.stringify(streets)]
    });
  }

  /**
   * Retrieves points in bounds.
   */
  async getPointsInBounds(minLat: number, maxLat: number, minLng: number, maxLng: number, minDetailMeters: number = 0): Promise<{lat: number, lng: number, visits: number}[]> {
    const minLatE7 = Math.round(minLat * 1e7);
    const maxLatE7 = Math.round(maxLat * 1e7);
    const minLngE7 = Math.round(minLng * 1e7);
    const maxLngE7 = Math.round(maxLng * 1e7);

    const factor = Math.max(1, metersToE7(minDetailMeters));
    
    let sql: string;
    if (factor <= metersToE7(APP_CONFIG.DETAIL_RADIUS_METERS)) {
      sql = `SELECT lat_e7, lng_e7, visit_count FROM locations WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?`;
    } else {
      sql = `
        SELECT 
          (lat_e7 / ${factor}) * ${factor} + (${factor} / 2) as lat_e7,
          (lng_e7 / ${factor}) * ${factor} + (${factor} / 2) as lng_e7,
          SUM(visit_count) as visit_count
        FROM locations 
        WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
        GROUP BY lat_e7 / ${factor}, lng_e7 / ${factor}
      `;
    }

    const rows = await this.send('query', {
      sql,
      bind: [minLatE7, maxLatE7, minLngE7, maxLngE7]
    }) as { lat_e7: number, lng_e7: number, visit_count: number }[];

    return rows.map((r) => ({
      lat: r.lat_e7 / 1e7,
      lng: r.lng_e7 / 1e7,
      visits: r.visit_count
    }));
  }

  /**
   * Finds the nearest location point and returns aggregated data for its grid cell.
   */
  async getNearestPoint(lat: number, lng: number, radiusDegrees: number): Promise<{lat: number, lng: number, timestamp: number, visits: number} | null> {
    const latE7 = Math.round(lat * 1e7);
    const lngE7 = Math.round(lng * 1e7);
    const radE7 = Math.round(radiusDegrees * 1e7);

    // 1. Find the nearest individual point to determine which grid cell we are looking at
    const rows = await this.send('query', {
      sql: `
        SELECT lat_e7, lng_e7, grid_id
        FROM locations 
        WHERE lat_e7 BETWEEN ? AND ? AND lng_e7 BETWEEN ? AND ?
        LIMIT ${APP_CONFIG.NEAREST_QUERY_LIMIT}
      `,
      bind: [latE7 - radE7, latE7 + radE7, lngE7 - radE7, lngE7 + radE7]
    }) as { lat_e7: number, lng_e7: number, grid_id: number }[];

    if (rows.length === 0) return null;

    let nearestPoint: { lat_e7: number, lng_e7: number, grid_id: number } | null = null;
    let minBaseDist = Infinity;

    for (const row of rows) {
      const dLat = row.lat_e7 - latE7;
      const dLng = row.lng_e7 - lngE7;
      const distSq = dLat * dLat + dLng * dLng;
      
      if (distSq < minBaseDist) {
        minBaseDist = distSq;
        nearestPoint = row;
      }
    }

    if (!nearestPoint) return null;

    // 2. Get aggregated stats for that specific grid cell
    const statsRows = await this.send('query', {
      sql: `
        SELECT 
          MAX(latest_timestamp) as latest_timestamp, 
          SUM(visit_count) as total_visits 
        FROM locations 
        WHERE grid_id = ?
      `,
      bind: [nearestPoint.grid_id]
    }) as { latest_timestamp: number, total_visits: number }[];

    const stats = statsRows[0];

    return { 
      lat: nearestPoint.lat_e7 / 1e7, 
      lng: nearestPoint.lng_e7 / 1e7, 
      timestamp: stats.latest_timestamp, 
      visits: stats.total_visits 
    };
  }

  /**
   * Clears all data.
   */
  async clearDatabase() {
    await this.send('reset');
    console.log("DatabaseService: Database cleared.");
  }

  /**
   * Resets the database and reloads.
   */
  async resetDatabase() {
    await this.send('reset');
    window.location.reload();
  }

  /**
   * Gets a list of track IDs that have already been synced from ulogger.
   */
  async getSyncedUloggerTracks(): Promise<Set<number>> {
    const rows = await this.send('query', {
      sql: 'SELECT ulogger_id FROM synced_tracks'
    }) as { ulogger_id: number }[];
    return new Set(rows.map(r => r.ulogger_id));
  }

  /**
   * Marks a list of track IDs as synced.
   */
  async markTracksAsSynced(ids: number[]) {
    const now = Date.now();
    for (const id of ids) {
      await this.send('exec', {
        sql: 'INSERT OR IGNORE INTO synced_tracks (ulogger_id, sync_date) VALUES (?, ?)',
        bind: [id, now]
      });
    }
  }

  /**
   * Exports the entire database file as a .db download.
   */
  async exportDatabase() {
    console.log("DatabaseService: Exporting database...");
    const bytes = await this.send('export') as BlobPart;
    
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `world-fog-of-war-${timestamp}.db`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log("DatabaseService: Export complete.");
  }

  /**
   * Shared helper for grid IDs.
   */
  public getGridId(lat: number, lng: number): number {
    const gridSizeDegrees = APP_CONFIG.UNLOCK_GRID_SIZE_METERS / APP_CONFIG.METERS_PER_DEGREE;
    const gridSizeE7 = Math.round(gridSizeDegrees * 1e7);
    const latE7 = Math.round(lat * 1e7);
    const lngE7 = Math.round(lng * 1e7);
    const latGrid = Math.floor(latE7 / gridSizeE7);
    const lngGrid = Math.floor(lngE7 / gridSizeE7);
    return (latGrid * 10000000) + lngGrid;
  }
}

export const databaseService = new DatabaseService();
