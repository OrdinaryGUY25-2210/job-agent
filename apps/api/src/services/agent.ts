import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import type { AgentTask, AgentSession, ApplicationEvent, TaskReportInput } from '@jobagent/types';
import { AGENT_TASK_STATUSES, AGENT_TASK_TYPES } from '@jobagent/types';
import { badRequest, notFound } from '../lib/http.js';
import type { Hub } from '../ws/hub.js';
import { logEvent } from './events.js';

const db = () => getDb();

export async function registerSession(
  userId: string,
  input: { platform: AgentSession['platform']; version?: string; userAgent?: string },
): Promise<AgentSession> {
  const inserted = await db()
    .insert(schema.agentSessions)
    .values({
      userId,
      platform: input.platform,
      version: input.version ?? '0.1.0',
      state: 'online',
      userAgent: input.userAgent,
    })
    .returning();
  const s = inserted[0] ?? notFound('Failed to register session');
  return toSession(s);
}

export async function touchSession(sessionId: string, state?: AgentSession['state']): Promise<void> {
  await db()
    .update(schema.agentSessions)
    .set({ lastSeenAt: new Date(), ...(state ? { state } : {}) })
    .where(eq(schema.agentSessions.id, sessionId));
}

export async function sessionById(sessionId: string): Promise<AgentSession | null> {
  const s = await db().query.agentSessions.findFirst({ where: eq(schema.agentSessions.id, sessionId) });
  return s ? toSession(s) : null;
}

function toSession(s: {
  id: string;
  userId: string;
  platform: AgentSession['platform'];
  state: AgentSession['state'];
  version: string;
  userAgent: string | null;
  startedAt: Date;
  lastSeenAt: Date;
}): AgentSession {
  return {
    id: s.id,
    userId: s.userId,
    platform: s.platform,
    state: s.state,
    version: s.version,
    startedAt: s.startedAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
  };
}

export async function createTask(
  userId: string,
  input: { type: 'discover' | 'apply'; payload: Record<string, unknown> },
): Promise<AgentTask> {
  if (!AGENT_TASK_TYPES.includes(input.type)) badRequest('Invalid task type');
  const inserted = await db().insert(schema.agentTasks).values({ userId, type: input.type, payload: input.payload }).returning();
  return toTask(inserted[0] ?? notFound('Failed to create task'));
}

export async function claimTask(userId: string, hookState: (s: AgentSession['state']) => void): Promise<AgentTask | null> {
  const res = await db().execute(sql`
    UPDATE agent_tasks
    SET status = 'claimed', claimed_at = now(), started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM agent_tasks
      WHERE user_id = ${userId} AND status = 'queued'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING *`);
  const row = res.rows[0] as unknown as RawTask | undefined;
  if (!row) return null;
  hookState('applying');
  return rawToTask(row);
}

interface RawTask {
  id: string;
  user_id: string;
  session_id: string | null;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  error: string | null;
  stop_reason: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

function rawToTask(r: RawTask): AgentTask {
  return {
    id: r.id,
    userId: r.user_id,
    sessionId: r.session_id,
    type: r.type as AgentTask['type'],
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: r.status as AgentTask['status'],
    attempts: r.attempts,
    error: r.error,
    stopReason: r.stop_reason,
    createdAt: new Date(r.created_at).toISOString(),
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
  };
}

export function toTask(row: {
  id: string;
  userId: string;
  sessionId: string | null;
  type: AgentTask['type'];
  payload: Record<string, unknown>;
  status: AgentTask['status'];
  attempts: number;
  error: string | null;
  stopReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): AgentTask {
  return {
    id: row.id,
    userId: row.userId,
    sessionId: row.sessionId,
    type: row.type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    stopReason: row.stopReason,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export async function getTaskContext(userId: string, taskId: string) {
  const task = await db().query.agentTasks.findFirst({
    where: and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.userId, userId)),
  });
  if (!task) notFound('Task not found');

  const context: Record<string, unknown> = {
    task: toTask(task),
  };

  if (task.type === 'apply') {
    const jobId = task.payload['jobId'];
    if (typeof jobId === 'string') {
      const application = await db().query.applications.findFirst({
        where: and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, jobId)),
      });
      if (application) context.application = application;
      const job = await db().query.jobs.findFirst({ where: eq(schema.jobs.id, jobId) });
      if (job) context.job = job;
    }
  } else if (task.type === 'discover') {
    const portals = await db().query.jobPortals.findMany({
      where: and(eq(schema.jobPortals.userId, userId), eq(schema.jobPortals.enabled, true)),
    });
    context.portals = portals;
  }

