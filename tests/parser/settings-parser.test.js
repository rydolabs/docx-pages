import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseSettings } from '../../src/parser/settings-parser.js';

test('settings parser preserves noColumnBalance compatibility switch', () => {
  const xml = `<?xml version="1.0"?>
    <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:compat><w:noColumnBalance w:val="1"/></w:compat>
    </w:settings>`;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const settings = parseSettings(doc);
  assert.equal(settings.compatibility.noColumnBalance, true);
});
