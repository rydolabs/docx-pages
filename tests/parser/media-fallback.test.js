import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseDrawing, parseMedia } from '../../src/parser/media-parser.js';

function xml(body) {
  return new DOMParser().parseFromString(body, 'application/xml').documentElement;
}

test('chart DrawingML is preserved as a fallback and emits a diagnostic', () => {
  const items = [];
  const node = xml(`<w:drawing xmlns:w="w" xmlns:a="a"><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></w:drawing>`);
  const parsed = parseDrawing(node, { sourcePart: 'word/document.xml', diagnostics: { warn: (...args) => items.push(args) } });
  assert.equal(parsed.fallback.feature, 'chart');
  assert.equal(parsed.fallback.supportLevel, 'fallback');
  assert.equal(items.length, 1);
});


test('DrawingML textbox preserves bounded flow content and emits a partial-support diagnostic', () => {
  const items = [];
  const node = xml(`<w:drawing xmlns:w="w" xmlns:a="a" xmlns:wps="wps"><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:txbx><w:txbxContent><w:p/></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></w:drawing>`);
  const parsed = parseDrawing(node, { sourcePart: 'word/document.xml', parseNode: n => ({ type: n.localName === 'p' ? 'paragraph' : n.localName }), diagnostics: { warn: (...args) => items.push(args) } });
  assert.equal(parsed.fallback, undefined);
  assert.equal(parsed.textBox.content[0].type, 'paragraph');
  assert.equal(items.length, 1);
  assert.equal(items[0][0], 'drawing-partial');
});

test('embedded object reuses stored VML preview and emits bounded diagnostic', () => {
  const xml = `<w:object xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><v:shape id="_x0000_i1025" style="width:30pt;height:20pt"><v:imagedata r:id="rId9"/></v:shape></w:object>`;
  const node = new DOMParser().parseFromString(xml,'application/xml').documentElement;
  const warnings=[];
  const parsed = parseMedia(node,{sourcePart:'word/document.xml',diagnostics:{warn:(code,message,meta)=>warnings.push({code,message,meta})}});
  assert.equal(parsed.type,'vml');
  assert.equal(parsed.relationshipId,'rId9');
  assert.equal(parsed.resourceKey,'word/document.xml#rId9');
  assert.equal(warnings[0]?.code,'embedded-object-partial');
  assert.equal(warnings[0]?.meta?.supportLevel,'partial');
});

test('DrawingML preserves image crop rectangle and accessibility metadata', () => {
  const node = xml(`<w:drawing xmlns:w="w" xmlns:a="a" xmlns:pic="pic" xmlns:r="r" xmlns:wp="wp"><wp:inline><wp:extent cx="127000" cy="127000"/><wp:docPr id="1" name="Picture 1" descr="A sample image" title="Sample title"/><a:graphic><a:graphicData uri="pic"><pic:pic><pic:blipFill><a:blip r:embed="rId5"/><a:srcRect l="10000" t="20000" r="30000" b="10000"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`);
  const parsed = parseDrawing(node,{sourcePart:'word/document.xml'});
  assert.deepEqual(parsed.visual.crop,{left:10000,top:20000,right:30000,bottom:10000});
  assert.equal(parsed.docProperties.description,'A sample image');
  assert.equal(parsed.docProperties.title,'Sample title');
});

test('DrawingML wrap preserves per-wrap top/bottom distances and explicit side', () => {
  const node = xml(`<w:drawing xmlns:w="w" xmlns:wp="wp"><wp:anchor distT="12700" distB="25400" distL="38100" distR="50800"><wp:positionH relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="127000" cy="127000"/><wp:wrapSquare wrapText="right" distT="63500" distB="76200" distL="88900" distR="101600"/></wp:anchor></w:drawing>`);
  const parsed = parseDrawing(node,{sourcePart:'word/document.xml'});
  assert.deepEqual(parsed.positioning.wrap, {
    type:'wrapSquare', wrapText:'right', distanceTop:63500, distanceBottom:76200, distanceLeft:88900, distanceRight:101600
  });
});

test('DrawingML line parser preserves basic dash style and respects noFill', () => {
  const dashedXml = `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphic><a:graphicData uri="urn:test"><a:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:prstGeom prst="line"/></a:spPr></a:graphicData></a:graphic></w:drawing>`;
  const noFillXml = `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphic><a:graphicData uri="urn:test"><a:spPr><a:ln w="12700"><a:noFill/></a:ln><a:prstGeom prst="line"/></a:spPr></a:graphicData></a:graphic></w:drawing>`;
  const dashed = parseDrawing(new DOMParser().parseFromString(dashedXml,'application/xml').documentElement);
  const noFill = parseDrawing(new DOMParser().parseFromString(noFillXml,'application/xml').documentElement);
  assert.equal(dashed.visual.line.dash,'dash');
  assert.equal(dashed.visual.line.widthEmu,12700);
  assert.equal(noFill.visual.line,undefined);
});
