import type { FastifyInstance } from 'fastify';
import {
  getApplication,
  listApplications,
  updateApplicationStatus,
} from '../services/applications.js';
import { requireUser } from '../lib/http.js';
import { applicationStatusInput } from '@jobagent/types';

export async function applicationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/applications', async (req, reply) => {
    const user = requireUser(req);
    const q = req.query as Record<string, string | undefined>;
    const result = await listApplications(user.id, {
      status: q['status'],
      limit: q['limit'] !== undefined ? Number(q['limit']) : undefined,
      offset: q['offset'] !== undefined ? Number(q['offset']) : undefined,
    });
    return reply.send(result);
  });

  app.get('/applications/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const data = await getApplication(user.id, id);
    return reply.send(data);
  });

  app.patch('/applications/:id/status', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const parsed = applicationStatusInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const application = await updateApplicationStatus(user.id, id, parsed.data.status, parsed.data.notes, app.hub);
    return reply.send({ application });
  });
}