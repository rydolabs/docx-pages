import { pxToPt } from "../../common/units.js";

export function createTextMeasurer({ context2d, document: doc, canvasFactory } = {}) {
  const ctx = context2d || createCanvasContext({ document: doc, canvasFactory });
  const normalLineHeightCache = new Map();

  return {
    kind: ctx ? "canvas" : "fallback",

    measure(text, style = {}) {
      const value = String(text ?? "");
      const fontSizePt = Number(style.fontSizePt || style.sizePt || 9);
      const fontFamily = style.fontFamily || style.fonts?.eastAsia || style.fonts?.ascii || "serif";
      const characterSpacingPt = Number(style.characterSpacingPt || 0);
      const textScale = normalizeTextScale(style.textScale ?? style.scale);
      const glyphCount = countGraphemes(value);

      if (ctx) {
        ctx.font = buildCanvasFont(style, fontSizePt, fontFamily);
        const metrics = ctx.measureText(value);
        const naturalWidthPt = pxToPt(metrics.width) + Math.max(0, glyphCount - 1) * characterSpacingPt;
        const widthPt = naturalWidthPt * textScale;

        // fontBoundingBox* is closer to a line metric than actualBoundingBox*,
        // which varies with the particular glyphs in the string.
        const ascentPx = finiteMetric(metrics.fontBoundingBoxAscent)
          ?? finiteMetric(metrics.actualBoundingBoxAscent)
          ?? fontSizePt * 0.8 * 96 / 72;
        const descentPx = finiteMetric(metrics.fontBoundingBoxDescent)
          ?? finiteMetric(metrics.actualBoundingBoxDescent)
          ?? fontSizePt * 0.2 * 96 / 72;

        const ascentPt = pxToPt(ascentPx);
        const descentPt = pxToPt(descentPx);
        const fontSpec = buildCanvasFont(style, fontSizePt, fontFamily);
        const cssNormalLineHeightPt = measureCssNormalLineHeightPt(doc, fontSpec, normalLineHeightCache);
        return {
          widthPt,
          ascentPt,
          descentPt,
          // Canvas fontBoundingBox metrics omit the font's external line gap.
          // Browser CSS `line-height: normal` includes that gap and tracks Word's
          // natural single-line pitch more closely for installed TrueType fonts.
          lineHeightPt: Math.max(fontSizePt, cssNormalLineHeightPt || 0, ascentPt + descentPt)
        };
      }

      // Deterministic fallback for Node/unit tests. This is intentionally simple;
      // browser rendering should provide a canvas context for real measurements.
      let widthPt = 0;
      for (const ch of Array.from(value)) {
        if (ch === "\t") widthPt += fontSizePt * 2;
        else if (/\s/u.test(ch)) widthPt += fontSizePt * 0.33;
        else if (isWideCharacter(ch)) widthPt += fontSizePt;
        else widthPt += fontSizePt * 0.52;
      }
      widthPt += Math.max(0, glyphCount - 1) * characterSpacingPt;
      widthPt *= textScale;
      return {
        widthPt,
        ascentPt: fontSizePt * 0.8,
        descentPt: fontSizePt * 0.2,
        lineHeightPt: fontSizePt
      };
    }
  };
}

export function createCanvasContext({ document: doc = globalThis.document, canvasFactory } = {}) {
  try {
    const canvas = canvasFactory
      ? canvasFactory()
      : doc?.createElement
        ? doc.createElement("canvas")
        : typeof globalThis.OffscreenCanvas === "function"
          ? new globalThis.OffscreenCanvas(1, 1)
          : null;
    return canvas?.getContext?.("2d") || null;
  } catch {
    return null;
  }
}

function buildCanvasFont(style, size, family) {
  const italic = style.italic ? "italic " : "";
  const weight = style.bold ? "700 " : "400 ";
  return `${italic}${weight}${size}pt ${quoteFamilyList(family)}`;
}

function quoteFamilyList(value) {
  return String(value)
    .split(",")
    .map(part => {
      const family = part.trim();
      return /\s/.test(family) && !/^['\"]/.test(family) ? `"${family}"` : family;
    })
    .join(", ");
}

function countGraphemes(value) {
  if (!value) return 0;
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value)).length;
  }
  return Array.from(value).length;
}

function finiteMetric(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isWideCharacter(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  );
}

function normalizeTextScale(value) {
  if (value == null || value === "") return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return numeric > 10 ? numeric / 100 : numeric;
}

function measureCssNormalLineHeightPt(doc, fontSpec, cache) {
  if (!doc?.createElement || !doc?.body) return null;
  if (cache?.has(fontSpec)) return cache.get(fontSpec);
  try {
    const probe = doc.createElement("span");
    probe.textContent = "Mg";
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;line-height:normal;margin:0;padding:0;border:0;";
    probe.style.font = fontSpec;
    doc.body.appendChild(probe);
    const heightPx = probe.getBoundingClientRect?.().height;
    probe.remove();
    const value = Number.isFinite(heightPx) && heightPx > 0 ? pxToPt(heightPx) : null;
    cache?.set(fontSpec, value);
    return value;
  } catch {
    cache?.set(fontSpec, null);
    return null;
  }
}
