import { NODE_TYPES } from "../common/constants.js";
import { child, children, attr, intAttr, boolAttr, localName, text } from "./xml-reader.js";
import { parseMath } from "./math-parser.js";

export function parseParagraph(node, context = {}) {
  const pPr = child(node, "pPr");
  return {
    type: NODE_TYPES.PARAGRAPH,
    properties: parseParagraphProperties(pPr),
    children: children(node)
      .filter(n => localName(n) !== "pPr")
      .flatMap(n => parseTextChild(n, context))
      .filter(Boolean)
  };
}

export function parseRun(node, context = {}) {
  const rPr = child(node, "rPr");
  return {
    type: NODE_TYPES.RUN,
    properties: parseRunProperties(rPr),
    children: children(node)
      .filter(n => localName(n) !== "rPr")
      .flatMap(n => parseRunChild(n, context))
      .filter(Boolean)
  };
}

export function parseParagraphProperties(node) {
  if (!node) return {};
  const spacing = child(node, "spacing");
  const ind = child(node, "ind");
  const numPr = child(node, "numPr");
  const frame = child(node, "framePr");
  const sectPr = child(node, "sectPr");
  const tabs = child(node, "tabs");
  const shading = child(node, "shd");
  const borders = child(node, "pBdr");

  return compact({
    styleId: attr(child(node, "pStyle"), "val"),
    alignment: attr(child(node, "jc"), "val"),
    bidi: child(node, "bidi") ? boolAttr(child(node, "bidi"), "val", true) : null,
    textAlignment: attr(child(node, "textAlignment"), "val"),
    autoSpaceDE: child(node, "autoSpaceDE") ? boolAttr(child(node, "autoSpaceDE"), "val", true) : null,
    autoSpaceDN: child(node, "autoSpaceDN") ? boolAttr(child(node, "autoSpaceDN"), "val", true) : null,
    keepNext: child(node, "keepNext") ? boolAttr(child(node, "keepNext"), "val", true) : null,
    keepLines: child(node, "keepLines") ? boolAttr(child(node, "keepLines"), "val", true) : null,
    widowControl: child(node, "widowControl") ? boolAttr(child(node, "widowControl"), "val", true) : null,
    pageBreakBefore: child(node, "pageBreakBefore") ? boolAttr(child(node, "pageBreakBefore"), "val", true) : null,
    snapToGrid: child(node, "snapToGrid") ? boolAttr(child(node, "snapToGrid"), "val", true) : null,
    wordWrap: child(node, "wordWrap") ? boolAttr(child(node, "wordWrap"), "val", true) : null,
    contextualSpacing: child(node, "contextualSpacing") ? boolAttr(child(node, "contextualSpacing"), "val", true) : null,
    shading: shading ? compact({
      value: attr(shading, "val"),
      color: attr(shading, "color"),
      fill: attr(shading, "fill"),
      themeColor: attr(shading, "themeColor"),
      themeFill: attr(shading, "themeFill"),
      themeTint: attr(shading, "themeTint"),
      themeShade: attr(shading, "themeShade"),
      themeFillTint: attr(shading, "themeFillTint"),
      themeFillShade: attr(shading, "themeFillShade")
    }) : null,
    borders: borders ? parseParagraphBorders(borders) : null,
    suppressLineNumbers: child(node, "suppressLineNumbers") ? boolAttr(child(node, "suppressLineNumbers"), "val", true) : null,
    spacing: spacing ? compact({
      before: intAttr(spacing, "before"),
      after: intAttr(spacing, "after"),
      beforeLines: intAttr(spacing, "beforeLines"),
      afterLines: intAttr(spacing, "afterLines"),
      line: intAttr(spacing, "line"),
      lineRule: attr(spacing, "lineRule")
    }) : null,
    indentation: ind ? compact({
      left: intAttr(ind, "left"),
      right: intAttr(ind, "right"),
      firstLine: intAttr(ind, "firstLine"),
      hanging: intAttr(ind, "hanging"),
      leftChars: intAttr(ind, "leftChars"),
      rightChars: intAttr(ind, "rightChars"),
      firstLineChars: intAttr(ind, "firstLineChars"),
      hangingChars: intAttr(ind, "hangingChars")
    }) : null,
    numbering: numPr ? compact({
      numId: intAttr(child(numPr, "numId"), "val"),
      level: intAttr(child(numPr, "ilvl"), "val", 0)
    }) : null,
    frame: frame ? compact({
      width: intAttr(frame, "w"),
      height: intAttr(frame, "h"),
      heightRule: attr(frame, "hRule"),
      x: intAttr(frame, "x"),
      y: intAttr(frame, "y"),
      hAnchor: attr(frame, "hAnchor"),
      vAnchor: attr(frame, "vAnchor"),
      wrap: attr(frame, "wrap"),
      xAlign: attr(frame, "xAlign"),
      yAlign: attr(frame, "yAlign"),
      hSpace: intAttr(frame, "hSpace"),
      vSpace: intAttr(frame, "vSpace"),
      dropCap: attr(frame, "dropCap"),
      lines: intAttr(frame, "lines")
    }) : null,
    tabs: tabs ? children(tabs, "tab").map(tab => compact({
      value: attr(tab, "val"),
      position: intAttr(tab, "pos"),
      leader: attr(tab, "leader")
    })) : null,
    section: sectPr ? parseSectionProperties(sectPr) : null
  });
}

