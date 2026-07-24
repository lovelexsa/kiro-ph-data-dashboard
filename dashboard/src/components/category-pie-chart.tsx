// ============================================================================
// WORKSHOP STEP 4.3: INTERACTIVE PIE CHART — Sales by Product Category
// ============================================================================
// Renders a responsive pie chart with custom labels and dynamic tooltips.
// Adapts to filter changes in real-time.
// ============================================================================

"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CATEGORY_COLORS, FALLBACK_COLOR } from "@/lib/constants";

interface CategoryRow {
  product_category: string;
  total_sales: number;
  transaction_count: number;
}

interface Props {
  data: CategoryRow[];
  loading: boolean;
  executionTimeMs: number | null;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`;
  return `₱${value.toFixed(0)}`;
}

export function CategoryPieChart({ data, loading, executionTimeMs }: Props) {
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
          Sales by Product Category
        </h2>
        {executionTimeMs !== null && (
          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
            {executionTimeMs}ms
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={110}
            innerRadius={60}
            dataKey="total_sales"
            nameKey="product_category"
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
            }
            labelLine={{ stroke: "#9ca3af" }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.product_category}
                fill={CATEGORY_COLORS[entry.product_category] || FALLBACK_COLOR}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              formatCurrency(Number(value)),
              "Sales",
            ]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value: string) => (
              <span className="text-sm text-gray-700">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
