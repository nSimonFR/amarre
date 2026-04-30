// Push-notification capability (PROTOCOL §13). Token store + Expo Push Service
// dispatcher. The store is a single JSON file, atomic-rewritten. The dispatcher
// chunks at 100 messages/request (Expo limit) and prunes tokens that come back
// as DeviceNotRegistered. All operations are no-ops when push is disabled.
//
// No external runtime deps — one fetch per chunk. expo-server-sdk-node is
// referenced for behaviour but not pulled in.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_PER_REQUEST = 100;

export type Platform = "ios" | "android" | "web";

export interface PushToken {
  token: string;
  deviceName?: string;
  platform?: Platform;
  registeredAt: number;
}

export type PushTrigger = "awaiting_input" | "crashed";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data: Record<string, unknown>;
}

export interface PushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushService {
  enabled: boolean;
  list(): PushToken[];
  register(token: string, meta: { deviceName?: string; platform?: Platform }): PushToken | null;
  unregister(token: string): boolean;
  send(trigger: PushTrigger, body: string, data: Record<string, unknown>): Promise<number>;
}

export function isExpoPushToken(s: unknown): s is string {
  return (
    typeof s === "string" &&
    (s.startsWith("ExponentPushToken[") || s.startsWith("ExpoPushToken[")) &&
    s.endsWith("]") &&
    s.length <= 200
  );
}

function titleFor(trigger: PushTrigger): string {
  if (trigger === "awaiting_input") return "amarre · awaiting input";
  return "amarre · session crashed";
}

interface CreateOpts {
  storePath: string | null;
  expoPushUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export async function createPushService(opts: CreateOpts): Promise<PushService> {
  const log = opts.log ?? ((m) => console.error(`[amarre.push] ${m}`));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const expoPushUrl = opts.expoPushUrl ?? DEFAULT_EXPO_PUSH_URL;

  if (!opts.storePath) {
    log("disabled — no AMARRE_PUSH_TOKENS_PATH");
    return disabled();
  }

  let tokens: Map<string, PushToken>;
  try {
    tokens = await loadTokens(opts.storePath);
  } catch (err) {
    log(`disabled — token store load failed: ${(err as Error).message}`);
    return disabled();
  }

  const persist = async () => {
    try {
      await saveTokens(opts.storePath!, tokens);
    } catch (err) {
      log(`token persist failed: ${(err as Error).message}`);
    }
  };

  return {
    enabled: true,
    list: () => [...tokens.values()],
    register: (token, meta) => {
      if (!isExpoPushToken(token)) return null;
      const existing = tokens.get(token);
      if (existing) return existing;
      const entry: PushToken = {
        token,
        deviceName: meta.deviceName?.slice(0, 64),
        platform: meta.platform,
        registeredAt: Date.now(),
      };
      tokens.set(token, entry);
      void persist();
      log(`registered ${token.slice(0, 22)}…  (total=${tokens.size})`);
      return entry;
    },
    unregister: (token) => {
      const had = tokens.delete(token);
      if (had) void persist();
      return had;
    },
    send: async (trigger, body, data) => {
      if (tokens.size === 0) return 0;
      const messages: PushMessage[] = [...tokens.values()].map((t) => ({
        to: t.token,
        title: titleFor(trigger),
        body: body.slice(0, 100),
        sound: "default",
        data: { amarre: "1", trigger, ...data },
      }));
      let sent = 0;
      const deadTokens: string[] = [];
      for (let i = 0; i < messages.length; i += MAX_PER_REQUEST) {
        const chunk = messages.slice(i, i + MAX_PER_REQUEST);
        try {
          const res = await fetchImpl(expoPushUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
              "accept-encoding": "gzip, deflate",
            },
            body: JSON.stringify(chunk),
          });
          const json = (await res.json()) as { data?: PushTicket | PushTicket[]; errors?: unknown };
          const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
          for (let j = 0; j < tickets.length; j++) {
            const ticket = tickets[j];
            const recipient = chunk[j]?.to;
            if (!ticket || !recipient) continue;
            if (ticket.status === "ok") {
              sent++;
              continue;
            }
            const code = ticket.details?.error;
            if (code === "DeviceNotRegistered") {
              deadTokens.push(recipient);
            } else {
              log(`push error ${code ?? "?"} for ${recipient.slice(0, 22)}…: ${ticket.message}`);
            }
          }
        } catch (err) {
          log(`push fetch failed: ${(err as Error).message}`);
        }
      }
      if (deadTokens.length > 0) {
        for (const t of deadTokens) tokens.delete(t);
        void persist();
        log(`pruned ${deadTokens.length} dead token(s)`);
      }
      return sent;
    },
  };
}

function disabled(): PushService {
  return {
    enabled: false,
    list: () => [],
    register: () => null,
    unregister: () => false,
    send: async () => 0,
  };
}

async function loadTokens(path: string): Promise<Map<string, PushToken>> {
  const map = new Map<string, PushToken>();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await mkdir(dirname(path), { recursive: true });
      return map;
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return map;
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as PushToken).token === "string" &&
      typeof (item as PushToken).registeredAt === "number"
    ) {
      const t = item as PushToken;
      if (isExpoPushToken(t.token)) map.set(t.token, t);
    }
  }
  return map;
}

async function saveTokens(path: string, tokens: Map<string, PushToken>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify([...tokens.values()], null, 2), "utf8");
  await rename(tmp, path);
}