function parseParagraphBorders(node) {
  const names = ["top", "right", "bottom", "left"];
  const out = {};
  for (const name of names) {
    const edge = child(node, name);
    if (!edge) continue;
    out[name] = compact({
      value: attr(edge, "val"),
      size: intAttr(edge, "sz"),
      color: attr(edge, "color"),
      space: intAttr(edge, "space"),
      themeColor: attr(edge, "themeColor"),
      themeTint: attr(edge, "themeTint"),
      themeShade: attr(edge, "themeShade")
    });
  }
  return Object.keys(out).length ? out : null;
}

export function parseRunProperties(node) {
  if (!node) return {};
  const fonts = child(node, "rFonts");
  const color = child(node, "color");
  const spacing = child(node, "spacing");
  const vert = child(node, "vertAlign");
  const lang = child(node, "lang");
  const position = child(node, "position");
  const scale = child(node, "w");
  const shading = child(node, "shd");
  const underline = child(node, "u");
  const border = child(node, "bdr");

  return compact({
    styleId: attr(child(node, "rStyle"), "val"),
    bold: child(node, "b") ? boolAttr(child(node, "b"), "val", true) : null,
    boldCs: child(node, "bCs") ? boolAttr(child(node, "bCs"), "val", true) : null,
    italic: child(node, "i") ? boolAttr(child(node, "i"), "val", true) : null,
    italicCs: child(node, "iCs") ? boolAttr(child(node, "iCs"), "val", true) : null,
    caps: child(node, "caps") ? boolAttr(child(node, "caps"), "val", true) : null,
    smallCaps: child(node, "smallCaps") ? boolAttr(child(node, "smallCaps"), "val", true) : null,
    emphasis: attr(child(node, "em"), "val"),
    rtl: child(node, "rtl") ? boolAttr(child(node, "rtl"), "val", true) : null,
    underline: attr(underline, "val"),
    underlineColor: underline ? compact({
      color: attr(underline, "color"),
      themeColor: attr(underline, "themeColor"),
      themeTint: attr(underline, "themeTint"),
      themeShade: attr(underline, "themeShade")
    }) : null,
    strike: child(node, "strike") ? boolAttr(child(node, "strike"), "val", true) : null,
    doubleStrike: child(node, "dstrike") ? boolAttr(child(node, "dstrike"), "val", true) : null,
    vanish: child(node, "vanish") ? boolAttr(child(node, "vanish"), "val", true) : null,
    webHidden: child(node, "webHidden") ? boolAttr(child(node, "webHidden"), "val", true) : null,
    highlight: attr(child(node, "highlight"), "val"),
    border: border ? compact({
      value: attr(border, "val"),
      size: intAttr(border, "sz"),
      space: intAttr(border, "space"),
      color: attr(border, "color"),
      themeColor: attr(border, "themeColor"),
      themeTint: attr(border, "themeTint"),
      themeShade: attr(border, "themeShade")
    }) : null,
    shading: shading ? compact({
      value: attr(shading, "val"),
      color: attr(shading, "color"),
      fill: attr(shading, "fill"),
      themeColor: attr(shading, "themeColor"),
      themeFill: attr(shading, "themeFill"),
      themeTint: attr(shading, "themeTint"),
      themeShade: attr(shading, "themeShade"),
      themeFillTint: attr(shading, "themeFillTint"),
      themeFillShade: attr(shading, "themeFillShade")
    }) : null,
    color: color ? compact({
      value: attr(color, "val"),
      themeColor: attr(color, "themeColor"),
      themeTint: attr(color, "themeTint"),
      themeShade: attr(color, "themeShade")
    }) : null,
    size: intAttr(child(node, "sz"), "val"),
    sizeCs: intAttr(child(node, "szCs"), "val"),
    spacing: intAttr(spacing, "val"),
    position: intAttr(position, "val"),
    scale: intAttr(scale, "val"),
    verticalAlign: attr(vert, "val"),
    snapToGrid: child(node, "snapToGrid") ? boolAttr(child(node, "snapToGrid"), "val", true) : null,
    languages: lang ? compact({
      value: attr(lang, "val"),
      eastAsia: attr(lang, "eastAsia"),
      bidi: attr(lang, "bidi")
    }) : null,
    fonts: fonts ? compact({
      ascii: attr(fonts, "ascii"),
      hAnsi: attr(fonts, "hAnsi"),
      eastAsia: attr(fonts, "eastAsia"),
      cs: attr(fonts, "cs"),
      asciiTheme: attr(fonts, "asciiTheme"),
      hAnsiTheme: attr(fonts, "hAnsiTheme"),
      eastAsiaTheme: attr(fonts, "eastAsiaTheme"),
      csTheme: attr(fonts, "csTheme")
    }) : null
  });
}

