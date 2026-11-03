/** Phase 49-B parser safety scenarios, now executable via npm test in Actions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { openPackage } from '../../src/parser/package-reader.js';
import { parseDocument } from '../../src/parser/document-parser.js';

const sample = () => readFile(new URL('../fixtures/corpus/diagnostics/paragraph-spacing.docx', import.meta.url));
async function makeZip(entries) {
  const z = new JSZip();
  for (const [name, content] of Object.entries(entries)) z.file(name, content);
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
async function rejectCode(promise, code) {
  await assert.rejects(promise, error => !code || error?.code === code);
}

test('S01 reject non-zip input', async () => rejectCode(openPackage(Buffer.from('not a ZIP')), 'INVALID_DOCX_PACKAGE'));
test('S02 reject truncated zip input', async () => rejectCode(openPackage((await sample()).subarray(0, 50)), 'INVALID_DOCX_PACKAGE'));
test('S03 compressed source limit enforced', async () => rejectCode(openPackage(await sample(), { packageLimits: { maxSourceBytes: 64 } }), 'DOCX_SIZE_LIMIT'));
test('S04 archive entry-count limit enforced', async () => rejectCode(openPackage(await makeZip({ a: 'a', b: 'b', c: 'c' }), { packageLimits: { maxEntryCount: 2 } }), 'DOCX_SIZE_LIMIT'));
test('S05 expanded part limit enforced', async () => rejectCode(openPackage(await makeZip({ a: Buffer.alloc(32768, 65) }), { packageLimits: { maxPartBytes: 16000 } }), 'DOCX_SIZE_LIMIT'));
test('S06 cumulative expansion limit enforced', async () => rejectCode(openPackage(await makeZip({ a: Buffer.alloc(10000, 65), b: Buffer.alloc(10000, 66) }), { packageLimits: { maxTotalExpandedBytes: 15000 } }), 'DOCX_SIZE_LIMIT'));
test('S07 compression bomb expansion cap enforced', async () => rejectCode(openPackage(await makeZip({ a: Buffer.alloc(1024*1024, 65) }), { packageLimits: { maxPartBytes: 64*1024 } }), 'DOCX_SIZE_LIMIT'));
test('S08 valid DOCX over smaller cap rejected', async () => { const bytes=await sample(); await rejectCode(openPackage(bytes,{packageLimits:{maxSourceBytes:bytes.length-1}}),'DOCX_SIZE_LIMIT'); });
test('S09 small valid zip works within strict limits', async () => {
  const data=await makeZip({a:'123',b:'456'});
  const pkg=await openPackage(data,{packageLimits:{maxEntryCount:2,maxPartBytes:6,maxTotalExpandedBytes:12}});
  assert.equal(await pkg.readText('a'),'123');
});
test('S10 empty archive does not parse as a document', async () => {
  await assert.rejects(parseDocument(await makeZip({}),{domParser:new DOMParser(),JSZipImpl:JSZip}));
});
test('S11 ZIP with missing main document rejected', async () => {
  await assert.rejects(parseDocument(await makeZip({'[Content_Types].xml':'<Types/>'}),{domParser:new DOMParser(),JSZipImpl:JSZip}));
});
test('S12 valid docx positive control parses content', async () => {
  const doc=await parseDocument(await sample(),{domParser:new DOMParser(),JSZipImpl:JSZip});
  assert.ok(doc.body?.length>0);
});
