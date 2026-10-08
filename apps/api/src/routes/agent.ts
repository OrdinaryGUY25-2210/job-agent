import type { FastifyInstance } from 'fastify';
import {
  claimTask,
  createTask,
  getTaskContext,
  listEvents,
  overview,
  registerSession,
  reportTask,
  touchSession,
} from '../services/agent.js';
import { logEvent } from '../services/events.js';
import { requireUser } from '../lib/http.js';
import { discoverInput, taskReportInput } from '@jobagent/types';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/agent/register', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body as { platform?: 'laptop' | 'android'; version?: string; userAgent?: string };
    const session = await registerSession(user.id, {
      platform: body.platform ?? 'laptop',
      version: body.version,
      userAgent: body.userAgent,
    });
    app.hub.pushToUser(user.id, { kind: 'state', state: session.state });
    return reply.send({ session });
  });

  app.post('/agent/discover', async (req, reply) => {
    const user = requireUser(req);
    const parsed = discoverInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const task = await createTask(user.id, {
      type: 'discover',
      payload: { portals: parsed.data.portals, query: parsed.data.query },
    });
    return reply.send({ task });
  });

  app.post('/agent/tasks', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body as { type?: 'discover' | 'apply'; payload?: Record<string, unknown> };
    if (body.type !== 'discover' && body.type !== 'apply') return reply.status(400).send({ error: 'Invalid task type' });
    const task = await createTask(user.id, { type: body.type, payload: body.payload ?? {} });
    return reply.send({ task });
  });

  app.post('/agent/tasks/claim', async (req, reply) => {
    const user = requireUser(req);
    const task = await claimTask(user.id, (state) => {
      app.hub.pushToUser(user.id, { kind: 'state', state });
    });
    return reply.send({ task });
  });

  app.get('/agent/tasks/:id/context', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const context = await getTaskContext(user.id, id);
    return reply.send(context);
  });

  app.post('/agent/tasks/:id/report', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const parsed = taskReportInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const task = await reportTask(user.id, id, parsed.data, app.hub);
    if (parsed.data.state) app.hub.pushToUser(user.id, { kind: 'state', state: parsed.data.state });
    return reply.send({ task });
  });

  app.post('/agent/sessions/:id/heartbeat', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const body = req.body as { state?: never };
    await touchSession(id, body.state ?? undefined);
    if (body.state) app.hub.pushToUser(user.id, { kind: 'state', state: body.state });
    return reply.send({ ok: true });
  });

  app.post('/agent/events', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body as { type?: string; payload?: Record<string, unknown> | null };
    if (!body.type) return reply.status(400).send({ error: 'type is required' });
    await logEvent([{ userId: user.id, applicationId: null, type: body.type, payload: body.payload ?? null }], app.hub);
    return reply.send({ ok: true });
  });

  app.get('/agent/events', async (req, reply) => {
    const user = requireUser(req);
    const q = req.query as Record<string, string | undefined>;
    const events = await listEvents(user.id, q['limit'] ? Number(q['limit']) : 50);
    return reply.send({ events });
  });

  app.get('/agent/overview', async (req, reply) => {
    const user = requireUser(req);
    const data = await overview(user.id);
    return reply.send({ ...data, connectedRunners: app.hub.connectedRunners() });
  });
}