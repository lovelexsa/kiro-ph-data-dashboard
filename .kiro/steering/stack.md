# PH Data Dashboard — Project Conventions

## Tech Stack

- **Runtime:** Node.js (ES Modules, `"type": "module"` in package.json)
- **Database:** DuckDB (via `duckdb` npm package) for local analytical storage
- **Visualization:** Chart.js for the browser-based dashboard
- **Browser DB (optional):** @duckdb/duckdb-wasm for client-side queries

## Project Structure

```
src/
  ingest.js        # Main ingestion entry point
  config.js        # Pipeline configuration (sources, paths, schedules)
  db.js            # DuckDB connection helper
data/
  raw/             # Raw fetched data (JSON/CSV)
  ph_dashboard.duckdb  # Analytical database
public/
  index.html       # Dashboard UI
  dashboard.js     # Chart.js visualizations
```

## Data Pipeline Rules

1. **Single source of truth:** All ingested data lands in `data/raw/` before being loaded into DuckDB.
2. **Idempotent loads:** Re-running the ingestion script must not create duplicates. Use `INSERT OR REPLACE` or truncate-and-reload per table.
3. **Schema-first:** Define table schemas explicitly in migration/setup logic inside `src/db.js`. Never rely on implicit column detection.
4. **Error handling:** Every HTTP fetch must handle network errors gracefully, log them to stderr, and exit with a non-zero code on fatal failures.
5. **Configuration over code:** Data source URLs, file paths, and schedule intervals live in `src/config.js`, not hard-coded in business logic.

## Dashboard Standards

1. **Responsive layout:** The dashboard must render correctly on viewports from 375px to 1920px wide.
2. **Accessible colors:** Chart color palettes must meet WCAG 2.1 AA contrast ratios against a white background.
3. **Loading states:** Show a spinner or skeleton while DuckDB-wasm queries execute.
4. **No bundler required:** Keep the frontend vanilla HTML + JS. Import Chart.js from a CDN or local copy.

## Coding Style

- Use `const` by default; use `let` only when reassignment is needed.
- Prefer `async/await` over raw promises.
- Name files in kebab-case; export named functions (no default exports).
- Keep functions small (< 40 lines). Extract helpers into their own modules when complexity grows.
- Log with `console.error` for errors, `console.info` for progress. Never use `console.log` in production paths.

## Scripts (package.json)

| Script        | Purpose                                  |
|---------------|------------------------------------------|
| `ingest`      | Run the full data ingestion pipeline     |
| `serve`       | Serve the dashboard locally for dev      |
| `db:reset`    | Drop and recreate all DuckDB tables      |
