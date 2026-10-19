/**
 * Estado en memoria del proceso para las herramientas locales que lo exigen
 * (contexto, checkpoints, colas, bitácora, cuotas…).
 *
 * Reglas: nada toca disco ni red; todo se pierde al reiniciar el servidor;
 * cada almacén tiene un tope y expulsa lo más antiguo. Nunca se almacenan
 * valores de credenciales: los almacenes guardan lo que el llamante entrega
 * explícitamente a herramientas de estado, y el llamante es responsable de
 * no pasar secretos (la documentación lo advierte).
 */
import type { LocalToolDefinition } from "../families/types.js";

export const MAX_STORE_KEYS = 500;
export const MAX_LIST_ITEMS = 5_000;

/** Expulsa las claves más antiguas hasta quedar en `max` (Map conserva orden de inserción). */
export function evictOldest<V>(map: Map<string, V>, max = MAX_STORE_KEYS): void {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export interface ScopedValue { value: unknown; updatedAt: number; expiresAt?: number }
export const contextScopes = new Map<string, Map<string, ScopedValue>>();

export interface KnowledgeDoc { id: string; title: string; text: string; tags: string[]; scope?: string }
export const knowledgeIndexes = new Map<string, { documents: KnowledgeDoc[]; createdAt: string }>();

export interface WorkflowState { state: string; blockedBy: string[]; history: { state: string; at: string; note?: string }[] }
export const workflowStates = new Map<string, WorkflowState>();

export interface Checkpoint { label: string; state: unknown; createdAt: string; hash: string }
export const checkpoints = new Map<string, Checkpoint>();

export interface CircuitBreaker { failures: number; successes: number; openedAt: number | null; threshold: number; resetAfterMs: number }
export const circuitBreakers = new Map<string, CircuitBreaker>();

export interface AuditEntry { seq: number; action: string; actor?: string; details?: string; at: string; prevHash: string; hash: string }
export const auditLogs = new Map<string, AuditEntry[]>();

export interface ApprovalGate { operation: string; risk: string; required: number; approvers: string[]; rejectedBy?: string; status: "pending" | "approved" | "rejected"; createdAt: string }
export const approvals = new Map<string, ApprovalGate>();

export interface QueuedJob { id: string; payload: unknown; status: "pending" | "running" | "completed" | "failed" | "dead"; attempts: number; maxAttempts: number; enqueuedAt: string }
export const jobQueues = new Map<string, QueuedJob[]>();

export interface IdempotencyRecord { payloadHash: string; status: "in_progress" | "completed"; createdAt: number; ttlSeconds: number }
export const idempotencyKeys = new Map<string, IdempotencyRecord>();

export interface QuotaWindow { limit: number; windowSeconds: number; windowStart: number; used: number }
export const quotaWindows = new Map<string, QuotaWindow>();

export interface PriceEntry { unit: string; price: number; currency: string; updatedAt: string }
export const priceCatalog = new Map<string, PriceEntry[]>();

export interface ProviderCapabilities { capabilities: { name: string; version?: string; limits?: Record<string, unknown> }[]; status: string; updatedAt: string }
export const capabilityRegistryStore = new Map<string, ProviderCapabilities>();

export interface TelemetryEvent { name: string; value: number; at: string; tags: Record<string, string> }
export const telemetryEvents: TelemetryEvent[] = [];

export interface CompoundToolRecord { description?: string; steps: { tool: string; alias?: string }[]; createdAt: string }
export const compoundTools = new Map<string, CompoundToolRecord>();

/** Definiciones locales registradas, para que herramientas meta (benchmarks, selectores) las consulten. */
export const registeredLocalTools = new Map<string, LocalToolDefinition>();
