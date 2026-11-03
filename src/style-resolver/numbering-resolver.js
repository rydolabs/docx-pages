import { mergeStyleObjects } from "./text-style-resolver.js";

export function resolveNumbering(numbering, ref) {
  if (ref?.numId === undefined || ref?.numId === null || !numbering) return null;
  const num = numbering.numbers?.[ref.numId];
  if (!num) return null;
  const levelIndex = ref.level ?? 0;
  const abs = numbering.abstractNumbers?.[num.abstractNumId];
  const levels = {};
  for (const [key, baseLevel] of Object.entries(abs?.levels || {})) {
    const index = Number(key);
    const override = num.overrides?.[index] || null;
    const level = override?.level ? mergeStyleObjects(baseLevel || {}, override.level) : baseLevel;
    if (!level) continue;
    levels[index] = normalizeLevel(level, override?.start);
  }
  const current = levels[levelIndex];
  if (!current) return null;

  return {
    numId: ref.numId,
    abstractNumId: num.abstractNumId,
    level: levelIndex,
    ...current,
    levels
  };
}

function normalizeLevel(level, startOverride) {
  return {
    format: level.format,
    text: level.text,
    start: startOverride ?? level.start ?? 1,
    suffix: level.suffix,
    justification: level.justification,
    paragraphProperties: level.paragraphProperties || {},
    runProperties: level.runProperties || {}
  };
}
