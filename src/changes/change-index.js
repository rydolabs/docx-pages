import { revisionChangeId } from './change-id.js';

export function buildChangeIndex(layout = {}) {
  const byId = new Map();
  let order = 0;

  for (let pageIndex = 0; pageIndex < (layout.pages || []).length; pageIndex += 1) {
    const page = layout.pages[pageIndex];
    for (const block of pageBlocks(page)) collectBlock(block, pageIndex, byId, () => order++);
  }

  const items = [...byId.values()]
    .sort((a, b) => a.order - b.order)
    .map(item => ({
      id: item.id,
      kind: item.kind,
      revisionId: item.revisionId,
      author: item.author,
      date: item.date,
      text: item.textParts.join(''),
      pageIndex: item.pageIndex,
      pageNumber: item.pageIndex + 1,
      occurrences: item.occurrences,
      pages: [...item.pages].sort((a, b) => a - b).map(index => index + 1)
    }));

  const counts = { total: items.length, insert: 0, delete: 0, moveFrom: 0, moveTo: 0 };
  for (const item of items) {
    if (item.kind === 'ins') counts.insert += 1;
    else if (item.kind === 'del') counts.delete += 1;
    else if (item.kind === 'moveFrom') counts.moveFrom += 1;
    else if (item.kind === 'moveTo') counts.moveTo += 1;
  }

  return { items, counts };
}

function collectBlock(block, pageIndex, byId, nextOrder) {
  if (!block) return;
  if (block.type === 'paragraph') {
    for (const line of block.lines || []) {
      for (const fragment of line.fragments || []) collectFragment(fragment, pageIndex, byId, nextOrder);
    }
    return;
  }
  if (block.type === 'table') {
    for (const row of block.rows || []) {
      for (const cell of row.cells || []) {
        for (const child of cell.blocks || []) collectBlock(child, pageIndex, byId, nextOrder);
      }
    }
  }
}

function collectFragment(fragment, pageIndex, byId, nextOrder) {
  const revision = fragment?.revision;
  const id = revisionChangeId(revision);
  if (!id) return;
  let item = byId.get(id);
  if (!item) {
    item = {
      id,
      order: nextOrder(),
      kind: revision.kind,
      revisionId: revision.id ?? null,
      author: revision.author || null,
      date: revision.date || null,
      pageIndex,
      pages: new Set(),
      textParts: [],
      occurrences: 0
    };
    byId.set(id, item);
  }
  item.pages.add(pageIndex);
  item.occurrences += 1;
  if (fragment.type === 'text' || fragment.type === 'tab') item.textParts.push(fragment.text || '');
}

function pageBlocks(page) {
  const blocks = [];
  if (page.header?.blocks) blocks.push(...page.header.blocks);
  if (page.footer?.blocks) blocks.push(...page.footer.blocks);
  for (const float of page.floats || []) blocks.push(float);
  const columns = page.regions?.length
    ? page.regions.flatMap(region => region.columns || [])
    : (page.columns || []);
  for (const column of columns) blocks.push(...(column.blocks || []));
  if (page.footnotes?.blocks) blocks.push(...page.footnotes.blocks);
  return blocks;
}
