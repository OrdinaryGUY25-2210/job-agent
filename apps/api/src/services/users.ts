import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { badRequest } from '../lib/http.js';
import type { User } from '@jobagent/types';
import { loginInput, type LoginInput, registerInput, type RegisterInput } from '@jobagent/types';

export async function register(input: unknown): Promise<User> {
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) badRequest(parsed.error.issues.map((i) => i.message).join('; '));
  const data = parsed.data as RegisterInput;
  const db = getDb();

  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, data.email.toLowerCase()) });
  if (existing) badRequest('Email already registered');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const inserted = await db
    .insert(schema.users)
    .values({ email: data.email.toLowerCase(), name: data.name, passwordHash })
    .returning();
  const u = inserted[0];
  if (!u) badRequest('Failed to create user');

  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt.toISOString() };
}

export async function login(input: unknown): Promise<User | null> {
  const parsed = loginInput.safeParse(input);
  if (!parsed.success) badRequest('Invalid email or password');
  const data = parsed.data as LoginInput;
  const db = getDb();

  const row = await db.query.users.findFirst({ where: eq(schema.users.email, data.email.toLowerCase()) });
  if (!row) return null;
  const valid = await bcrypt.compare(data.password, row.passwordHash);
  if (!valid) return null;

  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt.toISOString() };
}

export function userFromRow(row: { id: string; email: string; name: string; role: string; createdAt: Date }): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt.toISOString() };
}