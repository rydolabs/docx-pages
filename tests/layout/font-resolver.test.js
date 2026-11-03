import test from 'node:test';
import assert from 'node:assert/strict';
import { createFontResolver } from '../../src/layout/font-resolver.js';
import { layoutParagraph } from '../../src/layout/text-layout.js';

test('default font resolver keeps source Word font first and adds known fallbacks', () => {
  const resolve = createFontResolver();
  const family = resolve('Batang');
  assert.match(family, /^Batang,/);
  assert.match(family, /UnBatang/);
});

test('custom fontMap can inject a licensed webfont without changing layout code', () => {
  const resolve = createFontResolver({ fontMap: { Batang: ['KIMST Batang Web'] } });
  const p={type:'paragraph',style:{runProperties:{size:18}},children:[{type:'run',style:{fonts:{ascii:'Batang',eastAsia:'Batang'}},children:[{type:'text',value:'가'}]}]};
  const result=layoutParagraph(p,{x:0,y:0,widthPt:100,fontResolver:resolve,measurer:{measure:(t,s)=>({widthPt:5,ascentPt:7,descentPt:2,lineHeightPt:9})}});
  assert.match(result.lines[0].fragments[0].style.fontFamily,/KIMST Batang Web/);
});

test('legacy symbol families resolve through portable symbol-capable fallbacks', () => {
  const resolve=createFontResolver();
  const wing=resolve('Wingdings');
  assert.match(wing,/Wingdings/);
  assert.match(wing,/Noto Sans Symbols 2/);
  assert.match(wing,/Noto Sans Symbols/);
  const sym=resolve('Symbol');
  assert.match(sym,/Symbol/);
  assert.match(sym,/Noto Sans Symbols 2/);
});

test('optional Baekmuk Batang profile prioritizes the installed fallback without replacing the source family', () => {
  const ordinary = createFontResolver()('Batang');
  const configured = createFontResolver({ fontMap: { Batang: ['Baekmuk Batang'] } })('Batang');
  assert.match(ordinary, /^Batang, "UnBatang"/);
  assert.equal(configured, 'Batang, "Baekmuk Batang", "UnBatang", "Noto Serif CJK KR", serif');
  assert.equal(createFontResolver()('BatangChe').includes('Baekmuk Batang'), false);
});
