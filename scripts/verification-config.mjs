import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export class VerificationError extends Error {}

export function requireCondition(condition, code) {
  if (!condition) throw new VerificationError(code);
}

// Shared by verification and diagnosis so the latter measures the actual
// precedence used for the stdio child. Never return secrets as printable data.
export async function loadVerificationConfig(args, inherited = process.env) {
  requireCondition(args[0] === '--live', 'LIVE_OPT_IN_REQUIRED');
  requireCondition(args.length === 1 || (args.length === 3 && args[1] === '--env-file' && args[2]), 'INVALID_ARGUMENTS');
  const envFile = resolve(args[2] ?? resolve(ROOT, '.env'));
  const explicitFile = args.length === 3;
  let fileEnv = {};
  try {
    fileEnv = dotenv.parse(await readFile(envFile));
  } catch (error) {
    if (explicitFile || error?.code !== 'ENOENT') throw new VerificationError('ENV_FILE_UNREADABLE');
  }
  const token = (inherited.KRONOS_MCP_TOKEN ?? fileEnv.KRONOS_MCP_TOKEN ?? '').trim();
  requireCondition(token.length > 0, 'AUTH_REQUIRED');
  requireCondition(!/[\r\n\x00-\x1f\x7f]/.test(token), 'CONFIG_INVALID');
  const apiUrl = (inherited.KRONOS_API_URL ?? fileEnv.KRONOS_API_URL ?? 'https://api.kronos-space.com').trim();
  let parsed;
  try { parsed = new URL(apiUrl); } catch { throw new VerificationError('CONFIG_INVALID'); }
  requireCondition(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash, 'CONFIG_INVALID');
  return {
    envFile, token, apiUrl,
    tokenSource: inherited.KRONOS_MCP_TOKEN !== undefined ? 'process_env' : 'env_file',
    apiUrlSource: inherited.KRONOS_API_URL !== undefined ? 'process_env'
      : fileEnv.KRONOS_API_URL !== undefined ? 'env_file' : 'default',
  };
}
