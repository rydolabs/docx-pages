import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTextbox } from '../../src/layout/primitives/textbox-layout.js';

const measurer={measure:text=>({widthPt:String(text).length*4,ascentPt:7,descentPt:2,lineHeightPt:9})};
const paragraph=text=>({type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:text}]}]});

test('textbox lays out paragraph content inside rectangular insets using existing text primitive',()=>{
  const box=layoutTextbox({content:[paragraph('hello')]},{x:10,y:20,widthPt:100,heightPt:50,insets:{leftEmu:12700,topEmu:25400,rightEmu:12700,bottomEmu:0},measurer});
  assert.equal(box.x,11);
  assert.equal(box.y,22);
  assert.equal(box.widthPt,98);
  assert.equal(box.blocks[0].type,'paragraph');
  assert.equal(box.blocks[0].x,11);
});
