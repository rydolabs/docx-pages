import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOMParser } from '@xmldom/xmldom';
import { openDocx } from '../../src/index.js';

test('public synthetic fixture exercises openDocx() without private corpus', async () => {
  const data = await readFile(new URL('../fixtures/regression/common-formatting.docx', import.meta.url));
  const result = await openDocx(new Uint8Array(data), null, { parser: { domParser: new DOMParser() } });
  assert.ok(result.layout.pages.length >= 1);
  assert.equal(result.ir.sections.length, 1);
  assert.equal(typeof result.dispose, 'function');
  result.dispose();
});
