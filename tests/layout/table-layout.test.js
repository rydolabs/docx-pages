import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTable, splitTableForHeight, repositionTable } from '../../src/layout/table-layout.js';
import { layoutDocument } from '../../src/layout/layout-engine.js';

const measurer = { measure: text => ({ widthPt: String(text).length * 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }) };

function paragraph(text) {
  return { type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] };
}

test('table layout uses grid widths and cell content height', () => {
  const table = {
    type: 'table',
    grid: [1000, 2000],
    properties: {},
    rows: [{
      type: 'row', properties: {}, cells: [
        { type: 'cell', properties: {}, children: [paragraph('AAAA')] },
        { type: 'cell', properties: {}, children: [paragraph('BBBBBBBB')] }
      ]
    }]
  };
  const result = layoutTable(table, { x: 10, y: 20, widthPt: 150, measurer });
  assert.equal(result.columnWidths.length, 2);
  assert.equal(result.columnWidths[0], 50);
  assert.equal(result.columnWidths[1], 100);
  assert.equal(result.rows[0].cells[0].widthPt, 50);
  assert.equal(result.rows[0].cells[1].widthPt, 100);
  assert.ok(result.rows[0].heightPt >= 10);
});



test('atLeast row height preserves cell vertical margins outside the requested minimum', () => {
  const table = {
    type: 'table',
    grid: [1000],
    properties: { cellMargins: { top: { value: 50 }, bottom: { value: 50 } } },
    rows: [{
      type: 'row', properties: { height: { value: 300, rule: 'atLeast' } }, cells: [
        { type: 'cell', properties: {}, children: [paragraph('row')] }
      ]
    }]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 100, measurer });
  assert.equal(block.rows[0].heightPt, 20);
});

test('table can split at row boundaries', () => {
  const table = {
    type: 'table', grid: [1000], properties: {}, rows: [
      { type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('one')] }] },
      { type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('two')] }] },
      { type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('three')] }] }
    ]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 100, measurer });
  const split = splitTableForHeight(block, 31);
  assert.ok(split);
  assert.equal(split.first.rows.length, 2);
  assert.equal(split.rest.rows.length, 1);
});

test('pagination moves table rows across columns instead of overflowing whole table', () => {
  const table = {
    type: 'table', grid: [1000], properties: {}, rows: Array.from({ length: 4 }, (_, i) => ({
      type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph(String(i))] }]
    }))
  };
  const ir = { sections: [{ children: [table] }], resources: {} };
  const layout = layoutDocument(ir, { page: { pageWidthPt: 120, pageHeightPt: 60, margins: { top: 10, right: 10, bottom: 10, left: 10 }, columnCount: 2, columnGapPt: 10 }, measurer });
  assert.ok(layout.pages[0].columns[0].blocks.length > 0);
  assert.ok(layout.pages[0].columns[1].blocks.length > 0);
  const rows = layout.pages.flatMap(p => p.columns).flatMap(c => c.blocks).filter(b => b.type === 'table').flatMap(b => b.rows);
  assert.equal(rows.length, 4);
});

test('table renderer receives cell borders and margins through layout data', () => {
  const table = {
    type:'table', grid:[1000], properties:{ borders:{ top:{value:'single',size:8,color:'FF0000'}, bottom:{value:'single',size:8,color:'FF0000'}, left:{value:'single',size:8,color:'FF0000'}, right:{value:'single',size:8,color:'FF0000'} }, cellMargins:{top:{value:100},left:{value:100},bottom:{value:100},right:{value:100}} },
    rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('cell')]}]}]
  };
  const block=layoutTable(table,{x:0,y:0,widthPt:100,measurer});
  assert.equal(block.rows[0].cells[0].margins.leftPt,5);
  assert.equal(block.properties.borders.top.size,8);
});

