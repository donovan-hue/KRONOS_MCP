/** Familia 11 — Multimedia: imagen y diseño visual (herramientas 101-110). */
import { z } from "zod";
import { colorDistance, contrastRatio, cropForAspect, orientation, parseHexColor, parseRatio, resolutionTier } from "../engines/media.js";
import { paretoFront, rankCandidates } from "../engines/scoring.js";
import { mean, round, sum } from "../engines/stats.js";
import { tokens } from "../engines/text.js";
import { defineTool, fail, idStr, reqText, strArr, txt, type LocalToolDefinition } from "./types.js";

const hexColor = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "color hex RRGGBB");
const providerShape = z.object({
  id: idStr(), quality: z.number().min(0).max(10), costPerUnit: z.number().nonnegative(),
  latencySec: z.number().nonnegative(), available: z.boolean().optional(),
  capabilities: strArr(50, 100).optional(),
}).passthrough();

const imageProviderRouter = defineTool({
  number: 101,
  limitation: "Selecciona y ordena proveedores candidatos aportados; no genera la imagen ni llama a ningún proveedor.",
  inputSchema: z.object({
    prompt: txt(2_000).optional(),
    requirements: z.object({ maxCostPerImage: z.number().nonnegative().optional(), minQuality: z.number().min(0).max(10).optional(), requiredCapabilities: strArr(50, 100).optional(), weights: z.object({ quality: z.number().nonnegative().optional(), costPerUnit: z.number().nonnegative().optional(), latencySec: z.number().nonnegative().optional() }).strict().optional() }).strict().optional(),
    providers: z.array(providerShape).min(1).max(100),
  }).strict(),
  example: { prompt: "Portada minimalista azul", requirements: { minQuality: 7, maxCostPerImage: 0.5 }, providers: [{ id: "prov-a", quality: 9, costPerUnit: 0.4, latencySec: 6, available: true }, { id: "prov-b", quality: 6, costPerUnit: 0.05, latencySec: 3, available: true }] },
  handler: (input) => {
    const req = input.requirements ?? {};
    const feasible = input.providers.filter((p) =>
      p.available !== false &&
      (req.maxCostPerImage === undefined || p.costPerUnit <= req.maxCostPerImage) &&
      (req.minQuality === undefined || p.quality >= req.minQuality) &&
      (req.requiredCapabilities ?? []).every((c) => (p.capabilities ?? []).includes(c)));
    const candidates = feasible.map((p) => ({ id: p.id, metrics: { quality: p.quality, costPerUnit: p.costPerUnit, latencySec: p.latencySec } }));
    const ranked = rankCandidates(candidates, { quality: req.weights?.quality ?? 3, costPerUnit: req.weights?.costPerUnit ?? 2, latencySec: req.weights?.latencySec ?? 1 }, ["costPerUnit", "latencySec"]);
    return {
      summary: ranked.length > 0 ? `Proveedor recomendado: ${ranked[0].id} (${ranked[0].score}/100).` : "Ningún proveedor cumple los requisitos.",
      data: { recommended: ranked[0]?.id ?? null, ranking: ranked, paretoOptimal: paretoFront(candidates, ["quality"], ["costPerUnit", "latencySec"]), rejected: input.providers.filter((p) => !feasible.includes(p)).map((p) => p.id), nextStep: "Envía el prompt al proveedor recomendado con tu integración; esta herramienta no genera el activo." },
    };
  },
});

