import { applyNoteLabels } from './note-sequencer.js';

export function applyEndnoteLabels(document) {
  return applyNoteLabels(document, {
    storyKey:'endnotes',
    propertyKey:'endnotes',
    referenceType:'endnote-reference',
    bodyReferenceType:'endnote-ref'
  });
}
