// ============================================================================
// WORKSHOP STEP 4.1: DuckDB-WASM INITIALIZATION & PARQUET LOADING
// ============================================================================
// This hook initializes DuckDB-WASM in the browser, fetches the Parquet file
// from the public directory, and registers it in DuckDB's virtual filesystem.
//
// 💡 DATA ENGINEERING INSIGHT:
// By initializing DuckDB-WASM once and registering the Parquet file into the
// in-browser virtual filesystem, all subsequent SQL queries execute against
// memory-mapped columnar data with zero network round-trips. This eliminates
// API server costs entirely — Vercel only serves the static Parquet file once,
// then the user's CPU handles all analytical queries at native WASM speed.
// ============================================================================

"use client";

import { useState, useEffect, useRef } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";

// DuckDB-WASM bundle URLs (served from jsDelivr CDN for reliable static deployment)
const DUCKDB_VERSION = "1.33.1-dev57.0";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist`;

const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: `${CDN_BASE}/duckdb-mvp.wasm`,
    mainWorker: `${CDN_BASE}/duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${CDN_BASE}/duckdb-eh.wasm`,
    mainWorker: `${CDN_BASE}/duckdb-browser-eh.worker.js`,
  },
};

export interface DuckDBState {
  db: duckdb.AsyncDuckDB | null;
  conn: duckdb.AsyncDuckDBConnection | null;
  loading: boolean;
  error: string | null;
}

/**
 * React hook that initializes DuckDB-WASM and loads cleaned_dataset.parquet.
 * Returns { db, conn, loading, error } for use in query hooks.
 */
export function useDuckDB(): DuckDBState {
  const [state, setState] = useState<DuckDBState>({
    db: null,
    conn: null,
    loading: true,
    error: null,
  });
  const initRef = useRef(false);

  useEffect(() => {
    // Prevent double-initialization in React StrictMode
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      try {
        // Step 1: Select the best bundle for this browser
        const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);

        // Step 2: Create the worker and instantiate DuckDB
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        // Step 3: Fetch the Parquet file and register it in the virtual FS
        const parquetResponse = await fetch("/data/cleaned_dataset.parquet");
        if (!parquetResponse.ok) {
          throw new Error(`Failed to fetch Parquet: HTTP ${parquetResponse.status}`);
        }
        const parquetBuffer = new Uint8Array(await parquetResponse.arrayBuffer());

        // registerFileBuffer makes the file accessible as a path inside DuckDB
        await db.registerFileBuffer("cleaned_dataset.parquet", parquetBuffer);

        // Step 4: Open a connection for queries
        const conn = await db.connect();

        // Verify the file loaded correctly
        const result = await conn.query(`
          SELECT COUNT(*) AS row_count FROM 'cleaned_dataset.parquet'
        `);
        const rows = result.toArray();
        console.info(
          `[DuckDB-WASM] Parquet loaded: ${rows[0]?.row_count} rows ready for queries`
        );

        setState({ db, conn, loading: false, error: null });
      } catch (err) {
        console.error("[DuckDB-WASM] Initialization failed:", err);
        setState({
          db: null,
          conn: null,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    init();
  }, []);

  return state;
}
