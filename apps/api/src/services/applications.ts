import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { applicationKey, sha256Hex } from '@jobagent/shared';
import type { AgentTask, Application } from '@jobagent/types';
import { badRequest, notFound } from '../lib/http.js';
import type { Hub } from '../ws/hub.js';
import { logEvent } from './events.js';

const db = () => getDb();

function toApplication(row: {
  id: string;
  userId: string;
  jobId: string | null;
  externalJobId: string | null;
  companyName: string;
  position: string;
  portal: string;
  jobUrl: string;
  location: string;
  salary: string;
  matchScore: number | null;
  cvUsed: string | null;
  status: Application['status'];
  source: string;
  applicationHash: string;
  notes: string;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Application {
  return {
    id: row.id,
    userId: row.userId,
    jobId: row.jobId,
    externalJobId: row.externalJobId,
    companyName: row.companyName,
    position: row.position,
    portal: row.portal,
    jobUrl: row.jobUrl,
    location: row.location,
    salary: row.salary,
    matchScore: row.matchScore,
    cvUsed: row.cvUsed,
    status: row.status,
    source: row.source,
    applicationHash: row.applicationHash,
    notes: row.notes,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createApplicationFromMatch(userId: string, matchId: string): Promise<Application | null> {
  const match = await db().query.jobMatches.findFirst({
    where: and(eq(schema.jobMatches.id, matchId), eq(schema.jobMatches.userId, userId)),
    with: { job: true },
  });
  if (!match?.job) return null;
  const job = match.job;

  const key = applicationKey({
    portal: job.portal,
    externalJobId: job.externalJobId,
    jobUrl: job.jobUrl,
    company: job.company,
    position: job.title,
  });
  const hash = await sha256Hex(key);

  const existing = await db().query.applications.findFirst({
    where: and(eq(schema.applications.userId, userId), eq(schema.applications.applicationHash, hash)),
  });
  if (existing) return toApplication(existing);

  const inserted = await db()
    .insert(schema.applications)
    .values({
      userId,
      jobId: job.id,
      externalJobId: job.externalJobId,
      companyName: job.company,
      position: job.title,
      portal: job.portal,
      jobUrl: job.jobUrl,
      location: job.location,
      salary: job.salaryText,
      matchScore: match.score,
      status: 'approved',
      source: 'agent',
      applicationHash: hash,
    })
    .returning();
  const row = inserted[0];
  return row ? toApplication(row) : null;
}

export async function decideMatches(
  userId: string,
  jobIds: string[],
  decision: 'approve' | 'reject',
  hub?: Hub,
): Promise<{ decided: number; applicationsCreated: number }> {
  if (jobIds.length === 0) badRequest('No jobs selected');
  const matches = await db()
    .select()
    .from(schema.jobMatches)
    .where(and(eq(schema.jobMatches.userId, userId), inArray(schema.jobMatches.jobId, jobIds)));

  let decided = 0;
  for (const m of matches) {
    await db()
      .update(schema.jobMatches)
      .set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() })
      .where(eq(schema.jobMatches.id, m.id));
    decided++;
    await logEvent(
      [
        {
          userId,
          applicationId: null,
          type: decision === 'approve' ? 'match_approved' : 'match_rejected',
          payload: { jobId: m.jobId, score: m.score },
        },
      ],
      hub,
    );
  }

  let applicationsCreated = 0;
  if (decision === 'approve') {
    for (const m of matches) {
      const app = await createApplicationFromMatch(userId, m.id);
      if (app) applicationsCreated++;
    }
  }
  return { decided, applicationsCreated };
}

const NON_APPLICABLE_STATUSES = ['applying', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

export async function createApplyTasks(userId: string, jobIds: string[], hub?: Hub): Promise<{ tasks: AgentTask[] }> {
  if (jobIds.length === 0) badRequest('No jobs selected');

  const approved = await db()
    .select({ match: schema.jobMatches, job: schema.jobs })
    .from(schema.jobMatches)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobMatches.jobId))
    .where(
      and(
        eq(schema.jobMatches.userId, userId),
        eq(schema.jobMatches.status, 'approved'),
        inArray(schema.jobMatches.jobId, jobIds),
      ),
    );

  const tasks: AgentTask[] = [];
  for (const { job } of approved) {
    const existingApps = await db()
      .select({ status: schema.applications.status })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, job.id)));
    const alreadyInFlight = existingApps.some((a) => NON_APPLICABLE_STATUSES.includes(a.status));
    if (alreadyInFlight) continue;

    const inserted = await db()
      .insert(schema.agentTasks)
      .values({
        userId,
        type: 'apply',
        payload: { jobId: job.id, jobUrl: job.jobUrl, portal: job.portal, title: job.title, company: job.company },
      })
      .returning();
    const t = inserted[0];
    if (!t) continue;
    tasks.push(toTask(t));

    await logEvent(
      [
        {
          userId,
          applicationId: null,
          type: 'application_queued',
          payload: { taskId: t.id, jobId: job.id, title: job.title, company: job.company },
        },
      ],
      hub,
    );
  }
  return { tasks };
}

function toTask(row: {
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

export async function listApplications(
  userId: string,
  opts: { status?: string; limit?: number; offset?: number },
): Promise<{ rows: Application[]; total: number }> {
  const limit = Math.min(200, opts.limit ?? 50);
  const offset = opts.offset ?? 0;
  const statusWhere = opts.status ? eq(schema.applications.status, opts.status as Application['status']) : undefined;
  const userWhere = eq(schema.applications.userId, userId);

  const rows = await db()
    .select()
    .from(schema.applications)
    .where(and(userWhere, statusWhere))
    .orderBy(desc(schema.applications.createdAt), desc(schema.applications.updatedAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db()
    .select({ total: count() })
    .from(schema.applications)
    .where(and(userWhere, statusWhere));

  return { rows: rows.map(toApplication), total: Number(total) };
}

export async function getApplication(userId: string, id: string) {
  const app = await db().query.applications.findFirst({
    where: and(eq(schema.applications.id, id), eq(schema.applications.userId, userId)),
  });
  if (!app) notFound('Application not found');
  const answers = await db().query.applicationAnswers.findMany({ where: eq(schema.applicationAnswers.applicationId, id) });
  const events = await db().query.applicationEvents.findMany({ where: eq(schema.applicationEvents.applicationId, id) });
  return {
    application: toApplication(app),
    answers: answers.map((a) => ({ id: a.id, question: a.question, answer: a.answer, source: a.source, confidence: a.confidence, createdAt: a.createdAt.toISOString() })),
    events: events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt.toISOString() })),
  };
}

export async function updateApplicationStatus(userId: string, id: string, status: Application['status'], notes?: string, hub?: Hub) {
  const updated = await db()
    .update(schema.applications)
    .set({ status, notes: notes ?? '', updatedAt: new Date() })
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, userId)))
    .returning();
  const row = updated[0];
  if (!row) notFound('Application not found');
  await logEvent([{ userId, applicationId: id, type: 'status_changed', payload: { status } }], hub);
  return toApplication(row);
}

export async function listAllApplicationsForExport(userId: string): Promise<Application[]> {
  const rows = await db()
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.userId, userId))
    .orderBy(desc(schema.applications.createdAt));
  return rows.map(toApplication);
}

export async function countByStatus(userId: string): Promise<Record<string, number>> {
  const rows = await db().select().from(schema.applications).where(eq(schema.applications.userId, userId));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}