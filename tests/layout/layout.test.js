import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDocument } from '../../src/layout/layout-engine.js';
import { layoutParagraph, splitParagraphForHeight } from '../../src/layout/text-layout.js';
import { createLineBreaker } from '../../src/layout/services/line-breaker.js';
import { paginate } from '../../src/layout/pagination.js';

const fixedMeasurer={measure:t=>({widthPt:String(t).length*4,ascentPt:7,descentPt:2})};

test('atLeast line spacing is a minimum, not font height plus requested spacing', () => {
  const p={type:'paragraph',style:{size:18,spacing:{line:260,lineRule:'atLeast'}},children:[{type:'run',children:[{type:'text',value:'hello world'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer});
  assert.equal(result.lineHeightPt,13);
});

test('creates explicit two-column page geometry', () => {
  const ir={sections:[{children:[
    {type:'paragraph',style:{size:18},children:[{type:'run',children:[{type:'text',value:'A '.repeat(100)}]}]},
    {type:'paragraph',style:{size:18},children:[{type:'run',children:[{type:'text',value:'B '.repeat(100)}]}]}
  ]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:400,pageHeightPt:200,margins:{top:10,right:10,bottom:10,left:10},columnCount:2,columnGapPt:20},measurer:fixedMeasurer});
  assert.equal(layout.pages[0].columns.length,2);
  assert.equal(layout.pages[0].columns[0].widthPt,180);
  assert.equal(layout.pages[0].columns[1].x,210);
});

test('wraps CJK text at character boundaries without requiring whitespace', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},spacing:{line:240,lineRule:'auto'}},children:[{type:'run',style:{size:18},children:[{type:'text',value:'가나다라마바사아자차카타파하'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:20,measurer:fixedMeasurer});
  assert.ok(result.lines.length >= 3);
  assert.equal(result.lines.map(line=>line.text).join(''),'가나다라마바사아자차카타파하');
});

test('line break clear hint is forwarded to flow resolution for float clearance', () => {
  const calls=[];
  const p={type:'paragraph',style:{runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[
    {type:'text',value:'before'},
    {type:'break',breakType:'line',clear:'all'},
    {type:'text',value:'after'}
  ]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:100,measurer:fixedMeasurer,flowResolver:args=>{
    calls.push(args);
    return {x:0,y:args.clear==='all'?40:args.y,widthPt:100};
  }});
  assert.equal(result.lines[0].breakClear,'all');
  assert.equal(result.lines[1].y,40);
  assert.ok(calls.some(call=>call.clear==='all'));
});

test('applies paragraph spacing and first-line indentation to geometry', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},spacing:{before:100,after:120,line:200,lineRule:'exact'},indentation:{left:200,right:100,firstLine:180}},children:[{type:'run',children:[{type:'text',value:'hello world hello world'}]}]};
  const result=layoutParagraph(p,{x:10,y:20,widthPt:100,measurer:fixedMeasurer});
  assert.equal(result.spacingBeforePt,5);
  assert.equal(result.spacingAfterPt,6);
  assert.equal(result.indentation.leftPt,10);
  assert.equal(result.indentation.rightPt,5);
  assert.equal(result.indentation.firstLineOffsetPt,9);
  assert.equal(result.lines[0].y,25);
  assert.ok(result.lines[0].x >= 29);
});

test('splits a long paragraph across columns at line boundaries', () => {
  const ir={sections:[{children:[
    {type:'paragraph',style:{wordWrap:false,runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ'}]}]}
  ]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:100,pageHeightPt:50,margins:{top:10,right:10,bottom:10,left:10},columnCount:2,columnGapPt:10},measurer:fixedMeasurer});
  const firstPage=layout.pages[0];
  assert.equal(firstPage.columns.length,2);
  assert.ok(firstPage.columns[0].blocks.length > 0);
  assert.ok(firstPage.columns[1].blocks.length > 0);
  const allText=layout.pages.flatMap(page=>page.columns).flatMap(column=>column.blocks).flatMap(block=>block.lines||[]).map(line=>line.text).join('');
  assert.equal(allText,'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

import { createTextMeasurer } from '../../src/layout/text-measurer.js';

test('canvas measurer uses browser metrics and applies character spacing', () => {
  const context2d = {
    font: '',
    measureText(text) {
      assert.match(this.font, /9pt/);
      return {
        width: text.length * 10,
        fontBoundingBoxAscent: 10,
        fontBoundingBoxDescent: 4
      };
    }
  };
  const measurer = createTextMeasurer({ context2d });
  const metrics = measurer.measure('AB', { fontSizePt: 9, fontFamily: 'Times New Roman', characterSpacingPt: 1 });
  assert.equal(measurer.kind, 'canvas');
  assert.equal(metrics.widthPt, 16); // 20px = 15pt, plus 1pt spacing
  assert.equal(metrics.ascentPt, 7.5);
  assert.equal(metrics.descentPt, 3);
  assert.equal(metrics.lineHeightPt, 10.5);
});

test('selects East Asian and Latin fonts per character during text layout', () => {
  const seen = [];
  const measurer = {
    measure(text, style) {
      seen.push([text, style.fontFamily]);
      return { widthPt: 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 };
    }
  };
  const p = {
    type: 'paragraph',
    style: { runProperties: { size: 18, fonts: { eastAsia: 'Batang', ascii: 'Times New Roman' } } },
    children: [{ type: 'run', children: [{ type: 'text', value: '가A' }] }]
  };
  layoutParagraph(p, { x: 0, y: 0, widthPt: 100, measurer });
  assert.deepEqual(seen, [['가', 'Batang, \"UnBatang\", \"Noto Serif CJK KR\", serif'], ['A', 'Times New Roman']]);
});

test('justifies non-final lines for Word jc=both paragraphs', () => {
  const measurer = { measure(text, style) { return { widthPt: text === ' ' ? 2 : 5, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }; } };
  const p = {
    type: 'paragraph',
    style: { alignment: 'both', runProperties: { size: 18 } },
    children: [{ type: 'run', children: [{ type: 'text', value: '가 나 다 라 마' }] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 25, measurer });
  assert.ok(block.lines.length > 1);
  assert.equal(block.lines[0].justification?.mode, 'word');
  assert.ok(block.lines[0].justification?.perGapPt > 0);
  assert.equal(block.lines.at(-1).justification, null);
});

test('widow control keeps at least two lines on each paragraph fragment', () => {
  const block = {
    type: 'paragraph', x: 0, y: 0, widthPt: 100, spacingBeforePt: 0, spacingAfterPt: 0,
    keepLines: false, widowControl: true,
    lines: Array.from({length: 5}, (_, i) => ({ x:0, y:i*10, heightPt:10, text:String(i), fragments:[] }))
  };
  const split = splitParagraphForHeight(block, 40);
  assert.equal(split.first.lines.length, 3);
  assert.equal(split.rest.lines.length, 2);
});

test('keepNext moves linked paragraphs together when they fit in the next column', () => {
  const makeP = (text, keepNext=false) => ({
    type:'paragraph',
    style:{ keepNext, runProperties:{size:18}, spacing:{line:200,lineRule:'exact'} },
    children:[{type:'run',children:[{type:'text',value:text}]}]
  });
  const ir={sections:[{children:[
    makeP('A'.repeat(40)),
    makeP('Heading', true),
    makeP('Body')
  ]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:60,margins:{top:10,right:10,bottom:10,left:10},columnCount:2,columnGapPt:10},measurer:fixedMeasurer});
  const columns=layout.pages[0].columns;
  const headingCol=columns.findIndex(c=>c.blocks.some(b=>b.lines?.some(l=>l.text.includes('Heading'))));
  const bodyCol=columns.findIndex(c=>c.blocks.some(b=>b.lines?.some(l=>l.text.includes('Body'))));
  assert.equal(headingCol, bodyCol);
});

test('pageBreakBefore starts a new physical page instead of only advancing a column', () => {
  const p=(text, pageBreakBefore=false)=>({type:'paragraph',style:{pageBreakBefore,runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:text}]}]});
  const ir={sections:[{children:[p('first'),p('second',true)]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:60,margins:{top:10,right:10,bottom:10,left:10},columnCount:2,columnGapPt:10},measurer:fixedMeasurer});
  assert.equal(layout.pages.length,2);
  assert.ok(layout.pages[1].columns[0].blocks.some(b=>b.lines?.some(l=>l.text.includes('second'))));
});

test('inline DrawingML media participates in line width and line height', () => {
  const p = {
    type: 'paragraph', style: { runProperties: { size: 18 } },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'A' },
      { type: 'image', extent: { cx: 254000, cy: 381000 }, positioning: { mode: 'inline' } },
      { type: 'text', value: 'B' }
    ] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 200, measurer: fixedMeasurer });
  assert.equal(block.lines.length, 1);
  const media = block.lines[0].fragments.find(f => f.type === 'media');
  assert.ok(media);
  assert.equal(media.widthPt, 20);
  assert.equal(media.heightPt, 30);
  assert.ok(block.lines[0].heightPt >= 30);
});

