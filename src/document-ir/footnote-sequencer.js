import { applyNoteLabels } from './note-sequencer.js';

export function applyFootnoteLabels(document) {
  return applyNoteLabels(document, {
    storyKey:'footnotes',
    propertyKey:'footnotes',
    referenceType:'footnote-reference',
    bodyReferenceType:'footnote-ref'
  });
}
