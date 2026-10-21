/** Medios: color/contraste WCAG, geometría de encuadre, audio en dB y ritmo de locución. */
import { KronosApiError } from "../services/kronos-api.js";
import { round } from "./stats.js";

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) throw new KronosApiError("INVALID_INPUT");
  let raw = m[1];
  if (raw.length === 3) raw = raw.split("").map((c) => c + c).join("");
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function channelToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Ratio de contraste WCAG 2.x entre dos colores hexadecimales (1 a 21). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return round((hi + 0.05) / (lo + 0.05), 2);
}

/** Distancia euclídea RGB entre dos colores (0 idénticos, ~441 opuestos). */
export function colorDistance(a: string, b: string): number {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  return round(Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2), 2);
}

export interface CropRect { x: number; y: number; width: number; height: number }

/** Recorte máximo con la proporción objetivo, anclado en el punto focal (0-1). */
export function cropForAspect(
  width: number,
  height: number,
  ratioW: number,
  ratioH: number,
  focalX = 0.5,
  focalY = 0.5,
): CropRect {
  if (width <= 0 || height <= 0 || ratioW <= 0 || ratioH <= 0) throw new KronosApiError("INVALID_INPUT");
  const target = ratioW / ratioH;
  const source = width / height;
  let cropW = width;
  let cropH = height;
  if (source > target) cropW = Math.floor(height * target);
  else cropH = Math.floor(width / target);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const x = Math.round(clamp(focalX * width - cropW / 2, 0, width - cropW));
  const y = Math.round(clamp(focalY * height - cropH / 2, 0, height - cropH));
  return { x, y, width: cropW, height: cropH };
}

export function parseRatio(ratio: string): { w: number; h: number } {
  const m = ratio.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!m) throw new KronosApiError("INVALID_INPUT");
  return { w: Number(m[1]), h: Number(m[2]) };
}

export function resolutionTier(width: number, height: number): string {
  const p = Math.min(width, height);
  if (p >= 2160) return "4K";
  if (p >= 1440) return "1440p";
  if (p >= 1080) return "1080p";
  if (p >= 720) return "720p";
  if (p >= 480) return "480p";
  return "SD";
}

export function orientation(width: number, height: number): "landscape" | "portrait" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

export function linearToDb(value: number): number {
  if (value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

export function peakDb(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const db = linearToDb(Math.max(...samples.map(Math.abs)));
  return Number.isFinite(db) ? round(db, 2) : 0;
}

export function rmsDb(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const rms = Math.sqrt(samples.reduce((acc, s) => acc + s * s, 0) / samples.length);
  const db = linearToDb(rms);
  return Number.isFinite(db) ? round(db, 2) : 0;
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

/** Segundos estimados de locución para `words` a un ritmo dado. */
export function speechSeconds(words: number, wpm = 150): number {
  return round((words / Math.max(1, wpm)) * 60, 1);
}
