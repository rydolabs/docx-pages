import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { openPackage, DEFAULT_PACKAGE_LIMITS } from '../../src/parser/package-reader.js';

async function sample(files) {
  const zip=new JSZip();
  for(const [name,content] of Object.entries(files))zip.file(name,content);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

test('normal compressed Word package is accepted within safety limits',async()=>{
  const pkg=await openPackage(await sample({'word/document.xml':'<w:document/>'}));
  assert.equal(await pkg.readText('word/document.xml'),'<w:document/>');
  assert.ok(DEFAULT_PACKAGE_LIMITS.maxSourceBytes>0);
});
test('reject oversized source before JSZip load',async()=>{
  let called=false;
  await assert.rejects(openPackage(new Uint8Array(8),{
    packageLimits:{maxSourceBytes:5},
    JSZipImpl:{loadAsync:async()=>{called=true;return null;}}
  }),err=>err.code==='DOCX_SIZE_LIMIT');
  assert.equal(called,false);
});
test('reject unexpectedly large expanded part before decompression',async()=>{
  const bytes=await sample({'word/document.xml':'A'.repeat(3000)});
  await assert.rejects(openPackage(bytes,{packageLimits:{maxPartBytes:1024}}),err=>err.code==='DOCX_SIZE_LIMIT');
});
test('reject cumulative expanded ZIP bomb risk before reading files',async()=>{
  const bytes=await sample({'word/document.xml':'A'.repeat(900),'word/styles.xml':'B'.repeat(900)});
  await assert.rejects(openPackage(bytes,{packageLimits:{maxPartBytes:1000,maxTotalExpandedBytes:1500}}),err=>err.code==='DOCX_SIZE_LIMIT');
});
test('reject excessive package entries',async()=>{
  const bytes=await sample({'a':'x','b':'y','c':'z'});
  await assert.rejects(openPackage(bytes,{packageLimits:{maxEntryCount:2}}),err=>err.code==='DOCX_SIZE_LIMIT');
});