test('vertical merge extends restart cell across continuation rows', () => {
  const table = {
    type: 'table', grid: [1000, 1000], properties: {}, rows: [
      { type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [
        { type: 'cell', properties: { verticalMerge: 'restart' }, children: [paragraph('merged')] },
        { type: 'cell', properties: {}, children: [paragraph('r1')] }
      ] },
      { type: 'row', properties: { height: { value: 300, rule: 'exact' } }, cells: [
        { type: 'cell', properties: { verticalMerge: 'continue' }, children: [] },
        { type: 'cell', properties: {}, children: [paragraph('r2')] }
      ] }
    ]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 100, measurer });
  assert.equal(block.rows[0].cells[0].heightPt, 30);
  assert.equal(block.rows[1].cells[0].isMergeContinuation, true);
});

test('cell vertical center shifts content within the final cell height', () => {
  const table = {
    type: 'table', grid: [1000], properties: {}, rows: [{
      type: 'row', properties: { height: { value: 600, rule: 'exact' } }, cells: [
        { type: 'cell', properties: { verticalAlignment: 'center' }, children: [paragraph('center')] }
      ]
    }]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 100, measurer });
  const cell = block.rows[0].cells[0];
  assert.equal(cell.heightPt, 30);
  assert.ok(cell.blocks[0].y > cell.y);
});

test('table split does not cut through a vertical merge chain', () => {
  const table = {
    type:'table', grid:[1000], properties:{}, rows:[
      {type:'row',properties:{height:{value:300,rule:'exact'}},cells:[{type:'cell',properties:{verticalMerge:'restart'},children:[paragraph('merged')]}]},
      {type:'row',properties:{height:{value:300,rule:'exact'}},cells:[{type:'cell',properties:{verticalMerge:'continue'},children:[]}]},
      {type:'row',properties:{height:{value:300,rule:'exact'}},cells:[{type:'cell',properties:{},children:[paragraph('after')]}]}
    ]
  };
  const block=layoutTable(table,{x:0,y:0,widthPt:100,measurer});
  const split=splitTableForHeight(block,16);
  assert.equal(split,null);
  const splitAfterMerge=splitTableForHeight(block,31);
  assert.ok(splitAfterMerge);
  assert.equal(splitAfterMerge.first.rows.length,2);
});


test('legacy horizontal merge is normalized into one spanning layout cell', () => {
  const table = {
    type:'table', grid:[1000,1000,1000], properties:{}, rows:[{
      type:'row', properties:{}, cells:[
        {type:'cell',properties:{horizontalMerge:'restart'},children:[paragraph('merged')]},
        {type:'cell',properties:{horizontalMerge:'continue'},children:[]},
        {type:'cell',properties:{},children:[paragraph('tail')]}
      ]
    }]
  };
  const block=layoutTable(table,{x:0,y:0,widthPt:150,measurer});
  assert.equal(block.rows[0].cells.length,2);
  assert.equal(block.rows[0].cells[0].gridSpan,2);
  assert.equal(block.rows[0].cells[0].widthPt,100);
  assert.equal(block.rows[0].cells[1].x,100);
});

test('table alignment and indent determine table x without affecting available column geometry', () => {
  const centered={type:'table',properties:{alignment:'center',width:{type:'dxa',value:2000}},grid:[1000,1000],rows:[]};
  const center=layoutTable(centered,{x:50,y:0,widthPt:200,measurer});
  assert.equal(center.widthPt,100);
  assert.equal(center.x,100);

  const indented={type:'table',properties:{alignment:'left',indent:{type:'dxa',value:200}},grid:[1000],rows:[]};
  const left=layoutTable(indented,{x:50,y:0,widthPt:200,measurer});
  assert.equal(left.x,60);
});

test('auto-width table honors tblGrid natural width and centers inside the column', () => {
  const node={type:'table',properties:{alignment:'center',width:{type:'auto',value:0}},grid:[1000,1000],rows:[]};
  const block=layoutTable(node,{x:50,y:0,widthPt:120,measurer});
  assert.equal(block.widthPt,100);
  assert.equal(block.x,60);
});

