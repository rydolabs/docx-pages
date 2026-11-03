import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityPolicy, getSupportLevel } from '../../src/common/capabilities.js';

test('capability policy keeps complex Office graphics as explicit fallbacks', () => {
  assert.equal(getSupportLevel('chart'), 'fallback');
  assert.equal(getSupportLevel('smartArt'), 'fallback');
  assert.equal(getSupportLevel('textbox'), 'partial');
  assert.equal(getSupportLevel('embeddedObject'), 'partial');
  assert.equal(getSupportLevel('bidiText'), 'partial');
  assert.equal(getSupportLevel('paragraph'), 'full');
});

test('capability policy can be overridden without changing layout modules', () => {
  const policy = createCapabilityPolicy({ chart: 'partial' });
  assert.equal(policy.get('chart'), 'partial');
  assert.equal(policy.get('unknown-feature'), 'unsupported');
});
