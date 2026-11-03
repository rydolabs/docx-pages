import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTableGeometry } from '../../src/layout/primitives/table-width-resolver.js';

test('table width resolver preserves tblGrid geometry for ordinary auto tables', () => {
  const node={type:'table',properties:{width:{type:'auto',value:0}},grid:[1000,2000],rows:[]};
  const result=resolveTableGeometry(node,200);
  assert.equal(result.tableWidthPt,150);
  assert.deepEqual(result.columnWidths,[50,100]);
  assert.equal(result.layoutMode,'autofit');
});

test('cell preferred width can expand a grid constraint before the table is fit to available width', () => {
  const node={type:'table',properties:{width:{type:'auto',value:0}},grid:[1000,1000],rows:[{
    cells:[
      {properties:{width:{type:'dxa',value:1600}},children:[]},
      {properties:{width:{type:'dxa',value:1000}},children:[]}
    ]
  }]};
  const result=resolveTableGeometry(node,200);
  assert.equal(result.tableWidthPt,130);
  assert.equal(Math.round(result.columnWidths[0]),80);
  assert.equal(Math.round(result.columnWidths[1]),50);
});

test('grid-span preferred cell width expands its covered columns proportionally', () => {
  const node={type:'table',properties:{},grid:[1000,2000,1000],rows:[{
    cells:[
      {properties:{gridSpan:2,width:{type:'dxa',value:4000}},children:[]},
      {properties:{},children:[]}
    ]
  }]};
  const result=resolveTableGeometry(node,300);
  assert.equal(Math.round(result.tableWidthPt),250);
  assert.equal(Math.round(result.columnWidths[0]+result.columnWidths[1]),200);
  assert.equal(Math.round(result.columnWidths[2]),50);
});

test('grid-less table uses cell preferred widths instead of equal columns', () => {
  const node={type:'table',properties:{layout:'fixed'},grid:[],rows:[{
    cells:[
      {properties:{width:{type:'dxa',value:1000}},children:[]},
      {properties:{width:{type:'dxa',value:3000}},children:[]}
    ]
  }]};
  const result=resolveTableGeometry(node,200);
  assert.equal(result.tableWidthPt,200);
  assert.deepEqual(result.columnWidths,[50,150]);
  assert.equal(result.layoutMode,'fixed');
});

test('percentage table and cell widths are resolved against the available table base', () => {
  const node={type:'table',properties:{width:{type:'pct',value:2500}},grid:[],rows:[{
    cells:[
      {properties:{width:{type:'pct',value:3000}},children:[]},
      {properties:{width:{type:'pct',value:2000}},children:[]}
    ]
  }]};
  const result=resolveTableGeometry(node,200);
  assert.equal(result.tableWidthPt,100);
  assert.deepEqual(result.columnWidths,[60,40]);
});

test('autofit grid-less table can use injected content preferred widths without knowing text layout internals', () => {
  const left={properties:{id:'left'},children:[]};
  const right={properties:{id:'right'},children:[]};
  const node={type:'table',properties:{layout:'autofit'},grid:[],rows:[{cells:[left,right]}]};
  const result=resolveTableGeometry(node,200,{measureCell:cell=>cell===left
    ? {minWidthPt:20,preferredWidthPt:40}
    : {minWidthPt:30,preferredWidthPt:80}});
  assert.equal(result.tableWidthPt,120);
  assert.deepEqual(result.columnWidths,[40,80]);
});

test('autofit keeps stored grid unless content minimum actually exceeds it', () => {
  const cellA={properties:{},children:[]};
  const cellB={properties:{},children:[]};
  const node={type:'table',properties:{layout:'autofit'},grid:[1000,1000],rows:[{cells:[cellA,cellB]}]};
  const unchanged=resolveTableGeometry(node,200,{measureCell:()=>({minWidthPt:30,preferredWidthPt:150})});
  assert.deepEqual(unchanged.columnWidths,[50,50]);
  const expanded=resolveTableGeometry(node,200,{measureCell:cell=>cell===cellA
    ? {minWidthPt:80,preferredWidthPt:80}
    : {minWidthPt:50,preferredWidthPt:50}});
  assert.equal(expanded.tableWidthPt,130);
  assert.deepEqual(expanded.columnWidths,[80,50]);
});

test('fixed layout does not invoke content measurement callback', () => {
  const node={type:'table',properties:{layout:'fixed'},grid:[1000,1000],rows:[{cells:[{properties:{},children:[]},{properties:{},children:[]}]}]};
  let calls=0;
  const result=resolveTableGeometry(node,200,{measureCell:()=>{calls++;return {minWidthPt:100,preferredWidthPt:100};}});
  assert.equal(calls,0);
  assert.deepEqual(result.columnWidths,[50,50]);
});

test('cell preferred width targets its actual grid track after gridBefore', () => {
  const node = { type: 'table', properties: { layout: 'fixed' }, grid: [1000, 1000, 1000], rows: [{
    properties: { gridBefore: 1, gridAfter: 1 },
    cells: [{ properties: { width: { type: 'dxa', value: 2000 } }, children: [] }]
  }] };
  const geometry = resolveTableGeometry(node, 300);
  assert.deepEqual(geometry.columnWidths, [50, 100, 50]);
});

test('autofit minimum cell width uses the gridBefore offset', () => {
  const cell = { properties: {}, children: [] };
  const node = { type: 'table', properties: { layout: 'autofit' }, grid: [1000, 1000, 1000], rows: [{
    properties: { gridBefore: 1, gridAfter: 1 }, cells: [cell]
  }] };
  const geometry = resolveTableGeometry(node, 300, { measureCell: () => ({ minWidthPt: 90, preferredWidthPt: 110 }) });
  assert.deepEqual(geometry.columnWidths, [50, 90, 50]);
});

test('grid-less table counts omitted before and after tracks', () => {
  const cell = { properties: { width: { type: 'dxa', value: 1000 } }, children: [] };
  const node = { type: 'table', properties: { layout: 'fixed' }, grid: [], rows: [{
    properties: { gridBefore: 1, gridAfter: 1 }, cells: [cell]
  }] };
  const geometry = resolveTableGeometry(node, 200);
  assert.equal(geometry.columnWidths.length, 3);
  assert.deepEqual(geometry.columnWidths, [0, 50, 0]);
});
