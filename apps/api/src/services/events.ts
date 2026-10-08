import { getDb, schema } from '@jobagent/db';
import type { AgentEvent } from '@jobagent/types';
import type { Hub } from '../ws/hub.js';

export interface EventInput {
  userId: string;
  applicationId?: string | null;
  type: string;
  payload?: Record<string, unknown> | null;
}

export async function logEvent(events: EventInput[], hub?: Hub): Promise<AgentEvent[]> {
  const db = getDb();
  if (events.length === 0) return [];
  const rows = await db
    .insert(schema.applicationEvents)
    .values(events.map((e) => ({ userId: e.userId, applicationId: e.applicationId ?? null, type: e.type, payload: e.payload ?? null })))
    .returning();
  const out: AgentEvent[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    applicationId: r.applicationId,
    type: r.type,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
  for (const e of out) hub?.pushEvent(e.userId, e);
  return out;
}