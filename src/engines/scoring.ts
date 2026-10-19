/** Puntuación multicriterio: normalización min-max, ranking ponderado y frente de Pareto. */
import { round } from "./stats.js";

export interface Candidate {
  id: string;
  metrics: Record<string, number>;
}

export interface RankedCandidate {
  id: string;
  score: number;
  rank: number;
  contributions: Record<string, number>;
  metrics: Record<string, number>;
}

/**
 * Ranking ponderado 0-100. `minimize` lista las métricas donde menos es mejor
 * (coste, latencia). Las métricas sin peso declarado pesan 1.
 */
export function rankCandidates(
  candidates: readonly Candidate[],
  weights: Record<string, number> = {},
  minimize: readonly string[] = [],
): RankedCandidate[] {
  if (candidates.length === 0) return [];
  const keys = [...new Set(candidates.flatMap((c) => Object.keys(c.metrics)))];
  const ranges = new Map<string, { min: number; max: number }>();
  for (const key of keys) {
    const values = candidates.map((c) => c.metrics[key]).filter((v) => Number.isFinite(v));
    ranges.set(key, { min: Math.min(...values), max: Math.max(...values) });
  }
  const totalWeight = keys.reduce((acc, k) => acc + Math.max(0, weights[k] ?? 1), 0) || 1;
  const ranked = candidates.map((candidate) => {
    let score = 0;
    const contributions: Record<string, number> = {};
    for (const key of keys) {
      const value = candidate.metrics[key];
      const range = ranges.get(key)!;
      let normalized = 0.5;
      if (Number.isFinite(value)) {
        normalized = range.max === range.min ? 1 : (value - range.min) / (range.max - range.min);
        if (minimize.includes(key)) normalized = 1 - normalized;
      }
      const contribution = normalized * ((weights[key] ?? 1) / totalWeight) * 100;
      contributions[key] = round(contribution, 2);
      score += contribution;
    }
    return { id: candidate.id, score: round(score, 2), rank: 0, contributions, metrics: candidate.metrics };
  });
  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
}

/** IDs no dominados: ninguna otra opción es igual o mejor en todo y mejor en algo. */
export function paretoFront(
  candidates: readonly Candidate[],
  maximize: readonly string[],
  minimize: readonly string[],
): string[] {
  const dominates = (a: Candidate, b: Candidate): boolean => {
    let strictlyBetter = false;
    for (const key of maximize) {
      if ((a.metrics[key] ?? 0) < (b.metrics[key] ?? 0)) return false;
      if ((a.metrics[key] ?? 0) > (b.metrics[key] ?? 0)) strictlyBetter = true;
    }
    for (const key of minimize) {
      if ((a.metrics[key] ?? 0) > (b.metrics[key] ?? 0)) return false;
      if ((a.metrics[key] ?? 0) < (b.metrics[key] ?? 0)) strictlyBetter = true;
    }
    return strictlyBetter;
  };
  return candidates
    .filter((c) => !candidates.some((other) => other !== c && dominates(other, c)))
    .map((c) => c.id);
}
