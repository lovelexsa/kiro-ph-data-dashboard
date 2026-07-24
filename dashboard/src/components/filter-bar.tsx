// ============================================================================
// WORKSHOP STEP 4.2: INTERACTIVE FILTER BAR WITH DRILL-DOWN CONTROLS
// ============================================================================
// Dynamic dropdowns populated by DuckDB-WASM DISTINCT queries. Each filter
// change updates the SQL WHERE clause in real-time — no server round-trip.
// ============================================================================

"use client";

interface Props {
  regions: string[];
  categories: string[];
  segments: string[];
  selectedRegion: string;
  selectedCategory: string;
  selectedSegment: string;
  onRegionChange: (region: string) => void;
  onCategoryChange: (category: string) => void;
  onSegmentChange: (segment: string) => void;
}

export function FilterBar({
  regions,
  categories,
  segments,
  selectedRegion,
  selectedCategory,
  selectedSegment,
  onRegionChange,
  onCategoryChange,
  onSegmentChange,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap gap-4 items-center">
      <span className="text-sm font-medium text-gray-600">Filters:</span>

      {/* Region Dropdown */}
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Region</span>
        <select
          value={selectedRegion}
          onChange={(e) => onRegionChange(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          aria-label="Filter by region"
        >
          <option value="ALL">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {/* Product Category Dropdown */}
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Category</span>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          aria-label="Filter by product category"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {/* Customer Segment Dropdown */}
      <label className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Segment</span>
        <select
          value={selectedSegment}
          onChange={(e) => onSegmentChange(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          aria-label="Filter by customer segment"
        >
          <option value="ALL">All Segments</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {/* Reset */}
      {(selectedRegion !== "ALL" ||
        selectedCategory !== "ALL" ||
        selectedSegment !== "ALL") && (
        <button
          onClick={() => {
            onRegionChange("ALL");
            onCategoryChange("ALL");
            onSegmentChange("ALL");
          }}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Reset All
        </button>
      )}
    </div>
  );
}
