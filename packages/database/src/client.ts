import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

let cached: Db | null = null;
let pool: pg.Pool | null = null;

export function getDb(): Db {
  if (cached) return cached;
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new pg.Pool({ connectionString: url, max: 10 });
  cached = drizzle(pool, { schema });
  return cached;
}

export function closeDb(): Promise<void> {
  if (pool) return pool.end();
  return Promise.resolve();
}

export { schema };