import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseCommentsPart } from '../../src/parser/comment-parser.js';

const COMMENTS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';

test('comments part is preserved as an independent semantic story without comment UI coupling', async () => {
  const xml = new DOMParser().parseFromString(`
    <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:comment w:id="7" w:author="Reviewer" w:initials="RV" w:date="2026-09-28T00:00:00Z">
        <w:p><w:r><w:t>Needs clarification.</w:t></w:r></w:p>
      </w:comment>
    </w:comments>
  `, 'application/xml');
  const diagnostics = [];
  const pkg = {
    resolveTarget: () => 'word/comments.xml',
    readXml: async () => xml,
    getRelationships: async () => []
  };
  const result = await parseCommentsPart(pkg, 'word/document.xml', [{ id:'rId9', type:COMMENTS_REL, target:'comments.xml' }], {
    info(code, message, details) { diagnostics.push({ code, message, details }); }
  });
  assert.equal(result[7].author, 'Reviewer');
  assert.equal(result[7].initials, 'RV');
  assert.equal(result[7].content[0].type, 'paragraph');
  assert.equal(result[7].content[0].children[0].children[0].value, 'Needs clarification.');
  assert.equal(diagnostics[0].code, 'comments-ui-deferred');
});
