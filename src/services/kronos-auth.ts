import { z } from "zod";
import { getKronosMcpToken } from "../config/mcp.js";
import { KronosApiError, requestKronosJson, type RequestOptions } from "./kronos-api.js";

const identitySchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  identity: z.string(),
  permissions: z.array(z.string()),
}).passthrough();

export async function getKronosMe(options: RequestOptions = {}) {
  let token: string;
  try {
    token = options.token ?? getKronosMcpToken();
  } catch {
    throw new KronosApiError("AUTH_REQUIRED");
  }
  const data = await requestKronosJson("/api/mcp/me", token, options);
  const parsed = identitySchema.safeParse(data);
  if (!parsed.success) throw new KronosApiError("INVALID_RESPONSE");
  return parsed.data;
}
