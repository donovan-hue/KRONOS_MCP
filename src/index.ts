import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKronosServer } from "./server.js";

export { createKronosServer } from "./server.js";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Quiet is mandatory: stdout belongs to MCP, not dotenv status messages.
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env", quiet: true, debug: false, override: false });
  const server = createKronosServer();
  await server.connect(new StdioServerTransport());
}
