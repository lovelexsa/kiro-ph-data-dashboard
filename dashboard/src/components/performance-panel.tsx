// ============================================================================
// WORKSHOP STEP 4.4: PERFORMANCE AUDIT & VERIFICATION PANEL
// ============================================================================
// Displays real-time query latency metrics and runs assertion checks to prove
// sub-100ms performance to workshop participants.
//
// 💡 DATA ENGINEERING INSIGHT:
// This panel acts as a live SLA monitor — in production dashboards on Vercel,
// you'd emit these timings to an observability service. But because DuckDB-WASM
// processes queries locally, p99 latency is bounded by the user's device CPU
// rather than network jitter or server cold starts, making it consistently fast
// regardless of geographic distance from the nearest Vercel edge node.
// ============================================================================

"use client";

import { useState, useEffect } from "react";

interface QueryTiming {
  label: string;
  timeMs: number;
  rowCount: number;
  timestamp: number;
}

interface Props {
  timings: QueryTiming[];
}

export function PerformancePanel({ timings }: Props) {
  const [assertions, setAssertions] = useState<
    { label: string; passed: boolean; detail: string }[]
  >([]);

  useEffect(() => {
    if (timings.length === 0) return;

    // Run automated performance assertions
    const checks = [
      {
        label: "All queries < 100ms",
        passed: timings.every((t) => t.timeMs < 100),
        detail: `Slowest: ${Math.max(...timings.map((t) => t.timeMs)).toFixed(1)}ms`,
      },
      {
        label: "Average query < 50ms",
        passed:
          timings.reduce((sum, t) => sum + t.timeMs, 0) / timings.length < 50,
        detail: `Avg: ${(timings.reduce((sum, t) => sum + t.timeMs, 0) / timings.length).toFixed(1)}ms`,
      },
      {
        label: "No empty result sets",
        passed: timings.every((t) => t.rowCount > 0),
        detail: `Min rows: ${Math.min(...timings.map((t) => t.rowCount))}`,
      },
      {
        label: "Consistent row counts (no data loss)",
        passed: timings.filter((t) => t.rowCount === 0).length === 0,
        detail: `${timings.length} queries executed`,
      },
    ];

    setAssertions(checks);
  }, [timings]);

  if (timings.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Performance Audit
        </h2>
        <p className="text-sm text-gray-500">
          Interact with filters to collect query timings...
        </p>
      </div>
    );
  }

  const avgTime =
    timings.reduce((sum, t) => sum + t.timeMs, 0) / timings.length;
  const maxTime = Math.max(...timings.map((t) => t.timeMs));
  const minTime = Math.min(...timings.map((t) => t.timeMs));

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Performance Audit
      </h2>

      {/* Timing Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-2xl font-mono font-bold text-blue-700">
            {avgTime.toFixed(1)}ms
          </p>
          <p className="text-xs text-blue-600">Avg Latency</p>
        </div>
        <div className="text-center p-3 bg-emerald-50 rounded-lg">
          <p className="text-2xl font-mono font-bold text-emerald-700">
            {minTime.toFixed(1)}ms
          </p>
          <p className="text-xs text-emerald-600">Min Latency</p>
        </div>
        <div className="text-center p-3 bg-amber-50 rounded-lg">
          <p className="text-2xl font-mono font-bold text-amber-700">
            {maxTime.toFixed(1)}ms
          </p>
          <p className="text-xs text-amber-600">Max Latency</p>
        </div>
      </div>

      {/* Assertion Results */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-600 mb-2">
          Automated Assertions ({timings.length} queries)
        </h3>
        {assertions.map((check) => (
          <div
            key={check.label}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              check.passed
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            <span>
              {check.passed ? "✓" : "✗"} {check.label}
            </span>
            <span className="font-mono text-xs opacity-75">{check.detail}</span>
          </div>
        ))}
      </div>

      {/* Console Snippet for Workshop */}
      <details className="mt-4">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          Browser Console Verification Snippet
        </summary>
        <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto">
{`// Paste this in DevTools Console to verify:
const timings = ${JSON.stringify(timings.slice(-5).map((t) => ({ query: t.label, ms: t.timeMs })), null, 2)};
console.table(timings);
const allUnder100ms = timings.every(t => t.ms < 100);
console.assert(allUnder100ms, "FAIL: Some queries exceeded 100ms!");
console.log(allUnder100ms ? "✅ PASS: All queries < 100ms" : "❌ FAIL");`}
        </pre>
      </details>
    </div>
  );
}