const imageEditingOrchestrator = defineTool({
  number: 102,
  limitation: "Calcula la geometría y el pipeline de edición; la edición de píxeles la ejecuta el motor externo del llamante.",
  inputSchema: z.object({
    image: z.object({ width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000), format: txt(20).optional() }).strict(),
    edits: z.array(z.object({
      type: z.enum(["crop_to_ratio", "resize_width", "resize_height", "rotate_90", "flip_horizontal", "flip_vertical", "convert_format"]),
      ratio: z.string().max(20).optional(), value: z.number().positive().max(100_000).optional(), format: txt(20).optional(),
      focalX: z.number().min(0).max(1).optional(), focalY: z.number().min(0).max(1).optional(),
    })).min(1).max(50),
  }).strict(),
  example: { image: { width: 1920, height: 1080, format: "png" }, edits: [{ type: "crop_to_ratio", ratio: "9:16" }, { type: "resize_width", value: 720 }, { type: "convert_format", format: "webp" }] },
  handler: (input) => {
    let { width, height } = input.image;
    let format = input.image.format ?? "png";
    const steps: Record<string, unknown>[] = [];
    const warnings: string[] = [];
    for (const edit of input.edits) {
      const before = { width, height };
      let detail: Record<string, unknown> = {};
      switch (edit.type) {
        case "crop_to_ratio": {
          if (!edit.ratio) fail("INVALID_INPUT");
          const r = parseRatio(edit.ratio!);
          const crop = cropForAspect(width, height, r.w, r.h, edit.focalX ?? 0.5, edit.focalY ?? 0.5);
          width = crop.width; height = crop.height; detail = { crop };
          break;
        }
        case "resize_width": {
          if (!edit.value) fail("INVALID_INPUT");
          const scale = edit.value / width;
          if (scale > 1) warnings.push("Se pidió ampliar: puede perder nitidez sin un proceso de escalado dedicado.");
          height = Math.max(1, Math.round(height * scale)); width = Math.round(edit.value);
          break;
        }
        case "resize_height": {
          if (!edit.value) fail("INVALID_INPUT");
          const scale = edit.value / height;
          if (scale > 1) warnings.push("Se pidió ampliar: puede perder nitidez sin un proceso de escalado dedicado.");
          width = Math.max(1, Math.round(width * scale)); height = Math.round(edit.value);
          break;
        }
        case "rotate_90": { [width, height] = [height, width]; break; }
        case "convert_format": { format = edit.format ?? format; detail = { format }; break; }
        default: break;
      }
      steps.push({ type: edit.type, from: before, to: { width, height }, ...detail });
    }
    return {
      summary: `Pipeline de ${steps.length} ediciones: resultado ${width}x${height} (${format}).`,
      data: { finalSpec: { width, height, format, orientation: orientation(width, height), megapixels: round((width * height) / 1_000_000, 3) }, steps },
      warnings: [...new Set(warnings)],
    };
  },
});

const styleConsistency = defineTool({
  number: 103,
  inputSchema: z.object({
    assets: z.array(z.object({ id: idStr(), palette: z.array(hexColor).max(20), styleTags: strArr(50, 100).optional() })).min(2).max(200),
    referenceAssetId: idStr().optional(),
    maxColorDistance: z.number().positive().max(450).optional(),
  }).strict(),
  example: { assets: [{ id: "a", palette: ["#112233", "#445566"], styleTags: ["minimal", "azul"] }, { id: "b", palette: ["#FF0000"], styleTags: ["neón"] }], referenceAssetId: "a" },
  handler: (input) => {
    const reference = input.assets.find((a) => a.id === input.referenceAssetId) ?? input.assets[0];
    const threshold = input.maxColorDistance ?? 80;
    const nearestDistance = (color: string, palette: string[]) => Math.min(...palette.map((p) => colorDistance(color, p)));
    const checked = input.assets.filter((a) => a.id !== reference.id).map((asset) => {
      const distances = asset.palette.map((c) => ({ color: c, distanceToReferencePalette: nearestDistance(c, reference.palette) }));
      const worst = distances.sort((a, b) => b.distanceToReferencePalette - a.distanceToReferencePalette)[0];
      const refTags = new Set(reference.styleTags ?? []);
      const sharedTags = (asset.styleTags ?? []).filter((t) => refTags.has(t)).length;
      const tagScore = refTags.size === 0 ? 1 : sharedTags / Math.max(1, new Set([...refTags, ...(asset.styleTags ?? [])]).size);
      return { id: asset.id, consistent: (worst?.distanceToReferencePalette ?? 0) <= threshold && tagScore >= 0.34, worstColor: worst ?? null, meanDistance: round(mean(distances.map((d) => d.distanceToReferencePalette)), 1), tagOverlapScore: round(tagScore, 3) };
    });
    return {
      summary: `${checked.filter((c) => c.consistent).length}/${checked.length} piezas coherentes con «${reference.id}».`,
      data: { reference: reference.id, thresholdUsed: threshold, assets: checked, outliers: checked.filter((c) => !c.consistent).map((c) => c.id) },
    };
  },
});

