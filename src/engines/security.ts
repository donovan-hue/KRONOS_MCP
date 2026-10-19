/**
 * Seguridad local: hashes/HMAC con node:crypto, escáner de secretos y
 * detector heurístico de inyección de prompts. Los hallazgos nunca devuelven
 * el secreto detectado, solo tipo, posición y una vista enmascarada.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a.toLowerCase(), "utf8");
  const bb = Buffer.from(b.toLowerCase(), "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

export interface SecretFinding {
  type: string;
  line: number;
  column: number;
  severity: "high" | "medium";
  maskedPreview: string;
}

const SECRET_PATTERNS: { type: string; regex: RegExp; severity: "high" | "medium" }[] = [
  { type: "private_key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "high" },
  { type: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g, severity: "high" },
  { type: "github_token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, severity: "high" },
  { type: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, severity: "high" },
  { type: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, severity: "high" },
  { type: "generic_secret_assignment", regex: /\b(?:api[_-]?key|client[_-]?secret|password|contraseña|token|secret)\s*[:=]\s*["']?[^\s"']{8,}/gi, severity: "medium" },
  { type: "connection_string", regex: /\b(?:mongodb(?:\+srv)?|postgres|mysql|redis|amqp):\/\/[^\s"']+:[^\s"'@]+@/g, severity: "high" },
];

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)} (len ${value.length})`;
}

export function scanSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  lines.forEach((lineText, lineIdx) => {
    for (const { type, regex, severity } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      for (const m of lineText.matchAll(regex)) {
        findings.push({ type, line: lineIdx + 1, column: (m.index ?? 0) + 1, severity, maskedPreview: mask(m[0]) });
      }
    }
    // Candidatos genéricos de alta entropía (tokens opacos largos)
    for (const m of lineText.matchAll(/[A-Za-z0-9+/_-]{32,}={0,2}/g)) {
      if (shannonEntropy(m[0]) >= 4.2) {
        findings.push({
          type: "high_entropy_string",
          line: lineIdx + 1,
          column: (m.index ?? 0) + 1,
          severity: "medium",
          maskedPreview: mask(m[0]),
        });
      }
    }
  });
  return findings.slice(0, 200);
}

export interface InjectionFinding {
  category: string;
  weight: number;
  excerpt: string;
}

const INJECTION_PATTERNS: { category: string; regex: RegExp; weight: number }[] = [
  { category: "instruction_override", regex: /ignore (all |the )?(previous|prior|above) instructions/gi, weight: 30 },
  { category: "instruction_override", regex: /ignora (todas )?(las )?instrucciones (anteriores|previas)/gi, weight: 30 },
  { category: "instruction_override", regex: /disregard (your|the) (instructions|rules|guidelines)/gi, weight: 30 },
  { category: "instruction_override", regex: /olvida (tus|las) (instrucciones|reglas)/gi, weight: 30 },
  { category: "role_hijack", regex: /\byou are now\b|\bact as\b|\bpretend to be\b/gi, weight: 15 },
  { category: "role_hijack", regex: /\bahora eres\b|\bact[úu]a como\b|\bfinge ser\b/gi, weight: 15 },
  { category: "system_prompt_probe", regex: /system prompt|prompt del sistema|tus instrucciones internas|your (hidden|internal) instructions/gi, weight: 25 },
  { category: "system_prompt_probe", regex: /(revela|muestra|imprime|repeat|print|show|reveal).{0,40}(instrucciones|prompt|instructions)/gi, weight: 25 },
  { category: "exfiltration", regex: /(send|leak|exfiltrate|env[íi]a|filtra).{0,40}(token|password|secret|api[_ -]?key|contraseña|secreto)/gi, weight: 30 },
  { category: "delimiter_escape", regex: /<\/(system|instructions)>|\[INST\]|```\s*system/gi, weight: 20 },
  { category: "jailbreak_marker", regex: /\bDAN\b|developer mode|modo desarrollador sin (l[íi]mites|restricciones)|bypass (safety|content) (filter|policy)/gi, weight: 20 },
];

export function scanPromptInjection(text: string): { score: number; findings: InjectionFinding[] } {
  const findings: InjectionFinding[] = [];
  let score = 0;
  for (const { category, regex, weight } of INJECTION_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of text.matchAll(regex)) {
      score += weight;
      findings.push({ category, weight, excerpt: m[0].slice(0, 80) });
      if (findings.length >= 50) break;
    }
  }
  return { score: Math.min(100, score), findings };
}
