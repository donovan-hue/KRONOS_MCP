#!/usr/bin/env node
/**
 * Verifica un tarball de npm como lo consumiría un usuario real:
 *
 * 1. Crea un proyecto temporal vacío.
 * 2. Instala únicamente el .tgz indicado (o genera uno con npm pack).
 * 3. Lanza el binario instalado `kronos-mcp` por stdio mediante un cliente MCP.
 * 4. Enumera las herramientas y llama a las 180 locales con su ejemplo.
 * 5. Lanza `kronos-mcp-http`, comprueba 401 sin token y tools/list con token.
 *
 * Uso:
 *   node scripts/verify-npm-tarball.mjs [ruta/al/kronos-mcp-0.3.0.tgz] [--keep]
 *
 * El directorio temporal se borra si todo pasa, salvo con --keep. Si algo
 * falla, se conserva y se imprime su ruta para inspección.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const keep = process.argv.includes("--keep");
const tarballArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

async function run(command, args, cwd, label) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").slice(-8_000);
    throw new Error(label + " falló" + (detail ? ":\n" + detail : ""));
  }
}

function parseNpmPackJson(stdout) {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error("npm pack no devolvió JSON reconocible");
  return JSON.parse(stdout.slice(start));
}

const probeSource = String.raw`
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ALL_LOCAL_TOOLS } from "./node_modules/kronos-mcp/dist/families/index.js";
import { TOOLS_180 } from "./node_modules/kronos-mcp/dist/catalog/tools-180.js";

const webhookSecret = "tarball-test-only-secret";
const httpToken = "tarball-test-http-token-at-least-32-chars";
const httpPort = 34127;
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const stdioBin = process.platform === "win32"
  ? "./node_modules/.bin/kronos-mcp.cmd"
  : "./node_modules/.bin/kronos-mcp";
const httpBin = process.platform === "win32"
  ? "./node_modules/.bin/kronos-mcp-http.cmd"
  : "./node_modules/.bin/kronos-mcp-http";

const catalogByName = new Map(TOOLS_180.map((entry) => [entry.name, entry]));
const catalogByNumber = new Map(TOOLS_180.map((entry) => [entry.number, entry]));
const transport = new StdioClientTransport({
  command: stdioBin,
  cwd: process.cwd(),
  env: { ...process.env, KRONOS_DEMO_WEBHOOK_SECRET: webhookSecret },
  stderr: "pipe",
});
let serverStderr = "";
if (transport.stderr) {
  transport.stderr.on("data", (chunk) => { serverStderr += chunk.toString(); });
}
const client = new Client({ name: "kronos-tarball-probe", version: "1.0.0" });

let httpServer;
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const listedNames = listed.tools.map((tool) => tool.name);
  assert(listed.tools.length === 184, "tools/list devolvió " + listed.tools.length + ", esperado 184");
  for (const core of ["kronos_status", "kronos_health", "kronos_me", "kronos_contracts"]) {
    assert(listedNames.includes(core), "falta herramienta del núcleo " + core);
  }
  for (const entrada of TOOLS_180) {
    assert(listedNames.includes(entrada.name), "falta herramienta local " + entrada.name);
  }

  let successfulCalls = 0;
  for (const definition of [...ALL_LOCAL_TOOLS].sort((a, b) => a.number - b.number)) {
    const entrada = catalogByNumber.get(definition.number);
    const result = await client.callTool({ name: entrada.name, arguments: definition.example });
    const sc = result.structuredContent;
    if (
      result.isError === true || !sc || sc.ok !== true || sc.tool !== entrada.name ||
      sc.number !== definition.number || sc.mode !== "local_deterministic" ||
      typeof sc.summary !== "string" || typeof sc.data !== "object" || sc.data === null
    ) {
      failures.push("fallo o sobre inválido en #" + definition.number + " " + entrada.name);
    } else {
      successfulCalls += 1;
    }
  }

  const contracts = await client.callTool({ name: "kronos_contracts", arguments: {} });
  assert(contracts.isError !== true, "kronos_contracts falló desde el tarball");
  assert(contracts.structuredContent?.tools?.length === 184, "kronos_contracts no enumeró 184 herramientas");

  const invalid = await client.callTool({
    name: "kronos_risk_scoring_engine",
    arguments: { risks: [{ id: "x", impact: 99, probability: 1 }] },
  });
  assert(invalid.isError === true, "una entrada inválida no fue rechazada");

  httpServer = spawn(httpBin, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MSP_HTTP_BEARER_TOKEN: httpToken,
      MSP_HTTP_PORT: String(httpPort),
      MSP_HTTP_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let httpLog = "";
  httpServer.stderr.on("data", (chunk) => { httpLog += chunk.toString(); });
  let healthStatus = 0;
  for (let attempt = 0; attempt < 50 && healthStatus !== 200; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:" + httpPort + "/healthz");
      healthStatus = response.status;
    } catch {
      await delay(100);
    }
  }
  assert(healthStatus === 200, "el binario HTTP no respondió /healthz con 200: " + httpLog.slice(-500));

  const unauthorized = await fetch("http://127.0.0.1:" + httpPort + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert(unauthorized.status === 401, "HTTP sin token devolvió " + unauthorized.status + ", esperado 401");

  const authorized = await fetch("http://127.0.0.1:" + httpPort + "/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + httpToken,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const body = await authorized.text();
  const dataLine = body.split(/\n/).find((line) => line.startsWith("data: "));
  const rpc = JSON.parse(dataLine ? dataLine.slice(6) : body);
  const httpToolCount = rpc?.result?.tools?.length ?? 0;
  assert(authorized.status === 200, "HTTP con token devolvió " + authorized.status);
  assert(httpToolCount === 184, "HTTP tools/list devolvió " + httpToolCount + ", esperado 184");

  const report = {
    stdioToolCount: listed.tools.length,
    localToolsCalled: ALL_LOCAL_TOOLS.length,
    localToolsPassed: successfulCalls,
    invalidInputRejected: invalid.isError === true,
    httpToolCount,
    httpUnauthorizedStatus: unauthorized.status,
    failures,
  };
  process.stdout.write("KRONOS_TARBALL_REPORT " + JSON.stringify(report) + "\n");
  if (failures.length > 0) process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
  if (httpServer && !httpServer.killed) {
    httpServer.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => httpServer.once("exit", resolveExit)),
      delay(2_000),
    ]);
    if (!httpServer.killed) httpServer.kill("SIGKILL");
  }
  if (serverStderr.includes("AUTH_REQUIRED")) {
    process.stderr.write("Aviso: se observó AUTH_REQUIRED en stderr del servidor durante la sonda.\n");
  }
}
`;

let verificationRoot;
let succeeded = false;
try {
  verificationRoot = await mkdtemp(join(tmpdir(), "kronos-mcp-tarball-"));
  const packDir = join(verificationRoot, "pack");
  const consumerDir = join(verificationRoot, "consumer");
  await mkdir(packDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  let tarballPath;
  let packMetadata = null;
  if (tarballArg) {
    tarballPath = resolve(tarballArg);
  } else {
    const packed = await run(
      npmCommand,
      ["pack", "--json", "--pack-destination", packDir],
      repoRoot,
      "npm pack",
    );
    const parsed = parseNpmPackJson(packed.stdout);
    packMetadata = parsed[0];
    tarballPath = join(packDir, packMetadata.filename);
  }

  const tarballBytes = await readFile(tarballPath);
  const sha256 = createHash("sha256").update(tarballBytes).digest("hex");

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({ name: "kronos-mcp-tarball-probe", private: true, version: "0.0.0", type: "module" }, null, 2) + "\n",
    "utf8",
  );
  await run(
    npmCommand,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath],
    consumerDir,
    "npm install del tarball",
  );
  await writeFile(join(consumerDir, "probe.mjs"), probeSource, "utf8");

  const probe = await run(process.execPath, ["probe.mjs"], consumerDir, "sonda MCP del tarball");
  if (probe.stderr.trim()) process.stderr.write(probe.stderr);
  const reportLine = probe.stdout.split(/\n/).find((line) => line.startsWith("KRONOS_TARBALL_REPORT "));
  if (!reportLine) throw new Error("La sonda no produjo el informe esperado:\n" + probe.stdout.slice(-4_000));
  const probeReport = JSON.parse(reportLine.slice("KRONOS_TARBALL_REPORT ".length));
  if (probeReport.failures.length > 0) throw new Error("La sonda encontró fallos: " + probeReport.failures.join("; "));

  succeeded = true;
  process.stdout.write(JSON.stringify({
    ok: true,
    verifiedAt: new Date().toISOString(),
    tarball: tarballPath,
    tarballBytes: tarballBytes.length,
    tarballSha256: sha256,
    pack: packMetadata ? {
      name: packMetadata.name,
      version: packMetadata.version,
      filename: packMetadata.filename,
      entryCount: packMetadata.entryCount,
      size: packMetadata.size,
      unpackedSize: packMetadata.unpackedSize,
    } : null,
    probe: probeReport,
    temporaryConsumer: keep ? consumerDir : "eliminado tras la verificación",
  }, null, 2) + "\n");
} finally {
  if (verificationRoot) {
    if (succeeded && !keep) {
      await rm(verificationRoot, { recursive: true, force: true });
    } else {
      process.stderr.write("Directorio de verificación conservado en: " + verificationRoot + "\n");
    }
  }
}
