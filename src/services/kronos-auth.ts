import { env } from "../config/env.js";
import { getKronosMcpToken } from "../config/mcp.js";

export async function getKronosMe() {
  const response = await fetch(
    `${env.KRONOS_API_URL}/api/mcp/me`,
    {
      headers: {
        Authorization: `Bearer ${getKronosMcpToken()}`,
        Accept: "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `KRONOS API respondió HTTP ${response.status}: ${
        data?.error || "Error de autenticación MCP"
      }`
    );
  }

  return data;
}