const compositionAnalyzer = defineTool({
  number: 104,
  inputSchema: z.object({
    width: z.number().positive().max(100_000), height: z.number().positive().max(100_000),
    elements: z.array(z.object({ id: idStr(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1), weight: z.number().positive().optional() })).min(1).max(200),
  }).strict(),
  example: { width: 1080, height: 1350, elements: [{ id: "titulo", x: 0.1, y: 0.08, w: 0.8, h: 0.15, weight: 3 }, { id: "foto", x: 0.3, y: 0.3, w: 0.4, h: 0.4, weight: 2 }] },
  handler: (input) => {
    const thirds = [1 / 3, 2 / 3];
    const elementAnalysis = input.elements.map((el) => {
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const nearThird = (v: number) => Math.min(...thirds.map((t) => Math.abs(v - t))) <= 0.06;
      return { id: el.id, areaPct: round(el.w * el.h * 100, 1), center: { x: round(cx, 3), y: round(cy, 3) }, onRuleOfThirds: nearThird(cx) || nearThird(cy), touchesEdge: el.x <= 0.01 || el.y <= 0.01 || el.x + el.w >= 0.99 || el.y + el.h >= 0.99 };
    });
    const leftWeight = sum(input.elements.filter((e) => e.x + e.w / 2 < 0.5).map((e) => e.weight ?? 1));
    const rightWeight = sum(input.elements.filter((e) => e.x + e.w / 2 >= 0.5).map((e) => e.weight ?? 1));
    const occupied = sum(input.elements.map((e) => e.w * e.h));
    const biggest = [...elementAnalysis].sort((a, b) => b.areaPct - a.areaPct)[0];
    const findings: string[] = [];
    if (Math.abs(leftWeight - rightWeight) > Math.max(leftWeight, rightWeight) * 0.5) findings.push("Desequilibrio visual izquierda/derecha marcado");
    if (occupied < 0.15) findings.push("Mucho espacio vacío (>85%): composición muy dispersa");
    if (occupied > 0.95) findings.push("Lienzo casi lleno: puede resultar agobiante");
    if (!elementAnalysis.some((e) => e.onRuleOfThirds)) findings.push("Ningún elemento cae sobre las líneas de tercios");
    return {
      summary: `Composición analizada: foco principal «${biggest.id}» (${biggest.areaPct}% del lienzo).`,
      data: { elements: elementAnalysis, balance: { leftWeight, rightWeight, whitespaceApproxPct: round(Math.max(0, (1 - Math.min(1, occupied))) * 100, 1) }, findings },
    };
  },
});

const upscalingRouter = defineTool({
  number: 105,
  limitation: "Elige el método y calcula la salida; no amplía la imagen.",
  inputSchema: z.object({
    width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000),
    targetWidth: z.number().int().positive().max(100_000).optional(),
    targetScale: z.number().positive().max(32).optional(),
    methods: z.array(z.object({ id: idStr(), maxScale: z.number().positive().max(32), quality: z.number().min(0).max(10), costPerUnit: z.number().nonnegative(), available: z.boolean().optional() })).min(1).max(100),
  }).strict(),
  example: { width: 640, height: 640, targetWidth: 1920, methods: [{ id: "bilinear-local", maxScale: 2, quality: 4, costPerUnit: 0 }, { id: "ai-x4", maxScale: 4, quality: 9, costPerUnit: 0.2 }] },
  handler: (input) => {
    const neededScale = input.targetScale ?? (input.targetWidth ? input.targetWidth / input.width : 2);
    const feasible = input.methods.filter((m) => m.available !== false && m.maxScale >= neededScale);
    const ranked = rankCandidates(feasible.map((m) => ({ id: m.id, metrics: { quality: m.quality, costPerUnit: m.costPerUnit } })), { quality: 3, costPerUnit: 2 }, ["costPerUnit"]);
    return {
      summary: ranked.length > 0 ? `Para ×${round(neededScale, 2)} se recomienda ${ranked[0].id}.` : `Ningún método alcanza ×${round(neededScale, 2)}.`,
      data: { neededScale: round(neededScale, 3), outputSize: { width: Math.round(input.width * neededScale), height: Math.round(input.height * neededScale) }, ranking: ranked, insufficientMethods: input.methods.filter((m) => m.maxScale < neededScale).map((m) => m.id) },
    };
  },
});

