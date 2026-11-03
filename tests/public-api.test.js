import test from 'node:test';
import assert from 'node:assert/strict';
import * as publicApi from '../src/index.js';

test('core package public API remains viewer-first', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), ['openDocx']);
  assert.equal(typeof publicApi.openDocx, 'function');
});
