import { Pool } from "pg";

/**
 * Conexión a PostgreSQL (EasyPanel).
 * Requiere la variable DATABASE_URL, p.ej.:
 *   postgres://postgres:PASSWORD@santo-grial-db:5432/santogrial
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __pgSchemaReady: Promise<void> | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada");
  }
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) globalThis.__pgPool = createPool();
  return globalThis.__pgPool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analysis_reports (
  id           TEXT PRIMARY KEY,
  file_name    TEXT,
  month        TEXT,
  report_type  TEXT DEFAULT 'general',
  data         JSONB,
  audit_trail  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_month ON analysis_reports(month);

CREATE TABLE IF NOT EXISTS site_geography (
  name_key      TEXT PRIMARY KEY,
  display_name  TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  last_updated  TIMESTAMPTZ DEFAULT NOW()
);
`;

/** Crea las tablas si no existen (se ejecuta una sola vez por proceso). */
export async function db(): Promise<Pool> {
  const pool = getPool();
  if (!globalThis.__pgSchemaReady) {
    globalThis.__pgSchemaReady = pool.query(SCHEMA_SQL).then(() => undefined).catch((e) => {
      globalThis.__pgSchemaReady = undefined;
      throw e;
    });
  }
  await globalThis.__pgSchemaReady;
  return pool;
}
