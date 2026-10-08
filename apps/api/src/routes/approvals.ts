import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { createApplyTasks, decideMatches } from '../services/applications.js';
import { requireUser } from '../lib/http.js';
import { applyInput, decideInput } from '@jobagent/types';

export async function approvalsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/approvals', async (req, reply) => {
    const user = requireUser(req);
    const rows = await getDb()
      .select({ match: schema.jobMatches, job: schema.jobs })
      .from(schema.jobMatches)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobMatches.jobId))
      .where(and(eq(schema.jobMatches.userId, user.id), eq(schema.jobMatches.status, 'pending')))
      .orderBy(desc(schema.jobMatches.score));
    return reply.send({
      rows: rows.map((r) => ({
        match: { ...r.match, createdAt: r.match.createdAt.toISOString(), decidedAt: r.match.decidedAt?.toISOString() ?? null },
        job: r.job,
      })),
    });
  });

  app.post('/approvals/decide', async (req, reply) => {
    const user = requireUser(req);
    const parsed = decideInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const result = await decideMatches(user.id, parsed.data.jobIds, parsed.data.decision, app.hub);
    return reply.send(result);
  });

  app.post('/approvals/apply', async (req, reply) => {
    const user = requireUser(req);
    const parsed = applyInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const result = await createApplyTasks(user.id, parsed.data.jobIds, app.hub);
    return reply.send({ tasksCreated: result.tasks.length });
  });
}