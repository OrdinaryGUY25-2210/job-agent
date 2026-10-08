import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { AgentTask } from '@jobagent/types';
import { createLogger } from '@jobagent/logger';
import { config, allowedDomains } from '../config.js';
import type { ApiClient } from '../client.js';
import type { Session } from '../browser.js';
import { navigate, closeBrowser, openBrowser } from '../browser.js';
import { GenericAdapter, LinkedInAdapter } from '../adapters/generic.js';
import type { ApplyForm } from '../adapters/base.js';

const log = createLogger('runner:executor');

export async function executeTask(
  client: ApiClient,
  task: AgentTask,
  browser: Session,
): Promise<void> {
  log.info({ taskId: task.id, type: task.type }, 'executing task');
  await client.emit('task_started', { taskId: task.id, type: task.type });

  try {
    if (task.type === 'discover') {
      await runDiscovery(client, task, browser);
    } else if (task.type === 'apply') {
      await runApplication(client, task, browser);
    }
  } catch (err) {
    const stopReason = classifyError(err);
    await client.report(task.id, {
      status: stopReason === 'captcha' ? 'needs_review' : 'failed',
      state: 'needs_review',
      error: err instanceof Error ? err.message : String(err),
      stopReason,
      applicationId: null,
      result: null,
    });
    await client.emit('task_failed', { taskId: task.id, error: err instanceof Error ? err.message : String(err) });
  }
}

