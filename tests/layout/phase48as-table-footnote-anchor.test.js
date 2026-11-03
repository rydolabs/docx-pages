import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTable, splitTableForHeight } from '../../src/layout/primitives/table-layout.js';
import { collectPageFootnoteIds } from '../../src/layout/composers/page-footnotes.js';

const measurer = {
  measure: text => ({ widthPt: String(text).length * 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 })
};

function noteTable(noteAtStart) {
  const words = { type: 'text', value: ' AAAAA BBBBB CCCCC DDDDD EEEEE FFFFF GGGGG HHHHH IIIII' };
  const note = { type: 'footnote-reference', id: 8 };
  const parts = noteAtStart ? [note, words] : [words, note];
  const para = {
    type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: parts }]
  };
  return layoutTable({
    type: 'table', grid: [900], properties: { layout: 'fixed' },
    rows: [{ type: 'row', properties: {}, cells: [{ type: 'cell', properties: {}, children: [para] }] }]
  }, { x: 0, y: 0, widthPt: 45, measurer });
}
const page = table => ({ regions: [{ columns: [{ blocks: [table] }] }] });

test('footnote in first fragment of split table row stays with its anchor', () => {
  const original = noteTable(true);
  const split = splitTableForHeight(original, 25);
  assert.ok(split, 'long row must split');
  assert.deepEqual(collectPageFootnoteIds(page(split.first)), [8]);
  assert.deepEqual(collectPageFootnoteIds(page(split.rest)), []);
  assert.deepEqual(collectPageFootnoteIds(page(original)), [8], 'original must remain unmodified');
});

test('footnote in trailing table-row fragment is not collected on preceding page', () => {
  const split = splitTableForHeight(noteTable(false), 25);
  assert.ok(split);
  assert.deepEqual(collectPageFootnoteIds(page(split.first)), []);
  assert.deepEqual(collectPageFootnoteIds(page(split.rest)), [8]);
});
