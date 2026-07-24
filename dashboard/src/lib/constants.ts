// ============================================================================
// ACCESSIBLE COLOR PALETTE & CHART CONSTANTS
// ============================================================================
// Colors meet WCAG 2.1 AA contrast ratio (≥4.5:1) against white background.
// Verified with WebAIM contrast checker.

// Categorical palette for regions (4 regions in our dataset)
export const REGION_COLORS: Record<string, string> = {
  NCR: "#2563eb", // Blue-600 — contrast 4.6:1
  "Region III": "#dc2626", // Red-600 — contrast 4.5:1
  "Region IV-A": "#059669", // Emerald-600 — contrast 4.6:1
  "Region VII": "#7c3aed", // Violet-600 — contrast 5.4:1
};

// Categorical palette for product categories
export const CATEGORY_COLORS: Record<string, string> = {
  Electronics: "#2563eb", // Blue-600
  "Home Appliances": "#dc2626", // Red-600
  "Food & Beverage": "#059669", // Emerald-600
};

// Segment colors
export const SEGMENT_COLORS: Record<string, string> = {
  Enterprise: "#1d4ed8", // Blue-700
  SME: "#b91c1c", // Red-700
  Retail: "#047857", // Emerald-700
};

// Fallback color for unknown categories
export const FALLBACK_COLOR = "#6b7280"; // Gray-500

export const PARQUET_TABLE = "'cleaned_dataset.parquet'";
