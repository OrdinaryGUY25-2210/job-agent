import type { User } from '@jobagent/types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(msg = 'Not found'): never {
  throw new HttpError(404, msg);
}

export function badRequest(msg: string): never {
  throw new HttpError(400, msg);
}

export function requireUser(req: { user?: User | null }): User {
  const u = req.user;
  if (!u) throw new HttpError(401, 'Authentication required');
  return u;
}