test('automatic paragraph line spacing does not scale inline media extent', () => {
  const p = {
    type: 'paragraph',
    style: { runProperties: { size: 22 }, spacing: { line: 259, lineRule: 'auto', after: 160 } },
    children: [{ type: 'run', children: [
      { type: 'image', extent: { cx: 6188710, cy: 3491230 }, positioning: { mode: 'inline' } }
    ] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 500, measurer: fixedMeasurer });
  assert.equal(block.lines.length, 1);
  assert.ok(Math.abs(block.lines[0].heightPt - 274.9) < 0.01);
  assert.ok(Math.abs(block.heightPt - 282.9) < 0.01);
});


test('run-level column break advances to the next column', () => {
  const ir = { sections: [{ children: [{
    type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'left' },
      { type: 'break', breakType: 'column' },
      { type: 'text', value: 'right' }
    ] }]
  }] }], resources: {} };
  const layout = layoutDocument(ir, { page: { pageWidthPt: 120, pageHeightPt: 80, margins: { top: 10, right: 10, bottom: 10, left: 10 }, columnCount: 2, columnGapPt: 10 }, measurer: fixedMeasurer });
  assert.ok(layout.pages[0].columns[0].blocks.some(b => b.lines?.some(l => l.text === 'left')));
  assert.ok(layout.pages[0].columns[1].blocks.some(b => b.lines?.some(l => l.text === 'right')));
});

test('run-level page break advances to the next physical page', () => {
  const ir = { sections: [{ children: [{
    type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'page1' },
      { type: 'break', breakType: 'page' },
      { type: 'text', value: 'page2' }
    ] }]
  }] }], resources: {} };
  const layout = layoutDocument(ir, { page: { pageWidthPt: 120, pageHeightPt: 80, margins: { top: 10, right: 10, bottom: 10, left: 10 }, columnCount: 2, columnGapPt: 10 }, measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 2);
  assert.ok(layout.pages[0].columns[0].blocks.some(b => b.lines?.some(l => l.text === 'page1')));
  assert.ok(layout.pages[1].columns[0].blocks.some(b => b.lines?.some(l => l.text === 'page2')));
});

test('anchored square wrap narrows only overlapping lines and restores full width below the object', () => {
  const paragraph={type:'paragraph',style:{wordWrap:false,runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[
    {type:'image',extent:{cx:381000,cy:381000},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:127000},vertical:{relativeFrom:'page',offset:127000},wrap:{type:'wrapSquare'}}},
    {type:'text',value:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}
  ]}]};
  const ir={sections:[{children:[paragraph]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:160,margins:{top:10,right:10,bottom:10,left:10},columnCount:1},measurer:{measure:t=>({widthPt:String(t).length*4,ascentPt:7,descentPt:2,lineHeightPt:9})}});
  const block=layout.pages[0].columns[0].blocks[0];
  assert.equal(block.x, 10);
  assert.equal(block.widthPt, 100);
  assert.ok(block.lines.some(line => line.availableWidthPt < 100));
  assert.ok(block.lines.some(line => line.y >= 40 && line.availableWidthPt === 100));
});

test('multiple anchored wraps use the widest remaining horizontal interval', () => {
  const anchor = (xPt) => ({
    type: 'image',
    extent: { cx: 50 * 12700, cy: 100 * 12700 },
    positioning: {
      mode: 'anchor',
      horizontal: { relativeFrom: 'page', offset: xPt * 12700 },
      vertical: { relativeFrom: 'page', offset: 0 },
      wrap: { type: 'wrapSquare' }
    }
  });
  const paragraphNode = {
    type: 'paragraph',
    style: { runProperties: { size: 18 } },
    children: [
      { type: 'run', children: [anchor(50), anchor(150), { type: 'text', value: '가나다라마바사아자차카타파하' }] }
    ]
  };
  const layout = layoutDocument(
    { sections: [{ children: [paragraphNode] }], resources: {} },
    { page: { pageWidthPt: 300, pageHeightPt: 300, margins: { top: 0, right: 0, bottom: 0, left: 0 }, columnCount: 1 }, measurer: fixedMeasurer }
  );
  const block = layout.pages[0].columns[0].blocks[0];
  assert.equal(block.lines[0].availableWidthPt, 100);
  assert.equal(block.lines[0].flowBox.x, 200);
});

test('wrap exclusion applies when a floating object intersects the line height', () => {
  const paragraphNode = {
    type: 'paragraph',
    style: { runProperties: { size: 18 } },
    children: [{
      type: 'run',
      children: [
        {
          type: 'image',
          extent: { cx: 100 * 12700, cy: 50 * 12700 },
          positioning: {
            mode: 'anchor',
            horizontal: { relativeFrom: 'page', offset: 100 * 12700 },
            vertical: { relativeFrom: 'page', offset: 5 * 12700 },
            wrap: { type: 'wrapSquare' }
          }
        },
        { type: 'text', value: 'ABCDEFGHIJK' }
      ]
    }]
  };
  const layout = layoutDocument(
    { sections: [{ children: [paragraphNode] }], resources: {} },
    { page: { pageWidthPt: 300, pageHeightPt: 300, margins: { top: 0, right: 0, bottom: 0, left: 0 }, columnCount: 1 }, measurer: fixedMeasurer }
  );
  const block = layout.pages[0].columns[0].blocks[0];
  assert.equal(block.lines[0].availableWidthPt, 100);
});

test('document grid linePitch snaps paragraph lines to the section grid', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'hello'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{type:'lines',linePitch:272}});
  assert.equal(result.lineHeightPt,13.6);
});


test('document grid with omitted/default type does not snap line pitch', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'hello'}]}]};
  const omitted=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{linePitch:272}});
  const explicit=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{type:'default',linePitch:272}});
  assert.equal(omitted.lineHeightPt,9);
  assert.equal(explicit.lineHeightPt,9);
});

test('exact line spacing overrides document grid linePitch', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:'hello'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{type:'lines',linePitch:272}});
  assert.equal(result.lineHeightPt,10);
});

test('snapToGrid=false on the run disables document grid line pitch', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18,snapToGrid:false},children:[{type:'text',value:'hello'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{type:'lines',linePitch:272}});
  assert.equal(result.lineHeightPt,9);
});

test('document grid does not affect table cell lines unless compatibility enables it', () => {
  const table={type:'table',properties:{},style:{},grid:[1000],rows:[{properties:{},cells:[{properties:{},children:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'cell'}]}]}]}]}]};
  const base={sections:[{properties:{pageSize:{width:4000,height:4000},margins:{top:200,right:200,bottom:200,left:200},documentGrid:{type:'lines',linePitch:272}},children:[table]}],resources:{},settings:{compatibility:{adjustLineHeightInTable:false}}};
  const normal=layoutDocument(base,{measurer:fixedMeasurer});
  const normalLine=normal.pages[0].columns[0].blocks[0].rows[0].cells[0].blocks[0].lines[0];
  assert.equal(normalLine.heightPt,9);
  const enabled=layoutDocument({...base,settings:{compatibility:{adjustLineHeightInTable:true}}},{measurer:fixedMeasurer});
  const enabledLine=enabled.pages[0].columns[0].blocks[0].rows[0].cells[0].blocks[0].lines[0];
  assert.equal(enabledLine.heightPt,13.6);
});

test('paragraph snapToGrid=false disables document grid for all runs', () => {
  const p={type:'paragraph',style:{snapToGrid:false,runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'hello'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:fixedMeasurer,documentGrid:{type:'lines',linePitch:272}});
  assert.equal(result.lineHeightPt,9);
});

test('run width scaling changes measured advance without changing font size', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18,scale:80},children:[{type:'text',value:'ABCD'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:{measure:(t,s)=>({widthPt:String(t).length*5*(s.textScale||1),ascentPt:7,descentPt:2,lineHeightPt:9})}});
  assert.equal(result.lines[0].widthPt,16);
  assert.equal(result.lines[0].fragments[0].style.textScale,0.8);
  assert.equal(result.lines[0].fragments[0].style.fontSizePt,9);
});