test('table cell paragraphs receive default tab stops and field context from their layout caller', () => {
  const cellParagraph={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[
    {type:'text',value:'A'},
    {type:'tab'},
    {type:'field',instruction:'PAGE',children:[{type:'run',children:[{type:'text',value:'99'}]}]}
  ]}]};
  const table={type:'table',grid:[3000],properties:{},rows:[{type:'row',properties:{},cells:[{type:'cell',properties:{},children:[cellParagraph]}]}]};
  const block=layoutTable(table,{x:0,y:0,widthPt:150,measurer,defaultTabStop:800,fieldContext:{pageNumber:7}});
  const line=block.rows[0].cells[0].blocks[0].lines[0];
  assert.equal(line.text,'A\t7');
  const tab=line.fragments.find(fragment=>fragment.type==='tab');
  assert.equal(tab.widthPt,36);
});

test('nested table reuses the same table primitive inside a cell', () => {
  const nested={type:'table',grid:[600,600],properties:{width:{type:'auto',value:0}},rows:[{
    type:'row',properties:{},cells:[
      {type:'cell',properties:{},children:[paragraph('A')]},
      {type:'cell',properties:{},children:[paragraph('B')]}
    ]
  }]};
  const outer={type:'table',grid:[3000],properties:{},rows:[{
    type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('before'),nested,paragraph('after')]}]
  }]};
  const block=layoutTable(outer,{x:0,y:0,widthPt:150,measurer});
  const cell=block.rows[0].cells[0];
  assert.deepEqual(cell.blocks.map(child=>child.type),['paragraph','table','paragraph']);
  const nestedBlock=cell.blocks[1];
  assert.equal(nestedBlock.rows[0].cells.length,2);
  assert.ok(cell.blocks[2].y >= nestedBlock.y + nestedBlock.heightPt);
});

test('simple tall table row can split paragraph content across table fragments', () => {
  const tall={type:'table',grid:[2000],properties:{},rows:[{
    type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL')]}]
  }]};
  const block=layoutTable(tall,{x:0,y:0,widthPt:60,measurer});
  assert.ok(block.rows[0].heightPt > 10);
  const split=splitTableForHeight(block,20);
  assert.ok(split);
  assert.equal(split.first.rows.length,1);
  assert.equal(split.rest.rows.length,1);
  assert.equal(split.first.rows[0].rowFragment,'start');
  assert.equal(split.rest.rows[0].rowFragment,'end');
  const firstLines=split.first.rows[0].cells[0].blocks.flatMap(p=>p.lines).length;
  const restLines=split.rest.rows[0].cells[0].blocks.flatMap(p=>p.lines).length;
  assert.ok(firstLines>0);
  assert.ok(restLines>0);
});

test('cantSplit and complex merged rows stay row-boundary only', () => {
  const cant={type:'table',grid:[2000],properties:{},rows:[{
    type:'row',properties:{cantSplit:true},cells:[{type:'cell',properties:{},children:[paragraph('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL')]}]
  }]};
  const cantBlock=layoutTable(cant,{x:0,y:0,widthPt:60,measurer});
  assert.equal(splitTableForHeight(cantBlock,20),null);

  const merged={type:'table',grid:[2000],properties:{},rows:[{
    type:'row',properties:{},cells:[{type:'cell',properties:{verticalMerge:'restart'},children:[paragraph('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL')]}]
  }]};
  const mergedBlock=layoutTable(merged,{x:0,y:0,widthPt:60,measurer});
  assert.equal(splitTableForHeight(mergedBlock,20),null);
});

test('autofit noWrap cell promotes one-line preferred width to minimum constraint', () => {
  const node={type:'table',properties:{layout:'autofit'},grid:[],rows:[{type:'row',properties:{},cells:[
    {type:'cell',properties:{noWrap:true},children:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'LONGTOKEN'}]}]}]},
    {type:'cell',properties:{},children:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'x'}]}]}]}
  ]}]};
  const measurer={measure:t=>({widthPt:String(t).length*5,ascentPt:7,descentPt:2,lineHeightPt:9})};
  const block=layoutTable(node,{x:0,y:0,widthPt:100,measurer});
  assert.ok(block.columnWidths[0] >= 45, `expected noWrap first column near token width, got ${block.columnWidths[0]}`);
});

