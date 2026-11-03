import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDocxPreviewOptions, compatibility } from '../../src/compat/docx-preview.js';

test('docx-preview facade maps only the intentionally supported migration options', () => {
  const mapped = mapDocxPreviewOptions({ ignoreFonts:true, renderChanges:true });
  assert.equal(mapped.fonts.embedded, false);
  assert.equal(mapped.revisions.mode, 'markup');
  assert.equal(mapped.revisions.style, 'word');
});

test('docx-preview geometry toggles are intentionally unsupported', () => {
  const mapped = mapDocxPreviewOptions({ ignoreWidth:true, breakPages:false, debug:true });
  assert.deepEqual(mapped.compatibility.unsupported.sort(), ['breakPages','ignoreWidth']);
  assert.ok(!('layout' in mapped));
});

test('compatibility contract stays deliberately small', () => {
  assert.deepEqual(compatibility.supportedOptions, ['ignoreFonts','renderChanges','debug']);
});
