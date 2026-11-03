import { NODE_TYPES } from "../common/constants.js";
import { child, children, attr, intAttr, boolAttr, localName } from "./xml-reader.js";

export function parseTable(node, context = {}) {
  const pr = child(node, "tblPr");
  return {
    type: NODE_TYPES.TABLE,
    properties: parseTableProperties(pr),
    grid: parseGrid(child(node, "tblGrid")),
    rows: children(node, "tr").map(n => parseTableRow(n, context))
  };
}

export function parseTableRow(node, context = {}) {
  const pr = child(node, "trPr");
  const height = child(pr, "trHeight");
  const widthBefore = child(pr, "wBefore");
  const widthAfter = child(pr, "wAfter");
  return {
    type: NODE_TYPES.ROW,
    properties: compact({
      cantSplit: child(pr, "cantSplit") ? boolAttr(child(pr, "cantSplit"), "val", true) : null,
      repeatHeader: child(pr, "tblHeader") ? boolAttr(child(pr, "tblHeader"), "val", true) : null,
      gridBefore: intAttr(child(pr, "gridBefore"), "val"),
      gridAfter: intAttr(child(pr, "gridAfter"), "val"),
      widthBefore: widthBefore ? compact({ value: intAttr(widthBefore, "w"), type: attr(widthBefore, "type") }) : null,
      widthAfter: widthAfter ? compact({ value: intAttr(widthAfter, "w"), type: attr(widthAfter, "type") }) : null,
      height: height ? compact({ value: intAttr(height, "val"), rule: attr(height, "hRule") }) : null
    }),
    cells: children(node, "tc").map(n => parseTableCell(n, context))
  };
}

export function parseTableCell(node, context = {}) {
  const pr = child(node, "tcPr");
  return {
    type: NODE_TYPES.CELL,
    properties: parseTableCellProperties(pr),
    children: children(node)
      .filter(n => localName(n) !== "tcPr")
      .map(n => context.parseNode?.(n))
      .filter(Boolean)
  };
}

export function parseTableCellProperties(pr) {
  if (!pr) return {};
  const width = child(pr, "tcW");
  const margins = child(pr, "tcMar");
  const shading = child(pr, "shd");
  return compact({
    width: width ? compact({ value: intAttr(width, "w"), type: attr(width, "type") }) : null,
    gridSpan: intAttr(child(pr, "gridSpan"), "val", 1),
    horizontalMerge: child(pr, "hMerge") ? (attr(child(pr, "hMerge"), "val") || "continue") : null,
    verticalMerge: child(pr, "vMerge") ? (attr(child(pr, "vMerge"), "val") || "continue") : null,
    verticalAlignment: attr(child(pr, "vAlign"), "val"),
    noWrap: child(pr, "noWrap") ? boolAttr(child(pr, "noWrap"), "val", true) : null,
    margins: margins ? parseCellMargins(margins) : null,
    borders: parseBorders(child(pr, "tcBorders")),
    shading: parseShading(shading)
  });
}

function parseTableLook(node) {
  if (!node) return null;
  const val = attr(node, "val");
  const mask = val && /^[0-9a-f]+$/i.test(val) ? parseInt(val, 16) : 0;
  const readFlag = (name, bit) => {
    const explicit = attr(node, name);
    if (explicit != null) return !["0", "false", "off", "no"].includes(String(explicit).toLowerCase());
    return !!(mask & bit);
  };
  return {
    firstRow: readFlag("firstRow", 0x20),
    lastRow: readFlag("lastRow", 0x40),
    firstColumn: readFlag("firstColumn", 0x80),
    lastColumn: readFlag("lastColumn", 0x100),
    noHBand: readFlag("noHBand", 0x200),
    noVBand: readFlag("noVBand", 0x400)
  };
}

export function parseTableProperties(pr) {
  if (!pr) return {};
  const width = child(pr, "tblW");
  const cellMargins = child(pr, "tblCellMar");
  const shading = child(pr, "shd");
  return compact({
    styleId: attr(child(pr, "tblStyle"), "val"),
    look: parseTableLook(child(pr, "tblLook")),
    width: width ? compact({ value: intAttr(width, "w"), type: attr(width, "type") }) : null,
    alignment: attr(child(pr, "jc"), "val"),
    layout: attr(child(pr, "tblLayout"), "type"),
    rowBandSize: intAttr(child(pr, "tblStyleRowBandSize"), "val"),
    columnBandSize: intAttr(child(pr, "tblStyleColBandSize"), "val"),
    indent: parseWidth(child(pr, "tblInd")),
    cellSpacing: parseWidth(child(pr, "tblCellSpacing")),
    cellMargins: cellMargins ? parseCellMargins(cellMargins) : null,
    borders: parseBorders(child(pr, "tblBorders")),
    shading: parseShading(shading)
  });
}

function parseShading(node) {
  if (!node) return null;
  return compact({
    value: attr(node, "val"),
    color: attr(node, "color"),
    fill: attr(node, "fill"),
    themeColor: attr(node, "themeColor"),
    themeFill: attr(node, "themeFill"),
    themeTint: attr(node, "themeTint"),
    themeShade: attr(node, "themeShade"),
    themeFillTint: attr(node, "themeFillTint"),
    themeFillShade: attr(node, "themeFillShade")
  });
}

function parseGrid(grid) {
  return grid ? children(grid, "gridCol").map(n => intAttr(n, "w")) : [];
}

function parseCellMargins(node) {
  return Object.fromEntries(["top", "right", "bottom", "left", "start", "end"]
    .map(side => [side, parseWidth(child(node, side))])
    .filter(([, value]) => value));
}

function parseWidth(node) {
  return node ? compact({ value: intAttr(node, "w"), type: attr(node, "type") }) : null;
}

function parseBorders(node) {
  if (!node) return null;
  const result = {};
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV", "start", "end"]) {
    const border = child(node, side);
    if (!border) continue;
    result[side] = compact({
      value: attr(border, "val"),
      size: intAttr(border, "sz"),
      space: intAttr(border, "space"),
      color: attr(border, "color"),
      themeColor: attr(border, "themeColor"),
      themeTint: attr(border, "themeTint"),
      themeShade: attr(border, "themeShade")
    });
  }
  return Object.keys(result).length ? result : null;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}
