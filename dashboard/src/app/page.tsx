// ============================================================================
// WORKSHOP STEP 4: MAIN DASHBOARD PAGE
// ============================================================================
// Orchestrates DuckDB-WASM initialization, filter state, SQL queries, and
// chart rendering. This is the "glue" that connects all workshop components.
//
// Architecture:
//   1. useDuckDB() → initializes WASM + loads Parquet into virtual FS
//   2. useQuery()  → runs SQL with WHERE clauses from filter state
//   3. Charts      → render pre-aggregated results from DuckDB-WASM
//   4. Performance → tracks all query timings for the audit panel
// ============================================================================

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDuckDB } from "@/lib/use-duckdb";
import { useQuery, useQueryFn } from "@/lib/use-query";
import { PARQUET_TABLE } from "@/lib/constants";
import { FilterBar } from "@/components/filter-bar";
import { SalesByRegionChart } from "@/components/sales-by-region-chart";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { PerformancePanel } from "@/components/performance-panel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SalesRow {
  region: string;
  total_sales: number;
}

interface CategoryRow {
  product_category: string;
  total_sales: number;
  transaction_count: number;
}

interface QueryTiming {
  label: string;
  timeMs: number;
  rowCount: number;
  timestamp: number;
}

// ─── SQL Builder (adapts WHERE clause to active filters) ────────────────────

function buildWhereClause(
  region: string,
  category: string,
  segment: string
): string {
  const conditions: string[] = [];
  if (region !== "ALL") conditions.push(`region = '${region}'`);
  if (category !== "ALL") conditions.push(`product_category = '${category}'`);
  if (segment !== "ALL") conditions.push(`customer_segment = '${segment}'`);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

// ─── Main Dashboard Component ───────────────────────────────────────────────

export default function Dashboard() {
  // Step 1: Initialize DuckDB-WASM
  const { conn, loading: dbLoading, error: dbError } = useDuckDB();

  // Filter state
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSegment, setSelectedSegment] = useState("ALL");

  // Filter options (populated once DB is ready)
  const [regions, setRegions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>([]);

  // Performance tracking
  const [timings, setTimings] = useState<QueryTiming[]>([]);

  // Imperative query for fetching filter options
  const queryFn = useQueryFn(conn);

  // Load filter options once connection is ready
  useEffect(() => {
    if (!conn) return;

    async function loadFilters() {
      const [regionRes, catRes, segRes] = await Promise.all([
        queryFn<{ region: string }>(
          `SELECT DISTINCT region FROM ${PARQUET_TABLE} ORDER BY region`
        ),
        queryFn<{ product_category: string }>(
          `SELECT DISTINCT product_category FROM ${PARQUET_TABLE} ORDER BY product_category`
        ),
        queryFn<{ customer_segment: string }>(
          `SELECT DISTINCT customer_segment FROM ${PARQUET_TABLE} ORDER BY customer_segment`
        ),
      ]);

      setRegions(regionRes.data.map((r) => r.region));
      setCategories(catRes.data.map((c) => c.product_category));
      setSegments(segRes.data.map((s) => s.customer_segment));
    }

    loadFilters();
  }, [conn, queryFn]);

  // Step 2: Build dynamic SQL queries based on filter state
  const whereClause = useMemo(
    () => buildWhereClause(selectedRegion, selectedCategory, selectedSegment),
    [selectedRegion, selectedCategory, selectedSegment]
  );

  // Query: Sales aggregated by region
  const salesByRegionSQL = useMemo(
    () => `
      SELECT region, SUM(sales_amount) AS total_sales
      FROM ${PARQUET_TABLE}
      ${whereClause}
      GROUP BY region
      ORDER BY total_sales DESC
    `,
    [whereClause]
  );

  // Query: Sales aggregated by product category
  const salesByCategorySQL = useMemo(
    () => `
      SELECT
        product_category,
        SUM(sales_amount) AS total_sales,
        COUNT(*) AS transaction_count
      FROM ${PARQUET_TABLE}
      ${whereClause}
      GROUP BY product_category
      ORDER BY total_sales DESC
    `,
    [whereClause]
  );

  // Execute queries with the useQuery hook
  const regionResult = useQuery<SalesRow>(conn, salesByRegionSQL, [whereClause]);
  const categoryResult = useQuery<CategoryRow>(conn, salesByCategorySQL, [whereClause]);

  // Track query timings for the performance panel
  const addTiming = useCallback(
    (label: string, timeMs: number | null, rowCount: number) => {
      if (timeMs === null) return;
      setTimings((prev) => [
        ...prev.slice(-19), // Keep last 20 timings
        { label, timeMs, rowCount, timestamp: Date.now() },
      ]);
    },
    []
  );

  useEffect(() => {
    if (regionResult.executionTimeMs !== null) {
      addTiming("Sales by Region", regionResult.executionTimeMs, regionResult.data.length);
    }
  }, [regionResult.executionTimeMs, regionResult.data.length, addTiming]);

  useEffect(() => {
    if (categoryResult.executionTimeMs !== null) {
      addTiming("Sales by Category", categoryResult.executionTimeMs, categoryResult.data.length);
    }
  }, [categoryResult.executionTimeMs, categoryResult.data.length, addTiming]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Loading state while DuckDB-WASM initializes
  if (dbLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Initializing DuckDB-WASM...</p>
          <p className="text-sm text-gray-400 mt-1">
            Loading Parquet file into browser memory
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (dbError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Initialization Error</h2>
          <p className="text-red-600 text-sm">{dbError}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          PH Data Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Powered by DuckDB-WASM — All queries run in your browser, zero server
          costs
        </p>
      </header>

      {/* Filters */}
      <div className="mb-6">
        <FilterBar
          regions={regions}
          categories={categories}
          segments={segments}
          selectedRegion={selectedRegion}
          selectedCategory={selectedCategory}
          selectedSegment={selectedSegment}
          onRegionChange={setSelectedRegion}
          onCategoryChange={setSelectedCategory}
          onSegmentChange={setSelectedSegment}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SalesByRegionChart
          data={regionResult.data}
          loading={regionResult.loading}
          executionTimeMs={regionResult.executionTimeMs}
        />
        <CategoryPieChart
          data={categoryResult.data}
          loading={categoryResult.loading}
          executionTimeMs={categoryResult.executionTimeMs}
        />
      </div>

      {/* Performance Audit Panel */}
      <PerformancePanel timings={timings} />
    </main>
  );
}