function parseTextChild(node, context) {
  switch (localName(node)) {
    case "r": return [parseRun(node, context)];
    case "hyperlink": {
      const relationshipId = attr(node, "id");
      const relationship = relationshipId
        ? (context.relationships || []).find(item => item.id === relationshipId)
        : null;
      return [{
        type: NODE_TYPES.HYPERLINK,
        relationshipId,
        target: relationship?.target || null,
        targetMode: relationship?.targetMode || null,
        anchor: attr(node, "anchor"),
        history: attr(node, "history"),
        tooltip: attr(node, "tooltip"),
        targetFrame: attr(node, "tgtFrame"),
        children: children(node).flatMap(n => localName(n) === "r" ? [parseRun(n, context)] : [])
      }];
    }
    case "smartTag":
      return children(node).flatMap(childNode => parseTextChild(childNode, context)).filter(Boolean);
    case "sdt": {
      const content = child(node, "sdtContent");
      return content ? children(content).flatMap(childNode => parseTextChild(childNode, context)).filter(Boolean) : [];
    }
    case "ins":
    case "moveTo":
    case "del":
    case "moveFrom": {
      const kind = localName(node);
      if (context.revisionMode === "markup") {
        return [{
          type: NODE_TYPES.REVISION,
          revision: parseRevisionMetadata(node, kind),
          children: children(node).flatMap(childNode => parseTextChild(childNode, context)).filter(Boolean)
        }];
      }
      if (kind === "ins" || kind === "moveTo") {
        return children(node).flatMap(childNode => parseTextChild(childNode, context)).filter(Boolean);
      }
      return [];
    }
    case "customXml":
      return children(node).flatMap(childNode => parseTextChild(childNode, context)).filter(Boolean);
    case "bookmarkStart": return [{ type: "bookmark-start", id: attr(node, "id"), name: attr(node, "name") }];
    case "bookmarkEnd": return [{ type: "bookmark-end", id: attr(node, "id") }];
    case "commentRangeStart": return [{ type: "comment-range-start", id: intAttr(node, "id") }];
    case "commentRangeEnd": return [{ type: "comment-range-end", id: intAttr(node, "id") }];
    case "fldSimple": return [{ type: NODE_TYPES.FIELD, instruction: attr(node, "instr"), children: children(node).flatMap(n => localName(n) === "r" ? [parseRun(n, context)] : []) }];
    case "oMath":
    case "oMathPara": return [parseMath(node)];
    default: return context.parseNode ? [context.parseNode(node)].filter(Boolean) : [];
  }
}

function parseRunChild(node, context) {
  switch (localName(node)) {
    case "t":
    case "delText": return [{ type: NODE_TYPES.TEXT, value: text(node), preserveSpace: attr(node, "space") === "preserve" }];
    case "sym": {
      const value = attr(node, "char");
      const codePoint = value ? Number.parseInt(value, 16) : NaN;
      return Number.isFinite(codePoint) ? [{ type: "symbol", value: String.fromCodePoint(codePoint), font: attr(node, "font") }] : [];
    }
    case "tab": return [{ type: "tab" }];
    case "br":
    case "cr": return [{ type: NODE_TYPES.BREAK, breakType: attr(node, "type") ?? "line", clear: attr(node, "clear") }];
    case "fldChar": return [{ type: NODE_TYPES.FIELD, fieldCharType: attr(node, "fldCharType"), dirty: attr(node, "dirty") }];
    case "footnoteReference": return [{ type: "footnote-reference", id: intAttr(node, "id") }];
    case "footnoteRef": return [{ type: "footnote-ref" }];
    case "endnoteReference": return [{ type: "endnote-reference", id: intAttr(node, "id") }];
    case "endnoteRef": return [{ type: "endnote-ref" }];
    case "commentReference": return [{ type: "comment-reference", id: intAttr(node, "id") }];
    case "instrText": return [{ type: NODE_TYPES.FIELD, instruction: text(node), preserveSpace: attr(node, "space") === "preserve" }];
    case "drawing":
    case "pict":
    case "object": return context.parseNode ? [context.parseNode(node)].filter(Boolean) : [];
    case "oMath":
    case "oMathPara": return [parseMath(node)];
    case "AlternateContent":
      return parseAlternateContent(node, context);
    case "Choice":
    case "Fallback":
      return children(node).flatMap(childNode => parseRunChild(childNode, context)).filter(Boolean);
    case "noBreakHyphen": return [{ type: NODE_TYPES.TEXT, value: "‑" }];
    case "softHyphen": return [{ type: NODE_TYPES.TEXT, value: "\u00AD" }];
    case "lastRenderedPageBreak": return [{ type: "rendered-page-break" }];
    default: return [];
  }
}

