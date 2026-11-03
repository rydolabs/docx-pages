import test from 'node:test';
import assert from 'node:assert/strict';
import { stackFootnoteStoryBlocks, splitFootnoteStoryForHeight } from '../../src/layout/composers/page-footnotes.js';

function paragraph(y, text) {
  return {
    type: 'paragraph', x: 10, y, widthPt: 100, heightPt: 14,
    contentXPt: 10, lines: [{ x: 10, y, heightPt: 14, text, fragments: [] }]
  };
}

test('continuing footnotes followed by newly encountered footnotes move lines with their blocks', () => {
  const [carry, fresh] = [paragraph(0, 'carried'), paragraph(0, 'new')];
  const blocks = stackFootnoteStoryBlocks([carry], [fresh]);
  assert.deepEqual(blocks.map(b => b.y), [0, 14]);
  assert.deepEqual(blocks.map(b => b.lines[0].y), [0, 14]);
  assert.equal(fresh.y, 0, 'source blocks must remain unchanged');
  const split = splitFootnoteStoryForHeight(blocks, 28);
  assert.deepEqual(split.placed.map(b => b.lines[0].y), [0, 14]);
});

test('continuation footnote stacking preserves nested row and cell coordinates', () => {
  const cellBlock = paragraph(2, 'inside table');
  const table = {
    type: 'table', x: 10, y: 0, widthPt: 100, heightPt: 14, cellSpacingPt: 0,
    rows: [{ x: 10, y: 0, heightPt: 14, cellSpacingPt: 0, cells: [{
      x: 10, y: 0, heightPt: 14, widthPt: 100, trackWidthPt: 100,
      blocks: [cellBlock]
    }] }]
  };
  const [preceding, moved] = stackFootnoteStoryBlocks([paragraph(0, 'carry')], [table]);
  assert.equal(moved.y, 14);
  assert.equal(moved.rows[0].y, 14);
  assert.equal(moved.rows[0].cells[0].y, 14);
  assert.equal(moved.rows[0].cells[0].blocks[0].lines[0].y, 16);
  assert.equal(preceding.lines[0].y, 0);
});
