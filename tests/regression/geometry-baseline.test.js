import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../fixtures/regression/manifest.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(new URL('./geometry/baseline.json', import.meta.url), 'utf8'));

test('browser geometry baseline covers every regression fixture exactly once', () => {
  const ids = manifest.fixtures.map(item => item.id).sort();
  assert.deepEqual(Object.keys(baseline).sort(), ids);
  for (const item of manifest.fixtures) {
    assert.equal(baseline[item.id].pageCount, item.expectedBrowserPages);
    assert.equal(baseline[item.id].pages.length, item.expectedBrowserPages);
  }
});
