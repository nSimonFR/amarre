// REST helpers for the v2.0.0 amarre control plane (docs/PROTOCOL.md §3.1, §4).
// All wrappers throw `RestError` on non-2xx so callers can surface 429 limit
// messages or 404/409 lifecycle issues verbatim.

export type SessionStatus = 'running' | 'crashed' | 'stopped';

export type SessionInfo = {
  id: string;
  name?: string;
  status: SessionStatus;
  agent: string;
  spawnedAt: number;
  clients: number;
  exitCode?: number | null;
  signal?: string | null;
};

export type CreateSessionBody = {
  name?: string;
  cwd?: string;
  env?: Record<string, string>;
};

export class RestError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'RestError';
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function ensureOk(res: Response): Promise<unknown> {
  const body = await readJson(res);
  if (res.ok) return body;
  const errMsg =
    body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${res.status}`;
  throw new RestError(res.status, body, errMsg);
}

export async function listSessions(baseUrl: string): Promise<SessionInfo[]> {
  const res = await fetch(`${baseUrl}/sessions`);
  const body = await ensureOk(res);
  return Array.isArray(body) ? (body as SessionInfo[]) : [];
}

export async function createSession(
  baseUrl: string,
  body?: CreateSessionBody,
): Promise<SessionInfo> {
  const res = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return (await ensureOk(res)) as SessionInfo;
}

export async function getSession(baseUrl: string, id: string): Promise<SessionInfo> {
  const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}`);
  return (await ensureOk(res)) as SessionInfo;
}

export async function deleteSession(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await ensureOk(res);
}

export async function restartSession(baseUrl: string, id: string): Promise<SessionInfo> {
  const res = await fetch(`${baseUrl}/sessions/${encodeURIComponent(id)}/restart`, { method: 'POST' });
  return (await ensureOk(res)) as SessionInfo;
}
