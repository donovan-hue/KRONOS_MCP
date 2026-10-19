/** Estadística local: agregados, percentiles, anomalías y regresión lineal. */

export function round(n: number, decimals = 4): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = sorted(values);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / (values.length - 1));
}

export function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : stdDev(values) / Math.abs(m);
}

export function zScoreOutliers(values: readonly number[], threshold = 3): { index: number; value: number; zScore: number }[] {
  const m = mean(values);
  const sd = stdDev(values);
  if (sd === 0) return [];
  return values
    .map((value, index) => ({ index, value, zScore: round((value - m) / sd, 3) }))
    .filter((o) => Math.abs(o.zScore) >= threshold);
}

export function iqrOutliers(values: readonly number[]): { index: number; value: number; fence: "low" | "high" }[] {
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values
    .map((value, index) => ({ index, value, fence: (value < low ? "low" : "high") as "low" | "high" }))
    .filter((o) => o.value < low || o.value > high);
}

export interface Regression {
  slope: number;
  intercept: number;
  r2: number;
  predict: (x: number) => number;
}

export function linearRegression(points: readonly { x: number; y: number }[]): Regression {
  const n = points.length;
  if (n < 2) {
    const y = n === 1 ? points[0].y : 0;
    return { slope: 0, intercept: y, r2: 1, predict: () => y };
  }
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const predict = (x: number) => intercept + slope * x;
  const ssTot = sum(points.map((p) => (p.y - my) ** 2));
  const ssRes = sum(points.map((p) => (p.y - predict(p.x)) ** 2));
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, predict };
}

export function describe(values: readonly number[]): Record<string, number> {
  return {
    count: values.length,
    min: values.length ? round(Math.min(...values)) : 0,
    max: values.length ? round(Math.max(...values)) : 0,
    mean: round(mean(values)),
    median: round(median(values)),
    p95: round(percentile(values, 95)),
    stdDev: round(stdDev(values)),
    sum: round(sum(values)),
  };
}
