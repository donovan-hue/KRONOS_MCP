import { env } from "../config/env.js";

export interface KronosHealth {
  ok: boolean;
  service: string;
  database: string;
  realtime: boolean;
  timestamp: string;
  build?: {
    commit?: string;
    commitShort?: string;
    branch?: string;
    repo?: string;
    serviceName?: string;
    startedAt?: string;
    traceable?: boolean;
  };
  environment?: string;
  environmentDeclared?: boolean;
  autoIndex?: boolean;
}

export async function getKronosHealth(): Promise<KronosHealth> {
  const response = await fetch(`${env.KRONOS_API_URL}/api/health`);

  if (!response.ok) {
    throw new Error(
      `KRONOS API respondió HTTP ${response.status}`
    );
  }

  return (await response.json()) as KronosHealth;
}
