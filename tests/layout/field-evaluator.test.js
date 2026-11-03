import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFieldInstruction, resolveFieldLink } from '../../src/layout/services/field-evaluator.js';

test('field evaluator keeps page-dependent values in a dedicated service', () => {
  assert.equal(evaluateFieldInstruction(' PAGE ', { pageNumberDisplay: 'iv' }), 'iv');
  assert.equal(evaluateFieldInstruction('NUMPAGES', { totalPages: 7 }), 7);
  assert.equal(evaluateFieldInstruction('SEQ Figure', { totalPages: 7 }), null);
});

test('field link resolver supports common HYPERLINK and linked REF/PAGEREF forms', () => {
  assert.deepEqual(resolveFieldLink('HYPERLINK "https://example.com"'), {
    target: 'https://example.com', targetMode: 'External', anchor: null, field: true
  });
  assert.deepEqual(resolveFieldLink('HYPERLINK \\l "chapter1"'), {
    anchor: 'chapter1', target: null, targetMode: null, field: true
  });
  assert.deepEqual(resolveFieldLink('REF chapter1 \\h'), {
    anchor: 'chapter1', target: null, targetMode: null, field: true
  });
  assert.deepEqual(resolveFieldLink('PAGEREF chapter1 \\h'), {
    anchor: 'chapter1', target: null, targetMode: null, field: true
  });
  assert.equal(resolveFieldLink('REF chapter1'), null);
});
