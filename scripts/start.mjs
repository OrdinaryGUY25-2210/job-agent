/**
 * Monolith entrypoint for Railway (or any host).
 *
 * Runs the Fastify API on an internal port (API_PORT, default 3001) and the
 * Next.js production server on the public port (PORT, Railway-injected).
 * The dashboard proxies /api/* -> http://127.0.0.1:3001 via Next rewrites,
 * so a single service + domain is enough.
 */
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const PORT = process.env.PORT ?? '3000';
const API_PORT = process.env.API_PORT ?? '3001';
const CWD = process.cwd();
const NEXT_BIN = join(CWD, 'node_modules', 'next', 'dist', 'bin', 'next');

console.log(`[start] web on :${PORT}, api on :${API_PORT}`);

function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate] DATABASE_URL unset, skipping migrations');
    return;
  }
  console.log('[migrate] applying sql migrations');
  const res = spawnSync(
    process.execPath,
    ['packages/database/src/migrate.ts'],
    {
      cwd: CWD,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--import=tsx' },
    },
  );
  if (res.status !== 0) {
    console.error('[migrate] failed, aborting start');
    process.exit(res.status ?? 1);
  }
}

migrate();

const api = spawn(process.execPath, ['apps/api/src/server.ts'], {
  cwd: CWD,
  stdio: 'inherit',
  env: { ...process.env, PORT: API_PORT, NODE_OPTIONS: '--import=tsx' },
});

const web = spawn(process.execPath, [NEXT_BIN, 'start', '-p', PORT], {
  cwd: join(CWD, 'apps', 'web'),
  stdio: 'inherit',
  env: { ...process.env, PORT },
});

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  const timer = setTimeout(() => process.exit(code ?? 1), 4000);
  timer.unref();
}

api.on('exit', (code) => {
  console.error('[start] api exited', code);
  shutdown(code ?? 1);
});
web.on('exit', (code) => {
  console.error('[start] web exited', code);
  shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (err) => {
  console.error('[start] uncaught', err);
  shutdown(1);
});