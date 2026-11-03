const round = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : value;

export function summarizeLayout(layout, pageIndex) {
  const page = layout.pages?.[pageIndex];
  if (!page) return { pages: layout.pages?.length || 0, pageIndex, missing: true };
  return {
    pages: layout.pages.length,
    pageIndex,
    widthPt: round(page.widthPt),
    heightPt: round(page.heightPt),
    margins: summarizeMargins(page.margins),
    regions: (page.regions || []).map(summarizeRegion),
    floats: (page.floats || []).map(summarizeBlock),
    footnotes: page.footnotes ? {
      x: round(page.footnotes.x), y: round(page.footnotes.y),
      widthPt: round(page.footnotes.widthPt), heightPt: round(page.footnotes.heightPt),
      ids: [...(page.footnotes.ids || [])],
      blocks: (page.footnotes.blocks || []).map(summarizeBlock)
    } : null,
    diagnostics: (layout.diagnostics || []).map(item => ({ code: item.code || null, level: item.level || item.severity || null }))
  };
}

function summarizeMargins(margins = {}) {
  return Object.fromEntries(['top','right','bottom','left','header','footer']
    .filter(key => margins[key] != null)
    .map(key => [key, round(margins[key])]));
}

function summarizeRegion(region) {
  return {
    index: region.index ?? null,
    sectionIndex: region.sectionIndex ?? null,
    x: round(region.x), y: round(region.y), widthPt: round(region.widthPt), heightPt: round(region.heightPt),
    columns: (region.columns || []).map(column => ({
      index: column.index ?? null,
      x: round(column.x), y: round(column.y), widthPt: round(column.widthPt), heightPt: round(column.heightPt),
      blocks: (column.blocks || []).map(summarizeBlock)
    }))
  };
}

function summarizeBlock(block) {
  if (!block) return null;
  const common = {
    type: block.type || 'unknown',
    x: round(block.x), y: round(block.y), widthPt: round(block.widthPt), heightPt: round(block.heightPt)
  };
  if (block.type === 'paragraph') {
    return {
      ...common,
      lineCount: block.lines?.length || 0,
      text: (block.lines || []).map(line => line.text || (line.fragments || []).map(fragment => fragment.text || '').join('')).join('\n').slice(0, 160)
    };
  }
  if (block.type === 'table') {
    return {
      ...common,
      layoutMode: block.layoutMode || null,
      columnWidths: (block.columnWidths || []).map(round),
      rows: (block.rows || []).map(row => ({
        heightPt: round(row.heightPt),
        repeatHeader: !!row.repeatHeader,
        cantSplit: !!row.cantSplit,
        cells: (row.cells || []).map(cell => ({
          widthPt: round(cell.widthPt), heightPt: round(cell.heightPt),
          gridSpan: cell.gridSpan || cell.properties?.gridSpan || 1,
          vMerge: cell.vMerge || cell.properties?.vMerge || null,
          blockTypes: (cell.blocks || []).map(child => child.type)
        }))
      }))
    };
  }
  if (block.type === 'media' || block.type === 'drawing' || block.type === 'shape') {
    return { ...common, wrap: block.wrap?.type || block.wrapType || null, textboxBlocks: block.textbox?.blocks?.length || block.textboxLayout?.blocks?.length || 0 };
  }
  return common;
}
