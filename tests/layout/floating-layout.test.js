import test from 'node:test';
import assert from 'node:assert/strict';
import { createWrapExclusion, groupAdjacentFrameParagraphs, layoutFloating, layoutLeadingFrameParagraphs } from '../../src/layout/floating-layout.js';
import { resolveFlowBox } from '../../src/layout/composers/flow-composer.js';

const measurer={measure:t=>({widthPt:String(t).length*4,ascentPt:7,descentPt:2,lineHeightPt:9})};
const context={pageWidthPt:600,pageHeightPt:840,bodyWidthPt:480,margins:{left:60,right:60,top:70,bottom:70}};

test('page anchored drawing resolves EMU extent and page-relative offsets',()=>{
  const block=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000}}},context);
  assert.equal(block.widthPt,100);
  assert.equal(block.heightPt,50);
  assert.equal(block.x,10);
  assert.equal(block.y,20);
});

test('frame chain honors page x while stacking top-aligned frame paragraphs',()=>{
  const node=text=>({type:'paragraph',style:{frame:{width:9600,height:300,hAnchor:'page',x:1200,yAlign:'top'},runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:text}]}]});
  const result=layoutLeadingFrameParagraphs([node('A'),node('B')],context,measurer);
  assert.equal(result.blocks[0].x,60);
  assert.ok(result.blocks[1].y >= result.blocks[0].y + result.blocks[0].heightPt);
});

test('VML shape derives geometry from its style string',()=>{
  const block=layoutFloating({type:'vml',shape:{style:'margin-left:12pt;margin-top:8pt;width:226.75pt;height:141.75pt'}},context);
  assert.equal(block.x,12);
  assert.equal(block.y,8);
  assert.equal(block.widthPt,226.75);
  assert.equal(block.heightPt,141.75);
});


test('square wrap creates a side exclusion around anchored media',()=>{
  const block=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000},wrap:{type:'wrapSquare'}}},context);
  const exclusion=createWrapExclusion(block);
  assert.equal(exclusion.type,'side');
  assert.equal(exclusion.x,10);
  assert.equal(exclusion.widthPt,100);
});

test('frame exact height rule preserves requested height while atLeast can grow',()=>{
  const exact={type:'paragraph',style:{frame:{width:2000,height:200,heightRule:'exact',hAnchor:'page',x:0,y:0},runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'A '.repeat(100)}]}]};
  const atLeast={...exact,style:{...exact.style,frame:{...exact.style.frame,heightRule:'atLeast'}}};
  const exactResult=layoutLeadingFrameParagraphs([exact],context,measurer).blocks[0];
  const atLeastResult=layoutLeadingFrameParagraphs([atLeast],context,measurer).blocks[0];
  assert.equal(exactResult.frameGroupBounds.heightPt,10);
  assert.ok(exactResult.heightPt > exactResult.frameGroupBounds.heightPt);
  assert.ok(atLeastResult.frameGroupBounds.heightPt >= atLeastResult.heightPt);
});

test('frame wrap around creates a side exclusion with frame spacing',()=>{
  const result=layoutLeadingFrameParagraphs([{
    type:'paragraph',
    style:{frame:{width:2000,height:200,heightRule:'exact',hAnchor:'page',x:100,y:200,wrap:'around',hSpace:40,vSpace:20},runProperties:{size:18}},
    children:[{type:'run',children:[{type:'text',value:'frame'}]}]
  }],context,measurer).blocks[0];
  const exclusion=createWrapExclusion(result);
  assert.equal(exclusion.type,'side');
  assert.equal(exclusion.x,3);
  assert.equal(exclusion.y,9);
  assert.equal(exclusion.widthPt,104);
  assert.equal(exclusion.heightPt,12);
});


test('adjacent paragraphs with identical frame properties share one frame height',()=>{
  const node=text=>({type:'paragraph',style:{frame:{width:9600,height:300,hAnchor:'page',x:1200,yAlign:'top',wrap:'around'},runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:text}]}]});
  const nodes=[node('A'),node('B'),node('C')];
  assert.equal(groupAdjacentFrameParagraphs(nodes).length,1);
  const result=layoutLeadingFrameParagraphs(nodes,context,measurer);
  const sum=result.blocks.reduce((total,block)=>total+block.heightPt,0);
  assert.equal(result.bodyStartPt, context.margins.top + sum);
  assert.ok(result.blocks[0].isFrameGroupRoot);
  assert.equal(createWrapExclusion(result.blocks[1]), null);
  assert.equal(createWrapExclusion(result.blocks[0]).heightPt, sum);
});

test('floating shape can carry bounded textbox layout without changing shape geometry', () => {
  const measurer={measure:text=>({widthPt:String(text).length*4,ascentPt:7,descentPt:2,lineHeightPt:9})};
  const node={type:'image',xPt:5,yPt:6,extent:{cx:1270000,cy:635000},positioning:{mode:'inline'},visual:{textInsets:{leftEmu:12700,rightEmu:12700}},textBox:{content:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'box'}]}]}]}};
  const block=layoutFloating(node,{x:5,y:6,measurer,resources:{}});
  assert.equal(block.widthPt,100);
  assert.equal(block.heightPt,50);
  assert.equal(block.textBox.blocks[0].type,'paragraph');
  assert.equal(block.textBox.x,6);
});


test('clear left/right/all advances below matching side exclusions', () => {
  const column={x:0,y:0,widthPt:100,heightPt:200};
  const exclusions=[
    {type:'side',x:0,y:5,widthPt:30,heightPt:35},
    {type:'side',x:75,y:10,widthPt:25,heightPt:60}
  ];
  assert.equal(resolveFlowBox(column,20,exclusions,10,'left').y,40);
  assert.equal(resolveFlowBox(column,20,exclusions,10,'right').y,70);
  assert.equal(resolveFlowBox(column,20,exclusions,10,'all').y,70);
});

test('later allowOverlap=1 preserves requested position even when earlier anchor disallows overlap', () => {
  const first=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'0',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000}}},context);
  const second=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'1',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:381000}}},{...context,floatingObstacles:[first]});
  assert.equal(first.y,20);
  assert.equal(second.y,30);
});

test('allowOverlap=1 preserves intentional overlap when all participating floats allow it', () => {
  const first=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'1',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000}}},context);
  const second=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'1',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:381000}}},{...context,floatingObstacles:[first]});
  assert.equal(second.y,30);
});

test('later allowOverlap=0 moves below an overlapping anchor that permits overlap', () => {
  const first=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'1',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000}}},context);
  const second=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'0',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:381000}}},{...context,floatingObstacles:[first]});
  assert.equal(second.y,70);
});

test('later allowOverlap=0 also avoids earlier allowOverlap=0 anchors', () => {
  const first=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'0',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:254000}}},context);
  const second=layoutFloating({type:'image',extent:{cx:1270000,cy:635000},positioning:{mode:'anchor',allowOverlap:'0',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:381000}}},{...context,floatingObstacles:[first]});
  assert.equal(second.y,70);
});
