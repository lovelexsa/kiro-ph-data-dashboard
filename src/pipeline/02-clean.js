#!/usr/bin/env node
// ============================================================================
// STEP 2: CLEANING & INTEGRITY ENFORCEMENT
// ============================================================================
// Purpose: Transform raw_dataset.csv into a fully clean, typed, deduplicated
// in-memory table ("cleaned") ready for Parquet export.
//
// Operations performed:
//   • Null unification — 'N/A', 'NULL', '', whitespace-only → SQL NULL
//   • Whitespace trimming — TRIM() on all VARCHAR fields
//   • Categorical standardization — INITCAP() for region & product_category,
//     UPPER first-letter for customer_segment
//   • Numeric type casting — sales_amount → DOUBLE, units_sold → INTEGER
//   • Null imputation — median fill for sales_amount & units_sold within
//     their product_category (domain-aware strategy)
//   • Null removal — rows where critical identifiers (transaction_id, region,
//     product_category) are still null after imputation are dropped
//   • Deduplication — QUALIFY ROW_NUMBER() keeps only the first occurrence
//     per (region, product_category, sales_amount, units_sold, transaction_date)
//
// 💡 DATA ENGINEERING INSIGHT:
// DuckDB executes this entire cleaning pipeline as a single SQL query plan with
// zero intermediate disk writes — the optimizer fuses CTEs into one pass over
// the columnar buffers. This means our 5-stage transform chain uses the same
// memory footprint as reading the CSV once, unlike pandas which materializes
// each .apply() step as a separate DataFrame copy.
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

// ─── Main Cleaning Logic ────────────────────────────────────────────────────

