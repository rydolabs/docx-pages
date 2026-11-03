import { children, localName, attr, intAttr } from './xml-reader.js';

export function parseChartPart(xml) {
  const root = xml?.documentElement;
  if (!root) return null;
  const chart = findDescendant(root, 'chart');
  const plotArea = chart && findChild(chart, 'plotArea');
  const barChart = plotArea && findChild(plotArea, 'barChart');
  if (!barChart) return { type: 'unsupported' };

  const direction = attr(findChild(barChart, 'barDir'), 'val') || 'col';
  const grouping = attr(findChild(barChart, 'grouping'), 'val') || 'clustered';
  const gapWidth = Number(attr(findChild(barChart, 'gapWidth'), 'val') || 150);
  const series = children(barChart).filter(n => localName(n) === 'ser').map(parseSeries).filter(Boolean);
  const categories = series[0]?.categories || [];
  const legend = findChild(chart, 'legend');

  return {
    type: 'bar',
    direction,
    grouping,
    gapWidth,
    categories,
    series,
    legendPosition: attr(findChild(legend, 'legendPos'), 'val') || null,
  };
}

function parseSeries(node) {
  const tx = findDescendant(node, 'strCache');
  const name = tx ? pointValues(tx)[0] || '' : '';
  const catCache = findDescendant(findChild(node, 'cat'), 'strCache');
  const numCache = findDescendant(findChild(node, 'val'), 'numCache');
  const fill = parseSrgb(findDescendant(findChild(node, 'spPr'), 'solidFill'));
  return {
    index: intAttr(findChild(node, 'idx'), 'val') ?? 0,
    order: intAttr(findChild(node, 'order'), 'val') ?? 0,
    name,
    color: fill,
    categories: catCache ? pointValues(catCache) : [],
    values: numCache ? pointValues(numCache).map(v => Number(v)).map(v => Number.isFinite(v) ? v : 0) : [],
  };
}

function pointValues(cache) {
  return children(cache)
    .filter(n => localName(n) === 'pt')
    .sort((a,b) => (intAttr(a,'idx') ?? 0) - (intAttr(b,'idx') ?? 0))
    .map(pt => findChild(pt, 'v')?.textContent ?? '');
}

function parseSrgb(node) {
  if (!node) return null;
  const color = children(node).find(n => localName(n) === 'srgbClr');
  return color ? attr(color, 'val') : null;
}

function findChild(node, name) {
  return node ? children(node).find(n => localName(n) === name) || null : null;
}
function findDescendant(node, name) {
  if (!node) return null;
  for (const c of children(node)) {
    if (localName(c) === name) return c;
    const nested = findDescendant(c, name);
    if (nested) return nested;
  }
  return null;
}
