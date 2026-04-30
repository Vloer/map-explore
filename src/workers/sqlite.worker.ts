import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let db: any = null;
let sqlite3: any = null;

const log = (...args: unknown[]) => console.log('[SQLiteWorker]', ...args);
const error = (...args: unknown[]) => console.error('[SQLiteWorker]', ...args);

/**
 * Initializes the SQLite database in OPFS.
 */
async function init() {
  if (db) return;

  try {
    sqlite3 = await sqlite3InitModule();

    if ('opfs' in sqlite3) {
      db = new sqlite3.oo1.OpfsDb('/world_fog_of_war.db');
      log('OPFS database opened successfully.');
    } else {
      db = new sqlite3.oo1.DB('/world_fog_of_war.db', 'ct');
      log('OPFS not available, using fallback storage.');
    }

    // Standard PRAGMAs for performance
    db.exec(`
      PRAGMA page_size = 4096;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -16000;
    `);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        lat_e7 INTEGER,
        lng_e7 INTEGER,
        timestamp INTEGER,
        PRIMARY KEY (lat_e7, lng_e7, timestamp)
      );

      CREATE TABLE IF NOT EXISTS locations (
        lat_e7 INTEGER,
        lng_e7 INTEGER,
        grid_id INTEGER,
        visit_count INTEGER DEFAULT 0,
        latest_timestamp INTEGER,
        PRIMARY KEY (lat_e7, lng_e7)
      );
      CREATE INDEX IF NOT EXISTS idx_loc_grid_id ON locations(grid_id);

      CREATE TABLE IF NOT EXISTS streets_meta (
        osm_id INTEGER,
        osm_type TEXT,
        last_updated INTEGER,
        PRIMARY KEY (osm_id, osm_type)
      );

      CREATE TABLE IF NOT EXISTS streets_data (
        osm_id INTEGER,
        osm_type TEXT,
        streets_json TEXT,
        PRIMARY KEY (osm_id, osm_type)
      );

      CREATE TABLE IF NOT EXISTS street_grid_index (
        street_name TEXT,
        place_name TEXT,
        grid_id INTEGER,
        PRIMARY KEY (street_name, place_name, grid_id)
      );
      CREATE INDEX IF NOT EXISTS idx_grid_id ON street_grid_index(grid_id);
    `);

    // Define the trigger once
    const gridSizeDegrees = 15 / 111111; // Standard grid size fallback if not passed
    const gridSizeE7 = Math.round(gridSizeDegrees * 1e7);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ai_signals AFTER INSERT ON signals BEGIN
        INSERT INTO locations (lat_e7, lng_e7, grid_id, visit_count, latest_timestamp)
        VALUES (
          new.lat_e7, 
          new.lng_e7, 
          ( (CASE WHEN new.lat_e7 < 0 AND new.lat_e7 % ${gridSizeE7} != 0 THEN (new.lat_e7 / ${gridSizeE7}) - 1 ELSE new.lat_e7 / ${gridSizeE7} END) * 10000000 + 
            (CASE WHEN new.lng_e7 < 0 AND new.lng_e7 % ${gridSizeE7} != 0 THEN (new.lng_e7 / ${gridSizeE7}) - 1 ELSE new.lng_e7 / ${gridSizeE7} END) ),
          1, 
          new.timestamp
        )
        ON CONFLICT(lat_e7, lng_e7) DO UPDATE SET
          visit_count = visit_count + 1,
          latest_timestamp = MAX(latest_timestamp, excluded.latest_timestamp);
      END;
    `);

    // Enable expanded SQL tracing
    // We use the low-level capi to get the expanded SQL (with values) during execution
    sqlite3.capi.sqlite3_trace_v2(
      db.pointer,
      sqlite3.capi.SQLITE_TRACE_STMT,
      (_type: number, _context: any, stmtPtr: number) => {
        const expanded = sqlite3.capi.sqlite3_expanded_sql(stmtPtr);
        if (expanded) {
          // Log a sample of bulk operations to avoid flooding, but show everything else
          if (expanded.includes('INSERT') && Math.random() > 0.05) return 0;
          console.log(`[SQL TRACE] ${expanded}`);
        }
        return 0;
      },
      null
    );

    log('Tables initialized and tracing enabled.');
  } catch (err) {
    error('Initialization failed:', err);
    throw err;
  }
}

// Map of handlers for different message types
const handlers: Record<string, (data: any) => Promise<unknown>> = {
  async init() {
    await init();
    return true;
  },

  async exec({ sql, bind }: { sql: string; bind?: unknown[] }) {
    if (!db) await init();
    db.exec({ sql, bind });
    return true;
  },

  async query({ sql, bind }: { sql: string; bind?: unknown[] }) {
    if (!db) await init();
    const rows: unknown[] = [];
    db.exec({
      sql,
      bind,
      rowMode: 'object',
      callback: (row: unknown) => rows.push(row),
    });
    return rows;
  },

  async bulkInsertSignals({ points }: { points: { latE7: number, lngE7: number, timestamp: number }[] }) {
    if (!db) await init();
    
    try {
      db.exec('BEGIN TRANSACTION');
      const insertSignal = db.prepare('INSERT OR IGNORE INTO signals (lat_e7, lng_e7, timestamp) VALUES (?, ?, ?)');

      for (const p of points) {
        insertSignal.bind([p.latE7, p.lngE7, p.timestamp]).step();
        insertSignal.reset();
      }
      
      insertSignal.finalize();
      db.exec('COMMIT');
      return true;
    } catch (err) {
      db.exec('ROLLBACK');
      error('Bulk insert failed:', err);
      throw err;
    }
  },

  async batchInsertStreetGrid({ items }: { items: { name: string, place: string, gridIds: number[] }[] }) {
    if (!db) await init();
    
    try {
      db.exec('BEGIN TRANSACTION');
      const stmt = db.prepare('INSERT OR IGNORE INTO street_grid_index (street_name, place_name, grid_id) VALUES (?, ?, ?)');

      for (const item of items) {
        for (const gridId of item.gridIds) {
          stmt.bind([item.name, item.place, gridId]).step();
          stmt.reset();
        }
      }

      stmt.finalize();
      db.exec('COMMIT');
      return true;
    } catch (err) {
      db.exec('ROLLBACK');
      error('Batch street grid insert failed:', err);
      throw err;
    }
  },

  async reset() {
    if (!db) await init();
    db.exec(`
      DELETE FROM signals;
      DELETE FROM locations;
      DELETE FROM streets_meta;
      DELETE FROM streets_data;
      DELETE FROM street_grid_index;
      VACUUM;
    `);
    return true;
  },

  async export() {
    if (!db) await init();
    // For persistent DBs (like OpfsDb), use the capi helper to export the bytes
    return sqlite3.capi.sqlite3_js_db_export(db);
  }
};

// Main message listener
self.onmessage = async (event: MessageEvent) => {
  const { type, id, data } = event.data;
  
  if (handlers[type]) {
    try {
      const result = await handlers[type](data);
      self.postMessage({ id, type: 'SUCCESS', result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, type: 'ERROR', error: message });
    }
  } else {
    self.postMessage({ id, type: 'ERROR', error: `Unknown message type: ${type}` });
  }
};

