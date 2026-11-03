import test from 'node:test';
import assert from 'node:assert/strict';
import { composeBlockFactories } from '../../src/layout/composers/flow-composer.js';

// The actual KIMST source contains two separate empty paragraphs between
// references [1] and [2]. Their 14pt heights count toward the column budget.
// This fixture isolates normal flow; the column balancer is never invoked.
function composeBoundary(referenceHeightPt) {
  const columns = [0, 1].map(index => ({
    x: index * 100, y: 0, widthPt: 90, heightPt: 50, blocks: []
  }));
  let activeColumnIndex = 0;
  let y = 0;
  const flow = {
    current: () => ({ column: columns[activeColumnIndex], y }),
    setY: nextY => { y = nextY; },
    exclusions: () => [],
    markContent: () => {},
    hasPriorContent: () => y > 0,
    advanceColumn: () => {
      activeColumnIndex++;
      assert.ok(activeColumnIndex < columns.length, 'Expected 2 columns to be sufficient');
      y = columns[activeColumnIndex].y;
      return columns[activeColumnIndex];
    },
    advancePage: () => { throw new Error('Unexpected page advance'); }
  };
  const paragraph = (sourceIndex, text, heightPt) => {
    const factory = ({ x, y, widthPt }) => ({
      type: 'paragraph', sourceIndex, x, y, contentXPt: x, widthPt,
      heightPt, spacingBeforePt: 0, spacingAfterPt: 0,
      keepLines: true, keepNext: false,
      lines: [{ x, y, text, heightPt }]
    });
    factory.kind = 'paragraph';
    return factory;
  };
  composeBlockFactories([
    paragraph(53, '[1]', referenceHeightPt),
    paragraph(54, '', 14),
    paragraph(55, '', 14),
    paragraph(56, '[2]', 14)
  ], flow);
  return columns;
}

test('empty KIMST source paragraphs move naturally across columns when the preceding paragraph grows', () => {
  const short = composeBoundary(20);
  assert.deepEqual(short[0].blocks.map(b => b.sourceIndex), [53, 54, 55]);
  assert.deepEqual(short[1].blocks.map(b => b.sourceIndex), [56]);

  const tall = composeBoundary(34);
  assert.deepEqual(tall[0].blocks.map(b => b.sourceIndex), [53, 54]);
  assert.deepEqual(tall[1].blocks.map(b => b.sourceIndex), [55, 56]);
  assert.equal(tall[1].blocks[0].heightPt, 14);
  assert.equal(tall[1].blocks[0].lines[0].text, '');
  assert.deepEqual(tall.flatMap(c => c.blocks).map(b => b.sourceIndex), [53, 54, 55, 56]);
});
