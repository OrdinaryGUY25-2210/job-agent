import type { AgentTask, AgentSession, DiscoveredJob, TaskReportInput } from '@jobagent/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TaskContext {
  task: AgentTask;
  job?: Record<string, unknown>;
  application?: Record<string, unknown>;
  profile?: {
    headline?: string;
    summary?: string;
    yearsExperience?: number;
    skills?: string[];
    workAuthorization?: string;
    remotePreferred?: boolean;
    expectedSalary?: (number | null)[];
    cv?: { id: string; filename: string; storageKey: string } | null;
  };
  preferences?: Record<string, unknown>;
  policies?: { allowedDomains?: string[]; allowedApps?: string[]; maxConcurrency?: number; paused?: boolean; pauseReason?: string };
  answers?: { id: string; question: string; answer: string; confidence: number; usageCount: number }[];
  portals?: { portal: string; baseUrl: string | null; settings: Record<string, unknown> | null; enabled: boolean }[];
}

export class ApiClient {
  private token: string | null = null;

  constructor(private baseUrl: string) {}

  private get authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async login(email: string, password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !body.token) throw new ApiError(res.status, body.error ?? 'Login failed');
    this.token = body.token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.authHeader, ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, typeof body === 'object' && body && 'error' in body ? String(body.error) : 'Request failed');
    return body as T;
  }

  registerSession(platform: AgentSession['platform'], version: string) {
    return this.request<{ session: AgentSession }>('/agent/register', {
      method: 'POST',
      body: JSON.stringify({ platform, version, userAgent: `jobagent-runner/${version}` }),
    });
  }

  claim(): Promise<{ task: AgentTask | null }> {
    return this.request('/agent/tasks/claim', { method: 'POST', body: '{}' });
  }

  taskContext(taskId: string): Promise<TaskContext> {
    return this.request(`/agent/tasks/${taskId}/context`);
  }

  report(taskId: string, input: TaskReportInput): Promise<{ task: AgentTask }> {
    return this.request(`/agent/tasks/${taskId}/report`, { method: 'POST', body: JSON.stringify(input) });
  }

  emit(type: string, payload: Record<string, unknown> | null = null): Promise<{ ok: boolean }> {
    return this.request('/agent/events', { method: 'POST', body: JSON.stringify({ type, payload }) });
  }

  ingest(jobs: DiscoveredJob[], tasksId: string | null): Promise<{ ingested: number; matched: number; filtered: number }> {
    return this.request('/jobs/ingest', { method: 'POST', body: JSON.stringify({ jobs, tasksId }) });
  }

  resolveAnswer(question: string): Promise<{ hit: { memoryId: string; answer: string; confidence: number; method: string } | null }> {
    return this.request('/answers/resolve', { method: 'POST', body: JSON.stringify({ question }) });
  }

  heartbeat(sessionId: string): Promise<{ ok: boolean }> {
    return this.request(`/agent/sessions/${sessionId}/heartbeat`, { method: 'POST', body: '{}' });
  }
}