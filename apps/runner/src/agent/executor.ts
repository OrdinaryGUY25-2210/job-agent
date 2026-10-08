import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { AgentTask } from '@jobagent/types';
import { createLogger } from '@jobagent/logger';
import { config, allowedDomains } from '../config.js';
import type { ApiClient } from '../client.js';
import type { Session } from '../browser.js';
import { navigate } from '../browser.js';
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
  const query = payload.query ?? '';
  let wanted = payload.portals && payload.portals.length > 0 ? payload.portals : [];
  if (wanted.length === 0) {
    try {
      const ctx = await client.taskContext(task.id);
      wanted = (ctx.portals ?? []).filter((p) => p.enabled).map((p) => p.portal);
    } catch {
      wanted = [];
    }
  }
  if (wanted.length === 0) wanted = ['linkedin.com'];

  const portals = wanted.map((p) => p.replace(/^https?:\/\//, '').toLowerCase());
  const allowedPortals = portals.filter((p) => allowedDomains.some((d) => p === d || p.endsWith(`.${d}`)));

  for (const portal of allowedPortals.slice(0, 2)) {
    const adapter = new GenericAdapter(portal);
    const url = adapter.discoverUrl({ query });
    if (!url) {
      log.warn({ portal }, 'no discover URL for portal');
      continue;
    }
    await client.emit('discovery_started', { portal, url });
    const page = await navigate(browser, url, allowedDomains);
    await page.waitForTimeout(2500);

    const jobs = await adapter.extractJobs(page);
    if (jobs.length === 0) {
      await client.emit('discovery_empty', { portal });
      continue;
    }
    const result = await client.ingest(jobs, task.id);
    await client.emit('discovery_completed', { portal, jobs: jobs.length, ...result });
  }
}

async function runApplication(client: ApiClient, task: AgentTask, browser: Session): Promise<void> {
  const payload = task.payload as { jobId?: string; jobUrl?: string; portal?: string; title?: string; company?: string };
  if (!payload.jobUrl) throw new Error('NO_JOB_URL');

  const context = await client.taskContext(task.id);
  const portal = (payload.portal ?? 'linkedin.com').replace(/^https?:\/\//, '').toLowerCase();
  const adapter = portal.includes('linkedin') ? new LinkedInAdapter() : new GenericAdapter(portal);

  await client.emit('apply_started', { jobId: payload.jobId, title: payload.title, company: payload.company });

  const page = await navigate(browser, payload.jobUrl, allowedDomains);
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