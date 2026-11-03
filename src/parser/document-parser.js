import { createDiagnostics } from "../common/diagnostics.js";
import { openPackage, findMainDocument } from "./package-reader.js";
import { children, localName, child, attr } from "./xml-reader.js";
import { parseParagraph, parseSectionProperties } from "./text-parser.js";
import { parseTable } from "./table-parser.js";
import { parseStyles, parseTheme, parseFontTable } from "./styles-parser.js";
import { parseNumbering } from "./numbering-parser.js";
import { parseSettings } from "./settings-parser.js";
import { parseMedia } from "./media-parser.js";
import { parseFootnotesPart, parseEndnotesPart } from "./note-parser.js";
import { parseCommentsPart } from "./comment-parser.js";
import { parseChartPart } from "./chart-parser.js";

export async function parseDocument(source, options = {}) {
  const diagnostics = createDiagnostics();
  const pkg = await openPackage(source, options);
  const mainPath = await findMainDocument(pkg);
  const documentXml = await pkg.readXml(mainPath);
  if (!documentXml) throw new Error(`Main document part not found: ${mainPath}`);

  const rels = await pkg.getRelationships(mainPath);
  const relByType = suffix => rels.find(r => r.type?.endsWith(suffix));
  const loadRel = async suffix => {
    const r = relByType(suffix);
    return r ? pkg.readXml(pkg.resolveTarget(mainPath, r.target)) : null;
  };

  const styles = parseStyles(await loadRel("/styles"), { missingStylesDefaults: options.missingStylesDefaults });
  const numbering = parseNumbering(await loadRel("/numbering"));
  const settings = parseSettings(await loadRel("/settings"));
  const theme = parseTheme(await loadRel("/theme"));
  const fontTableRel = relByType("/fontTable");
  const fontTablePath = fontTableRel ? pkg.resolveTarget(mainPath, fontTableRel.target) : null;
  const fonts = parseFontTable(fontTablePath ? await pkg.readXml(fontTablePath) : null);
  if (fontTablePath) await attachEmbeddedFontData(pkg, fontTablePath, fonts);

  const revisionMode = options.revisionMode === "markup" ? "markup" : "final";
  const context = { pkg, diagnostics, relationships: rels, sourcePart: mainPath, revisionMode };
  const parseNode = node => {
    switch (localName(node)) {
      case "p": return parseParagraph(node, { ...context, parseNode });
      case "tbl": return parseTable(node, { ...context, parseNode });
      case "drawing":
      case "pict":
      case "object": return parseMedia(node, context);
      default: return null;
    }
  };

  const backgroundNode = child(documentXml.documentElement, "background");
  const background = backgroundNode ? {
    color: attr(backgroundNode, "color"),
    themeColor: attr(backgroundNode, "themeColor"),
    themeTint: attr(backgroundNode, "themeTint"),
    themeShade: attr(backgroundNode, "themeShade")
  } : null;

  const body = child(documentXml.documentElement, "body");
  const bodyChildren = parseBlockChildren(body, parseNode, revisionMode).filter(node => node?.type);
  const sectPr = child(body, "sectPr");

  const resources = await loadImageResources(pkg, mainPath, rels);
  Object.assign(resources, await loadChartResources(pkg, mainPath, rels));

  const { headers, footers, resources: partResources } = await parseHeaderFooterParts(pkg, mainPath, rels, diagnostics, revisionMode);
  Object.assign(resources, partResources);
  const footnotes = await parseFootnotesPart(pkg, mainPath, rels, diagnostics);
  const endnotes = await parseEndnotesPart(pkg, mainPath, rels, diagnostics);
  const comments = await parseCommentsPart(pkg, mainPath, rels, diagnostics);

  return {
    type: "raw-document",
    mainPart: mainPath,
    body: bodyChildren,
    background,
    finalSection: sectPr ? parseSectionProperties(sectPr) : null,
    styles,
    numbering,
    settings,
    theme,
    fonts,
    headers,
    footers,
    footnotes,
    endnotes,
    comments,
    resources,
    relationships: rels,
    metadata: {},
    diagnostics: diagnostics.items
  };
}

