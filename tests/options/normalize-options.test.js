import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions } from '../../src/options/normalize-options.js';

test('zero-config stays zero-config', () => {
  const out = normalizeOptions({});
  assert.equal(out.parser, undefined);
  assert.equal(out.changes, undefined);
  assert.equal(out.loadEmbeddedFonts, undefined);
});

test('revisions true expands to markup + review', () => {
  const out = normalizeOptions({ revisions:true });
  assert.equal(out.parser.revisionMode, 'markup');
  assert.equal(out.changes.style, 'review');
  assert.equal(out.changes.indicators, true);
});

test('revisions object exposes advanced review controls without parser knowledge', () => {
  const out = normalizeOptions({ revisions:{ mode:'markup', style:'word' } });
  assert.equal(out.parser.revisionMode, 'markup');
  assert.equal(out.changes.style, 'word');
  assert.equal(out.changes.indicators, true);
});

test('changesPanel accepts a target or UI object', () => {
  const target={appendChild(){}};
  assert.equal(normalizeOptions({changesPanel:target}).changes.ui.target,target);
  const out=normalizeOptions({changesPanel:{target:'#review',style:'none',filter:'insert'}});
  assert.deepEqual(out.changes.ui,{target:'#review',style:'none',filter:'insert'});
});

test('fonts shorthand maps only user-meaningful font controls', () => {
  assert.deepEqual(pick(normalizeOptions({fonts:false}),['loadEmbeddedFonts','waitForFonts']),{loadEmbeddedFonts:false,waitForFonts:false});
  assert.deepEqual(pick(normalizeOptions({fonts:{embedded:false,waitUntilReady:true}}),['loadEmbeddedFonts','waitForFonts']),{loadEmbeddedFonts:false,waitForFonts:true});
});

test('advanced and legacy direct options remain open, with legacy direct values winning', () => {
  const out=normalizeOptions({
    revisions:true,
    advanced:{parser:{revisionMode:'final',customA:1},layout:{x:1},renderer:{y:2}},
    parser:{revisionMode:'markup',customB:2},
    layout:{x:3},
    changes:{style:'none'}
  });
  assert.deepEqual(out.parser,{revisionMode:'markup',customA:1,customB:2});
  assert.deepEqual(out.layout,{x:3});
  assert.deepEqual(out.renderer,{y:2});
  assert.equal(out.changes.style,'none');
});

function pick(o,keys){return Object.fromEntries(keys.map(k=>[k,o[k]]));}

test('revision margin indicators can be disabled without disabling markup', () => {
  const out=normalizeOptions({revisions:{mode:'markup',indicators:false}});
  assert.equal(out.parser.revisionMode,'markup');
  assert.equal(out.changes.indicators,false);
  assert.equal(out.changes.style,'review');
});
