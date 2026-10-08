export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, typeof body === 'object' && body && 'error' in body ? String(body.error) : 'Request failed');
  }
  return body as T;
}

export interface SetField {
  name: string;
  label: string;
  required?: boolean;
}

export function formToObject(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const out: Record<string, unknown> = {};
  for (const [k, v] of data.entries()) {
    out[k] = v;
  }
  return out;
}

export function listFromInput(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}