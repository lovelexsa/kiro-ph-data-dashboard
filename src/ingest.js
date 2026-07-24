#!/usr/bin/env node
// Main ingestion entry point — fetches PH data, persists raw files, loads into DuckDB.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, sources, fetchOptions } from './config.js';
import { openDatabase, ensureSchema, exec, closeDatabase } from './db.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchWithRetry(url, retries = fetchOptions.retries) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchOptions.timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.info(`[fetch] Retrying ${url} (${retries} left)...`);
      return fetchWithRetry(url, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function saveRaw(name, data) {
  mkdirSync(paths.rawDir, { recursive: true });
  const filePath = join(paths.rawDir, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.info(`[raw] Saved ${filePath}`);
}

// ─── Loaders (transform raw → DuckDB) ──────────────────────────────────────

async function loadPopulation(con, data) {
  // Truncate-and-reload for idempotency
  await exec(con, 'DELETE FROM population;');

  const rows = extractRows(data);
  for (const row of rows) {
    const region = escape(row.region ?? 'Unknown');
    const year = Number(row.year) || 0;
    const pop = Number(row.value) || 0;
    await exec(con, `INSERT INTO population VALUES ('${region}', ${year}, ${pop});`);
  }
  console.info(`[load] population: ${rows.length} rows`);
}

async function loadGdp(con, data) {
  await exec(con, 'DELETE FROM gdp;');

  const rows = extractRows(data);
  for (const row of rows) {
    const quarter = escape(row.quarter ?? 'Q1');
    const year = Number(row.year) || 0;
    const value = Number(row.value) || 0;
    await exec(con, `INSERT INTO gdp VALUES ('${quarter}', ${year}, ${value});`);
  }
  console.info(`[load] gdp: ${rows.length} rows`);
}

/**
 * Normalize PSA PXWeb JSON response into flat row objects.
 * Adjust this mapping when real API response shape is confirmed.
 */
function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  // PXWeb responses use a "data" array of { key: [...], values: [...] }
  if (data?.data) {
    return data.data.map((entry) => {
      const keys = entry.key ?? [];
      const values = entry.values ?? [];
      return { region: keys[0], year: keys[1], quarter: keys[1], value: values[0] };
    });
  }
  return [];
}

function escape(str) {
  return str.replace(/'/g, "''");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.info('[ingest] Starting PH data pipeline...');

  const loaders = { population: loadPopulation, gdp: loadGdp };
  const { db, con } = openDatabase();

  try {
    await ensureSchema(con);

    for (const source of sources) {
      try {
        console.info(`[ingest] Fetching ${source.name} from ${source.url}`);
        const data = await fetchWithRetry(source.url);
        saveRaw(source.name, data);

        const loader = loaders[source.name];
        if (loader) {
          await loader(con, data);
        } else {
          console.info(`[ingest] No loader for "${source.name}", raw saved only.`);
        }
      } catch (err) {
        console.error(`[ingest] FAILED ${source.name}: ${err.message}`);
      }
    }

    console.info('[ingest] Pipeline complete.');
  } finally {
    await closeDatabase(db);
  }
}

main().catch((err) => {
  console.error(`[ingest] Fatal: ${err.message}`);
  process.exit(1);
});
