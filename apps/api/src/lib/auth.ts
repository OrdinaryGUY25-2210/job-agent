import type { User } from '@jobagent/types';
import { SignJWT, jwtVerify } from 'jose';

export interface SessionClaims {
  sub: string;
  scope?: 'session' | 'stream' | 'runner';
  email?: string;
  name?: string;
  role?: string;
}

const SECRET = new TextEncoder().encode(process.env['JWT_SECRET'] ?? 'dev-only-secret-change-me');

export async function signSession(user: User, scope: SessionClaims['scope'] = 'session'): Promise<string> {
  const ttl = scope === 'stream' ? 300 : scope === 'runner' ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;
  return new SignJWT({ scope, email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      scope: (payload.scope as SessionClaims['scope']) ?? 'session',
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Token from cookie or Authorization header. */
export function extractToken(req: { headers: Record<string, string | string[] | undefined>; cookies: Record<string, string | undefined> }): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies['jobagent_session'] ?? null;
}