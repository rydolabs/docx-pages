import { NODE_TYPES } from "../common/constants.js";
import { getSupportLevel } from "../common/capabilities.js";
import { child, children, attr, intAttr, localName } from "./xml-reader.js";

export function parseMedia(node, context = {}) {
  const name = localName(node);
  if (name === "drawing") return parseDrawing(node, context);
  if (name === "pict") return parseVml(node, context);
  if (name === "object") {
    context.diagnostics?.warn?.(
      "embedded-object-partial",
      "embedded object uses its stored VML preview only",
      { feature: "embeddedObject", supportLevel: getSupportLevel("embeddedObject"), sourcePart: context.sourcePart }
    );
    return parseVml(node, context);
  }
  return null;
}

export function parseDrawing(node, context = {}) {
  let relationshipId = null;
  let extent = null;
  let docProperties = null;
  let positioning = { mode: "inline" };
  const graphicData = findDescendant(node, "graphicData");
  const graphicUri = attr(graphicData, "uri");
  const textBox = parseTextbox(node, context);
  const fallbackFeature = textBox ? null : classifyDrawingFeature(graphicUri);
  if (textBox) {
    context.diagnostics?.warn?.(
      "drawing-partial",
      "textbox uses bounded rectangular flow support",
      { feature: "textbox", supportLevel: getSupportLevel("textbox"), graphicUri, sourcePart: context.sourcePart }
    );
  } else if (fallbackFeature) {
    context.diagnostics?.warn?.(
      "drawing-fallback",
      `${fallbackFeature} is rendered using a simplified fallback`,
      { feature: fallbackFeature, supportLevel: getSupportLevel(fallbackFeature), graphicUri, sourcePart: context.sourcePart }
    );
  }

  const walk = n => {
    const name = localName(n);
    if (name === "blip" && !relationshipId) relationshipId = attr(n, "embed") || attr(n, "link");
    if (name === "chart" && !relationshipId) relationshipId = attr(n, "id");
    if (name === "extent" && !extent) extent = compact({ cx: intAttr(n, "cx"), cy: intAttr(n, "cy") });
    if (name === "docPr" && !docProperties) docProperties = compact({ id: intAttr(n, "id"), name: attr(n, "name"), description: attr(n, "descr"), title: attr(n, "title") });
    if (name === "inline") positioning = { ...positioning, mode: "inline" };
    if (name === "anchor") {
      positioning = compact({
        mode: "anchor",
        behindDoc: attr(n, "behindDoc"),
        layoutInCell: attr(n, "layoutInCell"),
        allowOverlap: attr(n, "allowOverlap"),
        relativeHeight: intAttr(n, "relativeHeight"),
        distanceTop: intAttr(n, "distT"),
        distanceBottom: intAttr(n, "distB"),
        distanceLeft: intAttr(n, "distL"),
        distanceRight: intAttr(n, "distR")
      });
    }
    for (const c of children(n)) walk(c);
  };
  walk(node);

  const anchor = findDescendant(node, "anchor");
  if (anchor) {
    positioning.horizontal = parsePosition(findChild(anchor, "positionH"));
    positioning.vertical = parsePosition(findChild(anchor, "positionV"));
    positioning.wrap = parseWrap(anchor);
  }

  return compact({
    type: NODE_TYPES.IMAGE,
    relationshipId,
    resourceKey: relationshipId ? makeResourceKey(context.sourcePart, relationshipId) : null,
    extent,
    docProperties,
    positioning,
    visual: parseDrawingVisual(node),
    textBox,
    fallback: fallbackFeature ? {
      feature: fallbackFeature,
      supportLevel: getSupportLevel(fallbackFeature),
      sourceUri: graphicUri
    } : null
  });
}

export function parseVml(node, context = {}) {
  const shape = findDescendant(node, "shape") || findDescendant(node, "rect") || findDescendant(node, "group");
  const imageData = findDescendant(node, "imagedata");
  const textBox = parseTextbox(node, context);
  if (textBox) {
    context.diagnostics?.warn?.(
      "drawing-partial",
      "textbox uses bounded rectangular flow support",
      { feature: "textbox", supportLevel: getSupportLevel("textbox"), sourcePart: context.sourcePart }
    );
  }
  return compact({
    type: "vml",
    relationshipId: attr(imageData, "id") || attr(imageData, "href"),
    resourceKey: (attr(imageData, "id") || attr(imageData, "href"))
      ? makeResourceKey(context.sourcePart, attr(imageData, "id") || attr(imageData, "href"))
      : null,
    shape: shape ? compact({
      id: attr(shape, "id"),
      type: attr(shape, "type"),
      style: attr(shape, "style"),
      filled: attr(shape, "filled"),
      stroked: attr(shape, "stroked"),
      fillColor: attr(shape, "fillcolor"),
      strokeColor: attr(shape, "strokecolor"),
      strokeWeight: attr(shape, "strokeweight")
    }) : null,
    visual: shape ? compact({
      fill: attr(shape, "filled") === "f" ? null : normalizeVmlColor(attr(shape, "fillcolor")),
      line: attr(shape, "stroked") === "f" ? null : compact({ color: normalizeVmlColor(attr(shape, "strokecolor")), widthPt: parsePt(attr(shape, "strokeweight")) })
    }) : null,
    textBox
  });
}