function parseAlternateContent(node, context) {
  const supportedRequires = new Set(["wps", "wpg", "pic", "a14", "w14", "w15"]);
  const choices = children(node).filter(n => localName(n) === "Choice");
  const selected = choices.find(choice => {
    const requires = String(attr(choice, "Requires") || "").trim().split(/\s+/).filter(Boolean);
    return requires.length === 0 || requires.every(prefix => supportedRequires.has(prefix));
  }) || children(node).find(n => localName(n) === "Fallback");
  return selected ? children(selected).flatMap(childNode => parseRunChild(childNode, context)).filter(Boolean) : [];
}

export function parseSectionProperties(node) {
  if (!node) return {};
  const pgSz = child(node, "pgSz");
  const pgMar = child(node, "pgMar");
  const cols = child(node, "cols");
  const docGrid = child(node, "docGrid");
  const pgNumType = child(node, "pgNumType");
  const footnotePr = child(node, "footnotePr");
  const endnotePr = child(node, "endnotePr");

  const columnChildren = cols ? children(cols, "col") : [];
  const headerReferences = children(node, "headerReference").map(n => compact({ type: attr(n, "type"), relationshipId: attr(n, "id") }));
  const footerReferences = children(node, "footerReference").map(n => compact({ type: attr(n, "type"), relationshipId: attr(n, "id") }));

  return compact({
    type: attr(child(node, "type"), "val"),
    pageSize: pgSz ? compact({
      width: intAttr(pgSz, "w"),
      height: intAttr(pgSz, "h"),
      orientation: attr(pgSz, "orient"),
      code: intAttr(pgSz, "code")
    }) : null,
    margins: pgMar ? compact({
      top: intAttr(pgMar, "top"),
      right: intAttr(pgMar, "right"),
      bottom: intAttr(pgMar, "bottom"),
      left: intAttr(pgMar, "left"),
      header: intAttr(pgMar, "header"),
      footer: intAttr(pgMar, "footer"),
      gutter: intAttr(pgMar, "gutter")
    }) : null,
    columns: cols ? compact({
      count: intAttr(cols, "num", columnChildren.length || 1),
      space: intAttr(cols, "space"),
      equalWidth: attr(cols, "equalWidth"),
      separator: attr(cols, "sep"),
      definitions: columnChildren.map(n => compact({ width: intAttr(n, "w"), space: intAttr(n, "space") }))
    }) : null,
    documentGrid: docGrid ? compact({
      type: attr(docGrid, "type"),
      linePitch: intAttr(docGrid, "linePitch"),
      charSpace: intAttr(docGrid, "charSpace")
    }) : null,
    pageNumbering: pgNumType ? compact({
      format: attr(pgNumType, "fmt"),
      start: intAttr(pgNumType, "start"),
      chapterStyle: intAttr(pgNumType, "chapStyle"),
      chapterSeparator: attr(pgNumType, "chapSep")
    }) : null,
    footnotes: parseNoteProperties(footnotePr),
    endnotes: parseNoteProperties(endnotePr),
    titlePage: child(node, "titlePg") ? boolAttr(child(node, "titlePg"), "val", true) : null,
    headerReferences: headerReferences.length ? headerReferences : null,
    footerReferences: footerReferences.length ? footerReferences : null
  });
}

function parseNoteProperties(node) {
  if (!node) return null;
  return compact({
    position: attr(child(node, "pos"), "val"),
    format: attr(child(node, "numFmt"), "val"),
    start: intAttr(child(node, "numStart"), "val"),
    restart: attr(child(node, "numRestart"), "val")
  });
}

function parseRevisionMetadata(node, kind) {
  return compact({
    kind,
    id: attr(node, "id"),
    author: attr(node, "author"),
    date: attr(node, "date")
  });
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}
