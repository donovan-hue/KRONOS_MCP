import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "kronos-mcp-test",
  version: "0.1.0",
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
});

try {
  await client.connect(transport);

  const tools = await client.listTools();

  console.log("\n===== MCP CONECTADO =====");
  console.log("Servidor: OK");
  console.log("Tools encontradas:", tools.tools.map((tool) => tool.name));

  const result = await client.callTool({
    name: "kronos_status",
    arguments: {},
  });

  console.log("\n===== TOOL TEST =====");
  console.log(JSON.stringify(result, null, 2));

  await client.close();

  console.log("\n===== RESULTADO =====");
  console.log("MCP funcionando correctamente.");
} catch (error) {
  console.error("\n===== ERROR MCP =====");
  console.error(error);
  process.exit(1);
}
