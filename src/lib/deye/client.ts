// Minimal read-only Deye Cloud OpenAPI client (developer.deyecloud.com).
// Used by both the Next.js server and the standalone poller, so no "server-only" here.
import { createHash } from "node:crypto";

export class DeyeError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

// "1000000" is the normal success code; some endpoints answer 0.
const SUCCESS = new Set(["0", "1000000"]);
// Expired or invalid token: get a new one and retry once.
const TOKEN_INVALID = new Set(["1001", "1002", "1003", "2101017", "2101019"]);

export function deyeConfigured() {
  return !!(process.env.DEYE_APP_ID && process.env.DEYE_APP_SECRET && process.env.DEYE_EMAIL && process.env.DEYE_PASSWORD);
}

function config() {
  const { DEYE_APP_ID: appId, DEYE_APP_SECRET: appSecret, DEYE_EMAIL: email, DEYE_PASSWORD: password } = process.env;
  if (!appId || !appSecret || !email || !password) {
    throw new DeyeError("DEYE_APP_ID, DEYE_APP_SECRET, DEYE_EMAIL and DEYE_PASSWORD must be set");
  }
  // EU data center serves Europe, Asia and Africa; the US one serves the Americas.
  const baseUrl = (process.env.DEYE_BASE_URL || "https://eu1-developer.deyecloud.com/v1.0").replace(/\/$/, "");
  return { baseUrl, appId, appSecret, email, password };
}

type Body = Record<string, unknown> & { code?: unknown; msg?: string; success?: boolean; data?: unknown };

let token: { value: string; expiresAt: number } | null = null;

async function post(path: string, payload: unknown, accessToken?: string): Promise<Body> {
  const { baseUrl } = config();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new DeyeError("Deye rate limit reached, will retry later", "429");
  if (!res.ok) throw new DeyeError(`Deye HTTP ${res.status} for ${path}`);
  return (await res.json()) as Body;
}

const ok = (b: Body) => b.success === true || SUCCESS.has(String(b.code));

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const { appId, appSecret, email, password } = config();
  // Deye wants the SHA-256 hex of the password, never the password itself.
  const body = await post(`/account/token?appId=${encodeURIComponent(appId)}`, {
    appSecret,
    email,
    password: createHash("sha256").update(password).digest("hex"),
  });
  if (!ok(body)) throw new DeyeError(`Deye login failed: ${body.msg ?? "unknown error"}`, String(body.code));
  const result = (body.data && typeof body.data === "object" ? body.data : body) as { accessToken?: string; expiresIn?: number | string };
  if (!result.accessToken) throw new DeyeError("Deye login returned no token");
  // Tokens last about 60 days; renew a day early.
  const ttl = Number(result.expiresIn) || 5_184_000;
  token = { value: result.accessToken.replace(/^bearer\s+/i, ""), expiresAt: Date.now() + (ttl - 86_400) * 1000 };
  return token.value;
}

async function call<T>(path: string, payload: unknown): Promise<T> {
  let body = await post(path, payload, await getToken());
  if (!ok(body) && TOKEN_INVALID.has(String(body.code))) {
    token = null;
    body = await post(path, payload, await getToken());
  }
  if (!ok(body)) throw new DeyeError(`Deye ${path}: ${body.msg ?? "error"} (code ${body.code})`, String(body.code));
  return (body.data && typeof body.data === "object" ? body.data : body) as T;
}

export type DeyeStation = { id: string; name: string; installedCapacity: number | null; lastUpdateTime: number | null };

/** Every station (plant) on the Deye account. */
export async function listStations(): Promise<DeyeStation[]> {
  const out: DeyeStation[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await call<{ total?: number; stationList?: Record<string, unknown>[] }>("/station/list", { page, size: 100 });
    const rows = r.stationList ?? [];
    for (const s of rows) {
      out.push({
        id: String(s.id),
        name: String(s.name ?? `Station ${s.id}`),
        installedCapacity: s.installedCapacity == null ? null : Number(s.installedCapacity),
        lastUpdateTime: s.lastUpdateTime == null ? null : Number(s.lastUpdateTime),
      });
    }
    if (rows.length < 100 || out.length >= Number(r.total ?? 0)) break;
  }
  return out;
}

/** Latest power snapshot of a station (raw; see decode.ts). */
export function stationLatest(stationId: string) {
  return call<Record<string, unknown>>("/station/latest", { stationId: Number(stationId) });
}

/**
 * Daily energy totals (kWh) for `start` to `endExclusive` (YYYY-MM-DD). Deye rejects spans of 31 days
 * or more, so callers keep each request to 30.
 */
export async function stationDaily(stationId: string, start: string, endExclusive: string) {
  const r = await call<{ stationDataItems?: Record<string, unknown>[] }>("/station/history", {
    stationId: Number(stationId),
    granularity: 2,
    startAt: start,
    endAt: endExclusive,
  });
  return r.stationDataItems ?? [];
}
