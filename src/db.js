// DuckDB connection helper — schema-first table setup.

import duckdb from 'duckdb';
import { paths } from './config.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Open (or create) the DuckDB database and return { db, con }.
 */
export function openDatabase() {
  mkdirSync(dirname(paths.dbFile), { recursive: true });

  const db = new duckdb.Database(paths.dbFile);
  const con = db.connect();
  return { db, con };
}

/**
 * Run a SQL statement that doesn't return rows.
 */
export function exec(con, sql) {
  return new Promise((resolve, reject) => {
    con.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Run a SQL query and return all rows.
 */
export function queryAll(con, sql) {
  return new Promise((resolve, reject) => {
    con.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Create tables if they don't exist (idempotent).
 */
export async function ensureSchema(con) {
  await exec(con, `
    CREATE TABLE IF NOT EXISTS population (
      region       VARCHAR NOT NULL,
      year         INTEGER NOT NULL,
      population   BIGINT,
      PRIMARY KEY (region, year)
    );
  `);

  await exec(con, `
    CREATE TABLE IF NOT EXISTS gdp (
      quarter      VARCHAR NOT NULL,
      year         INTEGER NOT NULL,
      gdp_value    DOUBLE,
      PRIMARY KEY (quarter, year)
    );
  `);

  console.info('[db] Schema ready.');
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}
