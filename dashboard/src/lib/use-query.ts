// ============================================================================
// WORKSHOP STEP 4.2: CLIENT-SIDE SQL QUERY HOOK WITH PERFORMANCE TIMING
// ============================================================================
// This hook executes arbitrary SQL against the DuckDB-WASM connection and
// returns typed results along with execution time in milliseconds.
//
// 💡 DATA ENGINEERING INSIGHT:
// Each filter change triggers a new SQL query that runs entirely in the user's
// browser thread — no API call, no cold start, no Lambda invocation. On Vercel,
// this means your monthly bill stays at $0 for analytics compute regardless of
// how many users interact with filters, because the "server" is each user's CPU.
// Query latency drops from typical API round-trips (200-500ms) to sub-10ms for
// aggregations on datasets under 100K rows.
// ============================================================================

"use client";

import { useState, useEffect, useCallback } from "react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface QueryResult<T = Record<string, unknown>> {
  data: T[];
  loading: boolean;
  error: string | null;
  executionTimeMs: number | null;
}

/**
 * Execute a SQL query against DuckDB-WASM and return results with timing.
 *
 * @param conn - Active DuckDB-WASM connection (from useDuckDB hook)
 * @param sql - SQL string to execute
 * @param deps - Dependency array that triggers re-execution (like filters)
 */
export function useQuery<T = Record<string, unknown>>(
  conn: AsyncDuckDBConnection | null,
  sql: string,
  deps: unknown[] = []
): QueryResult<T> {
  const [result, setResult] = useState<QueryResult<T>>({
    data: [],
    loading: true,
    error: null,
    executionTimeMs: null,
  });

  useEffect(() => {
    if (!conn || !sql.trim()) {
      setResult({ data: [], loading: false, error: null, executionTimeMs: null });
      return;
    }

    let cancelled = false;

    async function execute() {
      setResult((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Performance timing — proves sub-100ms query speed to workshop participants
        const t0 = performance.now();
        const arrowResult = await conn!.query(sql);
        const t1 = performance.now();

        const executionTimeMs = Math.round((t1 - t0) * 100) / 100;

        // Convert Arrow table to plain JS objects for chart consumption
        const rows = arrowResult.toArray().map((row: { toJSON: () => T }) => row.toJSON()) as T[];

        if (!cancelled) {
          setResult({ data: rows, loading: false, error: null, executionTimeMs });

          // Console output for workshop demo
          console.info(
            `[Query] ${executionTimeMs}ms | ${rows.length} rows | ${sql.slice(0, 60)}...`
          );
        }
      } catch (err) {
        if (!cancelled) {
          setResult({
            data: [],
            loading: false,
            error: err instanceof Error ? err.message : "Query failed",
            executionTimeMs: null,
          });
        }
      }
    }

    execute();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, sql, ...deps]);

  return result;
}

/**
 * Imperative query function for one-off queries (e.g., fetching filter options).
 * Returns the rows directly instead of using React state.
 */
export function useQueryFn(conn: AsyncDuckDBConnection | null) {
  return useCallback(
    async <T = Record<string, unknown>>(sql: string): Promise<{ data: T[]; timeMs: number }> => {
      if (!conn) throw new Error("DuckDB connection not ready");

      const t0 = performance.now();
      const result = await conn.query(sql);
      const t1 = performance.now();

      const data = result.toArray().map((row: { toJSON: () => T }) => row.toJSON()) as T[];
      return { data, timeMs: Math.round((t1 - t0) * 100) / 100 };
    },
    [conn]
  );
}