async function runDiscovery(client: ApiClient, task: AgentTask, browser: Session): Promise<void> {
  const payload = task.payload as { portals?: string[]; query?: string };
  let query = payload.query ?? '';
  let wanted = payload.portals && payload.portals.length > 0 ? payload.portals : [];

  let ctx: Awaited<ReturnType<ApiClient['taskContext']>> | null = null;
  try {
    ctx = await client.taskContext(task.id);
  } catch (err) {
    log.warn({ err: String(err) }, 'task context fetch failed — retrying');
    try {
      ctx = await client.taskContext(task.id);
    } catch (err2) {
      log.warn({ err: String(err2) }, 'task context fetch failed — falling back');
      ctx = null;
    }
  }

  if (wanted.length === 0) wanted = (ctx?.portals ?? []).filter((p) => p.enabled).map((p) => p.portal);
  if (wanted.length === 0) wanted = ['linkedin.com'];

  const prefLocations = ((ctx?.preferences as { locations?: string[] } | undefined)?.locations ?? []).filter(Boolean);
  const remoteWanted = ctx?.profile?.remotePreferred === true || prefLocations.some((l) => /remote/i.test(l));
  if (remoteWanted && !/remote/i.test(query)) query = query ? `${query} remote` : 'remote';

  const portals = wanted.map((p) => p.replace(/^https?:\/\//, '').toLowerCase());
  const allowedPortals = portals.filter((p) => allowedDomains.some((d) => p === d || p.endsWith(`.${d}`)));
  log.info({ portals: allowedPortals, query }, 'discovery plan');

  let okCount = 0;
  let ingestedCount = 0;
  let lastError: string | null = null;

  for (const portal of allowedPortals) {
    log.info({ portal }, 'portal discovery begin');
    try {
      const adapter = new GenericAdapter(portal);
      const url = adapter.discoverUrl({ query });
      if (!url) {
        log.warn({ portal }, 'no discover URL for portal');
        lastError = `no discover URL for ${portal}`;
        continue;
      }
      await client.emit('discovery_started', { portal, url });
      const page = await withTimeout(navigate(browser, url, allowedDomains), 60_000, 'NAVIGATE');
      await page.waitForTimeout(2500);

      const jobs = await withTimeout(adapter.extractJobs(page), 30_000, 'EXTRACT');
      if (jobs.length === 0) {
        okCount += 1;
        await client.emit('discovery_empty', { portal });
        log.info({ portal }, 'portal discovery empty');
        continue;
      }
      const result = await withTimeout(client.ingest(jobs, task.id), 30_000, 'INGEST');
      okCount += 1;
      ingestedCount += 1;
      await client.emit('discovery_completed', { portal, jobs: jobs.length, ...result });
      log.info({ portal, jobs: jobs.length, ...result }, 'portal discovery done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      log.warn({ portal, err: msg }, 'portal discovery failed');
      await client.emit('discovery_failed', { portal, error: msg }).catch(() => undefined);
      await restartBrowser(browser)
        .then(() => log.info({ portal }, 'browser restarted after failure'))
        .catch((e) => log.warn({ err: String(e) }, 'browser restart failed'));
    }
  }

  if (okCount === 0) {
    const msg = lastError ?? 'no portal could be crawled';
    await client
      .report(task.id, {
        status: 'failed',
        state: 'idle',
        error: msg,
        stopReason: classifyError(new Error(msg)),
        applicationId: null,
        result: null,
      })
      .catch((e) => log.warn({ err: String(e) }, 'final failed report failed'));
    await client.emit('task_failed', { taskId: task.id, error: msg }).catch(() => undefined);
  } else {
    await client
      .report(task.id, {
        status: 'completed',
        state: 'idle',
        error: null,
        stopReason: null,
        applicationId: null,
        result: { portals: okCount, ingested: ingestedCount },
      })
      .catch((e) => log.warn({ err: String(e) }, 'final completed report failed'));
  }
}

async function runApplication(client: ApiClient, task: AgentTask, browser: Session): Promise<void> {
  const payload = task.payload as { jobId?: string; jobUrl?: string; portal?: string; title?: string; company?: string };
  if (!payload.jobUrl) throw new Error('NO_JOB_URL');

  const context = await client.taskContext(task.id);
  const portal = (payload.portal ?? 'linkedin.com').replace(/^https?:\/\//, '').toLowerCase();
  const adapter = portal.includes('linkedin') ? new LinkedInAdapter() : new GenericAdapter(portal);

  await client.emit('apply_started', { jobId: payload.jobId, title: payload.title, company: payload.company });

  const page = await withTimeout(navigate(browser, payload.jobUrl, allowedDomains), 60_000, 'NAVIGATE');
  await page.waitForTimeout(1500);

  const cvPath = resolveCv(context);
  const form: ApplyForm = {
    headline: context.profile?.headline ?? '',
    summary: context.profile?.summary ?? '',
    yearsExperience: context.profile?.yearsExperience ?? 0,
    skills: context.profile?.skills ?? [],
    workAuthorization: context.profile?.workAuthorization ?? '',
    expectedSalary: context.profile?.expectedSalary ?? [null, null],
    cvPath,
  };

  const outcome = await adapter.apply({
    page,
    form,
    answerOrNull: async (q) => {
      const hit = await client.resolveAnswer(q);
      return hit?.hit?.answer ?? null;
    },
  });

  if (outcome.submitted) {
    await client.report(task.id, {
      status: 'completed',
      state: 'idle',
      applicationId: outcome.applicationId ?? null,
      error: null,
      stopReason: null,
      result: { portal, title: payload.title ?? null, company: payload.company ?? null },
    });
    await client.emit('application_submitted', { taskId: task.id });
  } else {
    await client.report(task.id, {
      status: 'needs_review',
      state: 'needs_review',
      stopReason: outcome.stopReason,
      error: outcome.detail,
      applicationId: null,
      result: null,
    });
    await client.emit('needs_review', { taskId: task.id, reason: outcome.stopReason, detail: outcome.detail });
  }
}

function resolveCv(context: { profile?: { cv?: { filename?: string } | null } }): string | null {
  const filename = context.profile?.cv?.filename;
  if (!filename || !config.RUNNER_CV_DIR) {
    // CV not resolvable locally — application will stop with UPLOAD_REQUIRED if asked
    return null;
  }
  const candidate = join(config.RUNNER_CV_DIR, basename(filename));
  return existsSync(candidate) ? candidate : null;
}

function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/captcha/i.test(msg)) return 'captcha';
  if (/NOT_ALLOWED|allowlist|BLOCKED/i.test(msg)) return 'domain_not_allowed';
  if (/upload_required/i.test(msg)) return 'form_not_detected';
  if (/timeout|rate/i.test(msg)) return 'rate_limited';
  return 'unexpected_page';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT_${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function restartBrowser(browser: Session): Promise<void> {
  await withTimeout(closeBrowser(browser), 5_000, 'BROWSER_CLOSE').catch(() => undefined);
  const fresh = await withTimeout(openBrowser(), 30_000, 'BROWSER_LAUNCH');
  browser.context = fresh.context;
  browser.page = fresh.page;
}