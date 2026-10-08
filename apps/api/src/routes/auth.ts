import type { FastifyInstance, FastifyReply } from 'fastify';
import { login, register } from '../services/users.js';
import { signSession } from '../lib/auth.js';
import { requireUser } from '../lib/http.js';
import { IS_PROD } from '../env.js';

const COOKIE = 'jobagent_session';
const MAX_AGE = 7 * 24 * 60 * 60;

function setCookie(reply: FastifyReply, token: string, clear = false) {
  return reply.setCookie(COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: clear ? 0 : MAX_AGE,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (req, reply) => {
    const user = await register(req.body);
    const token = await signSession(user);
    setCookie(reply, token);
    return reply.send({ user, token });
  });

  app.post('/login', async (req, reply) => {
    const user = await login(req.body);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    const token = await signSession(user);
    setCookie(reply, token);
    return reply.send({ user, token });
  });

  app.post('/logout', async (_req, reply) => {
    setCookie(reply, '', true);
    return reply.send({ ok: true });
  });

  app.get('/me', async (req, reply) => {
    const user = requireUser(req);
    return reply.send({ user });
  });

  app.post('/stream-ticket', async (req, reply) => {
    const user = requireUser(req);
    const ticket = await signSession(user, 'stream');
    return reply.send({ ticket, expiresIn: 300 });
  });
}