  const [profile, preferences, policies, answers] = await Promise.all([
    db().query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) }),
    db().query.jobPreferences.findFirst({ where: eq(schema.jobPreferences.userId, userId) }),
    db().query.agentPolicies.findFirst({ where: eq(schema.agentPolicies.userId, userId) }),
    db().query.answerMemory.findMany({ where: eq(schema.answerMemory.userId, userId) }),
  ]);

  const defaultCvDescription = await (async () => {
    if (!profile?.defaultCvId) return null;
    const doc = await db().query.documents.findFirst({ where: eq(schema.documents.id, profile.defaultCvId) });
    return doc ? { id: doc.id, filename: doc.filename, storageKey: doc.storageKey } : null;
  })();

  context.profile = {
    headline: profile?.headline ?? '',
    summary: profile?.summary ?? '',
    yearsExperience: profile?.yearsExperience ?? 0,
    skills: profile?.skills ?? [],
    workAuthorization: profile?.workAuthorization ?? '',
    remotePreferred: profile?.remotePreferred ?? false,
    expectedSalary: [profile?.expectedSalaryMin, profile?.expectedSalaryMax],
    cv: defaultCvDescription,
  };
  context.preferences = preferences;
  context.policies = policies;
  context.answers = answers;

  return context;
}

export async function reportTask(
  userId: string,
  taskId: string,
  input: TaskReportInput,
  hub?: Hub,
): Promise<AgentTask> {
  const task = await db().query.agentTasks.findFirst({
    where: and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.userId, userId)),
  });
  if (!task) notFound('Task not found');

  if (!AGENT_TASK_STATUSES.includes(input.status)) badRequest('Invalid status');

  await db()
    .update(schema.agentTasks)
    .set({
      status: input.status,
      error: input.error ?? null,
      stopReason: input.stopReason ?? null,
      finishedAt: input.status === 'completed' || input.status === 'failed' || input.status === 'needs_review' ? new Date() : null,
    })
    .where(eq(schema.agentTasks.id, taskId));

  const events: { userId: string; applicationId: string | null; type: string; payload?: Record<string, unknown> | null }[] = [];

  if (task.type === 'apply' && input.status === 'completed') {
    const jobIdRaw = task.payload['jobId'];
    if (jobIdRaw === undefined && input.applicationId) {
      // application was created by runner (manual portal), link it
      events.push({
        userId,
        applicationId: input.applicationId,
        type: 'application_submitted',
        payload: { taskId },
      });
    } else if (typeof jobIdRaw === 'string') {
      const updateRes = await db()
        .update(schema.applications)
        .set({ status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, jobIdRaw)))
        .returning();
      const app = updateRes[0];
      events.push({
        userId,
        applicationId: app?.id ?? null,
        type: 'application_submitted',
        payload: { taskId, title: task.payload['title'] ?? '', company: task.payload['company'] ?? '' },
      });
    }
  }

  if (['failed', 'needs_review'].includes(input.status)) {
    events.push({
      userId,
      applicationId: input.applicationId ?? null,
      type: input.status === 'failed' ? 'task_failed' : 'needs_review',
      payload: { taskId, error: input.error, stopReason: input.stopReason },
    });
  }

  if (events.length > 0) await logEvent(events, hub);

  const updated = await db().query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, taskId) });
  return toTask(updated!);
}

export async function listEvents(userId: string, limit = 50): Promise<ApplicationEvent[]> {
  const rows = await db()
    .select()
    .from(schema.applicationEvents)
    .where(eq(schema.applicationEvents.userId, userId))
    .orderBy(desc(schema.applicationEvents.createdAt))
    .limit(Math.min(200, limit));
  return rows.map((e) => ({
    id: e.id,
    applicationId: e.applicationId,
    userId: e.userId,
    type: e.type,
    payload: e.payload,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function overview(userId: string) {
  const [sessions, queued, active, recentEvents, counters, policies] = await Promise.all([
    db().query.agentSessions.findMany({ where: eq(schema.agentSessions.userId, userId), orderBy: (t, { desc: d }) => [d(t.lastSeenAt)] }),
    db().select({ n: count() }).from(schema.agentTasks).where(and(eq(schema.agentTasks.userId, userId), eq(schema.agentTasks.status, 'queued'))),
    db().select({ n: count() }).from(schema.agentTasks).where(and(eq(schema.agentTasks.userId, userId), inArray(schema.agentTasks.status, ['claimed', 'running']))),
    listEvents(userId, 60),
    db().select({ status: schema.applications.status, n: count() }).from(schema.applications).where(eq(schema.applications.userId, userId)).groupBy(schema.applications.status),
    db().query.agentPolicies.findFirst({ where: eq(schema.agentPolicies.userId, userId) }),
  ]);

  return {
    connectedRunners: sessions.filter((s) => s.state === 'online' && Date.now() - s.lastSeenAt.getTime() < 90_000).length,
    sessions: sessions.map(toSession),
    tasks: { queued: Number(queued[0]?.n ?? 0), active: Number(active[0]?.n ?? 0) },
    applicationCounters: Object.fromEntries(counters.map((c) => [c.status, c.n])),
    policies,
    recentEvents,
  };
}