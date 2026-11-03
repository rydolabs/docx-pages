import { formatNumber } from '../common/number-format.js';

/** Shared semantic labeler for footnote/endnote stories. */
export function applyNoteLabels(document, {
  storyKey,
  propertyKey,
  referenceType,
  bodyReferenceType
}) {
  const labels = new Map();
  let current = 1;
  let initialized = false;
  let sequenceIndex = 0;

  const sections = (document.sections || []).map(section => {
    const props = section.properties?.[propertyKey] || {};
    if (!initialized || props.restart === 'eachSect') {
      current = Number(props.start ?? 1) || 1;
      initialized = true;
    }
    const format = props.format === 'bullet' ? 'decimal' : (props.format || 'decimal');
    const mapReferenceNode = node => {
      if (!node) return node;
      if (node.type === referenceType) {
        if (node.id == null) return node;
        if (!labels.has(node.id)) labels.set(node.id, { label: formatNumber(current++, format), sequenceIndex: sequenceIndex++ });
        const entry = labels.get(node.id);
        return { ...node, displayLabel: entry.label, sequenceIndex: entry.sequenceIndex };
      }
      if (node.type === 'table') {
        return {
          ...node,
          rows: (node.rows || []).map(row => ({
            ...row,
            cells: (row.cells || []).map(cell => ({ ...cell, children: (cell.children || []).map(mapReferenceNode) }))
          }))
        };
      }
      if (node.children) return { ...node, children: node.children.map(mapReferenceNode) };
      return node;
    };
    return { ...section, children: (section.children || []).map(mapReferenceNode) };
  });

  const story = Object.fromEntries(Object.entries(document[storyKey] || {}).map(([id, note]) => {
    const entry = labels.get(Number(id)) || labels.get(id) || null;
    const mapBodyNode = node => {
      if (!node) return node;
      if (node.type === bodyReferenceType) return {
        ...node,
        noteId: Number(id),
        displayLabel: entry?.label || null,
        sequenceIndex: entry?.sequenceIndex ?? null
      };
      if (node.type === 'table') {
        return {
          ...node,
          rows: (node.rows || []).map(row => ({
            ...row,
            cells: (row.cells || []).map(cell => ({ ...cell, children: (cell.children || []).map(mapBodyNode) }))
          }))
        };
      }
      if (node.children) return { ...node, children: node.children.map(mapBodyNode) };
      return node;
    };
    return [id, {
      ...note,
      displayLabel: entry?.label || null,
      sequenceIndex: entry?.sequenceIndex ?? null,
      content: (note.content || []).map(mapBodyNode)
    }];
  }));

  return { ...document, sections, [storyKey]: story };
}
