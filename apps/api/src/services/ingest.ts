import { and, count, desc, eq, gte, ilike, or } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { normalizeUrl } from '@jobagent/shared';
import { scoreJob } from '@jobagent/ai';
import type { DiscoveredJob, JobWithMatch } from '@jobagent/types';
import type { Hub } from '../ws/hub.js';
import { logEvent } from './events.js';
import { badRequest } from '../lib/http.js';

const db = () => getDb();

export async function ingestJobs(
  userId: string,
  input: { jobs: DiscoveredJob[]; tasksId?: string | null },
  hub?: Hub,
): Promise<{ ingested: number; matched: number; filtered: number; errors: { title: string; jobUrl: string; error: string }[] }> {
  const profileRow = await db().query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  const prefsRow = await db().query.jobPreferences.findFirst({ where: eq(schema.jobPreferences.userId, userId) });
  if (!profileRow || !prefsRow) badRequest('Set up profile and preferences before ingesting jobs');

  let ingested = 0;
  let matched = 0;
  let filtered = 0;
  const errors: { title: string; jobUrl: string; error: string }[] = [];

  for (const j of input.jobs) {
    try {
      const normalizedUrl = normalizeUrl(j.jobUrl).slice(0, 900);
      const existing = await db()
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.portal, j.portal), eq(schema.jobs.normalizedUrl, normalizedUrl)))
        .limit(1);

      const values = {
        externalJobId: j.externalJobId ? j.externalJobId.slice(0, 255) : null,
        portal: j.portal.slice(0, 80),
        jobUrl: j.jobUrl.slice(0, 1000),
        normalizedUrl,
        title: j.title.slice(0, 300),
        company: (j.company ?? '').slice(0, 300),
        location: (j.location ?? '').slice(0, 300),
        salaryText: (j.salaryText ?? '').slice(0, 200),
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        description: (j.description ?? '').slice(0, 20000),
        requirements: j.requirements,
        employmentType: (j.employmentType ?? '').slice(0, 80),
        postedAt: j.postedAt ? new Date(j.postedAt) : null,
        raw: (j.raw as Record<string, unknown> | null) ?? null,
      };

      let jobId: string;
      if (existing[0]) {
        await db().update(schema.jobs).set({ ...values, lastSeenAt: new Date() }).where(eq(schema.jobs.id, existing[0].id));
        jobId = existing[0].id;
      } else {
        const inserted = await db().insert(schema.jobs).values(values).returning();
        const row = inserted[0];
        if (!row) continue;
        jobId = row.id;
      }
      ingested++;

      const result = scoreJob(j, profileRow, prefsRow);
      await db()
        .insert(schema.jobMatches)
        .values({
          jobId,
          userId,
          score: result.score,
          tier: result.tier,
          reasons: result.reasons,
          breakdown: result.breakdown,
          status: prefsRow.requireApproval ? 'pending' : 'approved',
        })
        .onConflictDoUpdate({
          target: [schema.jobMatches.userId, schema.jobMatches.jobId],
          set: { score: result.score, tier: result.tier, reasons: result.reasons, breakdown: result.breakdown },
        });

      if (result.score >= prefsRow.minMatchScore) {
        matched++;
        await logEvent(
          [
            {
              userId,
              applicationId: null,
              type: 'job_detected',
              payload: {
                jobId,
                title: j.title,
                company: j.company,
                portal: j.portal,
                score: result.score,
                tier: result.tier,
                status: prefsRow.requireApproval ? 'waiting_approval' : 'approved',
              },
            },
          ],
          hub,
        );
      } else {
        filtered++;
      }
    } catch (err) {
      errors.push({
        title: (j.title ?? '').slice(0, 80),
        jobUrl: (j.jobUrl ?? '').slice(0, 150),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (input.tasksId) {
    await db().update(schema.agentTasks).set({ status: 'completed', finishedAt: new Date() }).where(eq(schema.agentTasks.id, input.tasksId));
  }

  return { ingested, matched, filtered, errors };
}

export async function listJobs(
  userId: string,
  opts: { portal?: string; q?: string; minScore?: number; limit?: number; offset?: number },
): Promise<{ rows: JobWithMatch[]; total: number }> {
  const limit = Math.min(100, opts.limit ?? 50);
  const offset = opts.offset ?? 0;

  const join = and(eq(schema.jobMatches.jobId, schema.jobs.id), eq(schema.jobMatches.userId, userId));
  const where = and(
    join,
    opts.portal ? eq(schema.jobs.portal, opts.portal) : undefined,
    opts.q ? or(ilike(schema.jobs.title, `%${opts.q}%`), ilike(schema.jobs.company, `%${opts.q}%`)) : undefined,
    opts.minScore !== undefined ? gte(schema.jobMatches.score, opts.minScore) : undefined,
  );

  const rows = await db()
    .select({ job: schema.jobs, match: schema.jobMatches })
    .from(schema.jobs)
    .innerJoin(schema.jobMatches, join)
    .where(where)
    .orderBy(desc(schema.jobMatches.score), desc(schema.jobMatches.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db()
    .select({ total: count() })
    .from(schema.jobs)
    .innerJoin(schema.jobMatches, join)
    .where(where);

  return {
    total: Number(total),
    rows: rows.map((r) => ({
      ...serializeJob(r.job),
      match: { ...r.match, createdAt: r.match.createdAt.toISOString(), decidedAt: r.match.decidedAt?.toISOString() ?? null },
    })),
  };
}

export async function getJob(userId: string, jobId: string): Promise<JobWithMatch | null> {
  const join = and(eq(schema.jobMatches.jobId, schema.jobs.id), eq(schema.jobMatches.userId, userId));
  const rows = await db()
    .select({ job: schema.jobs, match: schema.jobMatches })
    .from(schema.jobs)
    .innerJoin(schema.jobMatches, join)
    .where(and(join, eq(schema.jobs.id, jobId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    ...serializeJob(r.job),
    match: { ...r.match, createdAt: r.match.createdAt.toISOString(), decidedAt: r.match.decidedAt?.toISOString() ?? null },
  };
}

function serializeJob(j: {
  id: string;
  externalJobId: string | null;
  portal: string;
  jobUrl: string;
  title: string;
  company: string;
  location: string;
  salaryText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  requirements: string[];
  employmentType: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}) {
  return {
    id: j.id,
    externalJobId: j.externalJobId,
    portal: j.portal,
    jobUrl: j.jobUrl,
    title: j.title,
    company: j.company,
    location: j.location,
    salaryText: j.salaryText,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    description: j.description,
    requirements: j.requirements,
    employmentType: j.employmentType,
    postedAt: j.postedAt?.toISOString() ?? null,
    firstSeenAt: j.firstSeenAt.toISOString(),
    lastSeenAt: j.lastSeenAt.toISOString(),
  };
}