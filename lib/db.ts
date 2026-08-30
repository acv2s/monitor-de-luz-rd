import postgres from 'postgres';
import { DDL } from './schema';

let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  _sql = postgres(url, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // compatible con poolers (Supabase pgbouncer / Neon pooler)
  });
  return _sql;
}

let schemaReady: Promise<void> | null = null;

/** Crea las tablas si no existen (idempotente). */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql()
      .unsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}
