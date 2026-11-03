import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineBreaker, defaultLineBreaker } from '../../src/layout/services/line-breaker.js';

test('default line breaker keeps the existing bounded soft-break policy', () => {
  assert.equal(defaultLineBreaker.isSoftBreakOpportunity(' '), true);
  assert.equal(defaultLineBreaker.isSoftBreakOpportunity('-'), true);
  assert.equal(defaultLineBreaker.isSoftBreakOpportunity('가'), false);
});

test('Word noLineBreaksAfter prevents a configured character from becoming a soft break boundary', () => {
  const lineBreaker = createLineBreaker({ noLineBreaksAfter: '-' });
  assert.equal(lineBreaker.isSoftBreakOpportunity('-'), false);
  assert.equal(lineBreaker.isProhibitedAtLineEnd('-'), true);
});

test('Word noLineBreaksBefore is exposed as a narrow terminal-punctuation carry rule', () => {
  const lineBreaker = createLineBreaker({ noLineBreaksBefore: '.)' });
  const items = [
    { type: 'char', text: 'A' },
    { type: 'char', text: '.' }
  ];
  assert.equal(lineBreaker.shouldCarryPreviousAtParagraphEnd('.', items, 1), true);
  assert.equal(lineBreaker.shouldCarryPreviousAtParagraphEnd(')', [...items, { type: 'char', text: 'B' }], 1), false);
  assert.equal(lineBreaker.isProhibitedAtLineStart(')'), true);
});

test('wordWrap=false allows character-level breaks for space-delimited words', () => {
  const lineBreaker = createLineBreaker();
  assert.equal(lineBreaker.allowsCharacterBreak({ wordWrap: false, lineText: 'wor', nextText: 'l' }), true);
});

test('wordWrap=true or omission keeps a Latin-like word intact while CJK remains character-breakable', () => {
  const lineBreaker = createLineBreaker();
  assert.equal(lineBreaker.allowsCharacterBreak({ wordWrap: true, lineText: 'wor', nextText: 'l' }), false);
  assert.equal(lineBreaker.allowsCharacterBreak({ lineText: 'wor', nextText: 'l' }), false);
  assert.equal(lineBreaker.allowsCharacterBreak({ wordWrap: true, lineText: '한', nextText: '글' }), true);
});

test('Latin overflow prefers a preceding soft boundary; CJK does not', () => {
  const lineBreaker = createLineBreaker();
  assert.equal(lineBreaker.prefersSoftBreak({lineText:'word',nextText:'s'}),true);
  assert.equal(lineBreaker.prefersSoftBreak({lineText:'한글',nextText:'단'}),false);
  assert.equal(lineBreaker.prefersSoftBreak({lineText:'한',nextText:'A'}),false);
  assert.equal(lineBreaker.prefersSoftBreak({lineText:'123',nextText:'-'}),true);
  assert.equal(lineBreaker.prefersSoftBreak({lineText:'a ',nextText:'-'}),false);
});

test('language-scoped kinsoku rules do not affect runs explicitly tagged as another language', () => {
  const lineBreaker = createLineBreaker({
    noLineBreaksBefore: '.',
    noLineBreaksBeforeLanguage: 'ko-KR',
    noLineBreaksAfter: '(',
    noLineBreaksAfterLanguage: 'ko-KR'
  });
  const items = [{type:'char',text:'A'},{type:'char',text:'.'}];
  const korean = {languages:{eastAsia:'ko-KR'}};
  const japanese = {languages:{eastAsia:'ja-JP'}};
  assert.equal(lineBreaker.shouldCarryPreviousAtParagraphEnd('.', items, 1, korean), true);
  assert.equal(lineBreaker.shouldCarryPreviousAtParagraphEnd('.', items, 1, japanese), false);
  assert.equal(lineBreaker.isProhibitedAtLineEnd('(', korean), true);
  assert.equal(lineBreaker.isProhibitedAtLineEnd('(', japanese), false);
});
