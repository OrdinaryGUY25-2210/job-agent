import type { AgentState } from './enums.js';
import type { AgentTask } from './schemas.js';

export interface AgentEventPayload {
  type: string;
  applicationId?: string | null;
  payload: Record<string, unknown> | null;
}

export interface AgentEvent extends AgentEventPayload {
  id: string;
  userId: string;
  createdAt: string;
}

export type AgentWSServerMessage =
  | { kind: 'task'; task: AgentTask }
  | { kind: 'task_result'; taskId: string; ok: boolean; error?: string }
  | { kind: 'state'; state: AgentState }
  | { kind: 'paused'; reason: string }
  | { kind: 'resumed' }
  | { kind: 'ping'; at: string };

export type AgentWSClientMessage =
  | { kind: 'hello'; sessionId: string; version: string; state: AgentState }
  | { kind: 'task_ready' }
  | { kind: 'event'; event: AgentEventPayload }
  | { kind: 'state'; state: AgentState }
  | { kind: 'pong' };

export type DashboardWSServerMessage = AgentEvent | { kind: 'state'; state: AgentState };

export interface StreamTicket {
  ticket: string;
  expiresIn: number;
}