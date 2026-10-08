import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Load .env.local (then .env) from the repo root regardless of process cwd. */
export function loadEnvFile() {
  config({ path: [resolve(ROOT, '.env.local'), resolve(ROOT, '.env')] });
}