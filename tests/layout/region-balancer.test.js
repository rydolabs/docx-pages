import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceRegionColumns } from '../../src/layout/region-balancer.js';

test('region balancer redistributes simple blocks without knowing section policy', () => {
  const region = {
    y: 10,
    columns: [
      { x: 10, y: 10, widthPt: 80, heightPt: 100, blocks: [
        { type: 'custom', x: 10, y: 10, widthPt: 80, heightPt: 20 },
        { type: 'custom', x: 10, y: 30, widthPt: 80, heightPt: 20 },
        { type: 'custom', x: 10, y: 50, widthPt: 80, heightPt: 20 }
      ] },
      { x: 100, y: 10, widthPt: 80, heightPt: 100, blocks: [] }
    ]
  };

  balanceRegionColumns(region);
  assert.equal(region.balanced, true);
  assert.equal(region.columns[0].blocks.length, 2);
  assert.equal(region.columns[1].blocks.length, 1);
  assert.equal(region.balancedHeightPt, 40);
  assert.equal(region.columns[1].blocks[0].x, 100);
  assert.equal(region.columns[1].blocks[0].y, 10);
});

import { layoutParagraph } from '../../src/layout/text-layout.js';

const fixedMeasurer = { measure: text => ({ widthPt: String(text).length * 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }) };

test('region balancer can split a paragraph across balanced columns without losing text', () => {
  const node = {
    type: 'paragraph',
    style: { wordWrap:false, widowControl: false, runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [{ type: 'text', value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }] }]
  };
  const paragraph = layoutParagraph(node, { x: 10, y: 10, widthPt: 40, measurer: fixedMeasurer });
  const region = {
    y: 10,
    columns: [
      { x: 10, y: 10, widthPt: 40, heightPt: 100, blocks: [paragraph] },
      { x: 60, y: 10, widthPt: 40, heightPt: 100, blocks: [] }
    ]
  };

  balanceRegionColumns(region);
  assert.ok(region.columns[0].blocks.length > 0);
  assert.ok(region.columns[1].blocks.length > 0);
  const text = region.columns.flatMap(column => column.blocks)
    .flatMap(block => block.lines || []).map(line => line.text).join('');
  assert.equal(text, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

test('region balancer preserves a block relative x offset when moving it to another column', () => {
  const region = {
    y: 0,
    columns: [
      { x: 10, y: 0, widthPt: 80, heightPt: 100, blocks: [
        { type: 'custom', x: 25, y: 0, widthPt: 40, heightPt: 20 },
        { type: 'custom', x: 25, y: 20, widthPt: 40, heightPt: 20 },
        { type: 'custom', x: 25, y: 40, widthPt: 40, heightPt: 20 }
      ] },
      { x: 100, y: 0, widthPt: 80, heightPt: 100, blocks: [] }
    ]
  };
  balanceRegionColumns(region);
  assert.equal(region.columns[1].blocks[0].x, 115);
});

test('region balancer keeps a short keepNext chain together when it fits one balanced column', () => {
  const make = (text, keepNext = false) => layoutParagraph({
    type: 'paragraph',
    style: { keepNext, widowControl: false, runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  }, { x: 10, y: 0, widthPt: 80, measurer: fixedMeasurer });
  const blocks = [make('A'), make('B', true), make('C')];
  let y = 0;
  for (const block of blocks) { block.y = y; for (const line of block.lines) line.y += y; y += block.heightPt; }
  const region = {
    y: 0,
    columns: [
      { x: 10, y: 0, widthPt: 80, heightPt: 100, blocks },
      { x: 100, y: 0, widthPt: 80, heightPt: 100, blocks: [] }
    ]
  };
  balanceRegionColumns(region);
  const secondTexts = region.columns[1].blocks.flatMap(block => block.lines || []).map(line => line.text).join('');
  assert.equal(secondTexts, 'BC');
});

test('region balancer prefers an intact paragraph at a column boundary when it fits the next column', () => {
  const make = text => layoutParagraph({
    type: 'paragraph',
    style: { wordWrap:false, widowControl: false, runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  }, { x: 10, y: 0, widthPt: 40, measurer: fixedMeasurer });
  const first = make('AAAAABBBBB'); // one line (12.5pt exact line height)
  const second = make('CCCCCDDDDDEEEEEFFFFF'); // two lines; fits a fresh column
  let y = 0;
  for (const block of [first, second]) {
    const dy = y - block.y;
    block.y = y;
    for (const line of block.lines || []) line.y += dy;
    y += block.heightPt;
  }
  const region = {
    y: 0,
    columns: [
      { x: 10, y: 0, widthPt: 40, heightPt: 100, blocks: [first, second] },
      { x: 60, y: 0, widthPt: 40, heightPt: 100, blocks: [] }
    ]
  };

  balanceRegionColumns(region);
  const firstColumnText = region.columns[0].blocks.flatMap(block => block.lines || []).map(line => line.text).join('');
  const secondColumnText = region.columns[1].blocks.flatMap(block => block.lines || []).map(line => line.text).join('');
  assert.equal(firstColumnText, 'AAAAABBBBB');
  assert.equal(secondColumnText, 'CCCCCDDDDDEEEEEFFFFF');
  assert.equal(region.columns[1].blocks.length, 1);
  assert.equal(region.columns[1].blocks[0].fragment, undefined);
});
