import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDocument } from '../../src/layout/layout-engine.js';

const measurer={measure:t=>({widthPt:String(t).length*4,ascentPt:7,descentPt:2,lineHeightPt:9})};
const makeParagraph=(text,keepLines=true)=>({type:'paragraph',style:{keepLines,runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:text}]}]});
const options={page:{pageWidthPt:140,pageHeightPt:100,margins:{top:10,bottom:10,left:10,right:10}},measurer};
function blocks(layout){return layout.pages.map(pg=>pg.regions.flatMap(reg=>reg.columns.flatMap(col=>col.blocks)));}

test('oversized keepLines paragraph is split to prevent clipping',()=>{
  const text='One Two Three Four '.repeat(45).trim();
  const layout=layoutDocument({sections:[{children:[makeParagraph(text)]}],resources:{}},options);
  assert.ok(layout.pages.length>1,'paragraph should span more than one physical page');
  const pages=blocks(layout);
  assert.ok(pages.every((page,i)=>page.every(b=> b.y+b.heightPt<=layout.pages[i].regions[0].columns[0].y+layout.pages[i].regions[0].columns[0].heightPt+0.01)));
  const actual=pages.flatMap(bs=>bs.flatMap(b=>(b.lines||[]).map(l=>l.text))).join(' ').replace(/\s+/g,' ').trim();
  assert.equal(actual,text);
});

test('short keepLines paragraph still moves intact to a new page',()=>{
  const lead=makeParagraph('a '.repeat(130),false);
  const following=makeParagraph('b '.repeat(40));
  const layout=layoutDocument({sections:[{children:[lead,following]}],resources:{}},options);
  const paras=blocks(layout).flat().filter(b=>b.type==='paragraph' && b.lines.some(l=>l.text.includes('b')));
  assert.equal(paras.length,1,'fittable keepLines paragraph must not be fragmented');
});
