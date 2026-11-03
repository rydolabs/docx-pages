import { children, localName, attr, intAttr } from './xml-reader.js';
import { parseParagraph } from './text-parser.js';
import { parseTable } from './table-parser.js';
import { parseMedia } from './media-parser.js';

/** Parse the Word footnotes story without introducing page-layout policy. */
export async function parseFootnotesPart(pkg, mainPath, relationships, diagnostics) {
  return parseNotePart(pkg, mainPath, relationships, diagnostics, 'footnotes', 'footnote');
}

export async function parseEndnotesPart(pkg, mainPath, relationships, diagnostics) {
  return parseNotePart(pkg, mainPath, relationships, diagnostics, 'endnotes', 'endnote');
}

async function parseNotePart(pkg, mainPath, relationships, diagnostics, relationshipSuffix, elementName) {
  const rel = (relationships || []).find(item => item.type?.endsWith(`/${relationshipSuffix}`));
  if (!rel || rel.targetMode === 'External') return {};
  const partPath = pkg.resolveTarget(mainPath, rel.target);
  const xml = await pkg.readXml(partPath);
  if (!xml) return {};
  const partRelationships = await pkg.getRelationships(partPath);
  const context = { pkg, diagnostics, relationships: partRelationships, sourcePart: partPath };
  const parseNode = node => {
    switch (localName(node)) {
      case 'p': return parseParagraph(node, { ...context, parseNode });
      case 'tbl': return parseTable(node, { ...context, parseNode });
      case 'drawing':
      case 'pict': return parseMedia(node, context);
      default: return null;
    }
  };

  const out = {};
  for (const node of children(xml.documentElement, elementName)) {
    const id = intAttr(node, 'id');
    if (id == null) continue;
    out[id] = {
      id,
      type: attr(node, 'type') || 'normal',
      partPath,
      relationships: partRelationships,
      content: children(node).map(parseNode).filter(Boolean)
    };
  }
  return out;
}
