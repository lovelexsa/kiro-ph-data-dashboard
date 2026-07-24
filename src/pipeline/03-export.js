#!/usr/bin/env node
// ============================================================================
// STEP 3: EXPORT & POST-QUALITY VALIDATION PIPELINE
// ============================================================================
// Purpose: Run automated assertion checks on the cleaned table, then export
// to 'cleaned_dataset.parquet' with Snappy compression.
//
// Validation gates (any failure = pipeline abort):
//   ✓ Zero nulls in ALL core fields
//   ✓ Row count within expected boundaries (no catastrophic data loss)
//   ✓ Numeric fields have valid ranges (no negatives in sales/units)
//   ✓ Date column has no future dates
//   ✓ No duplicate business keys remain
//
// 💡 DATA ENGINEERING INSIGHT:
// Exporting to Parquet with Snappy compression on the server side produces a
// file 5-10x smaller than the source CSV with zero schema ambiguity — column
// types, nullability, and encoding are embedded in the file metadata. When
// DuckDB-WASM loads this Parquet in the browser, it skips type inference
// entirely and can predicate-pushdown directly into column chunks.
// ============================================================================

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUTPUT_DIR = join(ROOT, 'data');
const PARQUET_PATH = join(OUTPUT_DIR, 'cleaned_dataset.parquet');

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

// ─── Assertion Helper ───────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(check, message) {
    super(`[VALIDATION FAILED] ${check}: ${message}`);
    this.check = check;
  }
}

function assert(condition, checkName, message) {
  if (!condition) {
    throw new ValidationError(checkName, message);
  }
  console.info(`│  ✓ ${checkName}`);
}

// ─── Main Export & Validation ───────────────────────────────────────────────

/**
 * @param {object} con - DuckDB connection (with "cleaned" table already present)
 * @param {object} db - DuckDB database instance
 * @param {number} expectedMinRows - Minimum acceptable row count (sanity check)
 */
