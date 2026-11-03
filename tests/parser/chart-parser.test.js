import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { parseChartPart } from '../../src/parser/chart-parser.js';
import { parseDrawing } from '../../src/parser/media-parser.js';

test('basic clustered column chart preserves series, categories, values, and colors', () => {
  const xml = new DOMParser().parseFromString(`
    <c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:plotArea><c:barChart>
      <c:barDir val="col"/><c:grouping val="clustered"/>
      <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>S1</c:v></c:pt></c:strCache></c:strRef></c:tx>
        <c:spPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></c:spPr>
        <c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt></c:strCache></c:strRef></c:cat>
        <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>1.5</c:v></c:pt><c:pt idx="1"><c:v>3</c:v></c:pt></c:numCache></c:numRef></c:val>
      </c:ser>
    </c:barChart></c:plotArea><c:legend><c:legendPos val="r"/></c:legend></c:chart></c:chartSpace>`, 'application/xml');
  const chart = parseChartPart(xml);
  assert.equal(chart.type, 'bar');
  assert.equal(chart.direction, 'col');
  assert.equal(chart.grouping, 'clustered');
  assert.deepEqual(chart.categories, ['A','B']);
  assert.deepEqual(chart.series[0].values, [1.5,3]);
  assert.equal(chart.series[0].name, 'S1');
  assert.equal(chart.series[0].color, '112233');
  assert.equal(chart.legendPosition, 'r');
});

test('DrawingML chart relationship id is preserved as a resource key', () => {
  const xml = new DOMParser().parseFromString(`<w:drawing xmlns:w="w" xmlns:a="a" xmlns:c="c" xmlns:r="r"><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId8"/></a:graphicData></a:graphic></w:drawing>`, 'application/xml').documentElement;
  const parsed = parseDrawing(xml, { sourcePart:'word/document.xml', diagnostics:{warn(){}} });
  assert.equal(parsed.relationshipId, 'rId8');
  assert.equal(parsed.resourceKey, 'word/document.xml#rId8');
  assert.equal(parsed.fallback.feature, 'chart');
});
