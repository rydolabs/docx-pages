import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePageReserves } from '../../src/layout/pagination/footnote-pagination.js';

test('footnote cyclic-reserve recovery does not shrink earlier page reservations', () => {
  const first = mergePageReserves([], [75, 0, 40]);
  const next = mergePageReserves(first, [0, 75, 0, 18]);
  assert.deepEqual(next, [75, 75, 40, 18]);
  assert.deepEqual(mergePageReserves(next, [74, 75, 30]), next);
});

test('footnote recovery preserves trailing pages and ignores missing/negative values', () => {
  assert.deepEqual(mergePageReserves([0, 6, 0], [0, -12]), [0, 6, 0]);
  assert.deepEqual(mergePageReserves([6], [1, 4]), [6, 4]);
});
