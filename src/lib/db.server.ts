import { Pool, type QueryResultRow } from "pg";

// Server-only Postgres pool (Neon). The .server.ts suffix keeps this out of
// the client bundle — DATABASE_URL must never reach the browser.
let pool: Pool | undefined;
let schemaReady: Promise<unknown> | undefined;

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

// Colunas adicionadas depois da criação da tabela (ver db/schema.sql).
// Idempotente: roda uma vez por instância do servidor.
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `alter table registros add column if not exists categoria text not null default 'reprocesso';
         alter table registros add column if not exists movimento text not null default 'gerado';`,
      )
      .catch((err) => {
        schemaReady = undefined;
        throw err;
      });
  }
  return schemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  await ensureSchema();
  return getPool().query<T>(text, params);
}
