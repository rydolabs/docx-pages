import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParagraph } from '../../src/parser/text-parser.js';

function el(name, attrs = {}, children = [], textContent = '') {
  const attrList = Object.entries(attrs).map(([key, value]) => ({
    localName: key.includes(':') ? key.split(':').pop() : key,
    name: key,
    value: String(value)
  }));
  return {
    nodeType: 1,
    localName: name.includes(':') ? name.split(':').pop() : name,
    nodeName: name,
    attributes: attrList,
    childNodes: children,
    textContent: textContent || children.map(child => child.textContent || '').join('')
  };
}

function runText(value, deleted = false) {
  return el('w:r', {}, [el(deleted ? 'w:delText' : 'w:t', {}, [], value)]);
}

function visibleText(paragraph) {
  const out = [];
  const walk = node => {
    if (!node) return;
    if (node.type === 'text') out.push(node.value);
    for (const child of node.children || []) walk(child);
  };
  walk(paragraph);
  return out.join('');
}

test('default revision parsing remains final-view compatible', () => {
  const paragraph = el('w:p', {}, [
    runText('A'),
    el('w:del', { 'w:id':'1', 'w:author':'Alice', 'w:date':'2026-10-07T10:00:00Z' }, [runText('OLD', true)]),
    el('w:ins', { 'w:id':'2', 'w:author':'Bob', 'w:date':'2026-10-07T11:00:00Z' }, [runText('NEW')]),
    el('w:moveFrom', { 'w:id':'3' }, [runText('FROM', true)]),
    el('w:moveTo', { 'w:id':'4' }, [runText('TO')])
  ]);

  const parsed = parseParagraph(paragraph);
  assert.equal(visibleText(parsed), 'ANEWTO');
  assert.equal(JSON.stringify(parsed).includes('revision'), false);
  assert.equal(JSON.stringify(parsed).includes('OLD'), false);
  assert.equal(JSON.stringify(parsed).includes('FROM'), false);
});

test('markup revision parsing preserves insert/delete/move metadata and deleted text', () => {
  const paragraph = el('w:p', {}, [
    el('w:del', { 'w:id':'1', 'w:author':'Alice', 'w:date':'2026-10-07T10:00:00Z' }, [runText('OLD', true)]),
    el('w:ins', { 'w:id':'2', 'w:author':'Bob', 'w:date':'2026-10-07T11:00:00Z' }, [runText('NEW')]),
    el('w:moveFrom', { 'w:id':'3', 'w:author':'Alice' }, [runText('FROM', true)]),
    el('w:moveTo', { 'w:id':'4', 'w:author':'Bob' }, [runText('TO')])
  ]);

  const parsed = parseParagraph(paragraph, { revisionMode:'markup' });
  assert.equal(parsed.children.length, 4);
  assert.deepEqual(parsed.children.map(node => node.revision.kind), ['del','ins','moveFrom','moveTo']);
  assert.equal(parsed.children[0].revision.author, 'Alice');
  assert.equal(parsed.children[1].revision.date, '2026-10-07T11:00:00Z');
  assert.equal(visibleText(parsed), 'OLDNEWFROMTO');
});
