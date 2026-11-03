import { mergeStyleObjects, resolveStyleChain } from "./text-style-resolver.js";

export function resolveTableStyle(rawTable, styles) {
  const id = rawTable?.properties?.styleId;
  const fromChain = resolveStyleChain(styles, id, "tableProperties");
  return mergeStyleObjects(fromChain, rawTable?.properties || {});
}


export function resolveTableTextStyle(rawTable, styles) {
  const id = rawTable?.properties?.styleId;
  return {
    paragraphProperties: resolveStyleChain(styles, id, "paragraphProperties"),
    runProperties: resolveStyleChain(styles, id, "runProperties")
  };
}

export function resolveTableConditionalStyles(rawTable, styles) {
  const id = rawTable?.properties?.styleId;
  if (!id) return {};
  return resolveConditionalChain(styles, id);
}

export function resolveConditionalStyleForCell({
  conditionalStyles = {}, look = null, rowIndex = 0, rowCount = 0, gridStart = 0, gridSpan = 1, columnCount = 0,
  rowBandSize = 1, columnBandSize = 1
} = {}) {
  if (!look || !conditionalStyles || !Object.keys(conditionalStyles).length) return {};

  const gridEnd = Math.max(gridStart, gridStart + Math.max(1, gridSpan) - 1);
  const lastColumnIndex = Math.max(0, columnCount - 1);
  const types = [];

  const isFirstRow = rowIndex === 0;
  const isLastRow = rowIndex === rowCount - 1;
  const isFirstCol = gridStart === 0;
  const isLastCol = gridEnd >= lastColumnIndex;

  if (!look.noHBand && !(look.firstRow && isFirstRow) && !(look.lastRow && isLastRow)) {
    const bandIndex = rowIndex - (look.firstRow ? 1 : 0);
    const band = Math.floor(Math.max(0, bandIndex) / Math.max(1, Number(rowBandSize || 1)));
    types.push(band % 2 === 0 ? "band1Horz" : "band2Horz");
  }
  if (!look.noVBand && !(look.firstColumn && isFirstCol) && !(look.lastColumn && isLastCol)) {
    const bandIndex = gridStart - (look.firstColumn ? 1 : 0);
    const band = Math.floor(Math.max(0, bandIndex) / Math.max(1, Number(columnBandSize || 1)));
    types.push(band % 2 === 0 ? "band1Vert" : "band2Vert");
  }
  if (look.firstColumn && isFirstCol) types.push("firstCol");
  if (look.lastColumn && isLastCol) types.push("lastCol");
  if (look.firstRow && isFirstRow) types.push("firstRow");
  if (look.lastRow && isLastRow) types.push("lastRow");

  if (look.firstRow && look.firstColumn && isFirstRow && isFirstCol) types.push("nwCell");
  if (look.firstRow && look.lastColumn && isFirstRow && isLastCol) types.push("neCell");
  if (look.lastRow && look.firstColumn && isLastRow && isFirstCol) types.push("swCell");
  if (look.lastRow && look.lastColumn && isLastRow && isLastCol) types.push("seCell");

  return types.reduce((out, type) => mergeConditionalStyle(out, conditionalStyles[type] || {}), {});
}

function resolveConditionalChain(styles, styleId, seen = new Set()) {
  if (!styleId || seen.has(styleId)) return {};
  seen.add(styleId);
  const style = styles?.styles?.[styleId];
  if (!style) return {};
  const inherited = resolveConditionalChain(styles, style.basedOn, seen);
  const own = style.conditionalTableStyles || {};
  const out = { ...inherited };
  for (const [type, value] of Object.entries(own)) {
    out[type] = mergeConditionalStyle(out[type] || {}, value || {});
  }
  return out;
}

function mergeConditionalStyle(base = {}, extra = {}) {
  const merged = mergeStyleObjects(base, extra);
  for (const section of ["tableProperties", "cellProperties", "paragraphProperties", "runProperties"]) {
    if (!extra?.[section]) continue;
    const next = { ...(merged[section] || {}) };
    for (const atomic of ["shading", "color", "underlineColor"]) {
      if (extra[section][atomic] != null) next[atomic] = extra[section][atomic];
    }
    merged[section] = next;
  }
  return merged;
}