test('East Asian auto spacing inserts quarter-em between CJK and Latin or digits', () => {
  const p={type:'paragraph',style:{autoSpaceDE:true,autoSpaceDN:true,runProperties:{size:20}},children:[{type:'run',children:[{type:'text',value:'가A1나2'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:{measure:()=>({widthPt:5,ascentPt:8,descentPt:2,lineHeightPt:10})}});
  const gaps=result.lines[0].fragments.flatMap(f=>f.autoSpacingBeforePt?[f.autoSpacingBeforePt]:[]);
  assert.deepEqual(gaps,[2.5,2.5,2.5]);
});

test('East Asian auto spacing can be disabled by paragraph properties', () => {
  const p={type:'paragraph',style:{autoSpaceDE:false,autoSpaceDN:false,runProperties:{size:20}},children:[{type:'run',children:[{type:'text',value:'가A1나2'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:{measure:()=>({widthPt:5,ascentPt:8,descentPt:2,lineHeightPt:10})}});
  assert.equal(result.lines[0].fragments.some(f=>f.autoSpacingBeforePt),false);
});

test('superscript and explicit position expand line ascent and preserve baseline shift', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18,verticalAlign:'superscript'},children:[{type:'text',value:'x'}]},{type:'run',style:{size:18,position:4},children:[{type:'text',value:'y'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:{measure:()=>({widthPt:5,ascentPt:7,descentPt:2,lineHeightPt:9})}});
  assert.equal(result.lines[0].fragments[0].style.baselineShiftPt,3.15);
  assert.equal(result.lines[0].fragments[1].style.baselineShiftPt,2);
  assert.ok(result.lines[0].ascentPt>7);
});

test('OMML math participates in line width and expands line height for fractions', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[
    {type:'math',text:'x=(-b±√b²-4ac)/(2a)',ast:{type:'row',children:[
      {type:'text',value:'x='},
      {type:'fraction',numerator:{type:'row',children:[{type:'text',value:'-b±'},{type:'radical',body:{type:'row',children:[{type:'text',value:'b²-4ac'}]}}]},denominator:{type:'row',children:[{type:'text',value:'2a'}]}}
    ]}}
  ]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:300,measurer:{measure:(t,s)=>({widthPt:String(t).length*(s.fontSizePt||9)*0.5,ascentPt:(s.fontSizePt||9)*0.8,descentPt:(s.fontSizePt||9)*0.2,lineHeightPt:s.fontSizePt||9})}});
  assert.equal(result.lines[0].fragments[0].type,'math');
  assert.ok(result.lines[0].heightPt>9);
  assert.ok(result.lines[0].widthPt>20);
});

test('PAGE field uses the current page number instead of stale cached field text', () => {
  const paragraph = {
    type: 'paragraph',
    style: { runProperties: { size: 18, fonts: { eastAsia: 'Dotum', ascii: 'Dotum' } } },
    children: [
      { type: 'run', style: {}, children: [{ type: 'field', fieldCharType: 'begin' }] },
      { type: 'run', style: {}, children: [{ type: 'field', instruction: ' PAGE ' }] },
      { type: 'run', style: {}, children: [{ type: 'field', fieldCharType: 'separate' }] },
      { type: 'run', style: {}, children: [{ type: 'text', value: '3' }] },
      { type: 'run', style: {}, children: [{ type: 'field', fieldCharType: 'end' }] }
    ]
  };
  const block = layoutParagraph(paragraph, { x: 0, y: 0, widthPt: 200, measurer: createTextMeasurer(), fieldContext: { pageNumber: 1 } });
  assert.equal(block.lines.map(line => line.text).join(''), '1');
});

test('known Korean Word fonts include metrically closer installed fallbacks', () => {
  const paragraph = {
    type: 'paragraph',
    style: { runProperties: { size: 18, fonts: { eastAsia: 'Batang', ascii: 'Dotum' } } },
    children: [{ type: 'run', style: {}, children: [{ type: 'text', value: '한A' }] }]
  };
  const block = layoutParagraph(paragraph, { x: 0, y: 0, widthPt: 200, measurer: createTextMeasurer() });
  const families = block.lines[0].fragments.map(fragment => fragment.style.fontFamily).join(' | ');
  assert.match(families, /UnBatang/);
  assert.match(families, /UnDotum/);
});

test('uses document defaultTabStop instead of a hard-coded browser tab width', () => {
  const p = {
    type: 'paragraph',
    style: { runProperties: { size: 18 } },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'A' },
      { type: 'tab' },
      { type: 'text', value: 'B' }
    ] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 200, measurer: fixedMeasurer, defaultTabStop: 800 });
  const tab = block.lines[0].fragments.find(fragment => fragment.type === 'tab');
  assert.ok(tab);
  assert.equal(tab.widthPt, 36); // A=4pt, next 800twip (40pt) stop => 36pt advance.
  assert.equal(block.lines[0].widthPt, 44);
});

test('explicit paragraph tab stop overrides the document default tab stop', () => {
  const p = {
    type: 'paragraph',
    style: { runProperties: { size: 18 }, tabs: [{ value: 'left', position: 1000 }] },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'A' },
      { type: 'tab' },
      { type: 'text', value: 'B' }
    ] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 200, measurer: fixedMeasurer, defaultTabStop: 800 });
  const tab = block.lines[0].fragments.find(fragment => fragment.type === 'tab');
  assert.equal(tab.widthPt, 46); // Explicit 1000twip = 50pt.
});

test('NUMPAGES and SECTIONPAGES fields are resolved after final pagination', () => {
  const field = instruction => ({ type: 'field', instruction, children: [{ type: 'run', children: [{ type: 'text', value: '99' }] }] });
  const p = text => ({ type: 'paragraph', style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const ir = {
    settings: {}, resources: {},
    sections: [{
      properties: { footerReferences: [{ type: 'default', relationshipId: 'f1' }] },
      footerRefs: [{ type: 'default', relationshipId: 'f1' }],
      headerRefs: [],
      children: [p('first'), { ...p('second'), style: { ...p('second').style, pageBreakBefore: true } }]
    }],
    headers: {},
    footers: {
      f1: { content: [{ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [
        { type: 'run', children: [field('NUMPAGES'), { type: 'text', value: '/' }, field('SECTIONPAGES')] }
      ] }] }
    }
  };
  const layout = layoutDocument(ir, { page: { pageWidthPt: 120, pageHeightPt: 80, margins: { top: 10, right: 10, bottom: 10, left: 10, footer: 5 }, columnCount: 1 }, measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 2);
  const footerText = layout.pages.map(page => page.footer.blocks.flatMap(block => block.lines || []).map(line => line.text).join(''));
  assert.deepEqual(footerText, ['2/2', '2/2']);
});

test('right tab aligns the following text right edge to the explicit tab position', () => {
  const p = {
    type: 'paragraph',
    style: { runProperties: { size: 18 }, tabs: [{ value: 'right', position: 2000 }] },
    children: [{ type: 'run', children: [
      { type: 'text', value: 'LEFT' },
      { type: 'tab' },
      { type: 'text', value: 'RIGHT' }
    ] }]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 150, measurer: fixedMeasurer, defaultTabStop: 800 });
  const line = block.lines[0];
  const tab = line.fragments.find(fragment => fragment.type === 'tab');
  assert.ok(tab);
  assert.equal(tab.tabAlignment, 'right');
  // 2000twip=100pt, LEFT=16pt, RIGHT=20pt => tab advances 64pt.
  assert.equal(tab.widthPt, 64);
  assert.equal(line.widthPt, 100);
});

test('header and footer layout use the same injected font resolver as body text', () => {
  const seen=[];
  const measurer={measure:(text,style)=>{seen.push({text,fontFamily:style.fontFamily});return {widthPt:String(text).length*4,ascentPt:7,descentPt:2,lineHeightPt:9};}};
  const p=(text,font)=>({type:'paragraph',style:{runProperties:{size:18,fonts:{ascii:font,eastAsia:font}}},children:[{type:'run',children:[{type:'text',value:text}]}]});
  const ir={settings:{},resources:{},sections:[{properties:{headerReferences:[{type:'default',relationshipId:'h1'}],footerReferences:[{type:'default',relationshipId:'f1'}]},headerRefs:[{type:'default',relationshipId:'h1'}],footerRefs:[{type:'default',relationshipId:'f1'}],children:[p('BODY','Batang')]}],headers:{h1:{content:[p('HEADER','Batang')]}},footers:{f1:{content:[p('FOOTER','Batang')]}}};
  layoutDocument(ir,{page:{pageWidthPt:200,pageHeightPt:200,margins:{top:20,right:20,bottom:20,left:20,header:10,footer:10},columnCount:1},measurer,fontMap:{Batang:['LicensedBatang']}});
  for (const label of ['BODY','HEADER','FOOTER']) {
    const entry=seen.find(item=>item.text===label[0]);
    assert.ok(entry);
  }
  assert.ok(seen.some(item=>item.fontFamily?.includes('LicensedBatang')));
  assert.ok(seen.filter(item=>/[BHF]/.test(item.text)).every(item=>item.fontFamily?.includes('LicensedBatang')));
});

test('section page numbering restart and format drive PAGE field output', () => {
  const pageField={type:'field',instruction:'PAGE',children:[{type:'run',children:[{type:'text',value:'99'}]}]};
  const p=text=>({type:'paragraph',style:{runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[typeof text==='string'?{type:'text',value:text}:text]}]});
  const ir={settings:{},resources:{},sections:[{properties:{pageNumbering:{start:4,format:'lowerRoman'},footerReferences:[{type:'default',relationshipId:'f1'}]},headerRefs:[],footerRefs:[{type:'default',relationshipId:'f1'}],children:[p('a'),{...p('b'),style:{...p('b').style,pageBreakBefore:true}}]}],headers:{},footers:{f1:{content:[p(pageField)]}}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:80,margins:{top:10,right:10,bottom:10,left:10,footer:5},columnCount:1},measurer:fixedMeasurer});
  const values=layout.pages.map(page=>page.footer.blocks.flatMap(block=>block.lines||[]).map(line=>line.text).join(''));
  assert.deepEqual(values,['iv','v']);
});

test('adjacent runs with different decoration, shading, or character spacing stay separate layout fragments', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[
    {type:'run',style:{strike:true,shading:{resolvedFill:'FFFF00'}},children:[{type:'text',value:'A'}]},
    {type:'run',style:{strike:false,shading:{resolvedFill:'00FF00'},spacing:20},children:[{type:'text',value:'B'}]}
  ]};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  assert.equal(block.lines[0].fragments.length,2);
  assert.equal(block.lines[0].fragments[0].style.strike,true);
  assert.equal(block.lines[0].fragments[1].style.characterSpacingPt,1);
  assert.equal(block.lines[0].fragments[1].style.shading.resolvedFill,'00FF00');
});