test('table cell spacing creates bounded gaps without changing overall table width', () => {
  const table = {
    type:'table', grid:[1000,1000], properties:{ cellSpacing:{type:'dxa',value:120} }, rows:[{
      type:'row',properties:{},cells:[
        {type:'cell',properties:{},children:[paragraph('A')]},
        {type:'cell',properties:{},children:[paragraph('B')]}
      ]
    },{
      type:'row',properties:{},cells:[
        {type:'cell',properties:{},children:[paragraph('C')]},
        {type:'cell',properties:{},children:[paragraph('D')]}
      ]
    }]
  };
  const block=layoutTable(table,{x:0,y:0,widthPt:100,measurer});
  assert.equal(block.cellSpacingPt,6);
  assert.equal(block.widthPt,100);
  const [a,b]=block.rows[0].cells;
  assert.equal(a.x,3);
  assert.equal(a.widthPt,44);
  assert.equal(b.x,53);
  assert.equal(b.widthPt,44);
  assert.equal(b.x-(a.x+a.widthPt),6);
  const c=block.rows[1].cells[0];
  assert.equal(c.y-(a.y+a.heightPt),6);
});


test('row gridBefore/gridAfter preserve omitted grid tracks during layout and reposition', () => {
  const table={type:'table',grid:[1000,1000,1000],properties:{width:{type:'dxa',value:3000},layout:'fixed'},rows:[{
    type:'row',properties:{gridBefore:1,gridAfter:1},cells:[{type:'cell',properties:{},children:[paragraph('middle')]}]
  }]};
  const block=layoutTable(table,{x:10,y:5,widthPt:150,measurer});
  const row=block.rows[0];
  const cell=row.cells[0];
  assert.equal(row.gridBefore,1);
  assert.equal(row.gridAfter,1);
  assert.equal(row.leadingTrackWidthPt,50);
  assert.equal(row.trailingTrackWidthPt,50);
  assert.equal(cell.gridStart,1);
  assert.equal(cell.x,60);
  repositionTable(block,{x:20,y:30,widthPt:block.widthPt});
  assert.equal(block.rows[0].cells[0].x,70);
});

test('vertical-merge master content contributes to the merged span instead of inflating the first physical row', () => {
  const many={type:'paragraph',style:{runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:'merged'}]}]};
  const table={type:'table',grid:[1000,1000],properties:{},rows:[
    {type:'row',properties:{},cells:[
      {type:'cell',properties:{verticalMerge:'restart'},children:[many,many,many,many]},
      {type:'cell',properties:{},children:[paragraph('r1')]}
    ]},
    {type:'row',properties:{},cells:[
      {type:'cell',properties:{verticalMerge:'continue'},children:[paragraph('')]},
      {type:'cell',properties:{},children:[paragraph('r2')]}
    ]},
    {type:'row',properties:{},cells:[
      {type:'cell',properties:{verticalMerge:'continue'},children:[paragraph('')]},
      {type:'cell',properties:{},children:[paragraph('r3')]}
    ]}
  ]};
  const block=layoutTable(table,{x:0,y:0,widthPt:100,measurer});
  assert.ok(block.rows[0].heightPt < 30, `first row should stay physical-row sized, got ${block.rows[0].heightPt}`);
  assert.ok(block.rows[0].cells[0].heightPt >= block.rows.reduce((sum,row)=>sum+row.heightPt,0)-0.001);
});

