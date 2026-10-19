/** Familia 09 — Desarrollo de software y repositorios (herramientas 81-90). */
import { z } from "zod";
import { canonicalStringify } from "../engines/data.js";
import { scanSecrets } from "../engines/security.js";
import { unifiedDiff } from "../engines/text.js";
import { defineTool, fail, idStr, longText, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

interface ScaffoldFile { path: string; purpose: string; content: string }

function scaffold(projectName: string, stack: "node-ts" | "node-js" | "python" | "web-static", features: string[]): ScaffoldFile[] {
  if (stack === "python") {
    return [
      { path: "README.md", purpose: "Entrada del proyecto", content: `# ${projectName}\n\n## Uso\n\n\`\`\`sh\npython3 -m venv .venv\n.venv/bin/pip install -r requirements.txt\n.venv/bin/python -m src.main\n\`\`\`\n` },
      { path: "requirements.txt", purpose: "Dependencias (pínchalas al instalar)", content: "" },
      { path: "src/__init__.py", purpose: "Paquete principal", content: "" },
      { path: "src/main.py", purpose: "Punto de entrada", content: `"""${projectName}: punto de entrada."""\n\n\ndef main() -> None:\n    print("hola desde ${projectName}")\n\n\nif __name__ == "__main__":\n    main()\n` },
      { path: "tests/test_main.py", purpose: "Prueba de humo", content: `from src.main import main\n\n\ndef test_main_runs(capsys):\n    main()\n    assert "${projectName}" in capsys.readouterr().out\n` },
      { path: ".gitignore", purpose: "Ignorados", content: ".venv/\n__pycache__/\n.env\n" },
    ];
  }
  if (stack === "web-static") {
    return [
      { path: "index.html", purpose: "Página principal", content: `<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${projectName}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <main><h1>${projectName}</h1><p>Empieza aquí.</p></main>\n  <script src="app.js"></script>\n</body>\n</html>\n` },
      { path: "styles.css", purpose: "Estilos base", content: `:root { color-scheme: light dark; }\nbody { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 42rem; padding: 0 1rem; line-height: 1.5; }\n` },
      { path: "app.js", purpose: "Lógica de cliente", content: `// ${projectName}\ndocument.addEventListener('DOMContentLoaded', () => {\n});\n` },
      { path: "README.md", purpose: "Entrada del proyecto", content: `# ${projectName}\n\nSitio estático. Abre index.html o sírvelo con cualquier servidor de archivos.\n` },
    ];
  }
  const ts = stack === "node-ts";
  return [
    { path: "package.json", purpose: "Manifiesto (instala y fija versiones con lockfile)", content: JSON.stringify({ name: projectName, version: "0.1.0", private: true, type: "module", scripts: ts ? { build: "tsc", start: "node dist/index.js", test: "node --import tsx --test tests/*.test.ts" } : { start: "node src/index.js", test: "node --test tests/" }, description: "", keywords: [], license: "ISC" }, null, 2) + "\n" },
    ...(ts ? [{ path: "tsconfig.json", purpose: "TypeScript estricto ESM", content: JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist", rootDir: "src" }, include: ["src/**/*.ts"] }, null, 2) + "\n" }] : []),
    { path: `src/index.${ts ? "ts" : "js"}`, purpose: "Punto de entrada", content: ts ? `export function greet(name: string): string {\n  return \`hola, \${name}\`;\n}\n\nif (process.argv[1]?.endsWith("index.js")) {\n  process.stdout.write(greet("${projectName}") + "\\n");\n}\n` : `export function greet(name) {\n  return "hola, " + name;\n}\n\nif (process.argv[1]?.endsWith("index.js")) {\n  process.stdout.write(greet("${projectName}") + "\\n");\n}\n` },
    { path: `tests/${ts ? "greet.test.ts" : "greet.test.js"}`, purpose: "Prueba inicial con el runner de Node", content: `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { greet } from "../src/index.${ts ? "ts" : "js"}";\n\ntest("greet saluda por nombre", () => {\n  assert.equal(greet("kronos"), "hola, kronos");\n});\n` },
    { path: ".gitignore", purpose: "Ignorados", content: "node_modules/\ndist/\n.env\n.env.*\n!.env.example\n" },
    { path: "README.md", purpose: "Entrada del proyecto", content: `# ${projectName}\n\n## Uso\n\n\`\`\`sh\nnpm install\n${ts ? "npm run build\nnpm test\nnpm start" : "npm test\nnpm start"}\n\`\`\`\n\nCaracterísticas solicitadas: ${features.join(", ") || "ninguna extra"}.\n` },
    ...(features.includes("env") ? [{ path: ".env.example", purpose: "Plantilla sin secretos", content: "# Copia a .env y rellena localmente. Nunca subas .env a Git.\nEXAMPLE_TOKEN=\n" }] : []),
  ];
}

const scaffoldGenerator = defineTool({
  number: 81,
  limitation: "Devuelve la estructura y los contenidos como artefacto; no escribe archivos en disco.",
  inputSchema: z.object({
    projectName: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "kebab-case"),
    stack: z.enum(["node-ts", "node-js", "python", "web-static"]),
    features: z.array(z.enum(["env", "tests", "ci"])).max(3).optional(),
  }).strict(),
  example: { projectName: "mi-servicio", stack: "node-ts", features: ["env"] },
  handler: (input) => {
    const files = scaffold(input.projectName, input.stack, input.features ?? []);
    return {
      summary: `Esqueleto ${input.stack} para «${input.projectName}» con ${files.length} archivos.`,
      data: { files, nextSteps: input.stack === "python" ? ["Crear .venv", "Instalar dependencias", "Ejecutar pytest"] : input.stack === "web-static" ? ["Servir la carpeta", "Sustituir el contenido de ejemplo"] : ["npm install", "npm test", input.stack === "node-ts" ? "npm run build" : "npm start"] },
    };
  },
});

interface CodeFinding { kind: string; severity: string; line?: number; detail: string }

function analyzeCode(code: string, language: string): { findings: CodeFinding[]; metrics: Record<string, number> } {
  const lines = code.split("\n");
  const findings: CodeFinding[] = [];
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/TODO|FIXME|XXX/.test(line)) findings.push({ kind: "todo", severity: "low", line: lineNo, detail: line.trim().slice(0, 120) });
    if (/console\.log\b/.test(line) || (language === "python" && /\bprint\(/.test(line))) findings.push({ kind: "debug_output", severity: "low", line: lineNo, detail: "Salida de depuración en código" });
    if (line.length > 160) findings.push({ kind: "long_line", severity: "low", line: lineNo, detail: `Línea de ${line.length} caracteres` });
    if (/catch\s*\{\s*\}|catch\s*\([^)]*\)\s*\{\s*\}|except\s*:\s*pass/.test(line)) findings.push({ kind: "empty_catch", severity: "medium", line: lineNo, detail: "Captura de error vacía: el fallo quedaría oculto" });
    if ((language === "typescript" || language === "ts") && /:\s*any\b|as any\b/.test(line)) findings.push({ kind: "any_type", severity: "medium", line: lineNo, detail: "Uso de any: se pierde la seguridad de tipos" });
    if (/\beval\s*\(|new Function\s*\(/.test(line)) findings.push({ kind: "dynamic_eval", severity: "high", line: lineNo, detail: "Evaluación dinámica de código" });
  });
  for (const secret of scanSecrets(code)) findings.push({ kind: "possible_secret", severity: secret.severity, line: secret.line, detail: `${secret.type} (${secret.maskedPreview})` });
  const functionMatches = code.match(/function\s+\w+|=>\s*\{|^\s*def\s+\w+/gm) ?? [];
  let maxNesting = 0;
  let depth = 0;
  for (const ch of code) {
    if (ch === "{") { depth += 1; maxNesting = Math.max(maxNesting, depth); }
    else if (ch === "}") depth = Math.max(0, depth - 1);
  }
  return { findings: findings.slice(0, 200), metrics: { lines: lines.length, nonEmptyLines: lines.filter((l) => l.trim().length > 0).length, functionsApprox: functionMatches.length, maxBraceNesting: maxNesting, characters: code.length } };
}

const staticAnalysis = defineTool({
  number: 82,
  limitation: "Análisis heurístico local por patrones: orienta, pero no sustituye al compilador, al linter ni a las pruebas del proyecto.",
  inputSchema: z.object({ code: longText(), language: z.string().min(1).max(50).optional() }).strict(),
  example: { code: "export function f(x: any) {\n  // TODO: revisar\n  try { return x; } catch {}\n}\n", language: "typescript" },
  handler: (input) => {
    const { findings, metrics } = analyzeCode(input.code, input.language ?? "unknown");
    return {
      summary: `${findings.length} hallazgos (${findings.filter((f) => f.severity === "high").length} graves) en ${metrics.lines} líneas.`,
      data: { findings, metrics, byKind: Object.fromEntries([...findings.reduce((acc, f) => acc.set(f.kind, (acc.get(f.kind) ?? 0) + 1), new Map<string, number>())]) },
    };
  },
});

const refactorPlanner = defineTool({
  number: 83,
  inputSchema: z.object({
    goal: reqText(1_000),
    code: longText().optional(),
    language: txt(50).optional(),
    riskTolerance: z.enum(["low", "medium", "high"]).optional(),
    hasTests: z.boolean().optional(),
  }).strict(),
  example: { goal: "Extraer el cálculo de precios a un módulo propio", code: "export function total(items) { let t = 0; for (const i of items) { t += i.price; } return t; }", language: "typescript", riskTolerance: "low", hasTests: false },
  handler: (input) => {
    const analysis = input.code ? analyzeCode(input.code, input.language ?? "unknown") : { findings: [], metrics: null };
    const risk = input.riskTolerance ?? "low";
    const steps = [
      ...(input.hasTests ? [] : [{ phase: "red_de_seguridad", action: "Añadir primero pruebas de caracterización del comportamiento actual (entradas reales -> salidas actuales).", gate: "Las pruebas pasan antes de tocar código" }]),
      { phase: "acotar", action: `Definir el alcance exacto de «${input.goal}» y lo que NO se toca en este cambio.`, gate: "Alcance escrito y revisado" },
      { phase: "extraer_sin_cambiar_contrato", action: "Mover el código manteniendo firmas y comportamiento; un solo movimiento por commit.", gate: "Pruebas en verde sin cambiar sus expectativas" },
      { phase: "ajustar_llamantes", action: "Actualizar referencias y eliminar el código antiguo solo cuando nada lo use.", gate: "Build y tipos en verde" },
      ...(risk === "low" ? [{ phase: "comparacion_doble", action: "Comparar salida vieja frente a nueva con la misma entrada en los casos borde.", gate: "Sin diferencias no explicadas" }] : []),
      { phase: "limpieza", action: "Retirar duplicidades temporales y documentar la nueva frontera del módulo.", gate: "Revisión final sin TODOs introducidos" },
    ];
    return {
      summary: `Plan de refactor seguro de ${steps.length} fases (tolerancia al riesgo: ${risk}).`,
      data: { steps, currentSignals: analysis, rollback: "Cada fase es un commit revertible por separado; no mezclar el refactor con cambios funcionales." },
    };
  },
});

const patchGenerator = defineTool({
  number: 84,
  limitation: "Genera el parche unified diff como texto; no lo aplica ni escribe archivos.",
  inputSchema: z.object({ fileName: txt(300), original: longText(), modified: longText() }).strict(),
  example: { fileName: "src/app.ts", original: "const titulo = 'Hola';\n", modified: "const titulo = 'Hola KRONOS';\n" },
  handler: (input) => {
    if (input.original === input.modified) {
      return { summary: "Sin cambios: original y modificado son idénticos.", data: { patch: "", added: 0, removed: 0 }, warnings: ["No se generó parche porque no hay diferencias."] };
    }
    const { patch, added, removed, approximate } = unifiedDiff(input.fileName, input.original, input.modified);
    return {
      summary: `Parche generado para ${input.fileName}: +${added} -${removed} líneas.`,
      data: { patch, added, removed, approximate, applyHint: "Guárdalo como .patch y aplícalo con git apply en un árbol limpio." },
    };
  },
});

const dependencyAuditor = defineTool({
  number: 85,
  limitation: "Sin acceso a registros ni bases de vulnerabilidades: audita rangos de versión y licencias declaradas, no CVE conocidos.",
  inputSchema: z.object({
    manifest: longText().optional(),
    dependencies: z.record(z.string(), z.union([z.string().max(300), z.object({ version: txt(300), license: txt(100).optional(), latestMajor: z.number().int().nonnegative().optional() }).strict()])).optional(),
  }).strict(),
  example: { dependencies: { "lib-a": "*", "lib-b": "^2.3.0", "lib-c": { version: "1.0.0", license: "GPL-3.0-only", latestMajor: 4 }, "lib-d": "git+https://ejemplo.invalid/repo.git" } },
  handler: (input) => {
    let deps: Record<string, string | { version: string; license?: string; latestMajor?: number }> = input.dependencies ?? {};
    if (input.manifest && !input.dependencies) {
      try {
        const parsed = JSON.parse(input.manifest) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      } catch { fail("INVALID_INPUT"); }
    }
    const risFindings: Record<string, unknown>[] = [];
    let highest = "low";
    for (const [name, raw] of Object.entries(deps)) {
      const version = typeof raw === "string" ? raw : raw.version;
      const license = typeof raw === "string" ? undefined : raw.license;
      const issues: string[] = [];
      let severity = "low";
      if (version === "*" || version === "latest" || version === "") { issues.push("Rango abierto (*): cualquier versión puede entrar en una instalación"); severity = "high"; }
      if (/^(git\+|https?:\/\/|file:)/.test(version)) { issues.push("Dependencia desde URL: sin garantías del registro ni reproducibilidad"); severity = "high"; }
      if (/^\^?0\./.test(version)) { issues.push("Serie 0.x: los cambios pueden romper API en menores"); severity = severity === "high" ? severity : "medium"; }
      if (typeof raw !== "string" && raw.latestMajor !== undefined) {
        const major = Number((version.match(/\d+/) ?? ["0"])[0]);
        if (raw.latestMajor - major >= 2) { issues.push(`Desfase de ${raw.latestMajor - major} mayores (actual ${major}, última ${raw.latestMajor})`); severity = severity === "high" ? severity : "medium"; }
      }
      if (license && /GPL|AGPL/i.test(license)) { issues.push(`Licencia copyleft fuerte (${license}): revisar obligaciones de distribución`); severity = severity === "high" ? severity : "medium"; }
      if (issues.length > 0) {
        risFindings.push({ dependency: name, versionDeclared: version, severity, issues });
        if (severity === "high") highest = "high";
        else if (highest === "low") highest = "medium";
      }
    }
    return {
      summary: `${Object.keys(deps).length} dependencias revisadas; riesgo global ${highest}.`,
      data: { findings: risFindings, cleanCount: Object.keys(deps).length - risFindings.length, recommendation: "Fija versiones con lockfile versionado y revisa las licencias antes de distribuir." },
    };
  },
});

const apiMapper = defineTool({
  number: 86,
  inputSchema: z.object({
    endpoints: z.array(z.object({
      method: z.string().min(3).max(10), path: txt(500),
      auth: z.boolean().optional(), requestFields: strArr(100, 100).optional(), responseFields: strArr(100, 100).optional(),
      description: txt(500).optional(),
    })).min(1).max(500),
  }).strict(),
  example: { endpoints: [{ method: "GET", path: "/api/health" }, { method: "POST", path: "/api/projects", requestFields: ["name"], responseFields: ["id", "name"] }, { method: "DELETE", path: "/api/projects/:id", auth: true }] },
  handler: (input) => {
    const inconsistencies: string[] = [];
    const seen = new Set<string>();
    for (const e of input.endpoints) {
      const key = `${e.method.toUpperCase()} ${e.path}`;
      if (seen.has(key)) inconsistencies.push(`Endpoint duplicado: ${key}`);
      seen.add(key);
      const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(e.method.toUpperCase());
      if (isWrite && e.auth !== true) inconsistencies.push(`Escritura sin auth declarada: ${key}`);
      if (isWrite && e.responseFields === undefined && e.requestFields === undefined) inconsistencies.push(`Escritura sin esquema de petición/respuesta: ${key}`);
    }
    const groups = new Map<string, string[]>();
    for (const e of input.endpoints) {
      const resource = "/" + (e.path.split("/").filter(Boolean).slice(0, 2).join("/") || "");
      groups.set(resource, [...(groups.get(resource) ?? []), `${e.method.toUpperCase()} ${e.path}`]);
    }
    const openApiSkeleton = {
      openapi: "3.1.0",
      info: { title: "API map", version: "0.1.0" },
      paths: Object.fromEntries(input.endpoints.map((e) => [e.path, { [e.method.toLowerCase()]: { summary: e.description ?? "", security: e.auth ? [{ bearerAuth: [] }] : [], responses: { "200": { description: "OK" } } } }])),
    };
    return {
      summary: `${input.endpoints.length} endpoints en ${groups.size} recursos; ${inconsistencies.length} inconsistencias.`,
      data: { endpoints: input.endpoints.map((e) => ({ method: e.method.toUpperCase(), path: e.path, auth: Boolean(e.auth), requestFields: e.requestFields ?? [], responseFields: e.responseFields ?? [] })), groups: Object.fromEntries(groups), inconsistencies, openApiSkeleton },
    };
  },
});

const migrationPlanner = defineTool({
  number: 87,
  inputSchema: z.object({
    fromFields: z.array(z.object({ name: idStr(), type: txt(100), required: z.boolean().optional() })).min(1).max(500),
    toFields: z.array(z.object({ name: idStr(), type: txt(100), required: z.boolean().optional(), defaultValue: z.unknown().optional() })).min(1).max(500),
    renames: z.record(z.string(), z.string().max(200)).optional(),
  }).strict(),
  example: { fromFields: [{ name: "nombre", type: "string" }, { name: "telf", type: "string" }, { name: "legacy_flag", type: "boolean" }], toFields: [{ name: "nombre", type: "string" }, { name: "telefono", type: "string" }, { name: "creado_en", type: "date", required: true }], renames: { telf: "telefono" } },
  handler: (input) => {
    const renames = input.renames ?? {};
    const fromByName = new Map(input.fromFields.map((f) => [renames[f.name] ?? f.name, f]));
    const toByName = new Map(input.toFields.map((f) => [f.name, f]));
    const added = input.toFields.filter((f) => !fromByName.has(f.name));
    const removed = input.fromFields.filter((f) => !toByName.has(renames[f.name] ?? f.name));
    const typeChanges = input.toFields.filter((f) => fromByName.has(f.name) && fromByName.get(f.name)!.type !== f.type).map((f) => ({ field: f.name, from: fromByName.get(f.name)!.type, to: f.type }));
    const steps: { order: number; action: string; risk: string }[] = [];
    let order = 1;
    for (const a of added) steps.push({ order: order++, action: `Añadir campo opcional «${a.name}» (${a.type})${a.required ? " con valor por defecto para filas existentes" : ""}`, risk: a.required && a.defaultValue === undefined ? "medium: filas existentes sin valor" : "low" });
    for (const [from, to] of Object.entries(renames)) steps.push({ order: order++, action: `Renombrar «${from}» a «${to}» con doble lectura temporal y relleno (backfill)`, risk: "medium: coordina lectores antiguos" });
    for (const t of typeChanges) steps.push({ order: order++, action: `Convertir «${t.field}» de ${t.from} a ${t.to} con función de conversión probada en copia`, risk: "high: posible pérdida si la conversión no es total" });
    for (const r of removed) steps.push({ order: order++, action: `Dejar de escribir «${r.name}», verificar que nadie lo lee y solo entonces eliminarlo en una migración posterior`, risk: "high: eliminar datos es irreversible" });
    return {
      summary: `Migración con ${added.length} altas, ${removed.length} bajas, ${typeChanges.length} cambios de tipo y ${Object.keys(renames).length} renombres.`,
      data: { added: added.map((f) => f.name), removed: removed.map((f) => f.name), typeChanges, renames, steps, reversible: removed.length === 0 && typeChanges.length === 0, rollbackNotes: "Las bajas y conversiones destructivas requieren copia previa y ventana de doble escritura antes de cerrar la migración." },
    };
  },
});

const buildCheck = defineTool({
  number: 88,
  limitation: "Este servidor no ejecuta comandos: produce el plan ordenado de comandos y la lista de verificación para ejecutarlo en el repo.",
  inputSchema: z.object({
    stack: z.enum(["node", "node-ts", "python", "generic"]),
    packageScripts: z.record(z.string(), z.string().max(500)).optional(),
  }).strict(),
  example: { stack: "node-ts", packageScripts: { build: "tsc", test: "node --test", lint: "eslint ." } },
  handler: (input) => {
    if (input.stack === "python") {
      return { summary: "Plan de verificación Python generado.", data: { commands: [{ order: 1, command: "python3 -m compileall -q src", why: "Sintaxis" }, { order: 2, command: "python3 -m pytest -q", why: "Pruebas" }, { order: 3, command: "python3 -m pip check", why: "Consistencia de dependencias" }], checklist: ["Entorno virtual activo y reproducible", "Sin prints de depuración olvidados"] } };
    }
    if (input.stack === "generic") {
      return { summary: "Plan genérico generado.", data: { commands: [{ order: 1, command: "# compilación del proyecto según su README", why: "Build" }, { order: 2, command: "# suite de pruebas del proyecto", why: "Pruebas" }], checklist: ["Sigue el README del proyecto como fuente de verdad"] } };
    }
    const scripts = input.packageScripts ?? {};
    const commands: { order: number; command: string; why: string; detected: boolean }[] = [];
    const add = (script: string, why: string, fallback?: string) => {
      if (scripts[script]) commands.push({ order: commands.length + 1, command: `npm run ${script}`, why, detected: true });
      else if (fallback) commands.push({ order: commands.length + 1, command: fallback, why, detected: false });
    };
    commands.push({ order: 1, command: "npm ci", why: "Instalación reproducible desde el lockfile", detected: true });
    add("lint", "Lint");
    if (input.stack === "node-ts") add("build", "Typecheck + compilación", "npx tsc --noEmit");
    add("test", "Pruebas", "npm test");
    return {
      summary: `Plan de verificación Node con ${commands.length} pasos (${commands.filter((c) => c.detected).length} detectados de package.json).`,
      data: { commands, checklist: ["Ejecutar en árbol limpio o registrar el estado previo", "Un paso en rojo detiene la cadena: no publicar", "Registrar versión de Node usada"] },
      warnings: Object.keys(scripts).length === 0 ? ["No se pasaron scripts: el plan es genérico para el stack."] : [],
    };
  },
});

const prReviewer = defineTool({
  number: 89,
  inputSchema: z.object({ diff: longText(), title: txt(500).optional() }).strict(),
  example: { title: "Añade saludo", diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,2 @@\n const a = 1;\n+console.log('depura');\n" },
  handler: (input) => {
    const files = [...input.diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1].trim());
    const addedLines = input.diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removedLines = input.diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    const findings: { severity: string; detail: string }[] = [];
    const addedText = addedLines.join("\n");
    if (/console\.log|TODO|FIXME/.test(addedText)) findings.push({ severity: "low", detail: "El diff añade salidas de depuración o TODOs" });
    for (const secret of scanSecrets(addedText)) findings.push({ severity: "high", detail: `Posible secreto añadido (${secret.type}, línea ${secret.line} del bloque añadido)` });
    const touchesSrc = files.some((f) => f.startsWith("src/"));
    const touchesTests = files.some((f) => f.includes("test") || f.startsWith("tests/"));
    if (touchesSrc && !touchesTests) findings.push({ severity: "medium", detail: "Cambios en src/ sin cambios en pruebas" });
    if (files.length > 20) findings.push({ severity: "medium", detail: `PR grande: ${files.length} archivos (considera dividir)` });
    if (addedLines.length > 400) findings.push({ severity: "medium", detail: `${addedLines.length} líneas añadidas: revisión extensa` });
    const deletedTests = files.length > 0 && removedLines.length > 0 && /-.*test\(/.test(input.diff);
    if (deletedTests) findings.push({ severity: "high", detail: "Parece Eliminarse código de pruebas: verificar que no sea pérdida de cobertura" });
    return {
      summary: `Revisión heurística: ${files.length} archivos, +${addedLines.length}/-${removedLines.length} líneas, ${findings.length} avisos.`,
      data: { title: input.title ?? null, filesChanged: files, addedLines: addedLines.length, removedLines: removedLines.length, findings, suggestion: findings.some((f) => f.severity === "high") ? "solicitar_cambios" : findings.length > 0 ? "revisar_con_comentarios" : "sin_avisos_automaticos", note: canonicalStringify({ heuristic: true, humanReviewRequired: true }) },
    };
  },
});

const releaseReadiness = defineTool({
  number: 90,
  inputSchema: z.object({
    version: txt(100),
    testsPassing: z.boolean(),
    buildPassing: z.boolean(),
    changelogUpdated: z.boolean(),
    hasTag: z.boolean().optional(),
    uncommittedChanges: z.boolean().optional(),
    breakingChanges: z.boolean().optional(),
    versionBumped: z.boolean().optional(),
    openCriticalIssues: z.number().int().nonnegative().optional(),
    secretsScanClean: z.boolean().optional(),
  }).strict(),
  example: { version: "0.3.0", testsPassing: true, buildPassing: true, changelogUpdated: false, breakingChanges: true, versionBumped: false, openCriticalIssues: 0, secretsScanClean: true },
  handler: (input) => {
    const blockers: string[] = [];
    if (!input.testsPassing) blockers.push("Las pruebas no pasan");
    if (!input.buildPassing) blockers.push("El build no pasa");
    if (input.uncommittedChanges) blockers.push("Hay cambios sin confirmar en el árbol");
    if ((input.openCriticalIssues ?? 0) > 0) blockers.push(`Hay ${input.openCriticalIssues} incidencias críticas abiertas`);
    if (input.secretsScanClean === false) blockers.push("El escaneo de secretos no está limpio");
    if (input.breakingChanges && input.versionBumped !== true) blockers.push("Hay cambios que rompen compatibilidad sin salto de versión confirmado");
    const warningsList: string[] = [];
    if (!input.changelogUpdated) warningsList.push("CHANGELOG sin actualizar");
    if (!input.hasTag) warningsList.push("Falta la etiqueta de versión");
    if (!/^\d+\.\d+\.\d+/.test(input.version)) warningsList.push("La versión no parece semver (x.y.z)");
    return {
      summary: blockers.length === 0 ? `La versión ${input.version} está lista para publicar.` : `No lista: ${blockers.length} bloqueos.`,
      data: { ready: blockers.length === 0, blockers, warnings: warningsList, nextActions: [...blockers, ...warningsList] },
    };
  },
});

void fail;

export const f09: LocalToolDefinition[] = [scaffoldGenerator, staticAnalysis, refactorPlanner, patchGenerator, dependencyAuditor, apiMapper, migrationPlanner, buildCheck, prReviewer, releaseReadiness];