test('terminal punctuation prohibited at line start moves with the previous character instead of forming a lone line', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'AB.'}]}]};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:8,measurer:fixedMeasurer,lineBreakRules:{noLineBreaksBefore:'.'}});
  assert.deepEqual(block.lines.map(line=>line.text),['A','B.']);
});

test('contextual spacing removes same-style paragraph gap without affecting other styles', () => {
  const style = { styleId:'Body', contextualSpacing:true, spacing:{ before:120, after:120 }, runProperties:{ size:18 } };
  const p = text => ({ type:'paragraph', style, children:[{type:'run',style:{size:18},children:[{type:'text',value:text}]}] });
  const make = node => { const f=({x,y,widthPt})=>layoutParagraph(node,{x,y,widthPt,measurer:fixedMeasurer}); f.kind='paragraph'; return f; };
  const context = { pageWidthPt:300,pageHeightPt:300,margins:{top:20,right:20,bottom:20,left:20,header:10,footer:10},bodyWidthPt:260,columnCount:1,columnGapPt:0,columnDefinitions:[] };
  const pages = paginate([make(p('A')), make(p('B'))], context);
  const [a,b] = pages[0].columns[0].blocks;
  const aBottom = a.lines.at(-1).y + a.lines.at(-1).heightPt;
  assert.equal(b.lines[0].y, aBottom);
  assert.equal(b.spacingBeforePt, a.spacingBeforePt);
});

test('continuous section creates a new region on the same physical page and can change column count', () => {
  const paragraph = text => ({
    type: 'paragraph',
    style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  });
  const common = {
    pageSize: { width: 8000, height: 6000 },
    margins: { top: 200, right: 200, bottom: 200, left: 200 }
  };
  const ir = {
    sections: [
      { properties: { ...common, columns: { count: 1, space: 200 } }, children: [paragraph('single column')] },
      { properties: { ...common, type: 'continuous', columns: { count: 2, space: 200 } }, children: [paragraph('two column section')] }
    ],
    resources: {}, settings: {}
  };

  const layout = layoutDocument(ir, { measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 1);
  assert.equal(layout.pages[0].regions.length, 2);
  assert.equal(layout.pages[0].regions[0].columns.length, 1);
  assert.equal(layout.pages[0].regions[1].columns.length, 2);
  assert.ok(layout.pages[0].regions[1].y >= layout.pages[0].regions[0].y);
  assert.ok(layout.pages[0].regions[1].columns[0].blocks.some(block => block.lines?.some(line => line.text.includes('two column'))));
  assert.equal(layout.pages[0].columns.length, 3); // backward-compatible flattened alias
});

test('continuous section region can change horizontal margins without creating a new page', () => {
  const p = text => ({ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const ir = {
    sections: [
      {
        properties: { pageSize: { width: 8000, height: 6000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 }, columns: { count: 1 } },
        children: [p('first')]
      },
      {
        properties: { type: 'continuous', pageSize: { width: 8000, height: 6000 }, margins: { top: 200, right: 400, bottom: 200, left: 800 }, columns: { count: 1 } },
        children: [p('second')]
      }
    ], resources: {}, settings: {}
  };
  const layout = layoutDocument(ir, { measurer: fixedMeasurer });
  const second = layout.pages[0].regions[1];
  assert.equal(layout.pages.length, 1);
  assert.equal(second.x, 40);
  assert.equal(second.columns[0].x, 40);
  assert.equal(second.columns[0].widthPt, 340);
});

test('non-continuous section starts on a new physical page', () => {
  const p = text => ({ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const props = { pageSize: { width: 8000, height: 6000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 }, columns: { count: 1 } };
  const layout = layoutDocument({
    sections: [
      { properties: props, children: [p('first')] },
      { properties: { ...props, type: 'nextPage' }, children: [p('second')] }
    ], resources: {}, settings: {}
  }, { measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 2);
  assert.equal(layout.pages[0].regions.length, 1);
  assert.equal(layout.pages[1].regions.length, 1);
});

test('continuous section with a physical page-size change safely starts a new page', () => {
  const p = text => ({ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const layout = layoutDocument({
    sections: [
      { properties: { pageSize: { width: 8000, height: 6000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 } }, children: [p('first')] },
      { properties: { type: 'continuous', pageSize: { width: 9000, height: 6000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 } }, children: [p('second')] }
    ], resources: {}, settings: {}
  }, { measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 2);
  assert.equal(layout.pages[1].widthPt, 450);
});

test('continuous section overflow continues on the next page with the new section column geometry', () => {
  const p = text => ({ type: 'paragraph', style: { wordWrap:false, runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const common = { pageSize: { width: 3000, height: 1600 }, margins: { top: 100, right: 100, bottom: 100, left: 100 } };
  const layout = layoutDocument({
    sections: [
      { properties: { ...common, columns: { count: 1, space: 100 } }, children: [p('intro')] },
      { properties: { ...common, type: 'continuous', columns: { count: 2, space: 100 } }, children: [p('X'.repeat(300))] }
    ], resources: {}, settings: {}
  }, { measurer: fixedMeasurer });

  assert.ok(layout.pages.length >= 2);
  assert.equal(layout.pages[0].regions.length, 2);
  assert.equal(layout.pages[0].regions[1].columns.length, 2);
  assert.equal(layout.pages[1].regions.length, 1);
  assert.equal(layout.pages[1].regions[0].sectionIndex, 1);
  assert.equal(layout.pages[1].regions[0].columns.length, 2);
  assert.equal(layout.pages[1].sectionOwnerIndex, 1);
});

test('pageBreakBefore at the start of a continuous section still starts a new physical page', () => {
  const p = (text, pageBreakBefore = false) => ({ type: 'paragraph', style: { pageBreakBefore, runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const common = { pageSize: { width: 8000, height: 6000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 }, columns: { count: 1 } };
  const layout = layoutDocument({
    sections: [
      { properties: common, children: [p('first')] },
      { properties: { ...common, type: 'continuous' }, children: [p('second', true)] }
    ], resources: {}, settings: {}
  }, { measurer: fixedMeasurer });
  assert.equal(layout.pages.length, 2);
  assert.ok(layout.pages[1].regions[0].columns[0].blocks.some(block => block.lines?.some(line => line.text.includes('second'))));
});

test('continuous section keeps the shared page header/footer owner and switches on the next physical page', () => {
  const p = text => ({ type: 'paragraph', style: { wordWrap:false, runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' } }, children: [{ type: 'run', children: [{ type: 'text', value: text }] }] });
  const common = { pageSize: { width: 3000, height: 1600 }, margins: { top: 100, right: 100, bottom: 100, left: 100, footer: 80 }, columns: { count: 1 } };
  const ir = {
    sections: [
      { properties: common, footerRefs: [{ type: 'default', relationshipId: 'f1' }], children: [p('first section')] },
      { properties: { ...common, type: 'continuous' }, footerRefs: [{ type: 'default', relationshipId: 'f2' }], children: [p('Y'.repeat(400))] }
    ],
    resources: {}, settings: {},
    footers: {
      f1: { content: [p('FOOTER-A')] },
      f2: { content: [p('FOOTER-B')] }
    }
  };
  const layout = layoutDocument(ir, { measurer: fixedMeasurer });
  assert.ok(layout.pages.length >= 2);
  const footerText = page => page.footer?.blocks?.flatMap(block => block.lines || []).map(line => line.text).join('') || '';
  assert.equal(layout.pages[0].sectionOwnerIndex, 0);
  assert.match(footerText(layout.pages[0]), /FOOTER-A/);
  assert.equal(layout.pages[1].sectionOwnerIndex, 1);
  assert.match(footerText(layout.pages[1]), /FOOTER-B/);
});

test('continuous multi-column section balances its final region before the next section', () => {
  const p = text => ({
    type: 'paragraph',
    style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' }, widowControl: false },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  });
  const common = { pageSize: { width: 4000, height: 4000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 } };
  const firstChildren = Array.from({ length: 6 }, (_, i) => p(`item-${i + 1}`));
  const layout = layoutDocument({
    sections: [
      { properties: { ...common, columns: { count: 2, space: 200 } }, children: firstChildren },
      { properties: { ...common, type: 'continuous', columns: { count: 1 } }, children: [p('after')] }
    ],
    resources: {}, settings: {}
  }, { measurer: fixedMeasurer });

  const firstRegion = layout.pages[0].regions[0];
  assert.equal(firstRegion.columns.length, 2);
  assert.equal(firstRegion.balanced, true);
  assert.ok(firstRegion.columns[0].blocks.length > 0);
  assert.ok(firstRegion.columns[1].blocks.length > 0);
  assert.ok(Math.abs(firstRegion.columns[0].blocks.length - firstRegion.columns[1].blocks.length) <= 1);
  assert.ok(layout.pages[0].regions[1].y >= firstRegion.y + firstRegion.balancedHeightPt - 0.5);
});

test('final multi-column section balances its last region at document end', () => {
  const p = text => ({
    type: 'paragraph',
    style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' }, widowControl: false },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  });
  const common = { pageSize: { width: 4000, height: 4000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 } };
  const layout = layoutDocument({
    sections: [
      { properties: { ...common, columns: { count: 2, space: 200 } }, children: Array.from({ length: 6 }, (_, i) => p(`item-${i + 1}`)) }
    ],
    resources: {}, settings: {}
  }, { measurer: fixedMeasurer });

  const finalRegion = layout.pages.at(-1).regions.at(-1);
  assert.equal(finalRegion.columns.length, 2);
  assert.equal(finalRegion.balanced, true);
  assert.ok(finalRegion.columns[0].blocks.length > 0);
  assert.ok(finalRegion.columns[1].blocks.length > 0);
  assert.ok(Math.abs(finalRegion.columns[0].blocks.length - finalRegion.columns[1].blocks.length) <= 1);
});

test('noColumnBalance compatibility option leaves continuous section columns unbalanced', () => {
  const p = text => ({
    type: 'paragraph',
    style: { runProperties: { size: 18 }, spacing: { line: 200, lineRule: 'exact' }, widowControl: false },
    children: [{ type: 'run', children: [{ type: 'text', value: text }] }]
  });
  const common = { pageSize: { width: 4000, height: 4000 }, margins: { top: 200, right: 200, bottom: 200, left: 200 } };
  const layout = layoutDocument({
    sections: [
      { properties: { ...common, columns: { count: 2, space: 200 } }, children: Array.from({ length: 6 }, (_, i) => p(`item-${i + 1}`)) },
      { properties: { ...common, type: 'continuous', columns: { count: 1 } }, children: [p('after')] }
    ],
    resources: {}, settings: { compatibility: { noColumnBalance: true } }
  }, { measurer: fixedMeasurer });

  const firstRegion = layout.pages[0].regions[0];
  assert.notEqual(firstRegion.balanced, true);
  assert.equal(firstRegion.columns[1].blocks.length, 0);
});

test('explicit w:wordWrap=true keeps a long Latin word intact while false permits character wrapping', () => {
  const makeParagraph = wordWrap => ({
    type:'paragraph',
    style:{ runProperties:{size:18}, ...(wordWrap == null ? {} : {wordWrap}) },
    children:[{type:'run',children:[{type:'text',value:'ABCDE'}]}]
  });
  const wordLevel = layoutParagraph(makeParagraph(true), {x:0,y:0,widthPt:8,measurer:fixedMeasurer});
  const charLevel = layoutParagraph(makeParagraph(false), {x:0,y:0,widthPt:8,measurer:fixedMeasurer});
  assert.deepEqual(wordLevel.lines.map(line=>line.text), ['ABCDE']);
  assert.ok(charLevel.lines.length > 1);
  assert.equal(charLevel.lines.map(line=>line.text).join(''), 'ABCDE');
});

test('wordWrap=false prefers existing word boundaries before splitting a Latin word', () => {
  const makeParagraph = text => ({
    type:'paragraph',
    style:{runProperties:{size:18},wordWrap:false},
    children:[{type:'run',children:[{type:'text',value:text}]}]
  });
  const wrapped=layoutParagraph(makeParagraph('Apple Banana'),{x:0,y:0,widthPt:32,measurer:fixedMeasurer});
  assert.deepEqual(wrapped.lines.map(line=>line.text),['Apple','Banana']);
  const unbroken=layoutParagraph(makeParagraph('ABCDEFGHIJK'),{x:0,y:0,widthPt:32,measurer:fixedMeasurer});
  assert.ok(unbroken.lines.length > 1,'an oversized unbroken word must still break at a character');
  assert.equal(unbroken.lines.map(line=>line.text).join(''),'ABCDEFGHIJK');
});


test('a hyphen joining digits does not begin a new line when an earlier space can break', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},wordWrap:false},children:[
    {type:'run',children:[{type:'text',value:'aaa 123-180'}]}
  ]};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:28,measurer:fixedMeasurer});
  assert.deepEqual(block.lines.map(line=>line.text),['aaa','123-180']);
});

test('noLineBreaksAfter carries an opening punctuation mark to the next line', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{languages:{eastAsia:'ko-KR'}},children:[{type:'text',value:'A(B'}]}]};
  const block=layoutParagraph(p,{
    x:0,y:0,widthPt:8,measurer:fixedMeasurer,
    lineBreaker:createLineBreaker({noLineBreaksAfter:'(',noLineBreaksAfterLanguage:'ko-KR'})
  });
  assert.deepEqual(block.lines.map(line=>line.text),['A','(B']);
});

test('precomputed numbering label participates in paragraph measurement as ordinary inline content', () => {
  const p={
    type:'paragraph',
    style:{runProperties:{size:18},wordWrap:false},
    numberingLabel:{text:'1.',suffix:'space',style:{size:18}},
    children:[{type:'run',children:[{type:'text',value:'Item'}]}]
  };
  const block=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  assert.equal(block.lines[0].text,'1. Item');
});


test('numbering suffix tab advances only across the hanging-indent area', () => {
  const p={
    type:'paragraph',
    style:{
      indentation:{left:720,hanging:360},
      tabs:[{value:'num',position:720}],
      runProperties:{size:18}
    },
    numberingLabel:{text:'•',suffix:'tab',style:{size:18}},
    children:[{type:'run',children:[{type:'text',value:'Item'}]}]
  };
  const block=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  const line=block.lines[0];
  const bullet=line.fragments[0];
  const tab=line.fragments[1];
  const item=line.fragments[2];
  assert.equal(block.indentation.leftPt,36);
  assert.equal(block.indentation.firstLineOffsetPt,-18);
  assert.equal(tab.widthPt,14); // 18 pt hanging span minus 4 pt bullet width
  assert.equal(bullet.widthPt + tab.widthPt,18);
  assert.equal(item.text,'Item');
});

test('footnote reference label participates in ordinary line measurement as superscript metadata', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[
    {type:'text',value:'Body'},
    {type:'footnote-reference',id:4,displayLabel:'1'}
  ]}]};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:createTextMeasurer()});
  assert.equal(block.lines[0].text,'Body1');
  const ref=block.lines[0].fragments.find(fragment=>fragment.footnoteReference);
  assert.ok(ref);
  assert.equal(ref.footnoteId,4);
  assert.ok(ref.style.baselineShiftPt > 0);
});

test('advanced footnote placement/restart policy degrades explicitly through diagnostics', () => {
  const ir={
    type:'document',resources:{},settings:{},headers:{},footers:{},
    sections:[{properties:{footnotes:{position:'beneathText',restart:'eachPage'}},children:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[{type:'text',value:'x'},{type:'footnote-reference',id:1,displayLabel:'1'}]}]}]}],
    footnotes:{1:{id:1,type:'normal',displayLabel:'1',content:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[{type:'footnote-ref',footnoteId:1,displayLabel:'1'},{type:'text',value:' note'}]}]}]}}
  };
  const layout=layoutDocument(ir);
  assert.ok(layout.diagnostics.some(item=>item.code==='footnote-each-page-restart-fallback'));
  assert.ok(layout.diagnostics.some(item=>item.code==='footnote-position-fallback'));
  assert.ok(layout.pages[0].footnotes);
});

