import { createLogger } from '@jobagent/logger';
import { config, allowedDomains } from './config.js';
import { ApiClient } from './client.js';
import { closeBrowser, openBrowser, type Session } from './browser.js';
import { executeTask } from './agent/executor.js';

const log = createLogger('runner');

const POLL_INTERVAL_MS = 5000;
const VERSION = '0.1.0';

async function main(): Promise<void> {
  if (!config.RUNNER_EMAIL || !config.RUNNER_PASSWORD) {
    log.error('RUNNER_EMAIL and RUNNER_PASSWORD are required');
    process.exit(1);
  }

  const client = new ApiClient(config.RUNNER_API_URL);
  await client.login(config.RUNNER_EMAIL, config.RUNNER_PASSWORD);
  log.info('authenticated with API');

  const { session } = await client.registerSession('laptop', VERSION);
  log.info({ sessionId: session.id }, 'agent session registered');
  await client.emit('agent_online', { sessionId: session.id, version: VERSION, allowedDomains });

  const browser: Session = await openBrowser();
  log.info('browser ready');

  let running = true;
  const shutdown = async () => {
    running = false;
    await closeBrowser(browser).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('unhandledRejection', (err) => {
    log.error(err as never);
  });

  let idleSince = 0;
  while (running) {
    try {
      const { task } = await client.claim();
      if (task) {
        idleSince = 0;
        log.info({ taskId: task.id, type: task.type }, 'claimed task');
        await executeTask(client, task, browser);
      } else {
        const now = Date.now();
        if (idleSince === 0) idleSince = now;
        else if (now - idleSince > 30_000) {
          await client.heartbeat(session.id).catch(() => undefined);
          idleSince = 0;
        }
      }
    } catch (err) {
      log.error({ err: String(err) }, 'agent loop error');
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  log.error(err as never);
  process.exit(1);
});