import { children, localName, attr, intAttr } from './xml-reader.js';
import { parseParagraph } from './text-parser.js';
import { parseTable } from './table-parser.js';
import { parseMedia } from './media-parser.js';

/** Parse the Word comments story without introducing comment UI policy. */
export async function parseCommentsPart(pkg, mainPath, relationships, diagnostics) {
  const rel = (relationships || []).find(item => item.type?.endsWith('/comments'));
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
  for (const node of children(xml.documentElement, 'comment')) {
    const id = intAttr(node, 'id');
    if (id == null) continue;
    out[id] = {
      id,
      author: attr(node, 'author') || null,
      initials: attr(node, 'initials') || null,
      date: attr(node, 'date') || null,
      partPath,
      relationships: partRelationships,
      content: children(node).map(parseNode).filter(Boolean)
    };
  }
  if (Object.keys(out).length) {
    diagnostics?.info?.('comments-ui-deferred', 'Comments are preserved semantically; comment balloons/UI are not rendered.', { count: Object.keys(out).length });
  }
  return out;
}
