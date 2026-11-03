/**
 * Basic endnote support: append referenced normal endnotes to the document-end
 * flow. The note bodies are ordinary IR blocks and reuse the normal flow engine.
 */
export function createDocumentEndnoteNodes(endnotes = {}) {
  return Object.values(endnotes)
    .filter(note => (note.type === 'normal' || !note.type) && note.sequenceIndex != null)
    .sort((a, b) => Number(a.sequenceIndex) - Number(b.sequenceIndex))
    .flatMap(note => note.content || []);
}

export function collectEndnoteFallbackDiagnostics(documentIR) {
  const diagnostics = [];
  for (let index = 0; index < (documentIR.sections || []).length; index++) {
    const props = documentIR.sections[index]?.properties?.endnotes || {};
    if (props.position && props.position !== 'docEnd') diagnostics.push({
      level:'info',
      code:'endnote-position-fallback',
      message:`Endnote position ${props.position} is approximated using document-end placement.`,
      details:{sectionIndex:index,position:props.position}
    });
  }
  return diagnostics;
}
