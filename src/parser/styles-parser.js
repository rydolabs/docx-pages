import { child, children, attr, localName } from "./xml-reader.js";
import { parseParagraphProperties, parseRunProperties } from "./text-parser.js";
import { parseTableProperties, parseTableCellProperties } from "./table-parser.js";

export function parseStyles(doc, { missingStylesDefaults = null } = {}) {
  if (!doc) {
    // A package without word/styles.xml has no document-supplied docDefaults.
    // Applications may choose different Normal defaults; do not guess one
    // globally. Allow the caller to supply an explicit fallback at import.
    return {
      defaults: {
        paragraph: { ...(missingStylesDefaults?.paragraph || {}) },
        run: { ...(missingStylesDefaults?.run || {}) }
      },
      styles: {},
      latentStyles: {}
    };
  }
  const root = doc.documentElement;
  const defaults = child(root, "docDefaults");
  const styles = {};
  for (const n of children(root, "style")) {
    const style = parseStyle(n);
    if (style.id) styles[style.id] = style;
  }
  return {
    defaults: {
      paragraph: parseParagraphProperties(child(child(defaults, "pPrDefault"), "pPr")),
      run: parseRunProperties(child(child(defaults, "rPrDefault"), "rPr"))
    },
    styles
  };
}

export function parseStyle(node) {
  const conditionalTableStyles = {};
  for (const n of children(node, "tblStylePr")) {
    const type = attr(n, "type");
    if (!type) continue;
    conditionalTableStyles[type] = {
      tableProperties: parseTableProperties(child(n, "tblPr")),
      cellProperties: parseTableCellProperties(child(n, "tcPr")),
      paragraphProperties: parseParagraphProperties(child(n, "pPr")),
      runProperties: parseRunProperties(child(n, "rPr"))
    };
  }
  return {
    id: attr(node, "styleId"),
    type: attr(node, "type"),
    isDefault: attr(node, "default") === "1",
    customStyle: attr(node, "customStyle") === "1",
    name: attr(child(node, "name"), "val"),
    basedOn: attr(child(node, "basedOn"), "val"),
    next: attr(child(node, "next"), "val"),
    linked: attr(child(node, "link"), "val"),
    paragraphProperties: parseParagraphProperties(child(node, "pPr")),
    runProperties: parseRunProperties(child(node, "rPr")),
    tableProperties: parseTableProperties(child(node, "tblPr")),
    conditionalTableStyles
  };
}

export function parseTheme(doc) {
  if (!doc) return {};
  const root = doc.documentElement;
  const themeElementsNode = children(root).find(n => localName(n) === "themeElements");
  const fontScheme = themeElementsNode ? children(themeElementsNode).find(n => localName(n) === "fontScheme") : null;
  const colorScheme = themeElementsNode ? children(themeElementsNode).find(n => localName(n) === "clrScheme") : null;

  const readFontSet = name => {
    const set = fontScheme ? children(fontScheme).find(n => localName(n) === name) : null;
    if (!set) return {};
    const latin = children(set).find(n => localName(n) === "latin");
    const ea = children(set).find(n => localName(n) === "ea");
    const cs = children(set).find(n => localName(n) === "cs");
    return {
      latin: attr(latin, "typeface"),
      eastAsia: attr(ea, "typeface"),
      complexScript: attr(cs, "typeface")
    };
  };

  const colors = {};
  for (const slot of children(colorScheme)) {
    const valueNode = children(slot)[0];
    if (!valueNode) continue;
    const colorType = localName(valueNode);
    const value = colorType === "sysClr"
      ? (attr(valueNode, "lastClr") || attr(valueNode, "val"))
      : (attr(valueNode, "val") || attr(valueNode, "lastClr"));
    if (value) colors[localName(slot)] = value;
  }
  Object.assign(colors, {
    text1: colors.dk1,
    background1: colors.lt1,
    text2: colors.dk2,
    background2: colors.lt2,
    hyperlink: colors.hlink,
    followedHyperlink: colors.folHlink
  });

  return {
    name: attr(root, "name"),
    fonts: { major: readFontSet("majorFont"), minor: readFontSet("minorFont") },
    colors
  };
}

export function parseFontTable(doc) {
  if (!doc) return {};
  const fonts = {};
  const embedTypes = {
    embedRegular: "regular",
    embedBold: "bold",
    embedItalic: "italic",
    embedBoldItalic: "boldItalic"
  };
  for (const n of children(doc.documentElement, "font")) {
    const name = attr(n, "name");
    if (!name) continue;
    const embedded = [];
    for (const e of children(n)) {
      const type = embedTypes[localName(e)];
      if (!type) continue;
      embedded.push({
        type,
        relationshipId: attr(e, "id"),
        fontKey: attr(e, "fontKey")
      });
    }
    fonts[name] = {
      name,
      altName: attr(child(n, "altName"), "val"),
      family: attr(child(n, "family"), "val"),
      pitch: attr(child(n, "pitch"), "val"),
      charset: attr(child(n, "charset"), "val"),
      embedded
    };
  }
  return fonts;
}
