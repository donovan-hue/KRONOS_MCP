import { z } from "zod";
import { getKronosConfig } from "../config/env.js";

export const REQUEST_TIMEOUT_MS = 10_000;
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

interface RequestState {
  response?: Response;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
}

function cancelBody(state: RequestState): void {
  // A locked stream must be cancelled through its reader. Never wait for
  // cleanup to finish before delivering a timeout or response-size error.
  if (state.reader) {
    void state.reader.cancel().catch(() => {});
  } else if (state.response?.body && !state.response.body.locked) {
    void state.response.body.cancel().catch(() => {});
  }
}

async function readBoundedBody(response: Response, state: RequestState): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new KronosApiError("RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  state.reader = reader;
  let complete = false;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new KronosApiError("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    if (!complete) cancelBody(state);
    reader.releaseLock();
    state.reader = undefined;
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

  // One explicit wall-clock budget for headers AND body, not an idle timeout.
  // The race bounds the caller even if fetch/read doesn't promptly honor abort;
  // abort + reader.cancel() also terminate the underlying stream on expiry.
  const controller = new AbortController();
  const state: RequestState = {};
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      const error = new KronosApiError("UPSTREAM_TIMEOUT", state.response?.status);
      reject(error);
      controller.abort(error);
      cancelBody(state);
    }, REQUEST_TIMEOUT_MS);
  });

  const operation = (async () => {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers,
        signal: controller.signal,
        redirect: "error",
      });
      state.response = response;
      if (expired) throw new KronosApiError("UPSTREAM_TIMEOUT", response.status);
      if (!isJsonContentType(response.headers.get("content-type"))) {
        throw new KronosApiError("INVALID_RESPONSE", response.status);
      }
      const text = await readBoundedBody(response, state);
      if (expired) throw new KronosApiError("UPSTREAM_TIMEOUT", response.status);
      if (!response.ok) throw new KronosApiError("UPSTREAM_HTTP_ERROR", response.status);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new KronosApiError("INVALID_RESPONSE", response.status);
      }
    } finally {
      cancelBody(state);
    }
  })();

  // The race observes rejections; this handler also explicitly consumes a
  // transport's late rejection after the caller has already timed out.
  void operation.catch(() => {});
  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (error instanceof KronosApiError) throw error;
    if (expired || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))) {
      throw new KronosApiError("UPSTREAM_TIMEOUT", state.response?.status);
    }
    throw new KronosApiError("UPSTREAM_UNAVAILABLE", state.response?.status);
  } finally {
    clearTimeout(timer!);
  }
}

export async function getKronosHealth(options: RequestOptions = {}): Promise<KronosHealth> {
  const data = await requestKronosJson("/api/health", undefined, options);
  const parsed = healthSchema.safeParse(data);
  if (!parsed.success) throw new KronosApiError("INVALID_RESPONSE");
  return parsed.data;
}