test('page footnote attachment preserves measured vertical offsets between multiple notes', () => {
  const note = (id, label, text) => ({
    id, type:'normal', displayLabel:label,
    content:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[
      {type:'footnote-ref',footnoteId:id,displayLabel:label},
      {type:'text',value:` ${text}`}
    ]}]}]
  });
  const ir={
    type:'document',resources:{},settings:{},headers:{},footers:{},
    sections:[{properties:{pageSize:{width:4000,height:4000},margins:{top:200,right:200,bottom:200,left:200}},children:[
      {type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[
        {type:'text',value:'A'},
        {type:'footnote-reference',id:1,displayLabel:'1'},
        {type:'text',value:' B '},
        {type:'footnote-reference',id:2,displayLabel:'2'}
      ]}]}
    ]}],
    footnotes:{1:note(1,'1','first note'),2:note(2,'2','second note')}
  };
  const layout=layoutDocument(ir,{measurer:fixedMeasurer});
  const blocks=layout.pages[0].footnotes?.blocks || [];
  assert.equal(blocks.length,2);
  assert.ok(blocks[1].y > blocks[0].y, `expected second footnote below first: ${blocks[0].y} -> ${blocks[1].y}`);
  assert.ok(blocks[1].y >= blocks[0].y + blocks[0].heightPt - 0.01);
});

test('oversized footnote story continues onto a following physical page', () => {
  const longText = Array.from({length:1200}, (_,i)=>`word${i}`).join(' ');
  const ir={
    type:'document',resources:{},settings:{},headers:{},footers:{},
    sections:[{properties:{},children:[
      {type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[
        {type:'text',value:'Body'}, {type:'footnote-reference',id:1,displayLabel:'1'}
      ]}]}
    ]}],
    footnotes:{1:{id:1,type:'normal',displayLabel:'1',content:[{type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{size:18},children:[
      {type:'footnote-ref',footnoteId:1,displayLabel:'1'}, {type:'text',value:` ${longText}`}
    ]}]}]}}
  };
  const layout=layoutDocument(ir,{page:{pageWidthPt:180,pageHeightPt:120,margins:{top:10,right:10,bottom:10,left:10},columnCount:1,columnGapPt:0},measurer:fixedMeasurer});
  assert.ok(layout.pages.length >= 2, `expected continuation page, got ${layout.pages.length}`);
  assert.ok(layout.pages[0].footnotes?.blocks?.length);
  assert.ok(layout.pages[1].footnotes?.blocks?.length);
  assert.equal(layout.pages[1].isFootnoteContinuationPage, true);
  assert.ok((layout.pages[0].footnotes.heightPt || 0) <= (layout.pages[0].heightPt || Infinity));
});