test('outer table row can split around and through a nested table', () => {
  const nested={type:'table',grid:[1000],properties:{},rows:Array.from({length:4},(_,i)=>(
    {type:'row',properties:{height:{value:300,rule:'exact'}},cells:[{type:'cell',properties:{},children:[paragraph(`nested ${i+1}`)]}]}
  ))};
  const outer={type:'table',grid:[3000],properties:{},rows:[{
    type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('before nested'),nested,paragraph('after nested')]}]
  }]};
  const block=layoutTable(outer,{x:0,y:0,widthPt:150,measurer});
  const firstSplit=splitTableForHeight(block,20);
  assert.ok(firstSplit,'expected the outer row to split before the nested table');
  assert.equal(firstSplit.first.rows.length,1);
  assert.deepEqual(firstSplit.first.rows[0].cells[0].blocks.map(b=>b.type),['paragraph']);
  assert.equal(firstSplit.rest.rows[0].cells[0].blocks[0].type,'table');

  const restOuter=firstSplit.rest;
  const secondSplit=splitTableForHeight(restOuter,31);
  assert.ok(secondSplit,'expected the nested table itself to split across outer-row fragments');
  const nestedFirst=secondSplit.first.rows[0].cells[0].blocks.find(b=>b.type==='table');
  const nestedRest=secondSplit.rest.rows[0].cells[0].blocks.find(b=>b.type==='table');
  assert.ok(nestedFirst);
  assert.ok(nestedRest);
  assert.ok(nestedFirst.rows.length > 0 && nestedFirst.rows.length < 4);
  assert.equal(nestedFirst.rows.length + nestedRest.rows.length,4);
});

test('repeated table heading is not emitted as a header-only page fragment', () => {
  const rows = [
    { type: 'row', properties: { repeatHeader: true, height: { value: 200, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('HEADER')] }] },
    { type: 'row', properties: { cantSplit: true, height: { value: 600, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('DATA')] }] },
    { type: 'row', properties: { height: { value: 200, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('LAST')] }] }
  ];
  const block = layoutTable({ type: 'table', grid: [1000], properties: {}, rows }, { x: 0, y: 0, widthPt: 100, measurer });
  assert.equal(splitTableForHeight(block, 15), null, 'header and data must advance together');
  const split = splitTableForHeight(block, 45);
  assert.ok(split);
  assert.equal(split.first.rows.length, 2);
  assert.equal(split.rest.rows.length, 2, 'next fragment must repeat heading and include remaining data');
  assert.equal(split.rest.rows[0].repeatHeader, true);
});

test('tblHeader on a row after normal data does not turn it into a repeating heading', () => {
  const rows = [
    { type: 'row', properties: { height: { value: 200, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('A')] }] },
    { type: 'row', properties: { repeatHeader: true, height: { value: 200, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('B')] }] },
    { type: 'row', properties: { height: { value: 200, rule: 'exact' } }, cells: [{ type: 'cell', properties: {}, children: [paragraph('C')] }] }
  ];
  const block = layoutTable({ type: 'table', grid: [1000], properties: {}, rows }, { x: 0, y: 0, widthPt: 100, measurer });
  const split = splitTableForHeight(block, 21);
  assert.ok(split);
  assert.deepEqual(split.rest.rows.map(row => row.cells[0].blocks[0].lines[0].text), ['C']);
});


test('implicit table cell side margins follow OOXML 115-twip defaults', () => {
  const table = {
    type: 'table', grid: [2000], properties: { layout: 'fixed' }, rows: [{
      type: 'row', properties: {}, cells: [{type: 'cell', properties: {}, children: [paragraph('text')]}]
    }]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 100, measurer });
  const cell = block.rows[0].cells[0];
  assert.equal(cell.margins.leftPt, 5.75);
  assert.equal(cell.margins.rightPt, 5.75);
  assert.equal(cell.margins.topPt, 0);
  assert.equal(cell.margins.bottomPt, 0);
  assert.equal(cell.blocks[0].x, cell.x + 5.75);
  assert.equal(cell.blocks[0].widthPt, 88.5);
});

