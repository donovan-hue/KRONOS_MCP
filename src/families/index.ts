/**
 * Índice de las 18 familias del catálogo maestro.
 *
 * Se valida al cargar que estén exactamente las 180 posiciones, sin huecos
 * ni duplicados: una familia mal montada es un error de programación y debe
 * explotar en el arranque, no en producción.
 */
import type { LocalToolDefinition } from "./types.js";
import { f01 } from "./f01-coordination.js";
import { f02 } from "./f02-diagnostics.js";
import { f03 } from "./f03-planning.js";
import { f04 } from "./f04-simulation.js";
import { f05 } from "./f05-testing.js";
import { f06 } from "./f06-security.js";
import { f07 } from "./f07-context.js";
import { f08 } from "./f08-data.js";
import { f09 } from "./f09-development.js";
import { f10 } from "./f10-web.js";
import { f11 } from "./f11-image.js";
import { f12 } from "./f12-video.js";
import { f13 } from "./f13-audio.js";
import { f14 } from "./f14-content.js";
import { f15 } from "./f15-providers.js";
import { f16 } from "./f16-automation.js";
import { f17 } from "./f17-observability.js";
import { f18 } from "./f18-experience.js";

export const FAMILIES: readonly (readonly LocalToolDefinition[])[] = [
  f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18,
];

export const ALL_LOCAL_TOOLS: readonly LocalToolDefinition[] = FAMILIES
  .flatMap((family) => [...family])
  .sort((a, b) => a.number - b.number);

{
  const numbers = new Set(ALL_LOCAL_TOOLS.map((t) => t.number));
  if (ALL_LOCAL_TOOLS.length !== 180 || numbers.size !== 180) {
    throw new Error(`LOCAL_TOOLS_INCOMPLETE: ${ALL_LOCAL_TOOLS.length} definiciones, ${numbers.size} únicas`);
  }
  for (let n = 1; n <= 180; n += 1) {
    if (!numbers.has(n)) throw new Error(`LOCAL_TOOLS_INCOMPLETE: falta la herramienta ${n}`);
  }
  for (const [index, family] of FAMILIES.entries()) {
    if (family.length !== 10) {
      throw new Error(`LOCAL_TOOLS_INCOMPLETE: la familia posición ${index + 1} tiene ${family.length} herramientas`);
    }
  }
}
