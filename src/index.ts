#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKronosServer } from "./server.js";

export { createKronosServer } from "./server.js";
export type { CreateKronosServerOptions, KronosServerProfile } from "./server.js";

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  const entryPoint = resolve(process.argv[1]);
  try {
    // npm installs the bin as a symlink on POSIX systems; comparing real
    // paths keeps direct execution working both from dist/ and from .bin/.
    return realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return import.meta.url === pathToFileURL(entryPoint).href;
  }
}

if (isMainModule()) {
  // Quiet is mandatory: stdout belongs to MCP, not dotenv status messages.
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env", quiet: true, debug: false, override: false });
  const server = createKronosServer();
  await server.connect(new StdioServerTransport());
}