const maskGenerator = defineTool({
  number: 106,
  inputSchema: z.object({
    width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000),
    regions: z.array(z.object({
      id: idStr(), shape: z.enum(["rect", "circle", "ellipse"]),
      x: z.number().min(0).max(1), y: z.number().min(0).max(1),
      w: z.number().gt(0).max(1), h: z.number().gt(0).max(1),
    })).min(1).max(100),
  }).strict(),
  example: { width: 1000, height: 1000, regions: [{ id: "rostro", shape: "circle", x: 0.3, y: 0.15, w: 0.4, h: 0.4 }, { id: "fondo", shape: "rect", x: 0, y: 0.7, w: 1, h: 0.3 }] },
  handler: (input) => {
    const shapes = input.regions.map((r) => {
      const x = Math.round(r.x * input.width);
      const y = Math.round(r.y * input.height);
      const w = Math.round(r.w * input.width);
      const h = Math.round(r.h * input.height);
      const area = r.shape === "rect" ? w * h : Math.PI * (w / 2) * (h / 2);
      const svg = r.shape === "rect"
        ? `<rect id="${r.id}" x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`
        : `<ellipse id="${r.id}" cx="${x + Math.round(w / 2)}" cy="${y + Math.round(h / 2)}" rx="${Math.round(w / 2)}" ry="${Math.round(h / 2)}" fill="white"/>`;
      parseHexColor("#ffffff");
      return { id: r.id, shape: r.shape, pixelBox: { x, y, width: w, height: h }, areaPixels: Math.round(area), coveragePct: round((area / (input.width * input.height)) * 100, 2), svg };
    });
    const svgDocument = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="black"/>${shapes.map((s) => s.svg).join("")}</svg>`;
    return {
      summary: `Máscara con ${shapes.length} regiones generada (SVG en blanco sobre negro).`,
      data: { svgMask: svgDocument, regions: shapes.map(({ svg, ...rest }) => rest), totalCoveragePctApprox: round(sum(shapes.map((s) => s.coveragePct)), 2), note: "La cobertura suma regiones; si se solapan, el área real cubierta es menor." },
    };
  },
});

const backgroundRemoval = defineTool({
  number: 107,
  limitation: "No procesa píxeles sin un motor de segmentación: genera la especificación de matte (SVG) y valida bordes con las métricas aportadas.",
  inputSchema: z.object({
    width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000),
    subject: z.object({ shape: z.enum(["rect", "circle", "ellipse"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) }).strict(),
    featherPx: z.number().min(0).max(500).optional(),
    edgeContrast: z.number().min(0).max(10).optional(),
  }).strict(),
  example: { width: 1200, height: 1200, subject: { shape: "ellipse", x: 0.25, y: 0.1, w: 0.5, h: 0.7 }, featherPx: 2, edgeContrast: 7 },
  handler: (input) => {
    const feather = input.featherPx ?? 1;
    const x = Math.round(input.subject.x * input.width);
    const y = Math.round(input.subject.y * input.height);
    const w = Math.round(input.subject.w * input.width);
    const h = Math.round(input.subject.h * input.height);
    const shapeSvg = input.subject.shape === "rect"
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`
      : `<ellipse cx="${x + Math.round(w / 2)}" cy="${y + Math.round(h / 2)}" rx="${Math.round(w / 2)}" ry="${Math.round(h / 2)}" fill="white"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><defs><filter id="feather"><feGaussianBlur stdDeviation="${feather}"/></filter></defs><rect width="100%" height="100%" fill="black"/><g filter="url(#feather)">${shapeSvg}</g></svg>`;
    const warnings: string[] = [];
    if ((input.edgeContrast ?? 5) < 3) warnings.push("Contraste de borde bajo: el recorte real necesitará refinado manual o un modelo de segmentación.");
    if (feather > 10) warnings.push("Difuminado alto: puede comerse detalle fino (cabello, texto).");
    if (input.subject.x <= 0 || input.subject.y <= 0 || input.subject.x + input.subject.w >= 1 || input.subject.y + input.subject.h >= 1) warnings.push("El sujeto toca el borde: verifica que no falte parte del sujeto fuera del marco.");
    return {
      summary: "Especificación de matte lista para aplicar sobre la imagen original.",
      data: { svgMatte: svg, subjectPixelBox: { x, y, width: w, height: h }, processSteps: ["Aplicar el matte SVG como canal alfa", "Componer sobre fondos claros y oscuros para revisar halos", "Exportar en PNG/WebP con alfa"], edgeValidation: { featherPx: feather, edgeContrast: input.edgeContrast ?? null } },
      warnings,
    };
  },
});

