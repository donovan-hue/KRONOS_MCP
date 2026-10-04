import { z } from "zod";
import { getKronosConfig } from "../config/env.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_048_576;

const nullableString = z.string().nullable().optional();
const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  database: z.string(),
  realtime: z.boolean(),
  timestamp: z.string(),
  build: z.object({
    commit: nullableString,
    commitShort: nullableString,
    branch: nullableString,
    repo: nullableString,
    serviceName: nullableString,
    startedAt: nullableString,
    traceable: z.boolean().optional(),
  }).passthrough().optional(),
  environment: nullableString,
  environmentDeclared: z.boolean().optional(),
  autoIndex: z.boolean().optional(),
}).passthrough();

export type KronosHealth = z.infer<typeof healthSchema>;
export interface RequestOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  token?: string;
}

export class KronosApiError extends Error {
  constructor(readonly code: string, readonly httpStatus?: number) {
    super(code);
    this.name = "KronosApiError";
  }
}

function isJsonContentType(value: string | null): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new KronosApiError("RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new KronosApiError("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function requestKronosJson(path: string, token?: string, options: RequestOptions = {}): Promise<unknown> {
  let baseUrl: string;
  try {
    baseUrl = options.baseUrl ?? getKronosConfig().KRONOS_API_URL;
  } catch {
    throw new KronosApiError("CONFIG_INVALID");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new KronosApiError("UPSTREAM_TIMEOUT");
    }
    throw new KronosApiError("UPSTREAM_UNAVAILABLE");
  }

  if (!isJsonContentType(response.headers.get("content-type"))) {
    throw new KronosApiError("INVALID_RESPONSE", response.status);
  }
  const text = await readBoundedBody(response);
  if (!response.ok) throw new KronosApiError("UPSTREAM_HTTP_ERROR", response.status);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new KronosApiError("INVALID_RESPONSE", response.status);
  }
}

export async function getKronosHealth(options: RequestOptions = {}): Promise<KronosHealth> {
  const data = await requestKronosJson("/api/health", undefined, options);
  const parsed = healthSchema.safeParse(data);
  if (!parsed.success) throw new KronosApiError("INVALID_RESPONSE");
  return parsed.data;
}
