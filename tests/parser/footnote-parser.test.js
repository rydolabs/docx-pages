import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseFootnotesPart } from '../../src/parser/note-parser.js';
import { parseRun } from '../../src/parser/text-parser.js';

test('run parser preserves footnote references as semantic inline nodes', () => {
  const xml = new DOMParser().parseFromString(`<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnoteReference w:id="7"/></w:r>`,`application/xml`);
  const run = parseRun(xml.documentElement);
  assert.deepEqual(run.children[0], {type:'footnote-reference',id:7});
});

test('footnotes part is parsed as an independent story and ignores special separator ids only at layout policy', async () => {
  const xml = new DOMParser().parseFromString(`<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:t>sep</w:t></w:r></w:p></w:footnote>
    <w:footnote w:id="5"><w:p><w:r><w:footnoteRef/><w:t>Note text</w:t></w:r></w:p></w:footnote>
  </w:footnotes>`,`application/xml`);
  const pkg={
    resolveTarget(){ return 'word/footnotes.xml'; },
    async readXml(){ return xml; },
    async getRelationships(){ return []; }
  };
  const rels=[{type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes',target:'footnotes.xml'}];
  const footnotes=await parseFootnotesPart(pkg,'word/document.xml',rels,{items:[]});
  assert.equal(footnotes[-1].type,'separator');
  assert.equal(footnotes[5].type,'normal');
  assert.equal(footnotes[5].content[0].children[0].children[0].type,'footnote-ref');
  assert.equal(footnotes[5].content[0].children[0].children[1].value,'Note text');
});

test('section parser preserves bounded footnote numbering and placement policy', async () => {
  const { parseSectionProperties } = await import('../../src/parser/text-parser.js');
  const xml=new DOMParser().parseFromString(`<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnotePr><w:pos w:val="beneathText"/><w:numFmt w:val="upperLetter"/><w:numStart w:val="4"/><w:numRestart w:val="eachSect"/></w:footnotePr></w:sectPr>`,`application/xml`);
  assert.deepEqual(parseSectionProperties(xml.documentElement).footnotes,{position:'beneathText',format:'upperLetter',start:4,restart:'eachSect'});
});

test('endnotes part and inline references use the same bounded note-story parser', async () => {
  const { parseEndnotesPart } = await import('../../src/parser/note-parser.js');
  const runXml=new DOMParser().parseFromString(`<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnoteReference w:id="6"/></w:r>`,`application/xml`);
  assert.deepEqual(parseRun(runXml.documentElement).children[0],{type:'endnote-reference',id:6});
  const xml=new DOMParser().parseFromString(`<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="6"><w:p><w:r><w:endnoteRef/><w:t>End note</w:t></w:r></w:p></w:endnote></w:endnotes>`,`application/xml`);
  const pkg={resolveTarget(){return 'word/endnotes.xml';},async readXml(){return xml;},async getRelationships(){return [];}};
  const rels=[{type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes',target:'endnotes.xml'}];
  const notes=await parseEndnotesPart(pkg,'word/document.xml',rels,{items:[]});
  assert.equal(notes[6].content[0].children[0].children[0].type,'endnote-ref');
  assert.equal(notes[6].content[0].children[0].children[1].value,'End note');
});