export async function runExport(con, db, { expectedMinRows = 10 } = {}) {
  console.info('\n' + '='.repeat(70));
  console.info('  📦 LAYER 3: EXPORT & POST-QUALITY VALIDATION');
  console.info('='.repeat(70));

  // ──────────────────────────────────────────────────────────────────────────
  // 3A. POST-QUALITY ASSERTION CHECKS
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 3A. AUTOMATED QUALITY ASSERTIONS ─────────────────────────┐');

  // CHECK 1: Zero nulls in all core fields
  const nullCheck = await query(con, `
    SELECT
      COUNT(*) FILTER (WHERE transaction_id IS NULL) AS null_txn_id,
      COUNT(*) FILTER (WHERE region IS NULL) AS null_region,
      COUNT(*) FILTER (WHERE product_category IS NULL) AS null_category,
      COUNT(*) FILTER (WHERE sales_amount IS NULL) AS null_sales,
      COUNT(*) FILTER (WHERE units_sold IS NULL) AS null_units,
      COUNT(*) FILTER (WHERE transaction_date IS NULL) AS null_date,
      COUNT(*) FILTER (WHERE customer_segment IS NULL) AS null_segment
    FROM cleaned;
  `);
  const nc = nullCheck[0];
  // DuckDB Node.js driver returns BigInt for COUNT — coerce to Number for comparison
  const totalNulls = Number(
    nc.null_txn_id + nc.null_region + nc.null_category +
    nc.null_sales + nc.null_units + nc.null_date + nc.null_segment
  );
  assert(
    totalNulls === 0,
    'ZERO NULLS',
    `Found ${totalNulls} null(s): txn=${nc.null_txn_id}, region=${nc.null_region}, ` +
    `cat=${nc.null_category}, sales=${nc.null_sales}, units=${nc.null_units}, ` +
    `date=${nc.null_date}, seg=${nc.null_segment}`
  );

  // CHECK 2: Row count boundaries
  const rowCount = await query(con, `SELECT COUNT(*) AS n FROM cleaned;`);
  const n = Number(rowCount[0].n);
  assert(
    n >= expectedMinRows,
    `ROW COUNT >= ${expectedMinRows}`,
    `Only ${n} rows — possible catastrophic data loss during cleaning`
  );
  console.info(`│    (actual: ${n} rows)`);

  // CHECK 3: Numeric range validity
  const rangeCheck = await query(con, `
    SELECT
      MIN(sales_amount) AS min_sales,
      MIN(units_sold) AS min_units
    FROM cleaned;
  `);
  assert(
    rangeCheck[0].min_sales >= 0,
    'SALES >= 0',
    `Negative sales_amount detected: ${rangeCheck[0].min_sales}`
  );
  assert(
    rangeCheck[0].min_units >= 0,
    'UNITS >= 0',
    `Negative units_sold detected: ${rangeCheck[0].min_units}`
  );

  // CHECK 4: No future transaction dates
  const futureCheck = await query(con, `
    SELECT COUNT(*) AS future_dates
    FROM cleaned
    WHERE transaction_date > CURRENT_DATE;
  `);
  assert(
    Number(futureCheck[0].future_dates) === 0,
    'NO FUTURE DATES',
    `Found ${futureCheck[0].future_dates} transaction(s) with future dates`
  );

  // CHECK 5: No remaining duplicates on business key
  const dupeCheck = await query(con, `
    SELECT COUNT(*) AS dupes FROM (
      SELECT 1
      FROM cleaned
      GROUP BY region, product_category, sales_amount, units_sold,
               transaction_date, customer_segment
      HAVING COUNT(*) > 1
    );
  `);
  assert(
    Number(dupeCheck[0].dupes) === 0,
    'NO DUPLICATES',
    `Found ${dupeCheck[0].dupes} duplicate group(s) on business key`
  );

  console.info('│');
  console.info('│  ══ All assertions passed ══');
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 3B. EXPORT TO PARQUET (Snappy compression)
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 3B. PARQUET EXPORT (SNAPPY) ─────────────────────────────┐');

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const parquetPathForSql = PARQUET_PATH.replace(/\\/g, '/');

  await exec(con, `
    COPY cleaned TO '${parquetPathForSql}'
    (FORMAT PARQUET, CODEC 'SNAPPY');
  `);
  console.info(`│  Exported: ${PARQUET_PATH}`);
  console.info(`│  Rows written: ${n}`);
  console.info(`│  Compression: SNAPPY`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 3C. VERIFY PARQUET READBACK
  // Quick sanity: re-read the Parquet file and confirm row count matches.
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 3C. PARQUET READBACK VERIFICATION ───────────────────────┐');

  const readback = await query(con, `
    SELECT COUNT(*) AS n FROM read_parquet('${parquetPathForSql}');
  `);
  assert(
    Number(readback[0].n) === n,
    'READBACK ROW COUNT',
    `Parquet has ${readback[0].n} rows, expected ${n}`
  );

  // Show the Parquet schema for confirmation
  const parquetSchema = await query(con, `
    DESCRIBE SELECT * FROM read_parquet('${parquetPathForSql}');
  `);
  console.info('│  Parquet Schema:');
  parquetSchema.forEach((col) => {
    console.info(`│    • ${col.column_name.padEnd(20)} ${col.column_type}`);
  });
  console.info('└─────────────────────────────────────────────────────────────┘');

  console.info('\n🎉 Pipeline SUCCESS — cleaned_dataset.parquet is production-ready.\n');

  return { outputPath: PARQUET_PATH, rowCount: n };
}

// Run directly if executed as standalone (requires 02-clean to have run first)
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('pipeline/03-export.js');
if (isMain) {
  // Standalone mode: re-run cleaning then export
  const { runCleaning } = await import('./02-clean.js');
  const { db, con, finalRowCount } = await runCleaning();
  try {
    await runExport(con, db, { expectedMinRows: 10 });
  } finally {
    db.close();
  }
}
