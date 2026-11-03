import test from 'node:test';
import assert from 'node:assert/strict';
import { openDocx } from '../src/docx-viewer.js';

test('openDocx rejects an already aborted signal before parsing', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(openDocx(new Uint8Array(), null, { signal:controller.signal }), error => error?.name === 'AbortError');
});
