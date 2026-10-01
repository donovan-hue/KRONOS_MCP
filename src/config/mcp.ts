const token = process.env.KRONOS_MCP_TOKEN?.trim();

export function getKronosMcpToken(): string {
  if (!token) {
    throw new Error("KRONOS_MCP_TOKEN no está configurado.");
  }

  return token;
}
