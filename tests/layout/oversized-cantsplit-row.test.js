import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDocument } from '../../src/layout/layout-engine.js';

const measure = { measure: text => ({ widthPt: String(text).length * 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }) };

const paragraph = text => ({
  type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
  children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
});

function layoutTallTable({ cantSplit }) {
  const text = Array.from({ length: 85 }, (_, i) => `T${i}`).join(' ');
  const table = { type: 'table', grid: [2000], properties: {}, rows: [{
    type: 'row', properties: { cantSplit },
    cells: [{ type: 'cell', properties: {}, children: [paragraph(text)] }]
  }] };
  const layout = layoutDocument({ sections: [{ children: [table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  return { layout, text };
}

test('an unavoidably oversized cantSplit row is fragmented rather than clipped on its only page', () => {
  const { layout, text } = layoutTallTable({ cantSplit: true });
  assert.ok(layout.pages.length > 1, 'oversized content must paginate');
  const blocks = layout.pages.flatMap(page => page.regions.flatMap(region => region.columns.flatMap(col => col.blocks)));
  const tables = blocks.filter(block => block.type === 'table');
  assert.ok(tables.length > 1);
  for (const page of layout.pages) {
    for (const region of page.regions) for (const column of region.columns) {
      for (const block of column.blocks) {
        assert.ok(block.y + block.heightPt <= column.y + column.heightPt + 0.01,
          `table overflows column by ${block.y + block.heightPt - (column.y + column.heightPt)}pt`);
      }
    }
  }
  const actualText = tables.flatMap(table => table.rows.flatMap(row => row.cells.flatMap(cell => cell.blocks.flatMap(b => (b.lines || []).map(line => line.text))))).join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(actualText, text);
});

test('cantSplit row that fits a fresh page still moves intact when current page is short', () => {
  const p = paragraph('INTRO '.repeat(18));
  const rowText = 'row content '.repeat(10);
  const table = { type: 'table', grid: [2000], properties: {}, rows: [{
    type: 'row', properties: { cantSplit: true },
    cells: [{ type: 'cell', properties: {}, children: [paragraph(rowText)] }]
  }] };
  const layout = layoutDocument({ sections: [{ children: [p, table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  const allTables = layout.pages.flatMap(pg => pg.regions.flatMap(reg => reg.columns.flatMap(col => col.blocks.filter(b => b.type === 'table'))));
  assert.equal(allTables.length, 1, 'fittable cantSplit row must not fragment');
  assert.equal(allTables[0].rows[0].rowFragment, undefined);
});

test('oversized cantSplit row advances past preceding content before forcing a fragment', () => {
  const p = paragraph('INTRO '.repeat(12));
  const large = paragraph('AAAA BBBB CCCC '.repeat(35));
  const table = { type: 'table', grid: [2000], properties: {}, rows: [{
    type: 'row', properties: { cantSplit: true },
    cells: [{ type: 'cell', properties: {}, children: [large] }]
  }] };
  const layout = layoutDocument({ sections: [{ children: [p, table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  const firstPage = layout.pages[0].regions[0].columns[0].blocks;
  assert.ok(firstPage.some(b => b.type === 'paragraph'));
  assert.ok(!firstPage.some(b => b.type === 'table'), 'cantSplit stays off the partly occupied page');
  const laterTables = layout.pages.slice(1).flatMap(pg => pg.regions.flatMap(reg => reg.columns.flatMap(col => col.blocks.filter(b => b.type === 'table'))));
  assert.ok(laterTables.length >= 2);
  const content = laterTables.flatMap(tbl => tbl.rows.flatMap(row => row.cells.flatMap(cell => cell.blocks.flatMap(b => b.lines || [])))).map(l => l.text).join(' ').replace(/\s+/g,' ').trim();
  assert.equal(content, 'AAAA BBBB CCCC '.repeat(35).trim());
});

test('oversized cantSplit data row still keeps a repeating header paired with content', () => {
  const header = { type: 'row', properties: { repeatHeader: true },
    cells: [{ type: 'cell', properties: {}, children: [paragraph('HEADER')] }] };
  const data = { type: 'row', properties: { cantSplit: true },
    cells: [{ type: 'cell', properties: {}, children: [paragraph('some tall content '.repeat(35))] }] };
  const table = { type: 'table', grid: [2000], properties: {}, rows: [header, data] };
  const layout = layoutDocument({ sections: [{ children: [table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  assert.ok(layout.pages.length > 1);
  for (const page of layout.pages) {
    const tableBlocks = page.regions.flatMap(reg => reg.columns.flatMap(col => col.blocks.filter(b => b.type === 'table')));
    assert.ok(tableBlocks.some(t => t.rows.some(r => r.cells.some(c => c.blocks.some(b => b.lines?.some(l => l.text.includes('content')))))), 'header cannot occupy a page by itself');
    for (const t of tableBlocks) for (const reg of page.regions) for (const col of reg.columns) {
      if (!col.blocks.includes(t)) continue;
      assert.ok(t.y + t.heightPt <= col.y + col.heightPt + 0.01, 'table fragment cannot overflow its physical page');
    }
  }
});

test('oversized cantSplit row containing a keepLines paragraph is still not clipped', () => {
  const child = paragraph('very long nested keep line '.repeat(38));
  child.style.keepLines = true;
  const table = { type: 'table', grid: [2000], properties: {}, rows: [{
    type: 'row', properties: { cantSplit: true },
    cells: [{ type: 'cell', properties: {}, children: [child] }]
  }] };
  const layout = layoutDocument({ sections: [{ children: [table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  assert.ok(layout.pages.length > 1);
  const placed = layout.pages.flatMap(p => p.regions.flatMap(reg => reg.columns.flatMap(col => col.blocks.map(b => ({col,b})))));
  assert.ok(placed.every(({col,b}) => b.y+b.heightPt <= col.y+col.heightPt+0.01));
});

test('an oversized ordinary table row containing keepLines content fragments when unavoidable', () => {
  const child = paragraph('oversized ordinary row paragraph '.repeat(38));
  child.style.keepLines = true;
  const table = { type: 'table', grid: [2000], properties: {}, rows: [{
    type: 'row', properties: {}, cells: [{ type: 'cell', properties: {}, children: [child] }]
  }] };
  const layout = layoutDocument({ sections: [{ children: [table] }], resources: {} }, {
    page: { pageWidthPt: 140, pageHeightPt: 100, margins: { left: 10, right: 10, top: 10, bottom: 10 } },
    measurer: measure
  });
  assert.ok(layout.pages.length > 1);
  assert.ok(layout.pages.every(p => p.regions.every(reg => reg.columns.every(col => col.blocks.every(b => b.y + b.heightPt <= col.y + col.heightPt + 0.01)))));
});
