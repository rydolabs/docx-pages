import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseParagraph } from '../../src/parser/text-parser.js';

const parser = new DOMParser();

test('paragraph parser preserves comment range and reference markers as semantic nodes', () => {
  const xml = parser.parseFromString(`
    <w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:commentRangeStart w:id="7"/>
      <w:r><w:t>reviewed</w:t></w:r>
      <w:commentRangeEnd w:id="7"/>
      <w:r><w:commentReference w:id="7"/></w:r>
    </w:p>
  `, 'application/xml');
  const paragraph = parseParagraph(xml.documentElement);
  assert.equal(paragraph.children[0].type, 'comment-range-start');
  assert.equal(paragraph.children[0].id, 7);
  assert.equal(paragraph.children[2].type, 'comment-range-end');
  assert.equal(paragraph.children[2].id, 7);
  assert.equal(paragraph.children[3].children[0].type, 'comment-reference');
  assert.equal(paragraph.children[3].children[0].id, 7);
});
