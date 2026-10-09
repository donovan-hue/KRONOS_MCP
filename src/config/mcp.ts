export function getKronosMcpToken(): string {
  const token = process.env.KRONOS_MCP_TOKEN?.trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  return token;
}
