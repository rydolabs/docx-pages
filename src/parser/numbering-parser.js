import { child, children, attr, intAttr } from "./xml-reader.js";
import { parseParagraphProperties, parseRunProperties } from "./text-parser.js";

export function parseNumbering(doc) {
  const result = { abstractNumbers: {}, numbers: {} };
  if (!doc) return result;
  const root = doc.documentElement;

  for (const n of children(root, "abstractNum")) {
    const id = intAttr(n, "abstractNumId");
    result.abstractNumbers[id] = {
      id,
      multiLevelType: attr(child(n, "multiLevelType"), "val"),
      levels: Object.fromEntries(children(n, "lvl").map(l => {
        const level = intAttr(l, "ilvl", 0);
        return [level, parseLevel(l, level)];
      }))
    };
  }

  for (const n of children(root, "num")) {
    const id = intAttr(n, "numId");
    const overrides = {};
    for (const o of children(n, "lvlOverride")) {
      const level = intAttr(o, "ilvl", 0);
      const levelNode = child(o, "lvl");
      overrides[level] = {
        level: levelNode ? parseLevel(levelNode, level) : null,
        start: intAttr(child(o, "startOverride"), "val")
      };
    }
    result.numbers[id] = { id, abstractNumId: intAttr(child(n, "abstractNumId"), "val"), overrides };
  }
  return result;
}

function parseLevel(node, level) {
  return {
    level,
    start: intAttr(child(node, "start"), "val", 1),
    format: attr(child(node, "numFmt"), "val"),
    text: attr(child(node, "lvlText"), "val"),
    justification: attr(child(node, "lvlJc"), "val"),
    suffix: attr(child(node, "suff"), "val"),
    paragraphProperties: parseParagraphProperties(child(node, "pPr")),
    runProperties: parseRunProperties(child(node, "rPr"))
  };
}
