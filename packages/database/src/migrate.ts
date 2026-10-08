import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createLogger } from '@jobagent/logger';
import { loadEnvFile } from '../../../scripts/load-env.mjs';

loadEnvFile();

const log = createLogger('db:migrate');
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = process.env['MIGRATIONS_DIR'] ?? join(here, '..', 'migrations');

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        log.info({ file }, 'already applied, skipping');
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      log.info({ file }, 'applying migration');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    log.info('migrations up to date');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  log.error(err);
  process.exit(1);
});