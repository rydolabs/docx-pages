import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import { renderAsync, mapDocxPreviewOptions } from '../../src/compat/index.js';

const fixture=new URL('../fixtures/track-changes/track-changes-basic.docx',import.meta.url);

const migrationCases=[
  ['minimal call', {}, {embedded:true,revisions:false}],
  ['explicit empty options', {}, {embedded:true,revisions:false}],
  ['disable embedded fonts', {ignoreFonts:true}, {embedded:false,revisions:false}],
  ['explicit font rendering', {ignoreFonts:false}, {embedded:true,revisions:false}],
  ['show tracked changes', {renderChanges:true}, {embedded:true,revisions:true}],
  ['final tracked-changes view', {renderChanges:false}, {embedded:true,revisions:false}],
  ['debug mode', {debug:true}, {embedded:true,revisions:false}],
  ['unsupported geometry option is diagnostic-only', {ignoreWidth:true,debug:true}, {embedded:true,revisions:false}],
  ['unsupported pagination option is diagnostic-only', {breakPages:false,debug:true}, {embedded:true,revisions:false}],
  ['unsupported header toggle is diagnostic-only', {renderHeaders:false,debug:true}, {embedded:true,revisions:false}],
  ['multiple unsupported options stay out of core layout', {ignoreHeight:true,inWrapper:false,className:'legacy',debug:true}, {embedded:true,revisions:false}],
];

for (const [name,input,expect] of migrationCases) {
  test(`migration corpus: ${name}`, () => {
    const out=mapDocxPreviewOptions(input);
    assert.equal(out.fonts.embedded,expect.embedded);
    assert.equal(Boolean(out.revisions),expect.revisions);
    assert.equal('layout' in out,false);
    assert.equal('renderer' in out,false);
  });
}

test('debug reports styleContainer as accepted-but-ignored migration argument', () => {
  const out=mapDocxPreviewOptions({debug:true},{styleContainer:{nodeType:1}});
  assert.deepEqual(out.compatibility.ignored,['styleContainer']);
});

test('renderAsync runs the real parser/layout pipeline for Uint8Array and ArrayBuffer', async () => {
  const old=globalThis.DOMParser; globalThis.DOMParser=DOMParser;
  try {
    const buf=await fs.readFile(fixture);
    const u8=new Uint8Array(buf.buffer,buf.byteOffset,buf.byteLength);
    const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
    const a=await renderAsync(u8,null,null,{});
    const b=await renderAsync(ab,null,null,{ignoreFonts:true});
    assert.ok(a.layout.pages.length>=1);
    assert.equal(b.layout.pages.length,a.layout.pages.length);
    assert.equal(a.ir.type,b.ir.type);
  } finally { if(old===undefined) delete globalThis.DOMParser; else globalThis.DOMParser=old; }
});

test('renderChanges maps to markup revision content in the real pipeline', async () => {
  const old=globalThis.DOMParser; globalThis.DOMParser=DOMParser;
  try {
    const buf=await fs.readFile(fixture);
    const final=await renderAsync(new Uint8Array(buf),null,null,{renderChanges:false});
    const markup=await renderAsync(new Uint8Array(buf),null,null,{renderChanges:true});
    assert.equal(final.changeIndex.counts.total,0);
    assert.ok(markup.changeIndex.counts.total>0);
    assert.equal(markup.layout.pages.length,final.layout.pages.length);
  } finally { if(old===undefined) delete globalThis.DOMParser; else globalThis.DOMParser=old; }
});
