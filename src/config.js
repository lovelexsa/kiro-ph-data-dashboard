// Pipeline configuration — all tunables live here, not in business logic.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const paths = {
  root: ROOT,
  rawDir: join(ROOT, 'data', 'raw'),
  dbFile: join(ROOT, 'data', 'ph_dashboard.duckdb'),
};

// Philippine Open Data / PSA endpoints (placeholder URLs — replace with real sources)
export const sources = [
  {
    name: 'population',
    url: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2B-PHIS/PS/PS01/POPCNT.px',
    description: 'Philippine population counts by region',
  },
  {
    name: 'gdp',
    url: 'https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2B-PHIS/NA/NA01/GDPQ.px',
    description: 'Quarterly GDP at constant prices',
  },
];

export const fetchOptions = {
  timeoutMs: 30_000,
  retries: 2,
};
