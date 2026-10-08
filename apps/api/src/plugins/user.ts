import type { FastifyRequest } from 'fastify';
import type { User } from '@jobagent/types';
import { extractToken, verifyToken } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User | null;
  }
}

/** Attached at the root Fastify instance so it applies to every route. */
export async function userHook(req: FastifyRequest): Promise<void> {
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
}