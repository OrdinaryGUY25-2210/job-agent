import type { FastifyInstance } from 'fastify';
import type { User } from '@jobagent/types';
import { extractToken, verifyToken } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User | null;
  }
}

export async function userPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req) => {
    const token = extractToken(req);
    if (!token) return;
    const claims = await verifyToken(token);
    if (!claims || !claims.sub) return;
    req.user = {
      id: claims.sub,
      email: claims.email ?? '',
      name: claims.name ?? '',
      role: claims.role ?? 'owner',
      createdAt: '',
    };
  });
}