import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticsFromEmbeddedFonts, mergeDiagnostics } from '../src/common/diagnostics.js';

test('diagnostics are merged without coupling pipeline layers', () => {
  const merged = mergeDiagnostics([{ code: 'parser' }], null, [{ code: 'layout' }]);
  assert.deepEqual(merged.map(x => x.code), ['parser', 'layout']);
});

test('embedded font failures normalize into viewer diagnostics', () => {
  const items = diagnosticsFromEmbeddedFonts({ failed: [{ family: 'Batang', type: 'regular', path: 'font.odttf', error: new Error('boom') }] });
  assert.equal(items[0].code, 'embedded-font-load-failed');
  assert.equal(items[0].details.family, 'Batang');
  assert.equal(items[0].details.error, 'boom');
});
