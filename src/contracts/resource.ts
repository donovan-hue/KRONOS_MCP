import { z } from "zod";
import { capabilitySchema } from "./common.js";

/**
 * MCP resource contract.
 *
 * Resources are declared here as contracts only. Declaring a URI does not create
 * a backend endpoint: a resource may only be served once the upstream route that
 * backs it genuinely exists.
 */

export const resourceUriSchema = z
  .string()
  .min(1)
  .refine((value) => /^[a-z][a-z0-9+.-]*:\/\//.test(value), {
    message: "resource uri must start with a scheme, e.g. kronos://",
  });

export const resourceContractSchema = z.object({
  /** May be a template such as `kairos://project/{id}`. */
  uri: resourceUriSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  capability: capabilitySchema,
  requiredPermission: z.string().min(1).optional(),
  /** True when `uri` contains `{param}` placeholders. */
  templated: z.boolean(),
});

export type ResourceContract = z.infer<typeof resourceContractSchema>;

export function resource(
  contract: Omit<ResourceContract, "templated">,
): ResourceContract {
  return { ...contract, templated: /\{[^}]+\}/.test(contract.uri) };
}

/**
 * Matches a concrete URI against a templated one, exposing the captured params.
 * Segment counts must match exactly; a template is never a prefix match.
 */
export function matchResourceTemplate(
  template: string,
  uri: string,
): Record<string, string> | null {
  const templatePath = stripScheme(template);
  const uriPath = stripScheme(uri);
  if (schemeOf(template) !== schemeOf(uri)) return null;

  const t = templatePath.split("/");
  const u = uriPath.split("/");
  if (t.length !== u.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < t.length; i += 1) {
    const segment = t[i]!;
    const value = u[i]!;
    if (segment.startsWith("{") && segment.endsWith("}")) {
      const key = segment.slice(1, -1);
      if (!key || !value) return null;
      params[key] = decodeURIComponent(value);
      continue;
    }
    if (segment !== value) return null;
  }
  return params;
}

function schemeOf(uri: string): string {
  const index = uri.indexOf("://");
  return index === -1 ? "" : uri.slice(0, index);
}

function stripScheme(uri: string): string {
  const index = uri.indexOf("://");
  return index === -1 ? uri : uri.slice(index + 3).replace(/\/+$/, "");
}
