#!/usr/bin/env node
/**
 * Genera el catálogo tipado de las 180 herramientas y su documentación
 * a partir de la fuente en texto plano versionada en docs/.
 *
 * Fuente:  docs/KRONOS_MCP_180_Herramientas.txt   (catálogo maestro v1.0)
 * Salidas: src/catalog/tools-180.ts               (GENERADO, no editar)
 *          docs/HERRAMIENTAS_180.md               (GENERADO, no editar)
 *
 * Uso: npm run generate:catalog
 * Falla si el parseo no produce exactamente 180 herramientas únicas
 * en 18 familias de 10.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "docs/KRONOS_MCP_180_Herramientas.txt");
const tsPath = join(root, "src/catalog/tools-180.ts");
const mdPath = join(root, "docs/HERRAMIENTAS_180.md");

/** Nombre legible y capability por familia (el .txt trae el título en mayúsculas). */
const FAMILIES = {
  "01": { name: "Coordinación y enrutamiento inteligente", capability: "coordination" },
  "02": { name: "Diagnóstico, reparación y recuperación", capability: "diagnostics" },
  "03": { name: "Planificación y objetivos complejos", capability: "planning" },
  "04": { name: "Simulación, consecuencias y decisiones", capability: "simulation" },
  "05": { name: "Pruebas y evaluación de capacidades", capability: "testing" },
  "06": { name: "Control de cambios y seguridad operativa", capability: "security" },
  "07": { name: "Contexto, memoria y conocimiento", capability: "context" },
  "08": { name: "Datos, archivos y transformación", capability: "data" },
  "09": { name: "Desarrollo de software y repositorios", capability: "development" },
  "10": { name: "Web, búsqueda y verificación", capability: "web" },
  "11": { name: "Multimedia: imagen y diseño visual", capability: "image" },
  "12": { name: "Multimedia: vídeo y movimiento", capability: "video" },
  "13": { name: "Multimedia: audio, voz y música", capability: "audio" },
  "14": { name: "Guion, contenido y publicación", capability: "content" },
  "15": { name: "Proveedores, costes y capacidad", capability: "providers" },
  "16": { name: "Automatización e integraciones", capability: "automation" },
  "17": { name: "Observabilidad, métricas y rendimiento", capability: "observability" },
  "18": { name: "Experiencia, personalización y accesibilidad", capability: "experience" },
};

const raw = readFileSync(sourcePath, "utf8");
const lines = raw.split(/\r?\n/);

// --- 1. Trocear por secciones de familia delimitadas por líneas "=====" ---
const sections = [];
let current = null;
let previousLine = "";
for (const line of lines) {
  // Cabecera de familia: "NN. TÍTULO EN MAYÚSCULAS" precedida por "=====".
  // (El índice inicial también empieza líneas con "NN.", sin separador.)
  const m = line.match(/^(\d{2})\.\s+(.+)$/);
  if (m && FAMILIES[m[1]] && !line.includes("—") && /^={10,}$/.test(previousLine.trim())) {
    current = { familyId: m[1], header: m[2].trim(), body: [] };
    sections.push(current);
    previousLine = line;
    continue;
  }
  if (line.startsWith("NOTAS DE IMPLEMENTACIÓN")) current = null;
  if (/^={10,}$/.test(line.trim())) { previousLine = line; continue; }
  if (current) current.body.push(line);
  previousLine = line;
}
const familySections = sections.filter((s) => FAMILIES[s.familyId]);
if (familySections.length !== 18) {
  throw new Error(`Se esperaban 18 familias; se encontraron ${familySections.length}: ${familySections.map((s) => s.familyId).join(",")}`);
}

// --- 2. Extraer las 10 entradas de cada familia ---
function slugifyTechnical(technicalName) {
  const slug = technicalName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `kronos_${slug}`;
}

const entries = [];
for (const section of familySections) {
  const meta = FAMILIES[section.familyId];
  const text = section.body.join(" ").replace(/\s+/g, " ").trim();
  const regex = /(\d{1,3})\.\s+(.+?)\s+—\s+(.+?)\s+Función:\s+(.+?)(?=\s+\d{1,3}\.\s+|$)/g;
  let match;
  let found = 0;
  while ((match = regex.exec(text)) !== null) {
    const [, numberRaw, nickname, technicalName, description] = match;
    const number = Number(numberRaw);
    entries.push({
      number,
      nickname: nickname.trim(),
      technicalName: technicalName.trim(),
      name: slugifyTechnical(technicalName.trim()),
      familyId: section.familyId,
      familyName: meta.name,
      capability: meta.capability,
      description: description.trim(),
    });
    found += 1;
  }
  if (found !== 10) {
    throw new Error(`Familia ${section.familyId}: se esperaban 10 herramientas; se encontraron ${found}`);
  }
}

