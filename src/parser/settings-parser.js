import { child, attr, intAttr, boolAttr } from "./xml-reader.js";

export function parseSettings(doc) {
  if (!doc) return {};
  const root = doc.documentElement;
  const compat = child(root, "compat");
  const grid = child(root, "docGrid");
  return {
    defaultTabStop: intAttr(child(root, "defaultTabStop"), "val"),
    characterSpacingControl: attr(child(root, "characterSpacingControl"), "val"),
    noLineBreaksBefore: parseLineBreakRule(child(root, "noLineBreaksBefore")),
    noLineBreaksAfter: parseLineBreakRule(child(root, "noLineBreaksAfter")),
    evenAndOddHeaders: !!child(root, "evenAndOddHeaders"),
    mirrorMargins: !!child(root, "mirrorMargins"),
    trackRevisions: !!child(root, "trackRevisions"),
    compatibility: compat ? {
      mode: attr(child(compat, "compatSetting"), "val"),
      adjustLineHeightInTable: child(compat, "adjustLineHeightInTable")
        ? boolAttr(child(compat, "adjustLineHeightInTable"), "val", true)
        : false,
      noColumnBalance: child(compat, "noColumnBalance")
        ? boolAttr(child(compat, "noColumnBalance"), "val", true)
        : false
    } : {},
    documentGrid: grid ? {
      type: attr(grid, "type"),
      linePitch: intAttr(grid, "linePitch"),
      charSpace: intAttr(grid, "charSpace")
    } : {}
  };
}


function parseLineBreakRule(node) {
  if (!node) return null;
  return {
    language: attr(node, "lang"),
    characters: attr(node, "val", "")
  };
}
