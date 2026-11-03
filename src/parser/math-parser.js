import { child, children, localName, text, attr, intAttr } from './xml-reader.js';

export function parseMath(node) {
  return {
    type: 'math',
    ast: parseMathNode(node),
    text: collectMathText(node),
    style: parseMathStyle(node)
  };
}

function parseMathNode(node) {
  if (!node) return null;
  const name = localName(node);
  if (name === 't') return { type: 'text', value: text(node) };
  if (name === 'f') {
    return {
      type: 'fraction',
      numerator: parseContainer(findChild(node, 'num')),
      denominator: parseContainer(findChild(node, 'den'))
    };
  }
  if (name === 'rad') {
    return {
      type: 'radical',
      body: parseContainer(findChild(node, 'e')),
      degree: parseContainer(findChild(node, 'deg'))
    };
  }
  if (name === 'sSup') {
    return {
      type: 'superscript',
      base: parseContainer(findChild(node, 'e')),
      superscript: parseContainer(findChild(node, 'sup'))
    };
  }
  if (name === 'sSub') {
    return {
      type: 'subscript',
      base: parseContainer(findChild(node, 'e')),
      subscript: parseContainer(findChild(node, 'sub'))
    };
  }
  if (name === 'sSubSup') {
    return {
      type: 'subsup',
      base: parseContainer(findChild(node, 'e')),
      subscript: parseContainer(findChild(node, 'sub')),
      superscript: parseContainer(findChild(node, 'sup'))
    };
  }
  if (name === 'nary') {
    const pr = findChild(node, 'naryPr');
    return {
      type: 'nary',
      operator: attr(findChild(pr, 'chr'), 'val') || '∫',
      body: parseContainer(findChild(node, 'e')),
      subscript: parseContainer(findChild(node, 'sub')),
      superscript: parseContainer(findChild(node, 'sup'))
    };
  }
  if (name === 'd') {
    const pr = findChild(node, 'dPr');
    return {
      type: 'delimiter',
      begin: attr(findChild(pr, 'begChr'), 'val') ?? '(',
      end: attr(findChild(pr, 'endChr'), 'val') ?? ')',
      separator: attr(findChild(pr, 'sepChr'), 'val') ?? '',
      items: children(node).filter(n => localName(n) === 'e').map(parseContainer)
    };
  }
  if (name === 'm') {
    return {
      type: 'matrix',
      rows: children(node).filter(n => localName(n) === 'mr').map(row =>
        children(row).filter(n => localName(n) === 'e').map(parseContainer)
      )
    };
  }
  if (name === 'eqArr') {
    return {
      type: 'matrix',
      rows: children(node).filter(n => localName(n) === 'e').map(entry => [parseContainer(entry)])
    };
  }
  if (name === 'bar') {
    const pr = findChild(node, 'barPr');
    return {
      type: 'bar',
      position: attr(findChild(pr, 'pos'), 'val') || 'top',
      body: parseContainer(findChild(node, 'e'))
    };
  }
  if (name === 'acc') {
    const pr = findChild(node, 'accPr');
    return {
      type: 'accent',
      accent: attr(findChild(pr, 'chr'), 'val') || '^',
      body: parseContainer(findChild(node, 'e'))
    };
  }
  if (name === 'limLow' || name === 'limUpp') {
    return {
      type: name === 'limLow' ? 'under' : 'over',
      base: parseContainer(findChild(node, 'e')),
      annotation: parseContainer(findChild(node, 'lim'))
    };
  }
  if (name === 'groupChr') {
    const pr = findChild(node, 'groupChrPr');
    return {
      type: (attr(findChild(pr, 'pos'), 'val') || 'bot') === 'top' ? 'over' : 'under',
      base: parseContainer(findChild(node, 'e')),
      annotation: { type: 'text', value: attr(findChild(pr, 'chr'), 'val') || '⏟' }
    };
  }
  if (name === 'func') {
    return {
      type: 'row',
      children: [parseContainer(findChild(node, 'fName')), parseContainer(findChild(node, 'e'))]
    };
  }
  if (['box', 'borderBox', 'phant'].includes(name)) return parseContainer(findChild(node, 'e'));
  return parseContainer(node);
}

function parseContainer(node) {
  if (!node) return { type: 'row', children: [] };
  const parsed = [];
  for (const childNode of children(node)) {
    const name = localName(childNode);
    if (['r', 'oMath', 'oMathPara', 'e', 'num', 'den', 'sup', 'sub', 'deg', 'lim', 'fName'].includes(name)) {
      const nested = parseContainer(childNode);
      parsed.push(...(nested.type === 'row' ? nested.children : [nested]));
    } else if (name === 't') {
      parsed.push({ type: 'text', value: text(childNode) });
    } else if (['f', 'rad', 'sSup', 'sSub', 'sSubSup', 'nary', 'd', 'm', 'eqArr', 'bar', 'acc', 'limLow', 'limUpp', 'groupChr', 'func', 'box', 'borderBox', 'phant'].includes(name)) {
      parsed.push(parseMathNode(childNode));
    }
  }
  return { type: 'row', children: parsed.filter(Boolean) };
}

function parseMathStyle(node) {
  const rPr = findDescendant(node, n => localName(n) === 'rPr' && localName(n.parentNode) === 'r');
  if (!rPr) return {};
  const fonts = child(rPr, 'rFonts');
  return compact({
    size: intAttr(child(rPr, 'sz'), 'val'),
    sizeCs: intAttr(child(rPr, 'szCs'), 'val'),
    fonts: fonts ? compact({
      ascii: attr(fonts, 'ascii'),
      hAnsi: attr(fonts, 'hAnsi'),
      eastAsia: attr(fonts, 'eastAsia'),
      cs: attr(fonts, 'cs')
    }) : null
  });
}

function findDescendant(node, predicate) {
  for (const c of children(node)) {
    if (predicate(c)) return c;
    const nested = findDescendant(c, predicate);
    if (nested) return nested;
  }
  return null;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value != null));
}

function collectMathText(node) {
  let out = '';
  const walk = n => {
    if (!n) return;
    if (localName(n) === 't') out += text(n);
    else children(n).forEach(walk);
  };
  walk(node);
  return out;
}

function findChild(node, name) {
  return children(node).find(n => localName(n) === name) || null;
}