const variantGenerator = defineTool({
  number: 108,
  limitation: "Genera las especificaciones y prompts de cada variante; las imágenes se producen con el generador que el llamante conecte.",
  inputSchema: z.object({
    basePrompt: reqText(2_000),
    axes: z.object({
      styles: strArr(10, 200).optional(), palettes: strArr(10, 200).optional(),
      compositions: strArr(10, 200).optional(), ratios: strArr(10, 50).optional(),
    }).strict(),
    maxVariants: z.number().int().min(1).max(200).optional(),
  }).strict(),
  example: { basePrompt: "Portada para un vídeo sobre subtítulos", axes: { styles: ["minimalista", "neón"], ratios: ["16:9", "9:16"] }, maxVariants: 4 },
  handler: (input) => {
    const styles = input.axes.styles?.length ? input.axes.styles : [""];
    const palettes = input.axes.palettes?.length ? input.axes.palettes : [""];
    const compositions = input.axes.compositions?.length ? input.axes.compositions : [""];
    const ratios = input.axes.ratios?.length ? input.axes.ratios : ["1:1"];
    const cap = input.maxVariants ?? 24;
    const variants: Record<string, unknown>[] = [];
    outer:
    for (const style of styles) for (const palette of palettes) for (const composition of compositions) for (const ratio of ratios) {
      const r = parseRatio(ratio);
      const descriptors = [style && `estilo ${style}`, palette && `paleta ${palette}`, composition && `composición ${composition}`, `formato ${ratio}`].filter(Boolean);
      variants.push({ id: `variante_${variants.length + 1}`, style: style || null, palette: palette || null, composition: composition || null, ratio, suggestedPixels: { width: r.w >= r.h ? 1600 : Math.round(1600 * (r.w / r.h)), height: r.h >= r.w ? 1600 : Math.round(1600 * (r.h / r.w)) }, prompt: `${input.basePrompt} — ${descriptors.join(", ")}` });
      if (variants.length >= cap) break outer;
    }
    const totalPossible = styles.length * palettes.length * compositions.length * ratios.length;
    return {
      summary: `${variants.length} variantes especificadas (de ${totalPossible} combinaciones posibles).`,
      data: { variants, totalCombinations: totalPossible, truncated: totalPossible > variants.length },
    };
  },
});