entries.sort((a, b) => a.number - b.number);
if (entries.length !== 180) throw new Error(`Se esperaban 180; hay ${entries.length}`);
const numbers = new Set(entries.map((e) => e.number));
const names = new Set(entries.map((e) => e.name));
const nicknames = new Set(entries.map((e) => e.nickname));
if (numbers.size !== 180 || names.size !== 180 || nicknames.size !== 180) {
  throw new Error("Duplicados en número, nombre MCP o apodo");
}
for (let i = 1; i <= 180; i += 1) {
  if (!numbers.has(i)) throw new Error(`Falta la herramienta ${i}`);
}
for (const e of entries) {
  if (!/^[a-z0-9_]{1,64}$/.test(e.name)) throw new Error(`Nombre MCP inválido: ${e.name}`);
}

// --- 3. Emitir TypeScript ---
const tsRows = entries
  .map((e) => `  ${JSON.stringify(e)},`)
  .join("\n");
const ts = `/**
 * GENERADO por scripts/generate-catalog.mjs — no editar a mano.
 *
 * Fuente: docs/KRONOS_MCP_180_Herramientas.txt (catálogo maestro v1.0, 19-10-2026).
 * Regenerar con: npm run generate:catalog
 */
import type { Capability } from "../contracts/common.js";

export interface CatalogEntry {
  /** Posición 1-180 en el catálogo maestro. */
  number: number;
  /** apodo único en español. */
  nickname: string;
  /** Nombre técnico en inglés. */
  technicalName: string;
  /** Nombre MCP en snake_case derivado del nombre técnico. */
  name: string;
  familyId: string;
  familyName: string;
  capability: Capability;
  /** Función prevista según el catálogo, en español. */
  description: string;
}

export const TOOLS_180: readonly CatalogEntry[] = [
${tsRows}
];
`;
mkdirSync(dirname(tsPath), { recursive: true });
writeFileSync(tsPath, ts, "utf8");

// --- 4. Emitir documentación ---
let md = `# KRONOS MCP — 180 herramientas locales\n\n`;
md += `> Generado por \`npm run generate:catalog\` desde \`docs/KRONOS_MCP_180_Herramientas.txt\`. No editar a mano.\n\n`;
md += `Las 180 herramientas se ejecutan **localmente y sin proveedores externos**: trabajan de forma determinista sobre los datos que reciben en cada llamada y devuelven un sobre estructurado con \`summary\`, \`data\`, \`warnings\` y \`limitations\`. Las herramientas cuyo paso final requeriría un proveedor (generar la imagen, renderizar el vídeo, buscar en la web viva…) realizan el enrutamiento, la planificación o la verificación y lo declaran en \`limitations\`; nunca fingen haber generado el activo.\n\n`;
md += `Las 4 herramientas del núcleo KRONOS (\`kronos_status\`, \`kronos_health\`, \`kronos_me\`, \`kronos_contracts\`) se documentan en el README. En total el servidor expone **184 herramientas**.\n`;
for (const section of familySections) {
  const meta = FAMILIES[section.familyId];
  md += `\n## ${section.familyId}. ${meta.name} (\`${meta.capability}\`)\n\n`;
  md += `| # | Herramienta MCP | apodo | Nombre técnico | Función |\n|---|---|---|---|---|\n`;
  for (const e of entries.filter((x) => x.familyId === section.familyId)) {
    md += `| ${e.number} | \`${e.name}\` | ${e.nickname} | ${e.technicalName} | ${e.description} |\n`;
  }
}
md += `\n## Notas\n\n- Nombre MCP = \`kronos_\` + nombre técnico en snake_case. Los apodos se mantienen únicos, como exige el catálogo.\n- Ninguna de las 180 contacta KRONOS ni la red, ni escribe en disco, ni ejecuta comandos. Las marcadas como con estado guardan datos solo en memoria del proceso (se pierden al reiniciar).\n- Los ejemplos de entrada ejecutables de cada herramienta viven junto a su definición en \`src/families/\` y se verifican en \`tests/local-tools.test.ts\`.\n`;
writeFileSync(mdPath, md, "utf8");

process.stdout.write(`Catálogo generado: ${entries.length} herramientas, 18 familias.\n- ${tsPath}\n- ${mdPath}\n`);