test('unsupported section-end endnote placement is explicit fallback rather than hidden behavior', () => {
  const ir={type:'document',resources:{},settings:{},headers:{},footers:{},footnotes:{},sections:[{properties:{endnotes:{position:'sectEnd'}},children:[]}],endnotes:{}};
  const layout=layoutDocument(ir);
  assert.ok(layout.diagnostics.some(item=>item.code==='endnote-position-fallback'));
});

test('hyperlinks and bookmarks survive text layout as inline metadata without changing width', () => {
  const p = {
    type: 'paragraph', style: { runProperties: { size: 18 } }, children: [
      { type: 'bookmark-start', name: 'Target', id: '0' },
      { type: 'hyperlink', target: 'https://example.com/', targetMode: 'External', children: [
        { type: 'run', children: [{ type: 'text', value: 'Link' }] }
      ] },
      { type: 'hyperlink', anchor: 'Target', children: [
        { type: 'run', children: [{ type: 'text', value: 'Back' }] }
      ] }
    ]
  };
  const block = layoutParagraph(p, { x: 0, y: 0, widthPt: 100, measurer: fixedMeasurer });
  const fragments = block.lines.flatMap(line => line.fragments);
  assert.equal(fragments.find(f => f.type === 'bookmark')?.bookmarkName, 'Target');
  assert.equal(fragments.find(f => f.text === 'Link')?.link?.target, 'https://example.com/');
  assert.equal(fragments.find(f => f.text === 'Back')?.link?.anchor, 'Target');
});

test('symbol inline uses its declared Word symbol font without a separate renderer path', () => {
  const seen = [];
  const measurer = { measure(text, style) { seen.push([text, style.fontFamily]); return { widthPt: 5, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }; } };
  const p = { type:'paragraph', style:{runProperties:{size:18}}, children:[{type:'run',children:[{type:'symbol',value:'\uF0B7',font:'Symbol'}]}] };
  const block = layoutParagraph(p, { x:0, y:0, widthPt:100, measurer });
  assert.equal(block.lines[0].text, '\uF0B7');
  assert.match(seen[0][1], /^Symbol/);
});

test('REF field resolves bookmark text when document field context provides it', () => {
  const measurer = createTextMeasurer({ fallbackAverageWidthFactor: 0.5 });
  const paragraph = {
    type: 'paragraph', style: { runProperties: { size: 18 } }, children: [
      { type: 'field', instruction: 'REF Target \h', children: [
        { type: 'run', style: { size: 18 }, children: [{ type: 'text', value: 'stale cached value' }] }
      ] }
    ]
  };
  const block = layoutParagraph(paragraph, { x:0, y:0, widthPt:200, measurer, fieldContext:{ bookmarkTexts:{ Target:'Bookmark text' } } });
  assert.equal(block.lines.map(line => line.text).join(''), 'Bookmark text');
});

test('field-based hyperlinks preserve cached field result as clickable inline metadata', () => {
  const measurer = createTextMeasurer({ fallbackAverageWidthFactor: 0.5 });
  const paragraph = {
    type: 'paragraph',
    style: { runProperties: { size: 18 } },
    children: [
      { type: 'field', instruction: 'HYPERLINK "https://example.com"', children: [
        { type: 'run', style: { size: 18 }, children: [{ type: 'text', value: 'Example' }] }
      ] },
      { type: 'field', instruction: 'REF Target \\h', children: [
        { type: 'run', style: { size: 18 }, children: [{ type: 'text', value: 'Target text' }] }
      ] }
    ]
  };
  const block = layoutParagraph(paragraph, { x: 0, y: 0, widthPt: 200, measurer });
  const fragments = block.lines.flatMap(line => line.fragments).filter(fragment => fragment.text);
  assert.equal(fragments[0].link.target, 'https://example.com');
  assert.equal(fragments.at(-1).link.anchor, 'Target');
});

test('caps transforms displayed and measured text to uppercase', () => {
  const seen = [];
  const measurer = { measure(text, style) { seen.push(text); return { widthPt: 4, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }; } };
  const p = { type:'paragraph', style:{ runProperties:{ size:18 } }, children:[{ type:'run', style:{ size:18, caps:true }, children:[{type:'text', value:'Abc'}] }] };
  const block = layoutParagraph(p,{x:0,y:0,widthPt:100,measurer});
  assert.equal(block.lines[0].text,'ABC');
  assert.deepEqual(seen.slice(0,3), ['A','B','C']);
});

test('smallCaps uses reduced uppercase glyphs only for lowercase letters', () => {
  const seen = [];
  const measurer = { measure(text, style) { seen.push([text, style.fontSizePt]); return { widthPt: style.fontSizePt, ascentPt: 7, descentPt: 2, lineHeightPt: 9 }; } };
  const p = { type:'paragraph', style:{ runProperties:{ size:20 } }, children:[{ type:'run', style:{ size:20, smallCaps:true }, children:[{type:'text', value:'Ab'}] }] };
  const block = layoutParagraph(p,{x:0,y:0,widthPt:100,measurer});
  assert.equal(block.lines[0].text,'AB');
  assert.equal(seen[0][1],10);
  assert.equal(seen[1][1],8);
});

test('bidi paragraph defaults to right alignment when jc is absent', () => {
  const p={type:'paragraph',style:{bidi:true,runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'abc'}]}]};
  const block=layoutParagraph(p,{x:10,y:0,widthPt:100,measurer:fixedMeasurer});
  assert.equal(block.lines[0].x,98);
});

test('table flow uses floating wrap exclusion when the table vertically intersects the float', () => {
  const anchor = {
    type: 'image',
    extent: { cx: 80 * 12700, cy: 40 * 12700 },
    positioning: {
      mode: 'anchor',
      horizontal: { relativeFrom: 'page', offset: 20 * 12700 },
      vertical: { relativeFrom: 'page', offset: 15 * 12700 },
      wrap: { type: 'wrapSquare' }
    }
  };
  const anchorParagraph = {
    type: 'paragraph',
    style: { runProperties: { size: 18 } },
    children: [{ type: 'run', children: [anchor] }]
  };
  const table = {
    type: 'table',
    properties: { width: { type: 'pct', value: 5000 } },
    grid: [2000, 2000],
    rows: [{
      type: 'row', properties: {}, cells: [
        { type: 'cell', properties: {}, children: [{ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: 'left cell content' }] }] }] },
        { type: 'cell', properties: {}, children: [{ type: 'paragraph', style: { runProperties: { size: 18 } }, children: [{ type: 'run', children: [{ type: 'text', value: 'right cell content' }] }] }] }
      ]
    }]
  };
  const layout = layoutDocument(
    { sections: [{ children: [anchorParagraph, table] }], resources: {} },
    { page: { pageWidthPt: 200, pageHeightPt: 200, margins: { top: 0, right: 0, bottom: 0, left: 0 }, columnCount: 1 }, measurer: fixedMeasurer }
  );
  const tableBlock = layout.pages[0].columns[0].blocks.find(block => block.type === 'table');
  assert.ok(tableBlock);
  assert.ok(tableBlock.y < 55 && tableBlock.y + tableBlock.heightPt > 15, 'fixture must vertically intersect the float');
  assert.equal(tableBlock.x, 100);
  assert.equal(tableBlock.widthPt, 100);
});

test('section column separator is precomputed between adjacent columns', () => {
  const ir={sections:[{properties:{pageSize:{width:8000,height:6000},margins:{top:200,right:200,bottom:200,left:200},columns:{count:2,space:400,separator:'1'}},children:[
    {type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'A '.repeat(80)}]}]}
  ]}],resources:{}};
  const layout=layoutDocument(ir,{measurer:fixedMeasurer});
  const region=layout.pages[0].regions[0];
  assert.equal(region.columns.length,2);
  assert.equal(region.columnSeparators.length,1);
  const separator=region.columnSeparators[0];
  const left=region.columns[0], right=region.columns[1];
  assert.equal(separator.x,(left.x+left.widthPt+right.x)/2);
  assert.equal(separator.y,region.y);
  assert.equal(separator.heightPt,region.heightPt);
});

test('odd/even section breaks insert a bounded parity blank page only when needed', () => {
  const paragraph = text => ({ type:'paragraph', style:{runProperties:{size:18}}, children:[{type:'run',children:[{type:'text',value:text}]}] });
  const ir = { settings:{}, resources:{}, headers:{}, footers:{}, footnotes:{}, endnotes:{}, sections:[
    { properties:{}, children:[paragraph('Section A')] },
    { properties:{ type:'oddPage' }, children:[paragraph('Section B')] },
    { properties:{ type:'evenPage' }, children:[paragraph('Section C')] }
  ] };
  const layout = layoutDocument(ir, { page:{ pageWidthPt:200, pageHeightPt:200, margins:{top:10,right:10,bottom:10,left:10} }, measurer:fixedMeasurer });
  assert.equal(layout.pages.length, 4);
  assert.deepEqual(layout.pages.map(page => page.sectionOwnerIndex), [0,0,1,2]);
  assert.equal(layout.pages[1].isSectionParityBlank, true);
  assert.equal(layout.pages[1].regions.length, 0);
  const textByPage = layout.pages.map(page => (page.columns || []).flatMap(column => column.blocks || []).flatMap(block => block.lines || []).map(line => line.text).join(''));
  assert.deepEqual(textByPage, ['Section A', '', 'Section B', 'Section C']);
});

