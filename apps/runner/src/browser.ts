import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { config } from './config.js';
import { isAllowed } from './allowlist.js';

export interface Session {
  context: BrowserContext;
  page: Page | null;
}

export async function openBrowser(): Promise<Session> {
  const dir = config.RUNNER_PROFILE_DIR || undefined;
  if (dir) await mkdir(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir ?? '', {
    headless: config.RUNNER_HEADLESS,
    viewport: { width: 1360, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  await context.addInitScript('globalThis.__name = (fn) => fn;');
  return { context, page: null };
}

export async function navigate(session: Session, url: string, allowed: string[]): Promise<Page> {
  if (!isAllowed(url, allowed)) {
    throw new Error(`NAVIGATION_BLOCKED: ${url} is not in the allowlist`);
  }
  const page = session.page ?? (await session.context.newPage());
  session.page = page;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
  return page;
}

export async function closeBrowser(session: Session): Promise<void> {
  await session.context.close().catch(() => undefined);
}

export { isAllowed };