test('explicit zero and start/end cell margins override the implicit defaults', () => {
  const table = {
    type: 'table', grid: [2000], properties: {
      layout: 'fixed', cellMargins: { left: { value: 0 }, right: { value: 0 } }
    }, rows: [{ type: 'row', properties: {}, cells: [
      { type: 'cell', properties: {}, children: [paragraph('zero')] },
      { type: 'cell', properties: { margins: { start: { value: 200 }, end: { value: 300 } } }, children: [paragraph('explicit')] }
    ] }]
  };
  const block = layoutTable(table, { x: 0, y: 0, widthPt: 200, measurer });
  assert.equal(block.rows[0].cells[0].margins.leftPt, 0);
  assert.equal(block.rows[0].cells[0].margins.rightPt, 0);
  assert.equal(block.rows[0].cells[1].margins.leftPt, 10);
  assert.equal(block.rows[0].cells[1].margins.rightPt, 15);
});


test('table row can split when text lines fit but trailing paragraph spacing overflows', () => {
  const makeCell = (lines, afterPt, explicitWidow = null) => {
    const paragraph = {
      type: 'paragraph', x: 0, y: 0, widthPt: 90, heightPt: lines * 17.5 + afterPt,
      spacingBeforePt: 0, spacingAfterPt: afterPt, widowControl: true, keepLines: false,
      style: explicitWidow == null ? {} : { widowControl: explicitWidow },
      lines: Array.from({ length: lines }, (_, i) => ({ x: 0, y: i * 17.5,
        heightPt: 17.5, fragments: [{ text: `line-${i}` }] }))
    };
    return { type: 'cell', x: 0, y: 0, widthPt: 90, heightPt: paragraph.heightPt,
      margins: { topPt: 0, bottomPt: 0, leftPt: 0, rightPt: 0 },
      contentHeightPt: paragraph.heightPt, blocks: [paragraph], properties: {} };
  };
  const makeTable = explicitWidow => {
    const cells = [makeCell(1, 10), makeCell(4, 10, explicitWidow)];
    return { type: 'table', x: 0, y: 0, widthPt: 180,
      heightPt: 80, rows: [{ type: 'row', x: 0, y: 0, heightPt: 80,
        widthPt: 180, properties: {}, cells }] };
  };
  // Four 17.5pt lines (70pt) fit inside 70.5pt, but 10pt spacing does not.
  const split = splitTableForHeight(makeTable(null), 70.5);
  assert.ok(split, 'a splittable row should not move wholesale for trailing space');
  const first = split.first.rows[0].cells[1].blocks[0];
  const rest = split.rest.rows[0].cells[1].blocks[0];
  assert.equal(first.lines.length, 3);
  assert.equal(rest.lines.length, 1);
  assert.equal(first.spacingAfterPt, 0);
  assert.equal(rest.spacingAfterPt, 10);

  // Explicit widow control is preserved, unlike the implicit table default.
  const explicit = splitTableForHeight(makeTable(true), 70.5);
  assert.ok(explicit);
  assert.equal(explicit.first.rows[0].cells[1].blocks[0].lines.length, 2);
  assert.equal(explicit.rest.rows[0].cells[1].blocks[0].lines.length, 2);
});

