#!/usr/bin/env node
// ============================================================================
// STEP 1: DATA QUALITY ASSESSMENT & DIAGNOSTICS
// ============================================================================
// Purpose: Perform an initial audit of raw_dataset.csv BEFORE any transformations.
// We report: schema types, row counts, null/missing counts per column,
// duplicate detection, and categorical inconsistencies.
//
// 💡 DATA ENGINEERING INSIGHT:
// Running diagnostics server-side with DuckDB's columnar engine means we scan
// the CSV once into memory-mapped columnar buffers — no row-by-row parsing loops.
// This keeps memory flat at O(column_count) regardless of row volume, which is
// critical before handing a lean Parquet file to DuckDB-WASM in the browser.
// ============================================================================

import duckdb from 'duckdb';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RAW_CSV = join(ROOT, 'data', 'raw', 'raw_dataset.csv');

// ─── DuckDB Helpers ─────────────────────────────────────────────────────────

function query(con, sql) {
  return new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function exec(con, sql) {
  return new Promise((resolve, reject) => {
    con.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

// ─── Main Assessment ────────────────────────────────────────────────────────

export async function runAssessment() {
  console.info('\n' + '='.repeat(70));
  console.info('  📊 LAYER 1: DATA QUALITY ASSESSMENT & DIAGNOSTICS');
  console.info('='.repeat(70));

  const db = new duckdb.Database(':memory:');
  const con = db.connect();

  // Load the CSV into a temporary table for inspection.
  // We use auto_detect=true so DuckDB infers types — this reveals type mismatches.
  await exec(con, `
    CREATE TABLE raw AS
    SELECT * FROM read_csv_auto('${RAW_CSV.replace(/\\/g, '/')}', header=true, all_varchar=true);
  `);

  // ──────────────────────────────────────────────────────────────────────────
  // 1A. BASIC SHAPE: Row count & column schema
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 1A. DATASET SHAPE ─────────────────────────────────────────┐');

  const rowCount = await query(con, `SELECT COUNT(*) AS total_rows FROM raw;`);
  console.info(`│  Total Rows: ${rowCount[0].total_rows}`);

  const schema = await query(con, `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'raw'
    ORDER BY ordinal_position;
  `);
  console.info('│  Column Schema (as loaded with all_varchar=true):');
  schema.forEach((col) => {
    console.info(`│    • ${col.column_name.padEnd(20)} → ${col.data_type}`);
  });
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 1B. NULL / MISSING VALUE AUDIT
  // We treat empty strings, 'N/A', 'NULL', and actual NULLs as "missing".
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 1B. NULL & MISSING VALUE AUDIT ───────────────────────────┐');

  const columns = schema.map((c) => c.column_name);
  for (const col of columns) {
    const result = await query(con, `
      SELECT
        COUNT(*) FILTER (
          WHERE "${col}" IS NULL
             OR TRIM("${col}") = ''
             OR UPPER(TRIM("${col}")) IN ('N/A', 'NULL', 'NA', 'NONE')
        ) AS missing_count,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE "${col}" IS NULL
               OR TRIM("${col}") = ''
               OR UPPER(TRIM("${col}")) IN ('N/A', 'NULL', 'NA', 'NONE')
          ) / COUNT(*), 1
        ) AS missing_pct
      FROM raw;
    `);
    const { missing_count, missing_pct } = result[0];
    const flag = missing_count > 0 ? ' ⚠️' : ' ✓';
    console.info(
      `│  ${col.padEnd(20)} missing: ${String(missing_count).padStart(3)} (${String(missing_pct).padStart(5)}%)${flag}`
    );
  }
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 1C. DUPLICATE DETECTION
  // Check for exact row duplicates (all columns match).
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 1C. DUPLICATE DETECTION ──────────────────────────────────┐');

  const dupeCheck = await query(con, `
    SELECT COUNT(*) AS total_rows,
           COUNT(*) - COUNT(DISTINCT (
             region, product_category, sales_amount, units_sold,
             transaction_date, customer_segment
           )) AS duplicate_rows
    FROM raw;
  `);
  const { total_rows, duplicate_rows } = dupeCheck[0];
  const dupeFlag = duplicate_rows > 0 ? '⚠️  ACTION REQUIRED' : '✓ Clean';
  console.info(`│  Total rows:     ${total_rows}`);
  console.info(`│  Duplicate rows:  ${duplicate_rows}  ${dupeFlag}`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 1D. CATEGORICAL INCONSISTENCY CHECK
  // Show distinct values for text columns to surface casing/whitespace issues.
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 1D. CATEGORICAL CONSISTENCY CHECK ───────────────────────┐');

  const categoricalCols = ['region', 'product_category', 'customer_segment'];
  for (const col of categoricalCols) {
    const distinct = await query(con, `
      SELECT DISTINCT "${col}" AS val FROM raw ORDER BY "${col}";
    `);
    console.info(`│  ${col}:`);
    distinct.forEach((r) => {
      const display = r.val === null ? '<NULL>' : `'${r.val}'`;
      console.info(`│    - ${display}`);
    });
  }
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 1E. NUMERIC COLUMN TYPE AUDIT
  // Identify values in supposedly-numeric fields that can't cast to DOUBLE.
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 1E. NUMERIC FIELD TYPE AUDIT ─────────────────────────────┐');

  const numericCols = ['sales_amount', 'units_sold'];
  for (const col of numericCols) {
    const badValues = await query(con, `
      SELECT DISTINCT "${col}" AS val
      FROM raw
      WHERE TRY_CAST("${col}" AS DOUBLE) IS NULL
        AND "${col}" IS NOT NULL
        AND TRIM("${col}") != '';
    `);
    if (badValues.length > 0) {
      console.info(`│  ${col}: ⚠️  Non-numeric values found:`);
      badValues.forEach((r) => console.info(`│    - '${r.val}'`));
    } else {
      console.info(`│  ${col}: ✓ All non-null values are numeric`);
    }
  }
  console.info('└─────────────────────────────────────────────────────────────┘');

  console.info('\n✅ Assessment complete. Proceed to Layer 2 (Cleaning).\n');

  // Cleanup
  db.close();

  return { total_rows, duplicate_rows, columns };
}

// Run directly if executed as main script
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('pipeline/01-assess.js');
if (isMain) {
  runAssessment().catch((err) => {
    console.error(`[assess] Fatal: ${err.message}`);
    process.exit(1);
  });
}
