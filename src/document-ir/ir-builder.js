import { createDocumentNode, createSectionNode } from "./document-nodes.js";
import { createTextNode } from "./text-nodes.js";
import { createTableNode } from "./table-nodes.js";
import { createMediaNode } from "./media-nodes.js";
import { applyNumberingLabels } from "./numbering-sequencer.js";
import { applyFootnoteLabels } from "./footnote-sequencer.js";
import { applyEndnoteLabels } from "./endnote-sequencer.js";

export function buildDocumentIR(resolved) {
  const mapNode = node => {
    if (!node) return null;
    if (node.type === "table") return createTableNode(node);
    if (["image", "vml", "frame"].includes(node.type)) return createMediaNode(node);
    return createTextNode(node);
  };

  const sections = [];
  let currentChildren = [];
  for (const node of resolved.body || []) {
    const irNode = mapNode(node);
    if (irNode) currentChildren.push(irNode);
    const sectionProperties = node?.properties?.section;
    if (sectionProperties) {
      sections.push(createSectionNode({
        properties: sectionProperties,
        children: currentChildren,
        headerRefs: sectionProperties.headerReferences || [],
        footerRefs: sectionProperties.footerReferences || []
      }));
      currentChildren = [];
    }
  }

  if (currentChildren.length || !sections.length) {
    const properties = resolved.finalSection || {};
    sections.push(createSectionNode({
      properties,
      children: currentChildren,
      headerRefs: properties.headerReferences || [],
      footerRefs: properties.footerReferences || []
    }));
  }

  inheritSectionPartReferences(sections);

  const document = createDocumentNode({
    sections,
    resources: resolved.resources,
    settings: resolved.settings,
    metadata: { sourceType: resolved.type, ...(resolved.metadata || {}) },
    headers: mapParts(resolved.headers, mapNode),
    footers: mapParts(resolved.footers, mapNode),
    footnotes: mapParts(resolved.footnotes, mapNode),
    endnotes: mapParts(resolved.endnotes, mapNode),
    comments: mapParts(resolved.comments, mapNode),
    background: resolved.background || null
  });
  return applyEndnoteLabels(applyFootnoteLabels(applyNumberingLabels(document)));
}

function mapParts(parts, mapNode) {
  return Object.fromEntries(Object.entries(parts || {}).map(([id, part]) => [id, {
    ...part,
    content: (part.content || []).map(mapNode).filter(Boolean)
  }]));
}


function inheritSectionPartReferences(sections) {
  const inheritedHeaders = new Map();
  const inheritedFooters = new Map();
  for (const section of sections || []) {
    section.headerRefs = inheritPartReferenceSet(section.headerRefs || [], inheritedHeaders);
    section.footerRefs = inheritPartReferenceSet(section.footerRefs || [], inheritedFooters);
  }
}

function inheritPartReferenceSet(explicitRefs, inherited) {
  for (const ref of explicitRefs || []) {
    const type = ref?.type || "default";
    if (ref?.relationshipId) inherited.set(type, ref);
  }
  return [...inherited.values()];
}