function parseDrawingVisual(node) {
  const spPr = findDescendant(node, "spPr");
  if (!spPr) return null;
  const fill = findChild(spPr, "solidFill");
  const line = findChild(spPr, "ln");
  const geometry = findChild(spPr, "prstGeom");
  const bodyPr = findDescendant(node, "bodyPr");
  const srcRect = findDescendant(node, "srcRect");
  return compact({
    geometry: attr(geometry, "prst"),
    crop: srcRect ? compact({
      left: intAttr(srcRect, "l"),
      top: intAttr(srcRect, "t"),
      right: intAttr(srcRect, "r"),
      bottom: intAttr(srcRect, "b")
    }) : null,
    fill: parseDrawingColor(fill),
    line: line && !findChild(line, "noFill") ? compact({
      widthEmu: intAttr(line, "w"),
      color: parseDrawingColor(findChild(line, "solidFill")),
      dash: attr(findChild(line, "prstDash"), "val")
    }) : null,
    textInsets: bodyPr ? compact({
      leftEmu: intAttr(bodyPr, "lIns"),
      topEmu: intAttr(bodyPr, "tIns"),
      rightEmu: intAttr(bodyPr, "rIns"),
      bottomEmu: intAttr(bodyPr, "bIns")
    }) : null
  });
}

function parseDrawingColor(container) {
  if (!container) return null;
  const colorNode = children(container).find(n => ["srgbClr", "schemeClr", "sysClr"].includes(localName(n)));
  if (!colorNode) return null;
  const name = localName(colorNode);
  const modifiers = Object.fromEntries(children(colorNode).map(n => [localName(n), intAttr(n, "val")]).filter(([,v]) => v != null));
  return compact({
    value: name === "srgbClr" ? attr(colorNode, "val") : (name === "sysClr" ? attr(colorNode, "lastClr") : null),
    themeColor: name === "schemeClr" ? attr(colorNode, "val") : null,
    ...modifiers
  });
}

function normalizeVmlColor(value) {
  if (!value) return null;
  return { value: String(value).replace(/^#/, "") };
}

function parsePt(value) {
  const m = /^(-?[\d.]+)pt$/i.exec(value || "");
  return m ? Number(m[1]) : null;
}

function parsePosition(node) {
  if (!node) return null;
  return compact({
    relativeFrom: attr(node, "relativeFrom"),
    align: findChild(node, "align")?.textContent || null,
    offset: intText(findChild(node, "posOffset"))
  });
}

function parseWrap(anchor) {
  const names = ["wrapNone", "wrapSquare", "wrapTight", "wrapThrough", "wrapTopAndBottom"];
  for (const name of names) {
    const wrap = findChild(anchor, name);
    if (wrap) return compact({
      type: name,
      wrapText: attr(wrap, "wrapText"),
      distanceTop: intAttr(wrap, "distT"),
      distanceBottom: intAttr(wrap, "distB"),
      distanceLeft: intAttr(wrap, "distL"),
      distanceRight: intAttr(wrap, "distR")
    });
  }
  return null;
}

function parseTextbox(node, context) {
  const content = findDescendant(node, "txbxContent");
  if (!content) return null;
  return {
    content: children(content).map(childNode => context.parseNode?.(childNode)).filter(Boolean)
  };
}

function classifyDrawingFeature(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return null;
  if (value.includes("/chart")) return "chart";
  if (value.includes("/diagram") || value.includes("drawingml/2006/diagram")) return "smartArt";
  return null;
}

function findChild(node, name) {
  return children(node).find(n => localName(n) === name) || null;
}

function findDescendant(node, name) {
  if (!node) return null;
  for (const c of children(node)) {
    if (localName(c) === name) return c;
    const nested = findDescendant(c, name);
    if (nested) return nested;
  }
  return null;
}

function intText(node) {
  if (!node?.textContent) return null;
  const parsed = Number.parseInt(node.textContent, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

function makeResourceKey(sourcePart, relationshipId) {
  return `${sourcePart || "word/document.xml"}#${relationshipId}`;
}