function parseBlockChildren(parent, parseNode, revisionMode = "final") {
  return children(parent).flatMap(node => {
    const name = localName(node);
    if (name === "sectPr") return [];
    if (name === "sdt") {
      const content = child(node, "sdtContent");
      return content ? parseBlockChildren(content, parseNode, revisionMode) : [];
    }
    if (name === "customXml") return parseBlockChildren(node, parseNode, revisionMode);
    if (["ins", "moveTo", "del", "moveFrom"].includes(name)) {
      if (revisionMode === "markup") {
        const revision = parseRevisionMetadata(node, name);
        return parseBlockChildren(node, parseNode, revisionMode).map(parsed => ({ ...parsed, revision }));
      }
      if (name === "ins" || name === "moveTo") return parseBlockChildren(node, parseNode, revisionMode);
      return [];
    }
    const parsed = parseNode(node);
    return parsed ? [parsed] : [];
  });
}

function parseRevisionMetadata(node, kind) {
  return {
    kind,
    id: attr(node, "id"),
    author: attr(node, "author"),
    date: attr(node, "date")
  };
}

async function parseHeaderFooterParts(pkg, mainPath, relationships, diagnostics, revisionMode = "final") {
  const headers = {};
  const footers = {};
  const resources = {};
  for (const rel of relationships) {
    const isHeader = rel.type?.endsWith("/header");
    const isFooter = rel.type?.endsWith("/footer");
    if (!isHeader && !isFooter) continue;

    const partPath = pkg.resolveTarget(mainPath, rel.target);
    const xml = await pkg.readXml(partPath);
    if (!xml) continue;
    const partRelationships = await pkg.getRelationships(partPath);
    const context = { pkg, diagnostics, relationships: partRelationships, sourcePart: partPath, revisionMode };
    const parseNode = node => {
      switch (localName(node)) {
        case "p": return parseParagraph(node, { ...context, parseNode });
        case "tbl": return parseTable(node, { ...context, parseNode });
        case "drawing":
        case "pict":
        case "object": return parseMedia(node, context);
        default: return null;
      }
    };
    Object.assign(resources, await loadImageResources(pkg, partPath, partRelationships));
    Object.assign(resources, await loadChartResources(pkg, partPath, partRelationships));
    const content = parseBlockChildren(xml.documentElement, parseNode, revisionMode).filter(node => node?.type);
    const entry = { relationshipId: rel.id, partPath, relationships: partRelationships, content };
    (isHeader ? headers : footers)[rel.id] = entry;
  }
  return { headers, footers, resources };
}

async function loadImageResources(pkg, sourcePart, relationships) {
  const out = {};
  for (const rel of relationships.filter(x => x.type?.endsWith("/image") && x.targetMode !== "External")) {
    const path = pkg.resolveTarget(sourcePart, rel.target);
    const data = await pkg.readBinary(path);
    out[`${sourcePart}#${rel.id}`] = { id: rel.id, key: `${sourcePart}#${rel.id}`, path, contentType: inferImageContentType(path), sourcePart, data };
  }
  return out;
}

async function loadChartResources(pkg, sourcePart, relationships) {
  const out = {};
  for (const rel of relationships.filter(x => x.type?.endsWith("/chart") && x.targetMode !== "External")) {
    const path = pkg.resolveTarget(sourcePart, rel.target);
    const xml = await pkg.readXml(path);
    const chart = parseChartPart(xml);
    out[`${sourcePart}#${rel.id}`] = { id: rel.id, key: `${sourcePart}#${rel.id}`, path, contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml", sourcePart, chart };
  }
  return out;
}

function inferImageContentType(path = "") {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", bmp:"image/bmp", svg:"image/svg+xml", tif:"image/tiff", tiff:"image/tiff", webp:"image/webp" })[ext] || "application/octet-stream";
}

async function attachEmbeddedFontData(pkg, fontTablePath, fonts) {
  const rels = await pkg.getRelationships(fontTablePath);
  const byId = new Map(rels.map(rel => [rel.id, rel]));
  for (const font of Object.values(fonts || {})) {
    for (const ref of font.embedded || []) {
      const rel = byId.get(ref.relationshipId);
      if (!rel || rel.targetMode === "External") continue;
      const path = pkg.resolveTarget(fontTablePath, rel.target);
      const data = await pkg.readBinary(path);
      if (!data) continue;
      ref.path = path;
      ref.data = data;
    }
  }
}
