import { buildApp } from './app.js';
import { env } from './env.js';
import { closeDb } from '@jobagent/db';

const app = buildApp();

async function main() {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

const shutdown = async () => {
  app.log.info('shutting down');
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);