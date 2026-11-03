import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseMath } from '../../src/parser/math-parser.js';

const parse = xml => parseMath(new DOMParser().parseFromString(xml, 'application/xml').documentElement).ast;

test('parses bounded OMML root degree, n-ary, delimiter, matrix and limits', () => {
  const ast = parse(`<m:oMath xmlns:m="urn:m">
    <m:rad><m:radPr/><m:deg><m:r><m:t>3</m:t></m:r></m:deg><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad>
    <m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>x</m:t></m:r></m:e></m:nary>
    <m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/><m:sepChr m:val="|"/></m:dPr><m:e><m:r><m:t>a</m:t></m:r></m:e><m:e><m:r><m:t>b</m:t></m:r></m:e></m:d>
    <m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr><m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr></m:m>
    <m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim><m:r><m:t>x→0</m:t></m:r></m:lim></m:limLow>
  </m:oMath>`);
  const encoded = JSON.stringify(ast);
  assert.match(encoded, /"type":"radical"/);
  assert.match(encoded, /"degree"/);
  assert.match(encoded, /"operator":"∑"/);
  assert.match(encoded, /"type":"delimiter"/);
  assert.match(encoded, /"type":"matrix"/);
  assert.match(encoded, /"type":"under"/);
});

test('parses bounded OMML bar, accent, function and equation array', () => {
  const ast = parse(`<m:oMath xmlns:m="urn:m">
    <m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e><m:r><m:t>AB</m:t></m:r></m:e></m:bar>
    <m:acc><m:accPr><m:chr m:val="→"/></m:accPr><m:e><m:r><m:t>v</m:t></m:r></m:e></m:acc>
    <m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func>
    <m:eqArr><m:e><m:r><m:t>x=1</m:t></m:r></m:e><m:e><m:r><m:t>y=2</m:t></m:r></m:e></m:eqArr>
  </m:oMath>`);
  const encoded = JSON.stringify(ast);
  assert.match(encoded, /"type":"bar"/);
  assert.match(encoded, /"type":"accent"/);
  assert.match(encoded, /sin/);
  assert.match(encoded, /"type":"matrix"/);
});
