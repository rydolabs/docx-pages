const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

export function renderMath(ast, doc = document) {
  const create = tag => doc.createElementNS ? doc.createElementNS(MATH_NS, tag) : doc.createElement(tag);
  const root = create('math');
  root.className = 'docx-math';
  root.appendChild(renderNode(ast, doc, create));
  return root;
}

function renderNode(node, doc, create) {
  if (!node) return create('mrow');
  if (node.type === 'text') {
    const el = create('mi');
    el.textContent = node.value || '';
    return el;
  }
  if (node.type === 'fraction') {
    const el = create('mfrac');
    el.appendChild(renderNode(node.numerator, doc, create));
    el.appendChild(renderNode(node.denominator, doc, create));
    return el;
  }
  if (node.type === 'radical') {
    const hasDegree = hasContent(node.degree);
    const el = create(hasDegree ? 'mroot' : 'msqrt');
    el.appendChild(renderNode(node.body, doc, create));
    if (hasDegree) el.appendChild(renderNode(node.degree, doc, create));
    return el;
  }
  if (node.type === 'superscript') {
    const el = create('msup');
    el.appendChild(renderNode(node.base, doc, create));
    el.appendChild(renderNode(node.superscript, doc, create));
    return el;
  }
  if (node.type === 'subscript') {
    const el = create('msub');
    el.appendChild(renderNode(node.base, doc, create));
    el.appendChild(renderNode(node.subscript, doc, create));
    return el;
  }
  if (node.type === 'subsup') {
    const el = create('msubsup');
    el.appendChild(renderNode(node.base, doc, create));
    el.appendChild(renderNode(node.subscript, doc, create));
    el.appendChild(renderNode(node.superscript, doc, create));
    return el;
  }
  if (node.type === 'nary') {
    const limits = create('munderover');
    limits.appendChild(token(node.operator || '∫', create, 'mo'));
    limits.appendChild(renderNode(node.subscript, doc, create));
    limits.appendChild(renderNode(node.superscript, doc, create));
    const row = create('mrow');
    row.appendChild(limits);
    row.appendChild(renderNode(node.body, doc, create));
    return row;
  }
  if (node.type === 'delimiter') {
    const row = create('mrow');
    if (node.begin) row.appendChild(token(node.begin, create, 'mo'));
    (node.items || []).forEach((item, index) => {
      if (index && node.separator) row.appendChild(token(node.separator, create, 'mo'));
      row.appendChild(renderNode(item, doc, create));
    });
    if (node.end) row.appendChild(token(node.end, create, 'mo'));
    return row;
  }
  if (node.type === 'matrix') {
    const table = create('mtable');
    for (const rowData of node.rows || []) {
      const row = create('mtr');
      for (const cellData of rowData || []) {
        const cell = create('mtd');
        cell.appendChild(renderNode(cellData, doc, create));
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    return table;
  }
  if (node.type === 'bar' || node.type === 'accent') {
    const top = node.type === 'accent' || node.position !== 'bot';
    const el = create(top ? 'mover' : 'munder');
    el.appendChild(renderNode(node.body, doc, create));
    el.appendChild(token(node.type === 'bar' ? '¯' : (node.accent || '^'), create, 'mo'));
    return el;
  }
  if (node.type === 'under' || node.type === 'over') {
    const el = create(node.type === 'under' ? 'munder' : 'mover');
    el.appendChild(renderNode(node.base, doc, create));
    el.appendChild(renderNode(node.annotation, doc, create));
    return el;
  }
  const row = create('mrow');
  for (const child of node.children || []) row.appendChild(renderNode(child, doc, create));
  return row;
}

function token(value, create, tag = 'mi') {
  const el = create(tag);
  el.textContent = value || '';
  return el;
}

function hasContent(node) {
  if (!node) return false;
  if (node.type === 'text') return !!node.value;
  return (node.children || []).some(hasContent);
}
