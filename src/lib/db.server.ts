import { Pool, type QueryResultRow } from "pg";

// Server-only Postgres pool (Neon). The .server.ts suffix keeps this out of
// the client bundle — DATABASE_URL must never reach the browser.
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL não definida.");
    }
    // Neon's pooled endpoint requires TLS; channel_binding in the URL is
    // ignored by node-postgres and safely falls back to plain SCRAM auth.
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params);
}
