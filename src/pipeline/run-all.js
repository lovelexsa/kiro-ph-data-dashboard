#!/usr/bin/env node
// ============================================================================
// PIPELINE ORCHESTRATOR — Run the full data quality pipeline end-to-end
// ============================================================================
// Usage:  node src/pipeline/run-all.js
//         npm run pipeline
//
// Executes in order:
//   Layer 1 → Data Quality Assessment (diagnostics only, no mutations)
//   Layer 2 → Cleaning & Integrity Enforcement (in-memory DuckDB)
//   Layer 3 → Post-Quality Validation + Parquet Export
//
// The orchestrator passes the open DuckDB connection from Layer 2 → Layer 3
// so the cleaned table stays in memory without re-reading from disk.
//
// Exit codes:
//   0 = success
//   1 = fatal error (assessment, cleaning, validation, or export failure)
// ============================================================================

import { runAssessment } from './01-assess.js';
import { runCleaning } from './02-clean.js';
import { runExport } from './03-export.js';

async function main() {
  const startTime = performance.now();

  console.info('\n' + '╔' + '═'.repeat(68) + '╗');
  console.info('║  🚀 PH DATA DASHBOARD — DATA QUALITY PIPELINE                      ║');
  console.info('║  Workshop Step 3: Assess → Clean → Validate → Export                ║');
  console.info('╚' + '═'.repeat(68) + '╝');

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 1: Assessment (independent — uses its own in-memory DB)
  // ──────────────────────────────────────────────────────────────────────────
  await runAssessment();

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 2: Cleaning (returns open DB connection with "cleaned" table)
  // ──────────────────────────────────────────────────────────────────────────
  const { db, con, finalRowCount } = await runCleaning();

  // ──────────────────────────────────────────────────────────────────────────
  // LAYER 3: Validation + Parquet Export (reuses Layer 2's connection)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const { outputPath, rowCount } = await runExport(con, db, {
      expectedMinRows: 10,
    });

    // Final summary
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info('╔' + '═'.repeat(68) + '╗');
    console.info('║  ✅ PIPELINE COMPLETE                                               ║');
    console.info('╠' + '═'.repeat(68) + '╣');
    console.info(`║  Output:   ${outputPath.padEnd(55)}║`);
    console.info(`║  Rows:     ${String(rowCount).padEnd(55)}║`);
    console.info(`║  Duration: ${(elapsed + 's').padEnd(55)}║`);
    console.info('╚' + '═'.repeat(68) + '╝\n');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error('\n❌ PIPELINE ABORTED:', err.message);
  process.exit(1);
});
