import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutParagraph } from '../../src/layout/primitives/text-layout.js';
import { layoutTable } from '../../src/layout/primitives/table-layout.js';

const measurer = {
  measure(text, style = {}) {
    const size = style.fontSizePt || 9;
    return { widthPt: String(text).length * size * .4, ascentPt: size * .8, descentPt: size * .2, lineHeightPt: size * 1.1 };
  }
};
const p = (size, spacing) => ({
  type: 'paragraph', style: { runProperties: { size }, spacing },
  children: [{ type: 'run', style: { size }, children: [{ type: 'text', value: 'cell text' }] }]
});

test('text size, explicit line pitch and table cell margins are independent layout variables', () => {
  const exact10 = { line: 200, lineRule: 'exact' };
  const small = layoutParagraph(p(18, exact10), { widthPt: 300, measurer });
  const large = layoutParagraph(p(24, exact10), { widthPt: 300, measurer });
  assert.equal(small.lines[0].fragments[0].style.fontSizePt, 9);
  assert.equal(large.lines[0].fragments[0].style.fontSizePt, 12);
  assert.equal(small.lines[0].heightPt, 10);
  assert.equal(large.lines[0].heightPt, 10, 'exact line pitch must not follow larger font size');

  const tall = layoutParagraph(p(18, { line: 320, lineRule: 'exact' }), { widthPt: 300, measurer });
  assert.equal(tall.lines[0].heightPt, 16);

  const table = margins => layoutTable({
    type: 'table', grid: [1600], properties: { cellMargins: margins },
    rows: [{ type: 'row', properties: {}, cells: [{ type: 'cell', properties: {}, children: [p(18, exact10)] }] }]
  }, { widthPt: 120, measurer });
  const zero = table({});
  const padded = table({ top: { value: 100 }, bottom: { value: 100 } });
  assert.equal(padded.rows[0].heightPt - zero.rows[0].heightPt, 10,
    '100 twips padding at top and bottom = 10pt row increase without changing font or line pitch');
  assert.equal(padded.rows[0].cells[0].blocks[0].lines[0].heightPt, 10);
});
