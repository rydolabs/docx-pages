import { createColumns } from "./page-layout.js";

/** Create a layout region inside a physical page. */
export function createRegionLayout(page, context, {
  topPt = context.margins.top,
  bottomPt = context.pageHeightPt - context.margins.bottom,
  sectionIndex = 0,
  regionIndex = page.regions?.length || 0
} = {}) {
  const safeTop = Math.max(0, topPt);
  const safeBottom = Math.max(safeTop, Math.min(page.heightPt, bottomPt));
  const columns = createColumns(context, { bodyTopPt: safeTop, bodyBottomPt: safeBottom });
  const region = {
    type: "region",
    index: regionIndex,
    sectionIndex,
    x: context.margins.left,
    y: safeTop,
    widthPt: context.bodyWidthPt,
    heightPt: Math.max(0, safeBottom - safeTop),
    context,
    columns,
    columnSeparators: context.columnSeparator ? createColumnSeparators(columns, safeTop, safeBottom) : []
  };
  return region;
}

export function regionContentBottom(region) {
  let bottom = region.y;
  for (const column of region.columns || []) {
    for (const block of column.blocks || []) {
      bottom = Math.max(bottom, blockBottom(block));
    }
  }
  return bottom;
}

function blockBottom(block) {
  if (!block) return 0;
  return (block.y || 0) + (block.heightPt || 0);
}

function createColumnSeparators(columns, topPt, bottomPt) {
  const separators = [];
  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i];
    const right = columns[i + 1];
    const gapLeft = left.x + left.widthPt;
    const gapRight = right.x;
    separators.push({
      x: gapLeft + Math.max(0, gapRight - gapLeft) / 2,
      y: topPt,
      heightPt: Math.max(0, bottomPt - topPt),
      widthPt: 0.5
    });
  }
  return separators;
}
