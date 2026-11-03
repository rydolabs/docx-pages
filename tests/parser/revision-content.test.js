import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseParagraph } from '../../src/parser/text-parser.js';

function textOf(node) {
  return (node.children || []).flatMap(child => child.children || []).filter(child => child.type === 'text').map(child => child.value).join('');
}

test('final-view parsing keeps moveTo and hides moveFrom content', () => {
  const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:moveFrom><w:r><w:t>old</w:t></w:r></w:moveFrom>
    <w:moveTo><w:r><w:t>new</w:t></w:r></w:moveTo>
  </w:p>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  assert.equal(textOf(parseParagraph(node)), 'new');
});

test('customXml wrapper preserves visible paragraph content', () => {
  const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:customXml><w:r><w:t>visible</w:t></w:r></w:customXml>
  </w:p>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  assert.equal(textOf(parseParagraph(node)), 'visible');
});
