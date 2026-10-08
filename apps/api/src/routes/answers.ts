import type { FastifyInstance } from 'fastify';
import { deleteAnswer, listAnswers, resolveAnswer, upsertAnswer } from '../services/answers.js';
import { requireUser } from '../lib/http.js';
import { answerInput } from '@jobagent/types';

export async function answersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/answers', async (req, reply) => {
    const user = requireUser(req);
    const answers = await listAnswers(user.id);
    return reply.send({ answers });
  });

  app.post('/answers', async (req, reply) => {
    const user = requireUser(req);
    const parsed = answerInput.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    const answer = await upsertAnswer(user.id, parsed.data);
    return reply.send({ answer });
  });

  app.post('/answers/resolve', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body as { question?: string };
    const question = body?.question?.trim() ?? '';
    if (!question) return reply.status(400).send({ error: 'question is required' });
    const hit = await resolveAnswer(user.id, question);
    if (!hit) return reply.send({ hit: null });
    return reply.send({
      hit: {
        memoryId: hit.memory.id,
        answer: hit.memory.answer,
        confidence: hit.confidence,
        method: hit.method,
      },
    });
  });

  app.delete('/answers/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const removed = await deleteAnswer(user.id, id);
    return reply.send({ removed });
  });
}