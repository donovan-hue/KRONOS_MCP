/**
 * Tipos y helpers compartidos por las 18 familias de herramientas locales.
 *
 * Cada herramienta se define con `defineTool`, referenciando su número del
 * catálogo maestro: nombre, apodo, familia y descripción salen del catálogo
 * generado, nunca se duplican a mano. El ejemplo (`example`) es obligatorio:
 * lo usa la batería de pruebas para llamar a las 180 y sirve de muestra viva.
 */
import { z } from "zod";
import { KronosApiError } from "../services/kronos-api.js";

export interface ToolResult {
  summary: string;
  data: Record<string, unknown>;
  warnings?: string[];
}

export interface LocalToolDefinition {
  /** Posición 1-180 en el catálogo maestro. */
  number: number;
  /** true si muta estado en memoria del proceso (anotación MCP readOnlyHint=false). */
  stateful?: boolean;
  /** Limitación honesta declarada al llamante (p. ej. paso final con proveedor). */
  limitation?: string;
  inputSchema: unknown;
  /** Entrada de ejemplo válida y ejecutable. */
  example: Record<string, unknown>;
  run: (args: unknown) => Promise<ToolResult>;
}

interface DefineToolInput<S extends z.ZodObject<z.ZodRawShape>> {
  number: number;
  stateful?: boolean;
  limitation?: string;
  inputSchema: S;
  example: z.infer<S> & Record<string, unknown>;
  handler: (input: z.infer<S>) => ToolResult | Promise<ToolResult>;
}

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: DefineToolInput<S>): LocalToolDefinition {
  return {
    number: def.number,
    stateful: def.stateful,
    limitation: def.limitation,
    inputSchema: def.inputSchema,
    example: def.example,
    run: async (args: unknown) => {
      const parsed = def.inputSchema.safeParse(args ?? {});
      if (!parsed.success) throw new KronosApiError("INVALID_INPUT");
      return def.handler(parsed.data);
    },
  };
}

/** Aborta con un código de error estable (ver README: contrato de errores). */
export function fail(code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "LIMIT_EXCEEDED" | "NOT_CONFIGURED" | "FORBIDDEN"): never {
  throw new KronosApiError(code);
}

/* ---------------- Esquemas reutilizables, todos con límites ---------------- */

export const txt = (max = 20_000) => z.string().max(max);
export const reqText = (max = 20_000) => z.string().min(1).max(max);
export const longText = () => z.string().max(200_000);
export const idStr = () => z.string().min(1).max(200);
export const strArr = (maxItems = 200, maxLen = 5_000) => z.array(z.string().max(maxLen)).max(maxItems);
export const numArr = (maxItems = 5_000) => z.array(z.number().finite()).max(maxItems);
export const unknownArr = (maxItems = 1_000) => z.array(z.unknown()).max(maxItems);
export const rec = () => z.record(z.string(), z.unknown());
export const recArr = (maxItems = 500) => z.array(z.record(z.string(), z.unknown())).max(maxItems);
export const numRec = () => z.record(z.string(), z.number().finite());
export const score01 = () => z.number().min(0).max(1);
export const score100 = () => z.number().min(0).max(100);

/** Tarea con dependencias, compartida por varias familias de coordinación/planificación. */
export const taskSchema = z.object({
  id: idStr(),
  title: z.string().max(500).optional(),
  dependsOn: z.array(idStr()).max(100).optional(),
  duration: z.number().nonnegative().optional(),
  durationDays: z.number().nonnegative().optional(),
  status: z.string().max(50).optional(),
  weight: z.number().nonnegative().optional(),
}).passthrough();

export const tasksSchema = (max = 500) => z.array(taskSchema).min(1).max(max);
