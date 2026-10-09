export interface KronosConfig {
  NODE_ENV: string;
  KRONOS_API_URL: string;
}

export function getKronosConfig(): KronosConfig {
  const rawUrl = process.env.KRONOS_API_URL?.trim() || "https://api.kronos-space.com";
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("CONFIG_INVALID");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("CONFIG_INVALID");
  }

  return {
    NODE_ENV: process.env.NODE_ENV || "development",
    KRONOS_API_URL: rawUrl.replace(/\/+$/, ""),
  };
}
