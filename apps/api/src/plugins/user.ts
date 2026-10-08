import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@jobagent/types';
import { extractToken, verifyToken } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User | null;
  }
}

type DebugReq = FastifyRequest & Record<string, unknown>;

export async function userPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req) => {
    const d = req as DebugReq;
    d._hookRan = true;
    try {
      const token = extractToken(req);
      d._hookToken = !!token;
      if (!token) return;
      const claims = await verifyToken(token);
      d._hookClaims = !!claims;
      if (!claims || !claims.sub) return;
      req.user = {
        id: claims.sub,
        email: claims.email ?? '',
        name: claims.name ?? '',
        role: claims.role ?? 'owner',
        createdAt: '',
      };
      d._hookUserSet = true;
    } catch {
      d._hookThrew = true;
    }
  });
}