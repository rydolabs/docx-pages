import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const fixtureDir = new URL('../fixtures/regression/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', fixtureDir), 'utf8'));

test('regression manifest lists every DOCX fixture exactly once', async () => {
  const files = (await fs.readdir(fixtureDir)).filter(name => name.endsWith('.docx')).sort();
  const listed = manifest.fixtures.map(item => item.file).sort();
  assert.deepEqual(listed, files);
  assert.equal(new Set(manifest.fixtures.map(item => item.id)).size, manifest.fixtures.length);
});

test('regression fixtures distinguish engine snapshots from Word golden references', () => {
  const allowed = new Set(['engine-snapshot', 'word-golden']);
  for (const item of manifest.fixtures) {
    assert.ok(allowed.has(item.reference), `${item.id}: unknown reference class ${item.reference}`);
    assert.ok(Number.isInteger(item.expectedBrowserPages) && item.expectedBrowserPages > 0, `${item.id}: expectedBrowserPages is required`);
    assert.ok(Array.isArray(item.purpose) && item.purpose.length > 0, `${item.id}: purpose is required`);
    if (item.reference === 'word-golden') {
      assert.ok(Number.isInteger(item.wordReferencePages) && item.wordReferencePages > 0, `${item.id}: wordReferencePages is required for golden fixtures`);
    }
  }
});
