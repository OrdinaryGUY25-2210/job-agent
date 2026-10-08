import type { FastifyInstance } from 'fastify';
import { ingestJobs, listJobs, getJob as getJobRow } from '../services/ingest.js';
import { requireUser } from '../lib/http.js';
import { ingestJobsInput } from '@jobagent/types';

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/jobs', async (req, reply) => {
    const user = requireUser(req);
    const q = req.query as Record<string, string | undefined>;
    const result = await listJobs(user.id, {
      portal: q['portal'],
      q: q['q'],
      minScore: q['minScore'] !== undefined ? Number(q['minScore']) : undefined,
      limit: q['limit'] !== undefined ? Number(q['limit']) : undefined,
      offset: q['offset'] !== undefined ? Number(q['offset']) : undefined,
    });
    return reply.send(result);
  });

  app.get('/jobs/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const job = await getJobRow(user.id, id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return reply.send({ job });
  });

  app.post('/jobs/ingest', async (req, reply) => {
    const user = requireUser(req);
    const parsed = ingestJobsInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const result = await ingestJobs(user.id, { jobs: parsed.data.jobs, tasksId: parsed.data.tasksId }, app.hub);
    return reply.send(result);
  });
}