test('mirrorMargins swaps physical page sides and applies gutter to the binding edge', () => {
  const paragraph = text => ({ type:'paragraph', style:{runProperties:{size:18}}, children:[{type:'run',children:[{type:'text',value:text}]}] });
  const ir = {
    settings:{ mirrorMargins:true }, resources:{}, headers:{}, footers:{}, footnotes:{}, endnotes:{},
    sections:[{ properties:{
      pageSize:{width:4000,height:2400},
      margins:{top:200,right:1200,bottom:200,left:600,header:100,footer:100,gutter:400}
    }, children:Array.from({length:18},(_,i)=>paragraph(`Mirrored page paragraph ${i+1}. ${'content '.repeat(8)}`)) }]
  };
  const layout = layoutDocument(ir, { measurer:fixedMeasurer });
  assert.ok(layout.pages.length >= 2);
  const odd = layout.pages[0].regions[0];
  const even = layout.pages[1].regions[0];
  assert.equal(odd.x, 50);   // 30pt left + 20pt gutter
  assert.equal(odd.widthPt, 90);
  assert.equal(even.x, 60); // mirrored right margin becomes physical left
  assert.equal(even.widthPt, 90);
  assert.equal(layout.pages[0].margins.left, 50);
  assert.equal(layout.pages[0].margins.right, 60);
  assert.equal(layout.pages[1].margins.left, 60);
  assert.equal(layout.pages[1].margins.right, 50);
});

test('paragraph beforeLines/afterLines spacing uses line-relative units when twip spacing is absent', () => {
  const p={type:'paragraph',style:{runProperties:{size:20},spacing:{beforeLines:50,afterLines:100}},children:[{type:'run',children:[{type:'text',value:'line spacing units'}]}]};
  const result=layoutParagraph(p,{x:0,y:10,widthPt:200,measurer:fixedMeasurer});
  // 10pt font -> default 12pt line unit; 50/100 and 100/100 line spacing.
  assert.equal(result.spacingBeforePt,6);
  assert.equal(result.spacingAfterPt,12);
  assert.equal(result.lines[0].y,16);
});

test('explicit paragraph before/after twips take precedence over beforeLines/afterLines', () => {
  const p={type:'paragraph',style:{runProperties:{size:20},spacing:{before:100,after:120,beforeLines:300,afterLines:300}},children:[{type:'run',children:[{type:'text',value:'explicit wins'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  assert.equal(result.spacingBeforePt,5);
  assert.equal(result.spacingAfterPt,6);
});

test('character-based paragraph indentation uses active font metrics when twip indentation is absent', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},indentation:{leftChars:200,rightChars:100,firstLineChars:150}},children:[{type:'run',children:[{type:'text',value:'character indentation'}]}]};
  const result=layoutParagraph(p,{x:10,y:20,widthPt:100,measurer:fixedMeasurer});
  assert.equal(result.indentation.characterWidthPt,4);
  assert.equal(result.indentation.leftPt,8);
  assert.equal(result.indentation.rightPt,4);
  assert.equal(result.indentation.firstLineOffsetPt,6);
  assert.ok(result.lines[0].x >= 24);
});

test('character-based hanging indent uses a negative active-font offset', () => {
  const p={type:'paragraph',style:{runProperties:{size:18},indentation:{leftChars:200,hangingChars:100}},children:[{type:'run',children:[{type:'text',value:'hanging indentation wraps to the paragraph body'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:60,measurer:fixedMeasurer});
  assert.equal(result.indentation.leftPt,8);
  assert.equal(result.indentation.firstLineOffsetPt,-4);
  assert.equal(result.lines[0].x,4);
  if (result.lines.length > 1) assert.equal(result.lines[1].x,8);
});

test('complex-script runs prefer cs font/size/bold/italic overrides without a shaping engine', () => {
  const p={type:'paragraph',style:{runProperties:{}},children:[{type:'run',style:{
    fonts:{ascii:'Times New Roman',hAnsi:'Times New Roman',cs:'Arial'},
    size:20,sizeCs:30,bold:true,boldCs:false,italic:false,italicCs:true,rtl:true
  },children:[{type:'text',value:'שלום'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  const fragment=result.lines[0].fragments.find(item=>item.type==='text');
  assert.equal(fragment.style.fontSizePt,15);
  assert.match(fragment.style.fontFamily,/Arial/);
  assert.equal(fragment.style.bold,false);
  assert.equal(fragment.style.italic,true);
});

test('paragraph border space insets text from the painted border without a new box model', () => {
  const p={type:'paragraph',style:{
    runProperties:{size:18},
    borders:{
      top:{value:'single',space:3},
      right:{value:'single',space:5},
      bottom:{value:'single',space:4},
      left:{value:'single',space:6}
    }
  },children:[{type:'run',children:[{type:'text',value:'border spacing'}]}]};
  const result=layoutParagraph(p,{x:10,y:20,widthPt:100,measurer:fixedMeasurer});
  assert.deepEqual(result.borderInsetsPt,{top:3,right:5,bottom:4,left:6});
  assert.equal(result.contentXPt,16);
  assert.equal(result.contentWidthPt,89);
  assert.equal(result.lines[0].y,23);
  assert.equal(result.lines[0].x,16);
  assert.ok(result.heightPt >= result.lines[0].heightPt + 7);
});

test('adjacent runs with different highlight/shading/border spacing remain distinct fragments', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[
    {type:'run',style:{size:18,highlight:'yellow',border:{value:'single',size:8,space:1,color:'FF0000'},shading:{value:'clear',fill:'FFF2CC'}},children:[{type:'text',value:'A'}]},
    {type:'run',style:{size:18,highlight:'green',border:{value:'single',size:8,space:2,color:'FF0000'},shading:{value:'clear',fill:'E2F0D9'}},children:[{type:'text',value:'B'}]}
  ]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:200,measurer:fixedMeasurer});
  const fragments=result.lines[0].fragments.filter(fragment=>fragment.type==='text');
  assert.equal(fragments.length,2);
  assert.equal(fragments[0].text,'A');
  assert.equal(fragments[1].text,'B');
  assert.equal(fragments[0].style.highlight,'yellow');
  assert.equal(fragments[1].style.highlight,'green');
  assert.equal(fragments[0].style.border.space,1);
  assert.equal(fragments[1].style.border.space,2);
});

test('wrap-specific top/bottom distances expand the exclusion vertically', () => {
  const paragraph={type:'paragraph',style:{runProperties:{size:18},spacing:{line:200,lineRule:'exact'}},children:[{type:'run',children:[
    {type:'image',extent:{cx:50*12700,cy:20*12700},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:100*12700},vertical:{relativeFrom:'page',offset:20*12700},distanceTop:0,distanceBottom:0,wrap:{type:'wrapSquare',distanceTop:10*12700,distanceBottom:15*12700}}},
    {type:'text',value:'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ'}
  ]}]};
  const layout=layoutDocument({sections:[{children:[paragraph]}],resources:{}},{page:{pageWidthPt:300,pageHeightPt:200,margins:{top:0,right:0,bottom:0,left:0},columnCount:1},measurer:fixedMeasurer});
  const exclusion=layout.pages[0].exclusions[0];
  assert.equal(exclusion.y,10);
  assert.equal(exclusion.heightPt,45);
});

test('wrapText right keeps line flow on the right side of a single floating exclusion', () => {
  const paragraph={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[
    {type:'image',extent:{cx:60*12700,cy:60*12700},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:100*12700},vertical:{relativeFrom:'page',offset:0},wrap:{type:'wrapSquare',wrapText:'right'}}},
    {type:'text',value:'ABCDEFGHIJK'}
  ]}]};
  const layout=layoutDocument({sections:[{children:[paragraph]}],resources:{}},{page:{pageWidthPt:300,pageHeightPt:200,margins:{top:0,right:0,bottom:0,left:0},columnCount:1},measurer:fixedMeasurer});
  const line=layout.pages[0].columns[0].blocks[0].lines[0];
  assert.equal(line.flowBox.x,160);
  assert.equal(line.availableWidthPt,140);
});

test('wrapText left keeps line flow on the left side even when the right side is wider', () => {
  const paragraph={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[
    {type:'image',extent:{cx:60*12700,cy:60*12700},positioning:{mode:'anchor',horizontal:{relativeFrom:'page',offset:80*12700},vertical:{relativeFrom:'page',offset:0},wrap:{type:'wrapSquare',wrapText:'left'}}},
    {type:'text',value:'ABCDEFGHIJK'}
  ]}]};
  const layout=layoutDocument({sections:[{children:[paragraph]}],resources:{}},{page:{pageWidthPt:300,pageHeightPt:200,margins:{top:0,right:0,bottom:0,left:0},columnCount:1},measurer:fixedMeasurer});
  const line=layout.pages[0].columns[0].blocks[0].lines[0];
  assert.equal(line.flowBox.x,0);
  assert.equal(line.availableWidthPt,80);
});

