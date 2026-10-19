/**
 * Acceso al catálogo maestro de 180 herramientas.
 *
 * Los datos viven en `tools-180.ts` (generado desde
 * `docs/KRONOS_MCP_180_Herramientas.txt`); este módulo solo añade búsquedas.
 */
import { TOOLS_180, type CatalogEntry } from "./tools-180.js";

export { TOOLS_180, type CatalogEntry };

const byNumberMap = new Map<number, CatalogEntry>(TOOLS_180.map((e) => [e.number, e]));
const byNameMap = new Map<string, CatalogEntry>(TOOLS_180.map((e) => [e.name, e]));

/** Entrada del catálogo por posición (1-180). Lanza si no existe: es un error de programación. */
export function catalogEntry(number: number): CatalogEntry {
  const entry = byNumberMap.get(number);
  if (!entry) throw new Error(`CATALOG_ENTRY_NOT_FOUND: ${number}`);
  return entry;
}

export function catalogByName(name: string): CatalogEntry | undefined {
  return byNameMap.get(name);
}

export function catalogFamily(familyId: string): CatalogEntry[] {
  return TOOLS_180.filter((e) => e.familyId === familyId);
}

/** Herramientas del núcleo que ya existían antes del catálogo (ver README). */
export const CORE_TOOL_NAMES = ["kronos_status", "kronos_health", "kronos_me", "kronos_contracts"] as const;

export function isKnownToolName(name: string): boolean {
  return byNameMap.has(name) || (CORE_TOOL_NAMES as readonly string[]).includes(name);
}