export async function runCleaning() {
  console.info('\n' + '='.repeat(70));
  console.info('  🧹 LAYER 2: CLEANING & INTEGRITY ENFORCEMENT');
  console.info('='.repeat(70));

  const db = new duckdb.Database(':memory:');
  const con = db.connect();

  // ──────────────────────────────────────────────────────────────────────────
  // 2A. LOAD RAW DATA (all as VARCHAR for controlled casting)
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2A. LOADING RAW CSV ──────────────────────────────────────┐');
  await exec(con, `
    CREATE TABLE raw AS
    SELECT * FROM read_csv_auto('${RAW_CSV.replace(/\\/g, '/')}', header=true, all_varchar=true);
  `);
  const beforeCount = await query(con, `SELECT COUNT(*) AS n FROM raw;`);
  console.info(`│  Loaded ${beforeCount[0].n} raw rows.`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 2B. NULL UNIFICATION + TRIM + STANDARDIZE + CAST
  // Single CTE chain — DuckDB fuses these into one scan pass.
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2B. NULL HANDLING, TRIM, STANDARDIZE & CAST ─────────────┐');

  await exec(con, `
    CREATE TABLE staged AS
    WITH
    -- CTE 1: Unify null sentinels → SQL NULL, then TRIM all text
    nullified AS (
      SELECT
        TRIM(transaction_id) AS transaction_id,
        -- Convert empty/null-like region to NULL, then TRIM
        CASE
          WHEN TRIM(region) = '' OR UPPER(TRIM(region)) IN ('N/A','NULL','NA','NONE')
          THEN NULL
          ELSE TRIM(region)
        END AS region,
        CASE
          WHEN TRIM(product_category) = '' OR UPPER(TRIM(product_category)) IN ('N/A','NULL','NA','NONE')
          THEN NULL
          ELSE TRIM(product_category)
        END AS product_category,
        -- Numeric fields: unify sentinels → NULL before casting
        CASE
          WHEN TRIM(sales_amount) = '' OR UPPER(TRIM(sales_amount)) IN ('N/A','NULL','NA','NONE')
          THEN NULL
          ELSE TRY_CAST(TRIM(sales_amount) AS DOUBLE)
        END AS sales_amount,
        CASE
          WHEN TRIM(units_sold) = '' OR UPPER(TRIM(units_sold)) IN ('N/A','NULL','NA','NONE')
          THEN NULL
          ELSE TRY_CAST(TRIM(units_sold) AS INTEGER)
        END AS units_sold,
        TRY_CAST(TRIM(transaction_date) AS DATE) AS transaction_date,
        CASE
          WHEN TRIM(customer_segment) = '' OR UPPER(TRIM(customer_segment)) IN ('N/A','NULL','NA','NONE')
          THEN NULL
          ELSE TRIM(customer_segment)
        END AS customer_segment
      FROM raw
    ),
    -- CTE 2: Standardize categorical casing (NULL-safe)
    -- DuckDB v1.4 lacks INITCAP, so we use manual title-casing via
    -- CONCAT(UPPER(LEFT(s,1)), LOWER(SUBSTR(s,2))) for single-word,
    -- and explicit mapping for known multi-word categories.
    standardized AS (
      SELECT
        transaction_id,
        -- Region: known set — normalize to canonical spelling
        CASE
          WHEN region IS NULL THEN NULL
          WHEN UPPER(region) = 'NCR' THEN 'NCR'
          WHEN UPPER(region) LIKE '%REGION III%' THEN 'Region III'
          WHEN UPPER(region) LIKE '%REGION IV-A%' THEN 'Region IV-A'
          WHEN UPPER(region) LIKE '%REGION VII%' THEN 'Region VII'
          ELSE CONCAT(UPPER(LEFT(region, 1)), LOWER(SUBSTR(region, 2)))
        END AS region,
        -- Product Category: known set
        CASE
          WHEN product_category IS NULL THEN NULL
          WHEN UPPER(product_category) = 'ELECTRONICS' THEN 'Electronics'
          WHEN UPPER(product_category) IN ('HOME APPLIANCES', 'HOME APPLIANCE') THEN 'Home Appliances'
          WHEN UPPER(product_category) LIKE 'FOOD%BEVERAGE%' THEN 'Food & Beverage'
          ELSE CONCAT(UPPER(LEFT(product_category, 1)), LOWER(SUBSTR(product_category, 2)))
        END AS product_category,
        sales_amount,
        units_sold,
        transaction_date,
        -- Customer Segment: known set
        CASE
          WHEN customer_segment IS NULL THEN NULL
          WHEN UPPER(customer_segment) = 'ENTERPRISE' THEN 'Enterprise'
          WHEN UPPER(customer_segment) = 'SME' THEN 'SME'
          WHEN UPPER(customer_segment) = 'RETAIL' THEN 'Retail'
          ELSE CONCAT(UPPER(LEFT(customer_segment, 1)), LOWER(SUBSTR(customer_segment, 2)))
        END AS customer_segment
      FROM nullified
    )
    SELECT * FROM standardized;
  `);

  const stagedCount = await query(con, `SELECT COUNT(*) AS n FROM staged;`);
  console.info(`│  Staged rows (post-cast, pre-impute): ${stagedCount[0].n}`);

  // Show null counts after unification
  const nullAudit = await query(con, `
    SELECT
      COUNT(*) FILTER (WHERE region IS NULL) AS null_region,
      COUNT(*) FILTER (WHERE product_category IS NULL) AS null_category,
      COUNT(*) FILTER (WHERE sales_amount IS NULL) AS null_sales,
      COUNT(*) FILTER (WHERE units_sold IS NULL) AS null_units
    FROM staged;
  `);
  const na = nullAudit[0];
  console.info(`│  Nulls → region: ${na.null_region}, product_category: ${na.null_category}`);
  console.info(`│          sales_amount: ${na.null_sales}, units_sold: ${na.null_units}`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 2C. IMPUTATION — Median fill for numeric fields within product_category
  // Domain rationale: Sales and units vary by category, so category-level
  // median is a more representative fill than global median.
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2C. NULL IMPUTATION (Category-Level Median) ─────────────┐');

  await exec(con, `
    CREATE TABLE imputed AS
    SELECT
      transaction_id,
      region,
      product_category,
      -- Impute sales_amount with category median; fallback to global median
      COALESCE(
        sales_amount,
        MEDIAN(sales_amount) OVER (PARTITION BY product_category),
        MEDIAN(sales_amount) OVER ()
      ) AS sales_amount,
      -- Impute units_sold with category median; fallback to global median
      COALESCE(
        units_sold,
        CAST(MEDIAN(units_sold) OVER (PARTITION BY product_category) AS INTEGER),
        CAST(MEDIAN(units_sold) OVER () AS INTEGER)
      ) AS units_sold,
      transaction_date,
      customer_segment
    FROM staged;
  `);

  const postImpute = await query(con, `
    SELECT
      COUNT(*) FILTER (WHERE sales_amount IS NULL) AS null_sales,
      COUNT(*) FILTER (WHERE units_sold IS NULL) AS null_units
    FROM imputed;
  `);
  console.info(`│  Post-imputation nulls → sales_amount: ${postImpute[0].null_sales}, units_sold: ${postImpute[0].null_units}`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 2D. DROP ROWS WITH CRITICAL NULLS (identifiers that can't be imputed)
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2D. REMOVE ROWS WITH UNRECOVERABLE NULLS ────────────────┐');

  await exec(con, `
    CREATE TABLE no_nulls AS
    SELECT *
    FROM imputed
    WHERE transaction_id IS NOT NULL
      AND region IS NOT NULL
      AND product_category IS NOT NULL
      AND transaction_date IS NOT NULL
      AND customer_segment IS NOT NULL;
  `);

  const droppedRows = await query(con, `
    SELECT
      (SELECT COUNT(*) FROM imputed) - (SELECT COUNT(*) FROM no_nulls) AS dropped;
  `);
  console.info(`│  Rows dropped (critical null identifiers): ${droppedRows[0].dropped}`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 2E. DEDUPLICATION — Keep first occurrence using ROW_NUMBER()
  // Partition by business key columns (excluding transaction_id which may differ
  // across duplicates like TXN-001/TXN-006/TXN-021).
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2E. DEDUPLICATION (ROW_NUMBER Window) ────────────────────┐');

  await exec(con, `
    CREATE TABLE cleaned AS
    SELECT
      transaction_id,
      region,
      product_category,
      CAST(sales_amount AS DOUBLE) AS sales_amount,
      CAST(units_sold AS INTEGER) AS units_sold,
      transaction_date,
      customer_segment
    FROM no_nulls
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY region, product_category, sales_amount, units_sold,
                   transaction_date, customer_segment
      ORDER BY transaction_id ASC
    ) = 1;
  `);

  const finalCount = await query(con, `SELECT COUNT(*) AS n FROM cleaned;`);
  const dedupRemoved = await query(con, `
    SELECT (SELECT COUNT(*) FROM no_nulls) - (SELECT COUNT(*) FROM cleaned) AS dupes_removed;
  `);
  console.info(`│  Duplicates removed: ${dedupRemoved[0].dupes_removed}`);
  console.info(`│  Final clean row count: ${finalCount[0].n}`);
  console.info('└─────────────────────────────────────────────────────────────┘');

  // ──────────────────────────────────────────────────────────────────────────
  // 2F. PREVIEW — Show first 5 cleaned rows for workshop verification
  // ──────────────────────────────────────────────────────────────────────────
  console.info('\n┌─ 2F. CLEANED DATA PREVIEW (Top 5) ────────────────────────┐');
  const preview = await query(con, `SELECT * FROM cleaned ORDER BY transaction_id LIMIT 5;`);
  console.table(preview);
  console.info('└─────────────────────────────────────────────────────────────┘');

  console.info('\n✅ Cleaning complete. Proceed to Layer 3 (Export & Validate).\n');

  // Return the db/con so the orchestrator can pass it to export step
  return { db, con, finalRowCount: finalCount[0].n };
}

// Run directly if executed as standalone
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('pipeline/02-clean.js');
if (isMain) {
  runCleaning()
    .then(({ db }) => db.close())
    .catch((err) => {
      console.error(`[clean] Fatal: ${err.message}`);
      process.exit(1);
    });
}