test('oversized nested cantSplit row fragments rather than losing its text past the page bottom', () => {
  const hugeText = 'nested large row '.repeat(55);
  const nested = {type:'table',grid:[1200],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{cantSplit:true},cells:[{type:'cell',properties:{},children:[paragraph(hugeText)]}]},
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('following row')]}]}
  ]};
  const outer = {type:'table',grid:[2400],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[nested]}]}
  ]};
  const block=layoutTable(outer,{x:0,y:0,widthPt:120,measurer});
  assert.ok(block.rows[0].heightPt > 50);
  assert.equal(splitTableForHeight(block,50),null,'without exception nested cantSplit remains atomic');
  const split=splitTableForHeight(block,50,{
    allowOversizedCantSplit:true,allowOversizedKeepLines:true,fullRegionHeightPt:50
  });
  assert.ok(split,'a nested row taller than the whole page must be fragmentable');
  const originalNested = block.rows[0].cells[0].blocks[0];
  const firstNested = split.first.rows[0].cells[0].blocks[0];
  const restNested = split.rest.rows[0].cells[0].blocks[0];
  assert.equal(firstNested.type,'table');
  assert.equal(restNested.type,'table');
  assert.ok(firstNested.rows[0].heightPt <= 50.001);
  assert.equal(firstNested.rows[0].rowFragment,'start');
  assert.equal(restNested.rows[0].rowFragment,'end');
  const joined=splitRow=>splitRow.rows.flatMap(row=>row.cells).flatMap(cell=>cell.blocks).flatMap(b=>b.lines||[]).map(line=>line.text||'').join('').replace(/\s/g,'');
  assert.equal(joined(firstNested)+joined(restNested),joined(originalNested));
});

test('oversized nested keepLines paragraph can fragment when the full-page exception applies', () => {
  const lockedText = { ...paragraph('locked '.repeat(115)), style: {
    ...paragraph('x').style, keepLines: true
  }};
  const nested = {type:'table',grid:[1200],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[lockedText]}]}
  ]};
  const outer={type:'table',grid:[2400],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[nested]}]}
  ]};
  const block=layoutTable(outer,{x:0,y:0,widthPt:120,measurer});
  assert.ok(block.heightPt>50);
  const split=splitTableForHeight(block,50,{
    allowOversizedCantSplit:true,allowOversizedKeepLines:true,fullRegionHeightPt:50
  });
  assert.ok(split,'keepLines cannot make oversized nested content unrenderable');
  assert.ok(split.first.heightPt<=50.001);
});

test('nested cantSplit row that fits a whole page still moves intact', () => {
  const nested={type:'table',grid:[1200],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{cantSplit:true},cells:[{type:'cell',properties:{},children:[paragraph('small row')]}]},
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('second row')]}]}
  ]};
  const outer={type:'table',grid:[2400],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[nested]}]}
  ]};
  const block=layoutTable(outer,{x:0,y:0,widthPt:120,measurer});
  const split=splitTableForHeight(block,7,{
    allowOversizedCantSplit:true,allowOversizedKeepLines:true,fullRegionHeightPt:50
  });
  assert.equal(split,null,'locked nested row cannot be cut merely to fill a short remainder');
});

test('full paginator preserves a deeply nested oversized cantSplit row on bounded pages', () => {
  const story='1234567890 '.repeat(40);
  const nested={type:'table',grid:[1200],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{cantSplit:true},cells:[{type:'cell',properties:{},children:[paragraph(story)]}]},
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[paragraph('last')]}]}
  ]};
  const outer={type:'table',grid:[2400],properties:{layout:'fixed'},rows:[
    {type:'row',properties:{},cells:[{type:'cell',properties:{},children:[nested]}]}
  ]};
  const layout=layoutDocument({sections:[{children:[outer]}],resources:{}},{
    page:{pageWidthPt:180,pageHeightPt:90,margins:{top:10,right:10,bottom:10,left:10}},measurer
  });
  assert.ok(layout.pages.length>=3);
  const lines=[];
  for(const page of layout.pages)for(const col of page.columns)for(const b of col.blocks||[]) {
    assert.ok(b.y+b.heightPt<=col.y+col.heightPt+0.01,`a nested table spilled below page ${page.index??'?'}: ${b.y+b.heightPt}`);
    const visit=b=>{
      if(b.type==='paragraph')lines.push(...(b.lines||[]).map(l=>l.text||''));
      if(b.type==='table')for(const row of b.rows||[])for(const cell of row.cells||[])for(const child of cell.blocks||[])visit(child);
    };
    visit(b);
  }
  const normalized=value=>value.replace(/\s/g,'');
  assert.equal(normalized(lines.join('')), normalized(story+'last'));
});
