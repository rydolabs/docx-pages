import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { openDocx } from '../../src/docx-viewer.js';

const fixture = new URL('../fixtures/track-changes/track-changes-basic.docx', import.meta.url);
const finalFixture = new URL('../fixtures/track-changes/track-changes-final-equivalent.docx', import.meta.url);

test('default openDocx layout matches the accepted-final equivalent document', async t => {
  let JSZip, DOMParser;
  try {
    JSZip = (await import('jszip')).default;
    DOMParser = (await import('@xmldom/xmldom')).DOMParser;
  } catch {
    t.skip('jszip/xmldom are not installed in this execution environment');
    return;
  }

  const [tracked, accepted] = await Promise.all([fs.readFile(fixture), fs.readFile(finalFixture)]);
  const parser = { JSZipImpl:JSZip, domParser:new DOMParser() };
  const layout = { measurer:{ measure:text=>({ widthPt:String(text).length*5, ascentPt:7, descentPt:2, lineHeightPt:9 }) } };
  const trackedResult = await openDocx(tracked, null, { parser, layout, loadEmbeddedFonts:false, waitForFonts:false });
  const acceptedResult = await openDocx(accepted, null, { parser:{...parser,domParser:new DOMParser()}, layout, loadEmbeddedFonts:false, waitForFonts:false });

  assert.deepEqual(trackedResult.layout, acceptedResult.layout);
});

test('markup mode preserves revision metadata without changing the default API mode', async t => {
  let JSZip, DOMParser;
  try {
    JSZip = (await import('jszip')).default;
    DOMParser = (await import('@xmldom/xmldom')).DOMParser;
  } catch {
    t.skip('jszip/xmldom are not installed in this execution environment');
    return;
  }

  const tracked = await fs.readFile(fixture);
  const parser = { JSZipImpl:JSZip, domParser:new DOMParser(), revisionMode:'markup' };
  const layout = { measurer:{ measure:text=>({ widthPt:String(text).length*5, ascentPt:7, descentPt:2, lineHeightPt:9 }) } };
  const result = await openDocx(tracked, null, { parser, layout, loadEmbeddedFonts:false, waitForFonts:false });
  const serialized = JSON.stringify(result.ir);
  assert.match(serialized, /\"kind\":\"del\"/);
  assert.match(serialized, /\"kind\":\"ins\"/);
  assert.match(serialized, /\"kind\":\"moveFrom\"/);
  assert.match(serialized, /\"kind\":\"moveTo\"/);
  assert.match(serialized, /Alice/);
  assert.match(serialized, /Bob/);
});