const brandCompliance = defineTool({
  number: 109,
  inputSchema: z.object({
    brand: z.object({
      colors: z.array(hexColor).min(1).max(20),
      forbiddenColors: z.array(hexColor).max(20).optional(),
      colorTolerance: z.number().positive().max(450).optional(),
      fonts: strArr(20, 100).optional(),
      minLogoClearspacePx: z.number().nonnegative().max(10_000).optional(),
      textPairs: z.array(z.object({ fg: hexColor, bg: hexColor, largeText: z.boolean().optional() })).max(50).optional(),
    }).strict(),
    asset: z.object({
      colorsUsed: z.array(hexColor).max(50), fontsUsed: strArr(20, 100).optional(),
      logoClearspacePx: z.number().nonnegative().max(10_000).optional(),
    }).strict(),
  }).strict(),
  example: { brand: { colors: ["#112233", "#FFFFFF"], fonts: ["Inter"], minLogoClearspacePx: 24, textPairs: [{ fg: "#FFFFFF", bg: "#112233" }] }, asset: { colorsUsed: ["#102030", "#FF00FF"], fontsUsed: ["Arial"], logoClearspacePx: 10 } },
  handler: (input) => {
    const tolerance = input.brand.colorTolerance ?? 40;
    const violations: Record<string, unknown>[] = [];
    for (const used of input.asset.colorsUsed) {
      const forbidden = (input.brand.forbiddenColors ?? []).some((f) => colorDistance(used, f) <= tolerance);
      const nearestBrand = Math.min(...input.brand.colors.map((c) => colorDistance(used, c)));
      if (forbidden) violations.push({ kind: "forbidden_color", color: used });
      else if (nearestBrand > tolerance) violations.push({ kind: "off_brand_color", color: used, distanceToNearestBrand: round(nearestBrand, 1) });
    }
    for (const font of input.asset.fontsUsed ?? []) {
      if (input.brand.fonts?.length && !input.brand.fonts.some((f) => f.toLowerCase() === font.toLowerCase())) violations.push({ kind: "non_brand_font", font });
    }
    if (input.brand.minLogoClearspacePx !== undefined && input.asset.logoClearspacePx !== undefined && input.asset.logoClearspacePx < input.brand.minLogoClearspacePx) {
      violations.push({ kind: "logo_clearspace", expectedAtLeastPx: input.brand.minLogoClearspacePx, foundPx: input.asset.logoClearspacePx });
    }
    const contrastChecks = (input.brand.textPairs ?? []).map((pair) => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      const required = pair.largeText ? 3 : 4.5;
      return { fg: pair.fg, bg: pair.bg, contrastRatio: ratio, required, passesAA: ratio >= required };
    });
    for (const check of contrastChecks) if (!check.passesAA) violations.push({ kind: "low_contrast", ...check });
    return {
      summary: violations.length === 0 ? "La pieza cumple las reglas de marca aportadas." : `${violations.length} incumplimientos de marca.`,
      data: { compliant: violations.length === 0, violations, contrastChecks },
    };
  },
});

const assetCataloger = defineTool({
  number: 110,
  inputSchema: z.object({
    assets: z.array(z.object({ id: idStr(), fileName: txt(500), width: z.number().int().positive().max(100_000).optional(), height: z.number().int().positive().max(100_000).optional(), tags: strArr(50, 100).optional(), palette: z.array(hexColor).max(10).optional() })).min(1).max(2_000),
    search: txt(500).optional(),
  }).strict(),
  example: { assets: [{ id: "img1", fileName: "portada-subtitulos-final.png", width: 1920, height: 1080 }, { id: "img2", fileName: "miniatura-vertical.jpg", width: 1080, height: 1920, tags: ["short"] }], search: "portada" },
  handler: (input) => {
    const catalogued = input.assets.map((asset) => {
      const autoTags = new Set<string>(asset.tags ?? []);
      if (asset.width && asset.height) {
        autoTags.add(orientation(asset.width, asset.height));
        autoTags.add(resolutionTier(asset.width, asset.height));
      }
      for (const token of tokens(asset.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "), { dropStopwords: false })) {
        if (token.length >= 3 && !["final", "img", "copia", "copy"].includes(token)) autoTags.add(token);
      }
      const extension = asset.fileName.split(".").pop()?.toLowerCase() ?? "";
      if (extension) autoTags.add(extension);
      return { id: asset.id, fileName: asset.fileName, tags: [...autoTags], width: asset.width ?? null, height: asset.height ?? null };
    });
    const searchTokens = input.search ? tokens(input.search) : [];
    const results = input.search
      ? catalogued.map((c) => ({ ...c, matchScore: round(searchTokens.filter((t) => c.tags.includes(t) || c.fileName.toLowerCase().includes(t)).length / Math.max(1, searchTokens.length), 2) })).filter((c) => c.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore)
      : catalogued;
    return {
      summary: `${catalogued.length} activos catalogados${input.search ? `; ${results.length} coinciden con «${input.search}»` : ""}.`,
      data: { assets: results.slice(0, 500), tagIndex: Object.fromEntries([...catalogued.reduce((acc, c) => { c.tags.forEach((t) => acc.set(t, [...(acc.get(t) ?? []), c.id])); return acc; }, new Map<string, string[]>())].sort((a, b) => b[1].length - a[1].length).slice(0, 100)) },
    };
  },
});

export const f11: LocalToolDefinition[] = [imageProviderRouter, imageEditingOrchestrator, styleConsistency, compositionAnalyzer, upscalingRouter, maskGenerator, backgroundRemoval, variantGenerator, brandCompliance, assetCataloger];