test('soft break opportunities survive adjacent-style fragment merging so Latin text stays within the line box', () => {
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:'alpha beta gamma delta'}]}]};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:45,measurer:fixedMeasurer});
  assert.ok(block.lines.length > 1);
  assert.ok(block.lines.every(line => line.widthPt <= 45 + 0.001));
  assert.equal(block.lines.map(line=>line.text).join('').replace(/\s+/g,''),'alphabetagammadelta');
});

test('body flow starts below an oversized first-page header instead of overlapping it', () => {
  const para=text=>({type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',children:[{type:'text',value:text}]}]});
  const ir={
    settings:{},resources:{},
    headers:{h1:{content:[para('header one'),para('header two'),para('header three')]}},footers:{},
    sections:[{
      properties:{pageSize:{width:2400,height:3000},margins:{top:300,right:200,bottom:300,left:200,header:100,footer:100},titlePage:true},
      headerRefs:[{type:'first',relationshipId:'h1'}],footerRefs:[],children:[para('body')]
    }]
  };
  const layout=layoutDocument(ir,{measurer:fixedMeasurer});
  const page=layout.pages[0];
  const body=page.regions[0].columns[0].blocks[0];
  assert.ok(page.header.heightPt > page.layoutContext.margins.top - page.layoutContext.margins.header);
  assert.ok(body.y >= page.header.y + page.header.heightPt - 0.001);
});

test('adjacent paragraph before/after spacing collapses to the larger value', () => {
  const styleA={ spacing:{after:480}, runProperties:{size:18} };
  const styleB={ spacing:{before:240}, runProperties:{size:18} };
  const p=(text,style)=>({type:'paragraph',style,children:[{type:'run',style:{size:18},children:[{type:'text',value:text}]}]});
  const make=node=>{ const f=({x,y,widthPt})=>layoutParagraph(node,{x,y,widthPt,measurer:fixedMeasurer}); f.kind='paragraph'; return f; };
  const context={pageWidthPt:300,pageHeightPt:300,margins:{top:20,right:20,bottom:20,left:20,header:10,footer:10},bodyWidthPt:260,columnCount:1,columnGapPt:0,columnDefinitions:[]};
  const pages=paginate([make(p('A',styleA)),make(p('B',styleB))],context);
  const [a,b]=pages[0].columns[0].blocks;
  const aContentBottom=a.lines.at(-1).y+a.lines.at(-1).heightPt;
  assert.equal(b.lines[0].y-aContentBottom,24);
});

test('break-only paragraph overflowing the page bottom does not create an extra blank page', () => {
  const p = children => ({
    type: 'paragraph',
    style: { runProperties: { size: 18 }, spacing: { line: 400, lineRule: 'exact' } },
    children: [{ type: 'run', children }]
  });
  const ir = {
    settings: {}, resources: {}, headers: {}, footers: {}, footnotes: {}, endnotes: {}, comments: {},
    sections: [{
      properties: {
        pageSize: { width: 2000, height: 1400 },
        margins: { top: 400, right: 200, bottom: 400, left: 200, header: 100, footer: 100 },
        columns: { count: 1, definitions: [] }
      },
      headerRefs: [], footerRefs: [],
      children: [
        p([{ type: 'text', value: 'A' }]),
        p([{ type: 'break', breakType: 'page' }]),
        p([{ type: 'text', value: 'B' }])
      ]
    }]
  };
  const layout = layoutDocument(ir, { measurement: { useCanvas: false } });
  assert.equal(layout.pages.length, 2);
  const page2Text = layout.pages[1].regions[0].columns[0].blocks
    .flatMap(block => block.lines || [])
    .flatMap(line => line.fragments || [])
    .map(fragment => fragment.text || '')
    .join('');
  assert.match(page2Text, /B/);
});

test('numbering label symbol font does not inflate body line height', () => {
  const paragraph={
    type:'paragraph',
    computedStyle:{runProperties:{fonts:{ascii:'Liberation Serif'},size:24},indentation:{left:720,hanging:360}},
    numberingLabel:{text:'●',suffix:'tab',style:{fonts:{ascii:'Wingdings',hAnsi:'Wingdings'},size:24}},
    children:[{type:'run',style:{fonts:{ascii:'Liberation Serif'},size:24},children:[{type:'text',value:'one'}]}]
  };
  const measurer={measure(text,style){const symbol=String(style.fontFamily||'').includes('Wingdings'); return {widthPt:6,ascentPt:9,descentPt:3,lineHeightPt:symbol?24.75:13.5};}};
  const out=layoutParagraph(paragraph,{x:0,y:0,widthPt:300,measurer});
  assert.equal(out.lineHeightPt,13.5);
  assert.equal(out.lines[0].naturalHeightPt,13.5);
});


test('rtl run uses complex-script font for spaces punctuation and Latin characters', () => {
  const p={type:'paragraph',style:{runProperties:{}},children:[{type:'run',style:{rtl:true,size:20,sizeCs:30,bold:true,boldCs:false,italic:false,italicCs:true,fonts:{ascii:'Times New Roman',hAnsi:'Times New Roman',cs:'Arial',primary:'Times New Roman'}},children:[{type:'text',value:'שלום - ABC'}]}]};
  const measurer={measure:(text,style)=>({widthPt:String(text).length*5,ascentPt:8,descentPt:2})};
  const block=layoutParagraph(p,{x:0,y:0,widthPt:500,measurer,fontResolver:name=>name});
  const fragments=block.lines.flatMap(line=>line.fragments||[]).filter(f=>f.type==='text');
  const mixed=fragments.filter(f=>/[-ABC ]/.test(f.text||''));
  assert.ok(mixed.length>0);
  for(const fragment of mixed){
    assert.equal(fragment.style.fontFamily,'Arial');
    assert.equal(fragment.style.fontSizePt,15);
    assert.equal(fragment.style.bold,false);
    assert.equal(fragment.style.italic,true);
  }
});

test('revision markup metadata reaches text fragments without changing ordinary paragraph metrics', () => {
  const measurer={measure:text=>({widthPt:String(text).length*5,ascentPt:7,descentPt:2,lineHeightPt:9})};
  const base={type:'paragraph',style:{runProperties:{fontSize:18}},children:[{type:'run',style:{},children:[{type:'text',value:'NEW'}]}]};
  const marked={type:'paragraph',style:{runProperties:{fontSize:18}},children:[{type:'revision',revision:{kind:'ins',id:'2',author:'Bob'},children:[{type:'run',style:{},children:[{type:'text',value:'NEW'}]}]}]};
  const plainLayout=layoutParagraph(base,{x:0,y:0,widthPt:200,measurer});
  const markedLayout=layoutParagraph(marked,{x:0,y:0,widthPt:200,measurer});
  assert.equal(markedLayout.widthPt,plainLayout.widthPt);
  assert.equal(markedLayout.heightPt,plainLayout.heightPt);
  assert.equal(markedLayout.lines[0].text,plainLayout.lines[0].text);
  assert.equal(markedLayout.lines[0].fragments[0].revision.kind,'ins');
  assert.equal(markedLayout.lines[0].fragments[0].revision.author,'Bob');
});

test('trailing empty paragraph stays on the current page when its line box fits', () => {
  const visible={type:'paragraph',style:{runProperties:{size:18},spacing:{line:400,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:'visible'}]}]};
  const empty={type:'paragraph',style:{runProperties:{size:18},spacing:{line:280,lineRule:'atLeast'}},children:[]};
  const ir={sections:[{children:[visible,empty]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:60,margins:{top:10,right:10,bottom:10,left:10},columnCount:1},measurer:fixedMeasurer});
  assert.equal(layout.pages.length,1);
  const blocks=layout.pages[0].columns[0].blocks;
  assert.equal(blocks.length,2);
  assert.equal(blocks[1].lines.length,1);
  assert.equal(blocks[1].lines[0].text,'');
  assert.equal(blocks[1].heightPt,14);
});

test('trailing empty paragraph creates a new page when its real line box does not fit', () => {
  const visible={type:'paragraph',style:{runProperties:{size:18},spacing:{line:400,lineRule:'exact'}},children:[{type:'run',children:[{type:'text',value:'visible'}]}]};
  const empty={type:'paragraph',style:{runProperties:{size:18},spacing:{line:280,lineRule:'atLeast'}},children:[]};
  const ir={sections:[{children:[visible,empty]}],resources:{}};
  const layout=layoutDocument(ir,{page:{pageWidthPt:120,pageHeightPt:50,margins:{top:10,right:10,bottom:10,left:10},columnCount:1},measurer:fixedMeasurer});
  assert.equal(layout.pages.length,2);
  const second=layout.pages[1].columns[0].blocks;
  assert.equal(second.length,1);
  assert.equal(second[0].lines[0].text,'');
  assert.equal(second[0].heightPt,14);
});

test('ordinary paragraph does not enable the table-only trailing-spacing split policy', () => {
  const lines = Array.from({length: 4}, (_, i) => ({ x:0, y:i*17.5, heightPt:17.5, fragments:[] }));
  const block = { type:'paragraph', x:0, y:0, widthPt:100, heightPt:80,
    spacingBeforePt:0, spacingAfterPt:10, keepLines:false, widowControl:true, lines };
  assert.equal(splitParagraphForHeight(block, 70.5), null);
});
