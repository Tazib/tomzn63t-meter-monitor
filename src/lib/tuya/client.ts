// Minimal read-only Tuya Cloud client (simple mode, HMAC-SHA256 signing).
// Used by both the Next.js server and the standalone poller, so no "server-only" here.
import { createHash, createHmac, randomUUID } from "node:crypto";

export type TuyaStatus = { code: string; value: unknown };

export type TuyaDevice = {
  id: string;
  name: string;
  category: string; // "dlq" = breaker with metering (TOVA 63T)
  productName: string;
  online: boolean;
  uid: string;
  status: TuyaStatus[];
};

type TuyaResponse<T> = { success: boolean; code?: number; msg?: string; result: T };

export class TuyaError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

const TOKEN_INVALID = new Set([1010, 1011]);
const BATCH_SIZE = 20; // Tuya's limit for device_ids per request

function config() {
  const baseUrl = process.env.TUYA_BASE_URL;
  const accessId = process.env.TUYA_ACCESS_ID;
  const secret = process.env.TUYA_ACCESS_SECRET;
  if (!baseUrl || !accessId || !secret) throw new TuyaError("TUYA_BASE_URL, TUYA_ACCESS_ID and TUYA_ACCESS_SECRET must be set");
  return { baseUrl, accessId, secret };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let token: { value: string; expiresAt: number } | null = null;

async function request<T>(path: string, accessToken: string): Promise<TuyaResponse<T>> {
  const { baseUrl, accessId, secret } = config();
  const t = Date.now().toString();
  const nonce = randomUUID();
  const stringToSign = ["GET", sha256(""), "", path].join("\n");
  const sign = createHmac("sha256", secret)
    .update(accessId + accessToken + t + nonce + stringToSign)
    .digest("hex")
    .toUpperCase();

  const headers: Record<string, string> = { client_id: accessId, t, nonce, sign, sign_method: "HMAC-SHA256" };
  if (accessToken) headers.access_token = accessToken;

  const res = await fetch(baseUrl + path, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new TuyaError(`Tuya HTTP ${res.status} for ${path}`);
  return res.json() as Promise<TuyaResponse<T>>;
}

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const res = await request<{ access_token: string; expire_time: number }>("/v1.0/token?grant_type=1", "");
  if (!res.success) throw new TuyaError(`Tuya token: ${res.msg}`, res.code);
  // Refresh a minute early.
  token = { value: res.result.access_token, expiresAt: Date.now() + (res.result.expire_time - 60) * 1000 };
  return token.value;
}

async function get<T>(path: string): Promise<T> {
  let res = await request<T>(path, await getToken());
  if (!res.success && res.code && TOKEN_INVALID.has(res.code)) {
    token = null;
    res = await request<T>(path, await getToken());
  }
  if (!res.success) throw new TuyaError(`Tuya ${path}: ${res.msg}`, res.code);
  return res.result;
}

/** All devices of one linked Smart Life account, with their current status. */
export async function listUserDevices(uid: string): Promise<TuyaDevice[]> {
  type Raw = { id: string; name: string; category: string; product_name: string; online: boolean; uid: string; status: TuyaStatus[] };
  const rows = await get<Raw[]>(`/v1.0/users/${encodeURIComponent(uid)}/devices`);
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    productName: d.product_name,
    online: d.online,
    uid: d.uid,
    status: d.status ?? [],
  }));
}

/** Current status of many devices, batched 20 per request. */
export async function getStatuses(deviceIds: string[]): Promise<Map<string, TuyaStatus[]>> {
  const out = new Map<string, TuyaStatus[]>();
  for (let i = 0; i < deviceIds.length; i += BATCH_SIZE) {
    const ids = deviceIds.slice(i, i + BATCH_SIZE).join(",");
    const rows = await get<{ id: string; status: TuyaStatus[] }[]>(`/v1.0/iot-03/devices/status?device_ids=${ids}`);
    for (const r of rows) out.set(r.id, r.status);
  }
  return out;
}
