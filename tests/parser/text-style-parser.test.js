import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseRun, parseParagraph } from '../../src/parser/text-parser.js';

test('run parser preserves Word text highlight without renderer coupling', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>marked</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  assert.equal(run.properties.highlight, 'yellow');
});

test('run parser preserves hidden-text flags for layout policy', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:vanish/><w:webHidden w:val="1"/></w:rPr><w:t>secret</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  assert.equal(run.properties.vanish, true);
  assert.equal(run.properties.webHidden, true);
});

test('run parser preserves caps and smallCaps flags', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:caps/><w:smallCaps w:val="1"/></w:rPr><w:t>Abc</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  assert.equal(run.properties.caps, true);
  assert.equal(run.properties.smallCaps, true);
});

test('paragraph parser preserves basic paragraph borders', () => {
  const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:pBdr><w:top w:val="single" w:sz="8" w:color="FF0000"/><w:bottom w:val="dashed" w:sz="4" w:color="00FF00"/></w:pBdr></w:pPr><w:r><w:t>boxed</w:t></w:r></w:p>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const paragraph = parseParagraph(node);
  assert.equal(paragraph.properties.borders.top.value, 'single');
  assert.equal(paragraph.properties.borders.top.size, 8);
  assert.equal(paragraph.properties.borders.bottom.value, 'dashed');
});

test('run parser preserves East Asian emphasis marks', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:em w:val="dot"/></w:rPr><w:t>강조</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  assert.equal(run.properties.emphasis, 'dot');
});

test('parser preserves paragraph bidi and run rtl flags', () => {
  const pxml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t>שלום</w:t></w:r></w:p>`;
  const node = new DOMParser().parseFromString(pxml, 'application/xml').documentElement;
  const paragraph = parseParagraph(node);
  assert.equal(paragraph.properties.bidi, true);
  assert.equal(paragraph.children[0].properties.rtl, true);
});

test('hyperlink parser preserves tooltip and target frame metadata', () => {
  const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:hyperlink r:id="rId1" w:tooltip="Open site" w:tgtFrame="_blank"><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const paragraph = parseParagraph(node,{relationships:[{id:'rId1',target:'https://example.com',targetMode:'External'}]});
  const link=paragraph.children[0];
  assert.equal(link.tooltip,'Open site');
  assert.equal(link.targetFrame,'_blank');
});

test('run break parser preserves Word clear hint for floating flow', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:t>before</w:t><w:br w:clear="all"/><w:t>after</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  const br = run.children.find(child => child.type === 'break');
  assert.equal(br.breakType, 'line');
  assert.equal(br.clear, 'all');
});

test('run parser preserves character border and underline color metadata', () => {
  const xml = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:bdr w:val="single" w:sz="8" w:space="1" w:color="FF0000"/><w:u w:val="single" w:color="00AA00"/></w:rPr><w:t>decorated</w:t></w:r>`;
  const node = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const run = parseRun(node);
  assert.equal(run.properties.border.value, 'single');
  assert.equal(run.properties.border.size, 8);
  assert.equal(run.properties.border.space, 1);
  assert.equal(run.properties.border.color, 'FF0000');
  assert.equal(run.properties.underline, 'single');
  assert.equal(run.properties.underlineColor.color, '00AA00');
});
