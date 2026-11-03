import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseFontTable } from '../../src/parser/styles-parser.js';

test('font table preserves embedded font relationship and obfuscation key as raw data', () => {
  const xml = new DOMParser().parseFromString(`
    <w:fonts xmlns:w="w" xmlns:r="r">
      <w:font w:name="Demo Font">
        <w:family w:val="roman"/>
        <w:embedRegular r:id="rId1" w:fontKey="{00112233-4455-6677-8899-AABBCCDDEEFF}"/>
        <w:embedBold r:id="rId2" w:fontKey="{FFEEDDCC-BBAA-9988-7766-554433221100}"/>
      </w:font>
    </w:fonts>`, 'application/xml');
  const fonts = parseFontTable(xml);
  assert.equal(fonts['Demo Font'].embedded.length, 2);
  assert.deepEqual(fonts['Demo Font'].embedded[0], {
    type: 'regular', relationshipId: 'rId1', fontKey: '{00112233-4455-6677-8899-AABBCCDDEEFF}'
  });
});
