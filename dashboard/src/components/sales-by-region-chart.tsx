// ============================================================================
// WORKSHOP STEP 4.3: INTERACTIVE BAR CHART — Sales by Region
// ============================================================================
// Renders a responsive bar chart with dynamic tooltips showing total sales
// per region. Automatically adapts when filters change.
//
// 💡 DATA ENGINEERING INSIGHT:
// The chart receives pre-aggregated data from a DuckDB-WASM GROUP BY query
// that ran in <10ms on the client. Traditional architectures would require
// an API endpoint + server-side DB query + JSON serialization for this same
// aggregation, adding 200-400ms latency and ongoing compute costs per request.
// ============================================================================

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { REGION_COLORS, FALLBACK_COLOR } from "@/lib/constants";

interface SalesRow {
  region: string;
  total_sales: number;
}

interface Props {
  data: SalesRow[];
  loading: boolean;
  executionTimeMs: number | null;
}

// Format large numbers as PHP currency
function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`;
  return `₱${value.toFixed(0)}`;
}

export function SalesByRegionChart({ data, loading, executionTimeMs }: Props) {
  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center bg-gray-50 rounded-lg animate-pulse">
        <p className="text-gray-400">Loading chart...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Total Sales by Region
        </h2>
        {executionTimeMs !== null && (
          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
            {executionTimeMs}ms
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="region"
            tick={{ fontSize: 12, fill: "#374151" }}
            axisLine={{ stroke: "#d1d5db" }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={{ stroke: "#d1d5db" }}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), "Total Sales"]}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="total_sales" radius={[6, 6, 0, 0]} maxBarSize={80}>
            {data.map((entry) => (
              <Cell
                key={entry.region}
                fill={REGION_COLORS[entry.region] || FALLBACK_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
