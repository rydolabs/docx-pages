import { repositionBlock, splitBlockForHeight } from "../primitives/block-operations.js";

/**
 * Balance the content of a multi-column region at a continuous section boundary.
 *
 * This module deliberately works on already-laid-out blocks. It does not know
 * about sections, pages, or transition rules; callers decide when balancing is
 * appropriate. That keeps pagination policy separate from column composition.
 */
export function balanceRegionColumns(region, { enabled = true, tolerancePt = 0.25 } = {}) {
  if (!enabled || !region || (region.columns?.length || 0) < 2) return region;

  const sourceEntries = collectRegionBlockEntries(region);
  if (!sourceEntries.length) return region;

  const columns = region.columns || [];
  const fullHeightPt = Math.min(...columns.map(column => column.heightPt || 0));
  if (!(fullHeightPt > 0)) return region;

  const totalHeightPt = sourceEntries.reduce((sum, entry) => sum + Math.max(0, entry.block.heightPt || 0), 0);
  let low = Math.max(0.01, totalHeightPt / columns.length);
  let high = fullHeightPt;
  let best = tryComposeBalancedColumns(sourceEntries, columns, high);
  if (!best) return region;

  // Find the smallest common column height that can contain the content.
  for (let i = 0; i < 18 && high - low > tolerancePt; i++) {
    const mid = (low + high) / 2;
    const trial = tryComposeBalancedColumns(sourceEntries, columns, mid);
    if (trial) {
      high = mid;
      best = trial;
    } else {
      low = mid;
    }
  }

  region.columns = best.columns;
  region.balanced = true;
  region.balancedHeightPt = best.usedHeightPt;
  return region;
}

export function flattenRegionBlocks(region) {
  return collectRegionBlockEntries(region).map(entry => entry.block);
}

function collectRegionBlockEntries(region) {
  const result = [];
  for (const column of region?.columns || []) {
    for (const block of column.blocks || []) {
      result.push({
        block,
        relativeXPt: (block.x || 0) - (column.x || 0)
      });
    }
  }
  return result;
}

function tryComposeBalancedColumns(sourceEntries, columnTemplates, targetHeightPt) {
  const columns = columnTemplates.map(template => ({ ...template, blocks: [] }));
  let columnIndex = 0;
  let y = columns[0].y;

  const nextColumn = () => {
    columnIndex += 1;
    if (columnIndex >= columns.length) return null;
    y = columns[columnIndex].y;
    return columns[columnIndex];
  };

  for (let sourceIndex = 0; sourceIndex < sourceEntries.length; sourceIndex++) {
    const entry = sourceEntries[sourceIndex];
    let block = cloneLayoutBlock(entry.block);
    const relativeXPt = entry.relativeXPt;

    // Preserve keepNext as a composition rule instead of letting the balancing
    // pass separate a short linked chain merely to make columns look even.
    if (block.type === "paragraph" && block.keepNext) {
      const chainHeightPt = measureKeepNextChain(sourceEntries, sourceIndex);
      const column = columns[columnIndex];
      const remaining = column ? Math.max(0, column.y + targetHeightPt - y) : 0;
      if (chainHeightPt <= targetHeightPt + 0.001 && chainHeightPt > remaining + 0.001) {
        if (!nextColumn()) return null;
      }
    }

    while (block) {
      let column = columns[columnIndex];
      if (!column) return null;
      const columnBottom = column.y + targetHeightPt;
      const remaining = Math.max(0, columnBottom - y);

      if ((block.heightPt || 0) <= remaining + 0.001) {
        placeBalancedBlock(column, block, y, relativeXPt);
        y += block.heightPt || 0;
        block = null;
        continue;
      }

      // Prefer a paragraph/block boundary when the whole block can fit in a
      // fresh balanced column. Word's column balancing generally avoids
      // stranding only the first few lines of a paragraph at the bottom of a
      // column when that paragraph can move intact to the next column. Keep
      // splitting as a fallback for blocks taller than the target height or
      // when the current column is otherwise empty.
      const canMoveWholeToNextColumn =
        column.blocks.length > 0 &&
        columnIndex < columns.length - 1 &&
        (block.heightPt || 0) <= targetHeightPt + 0.001;
      if (canMoveWholeToNextColumn) {
        column = nextColumn();
        if (!column) return null;
        continue;
      }

      const split = splitBalancedBlock(block, remaining);
      if (split) {
        placeBalancedBlock(column, split.first, y, relativeXPt);
        column = nextColumn();
        if (!column) return null;
        block = split.rest;
        continue;
      }

      if (column.blocks.length) {
        column = nextColumn();
        if (!column) return null;
        continue;
      }

      // An unsplittable block cannot fit at this candidate height.
      return null;
    }
  }

  const usedHeightPt = columns.reduce((max, column) => {
    const bottom = column.blocks.reduce((value, block) => Math.max(value, (block.y || 0) + (block.heightPt || 0)), column.y);
    return Math.max(max, bottom - column.y);
  }, 0);

  for (const column of columns) column.balancedHeightPt = usedHeightPt;
  return { columns, usedHeightPt };
}

function measureKeepNextChain(entries, startIndex) {
  let total = 0;
  for (let i = startIndex; i < entries.length; i++) {
    const block = entries[i].block;
    total += Math.max(0, block?.heightPt || 0);
    if (block?.type !== "paragraph" || !block.keepNext) break;
  }
  return total;
}

function splitBalancedBlock(block, remaining) {
  return splitBlockForHeight(block, remaining);
}

function placeBalancedBlock(column, block, y, relativeXPt = 0) {
  const x = column.x + relativeXPt;
  repositionBlock(block, { x, y, widthPt: block.widthPt });
  column.blocks.push(block);
}

function cloneLayoutBlock(block) {
  if (typeof structuredClone === "function") return structuredClone(block);
  return JSON.parse(JSON.stringify(block));
}
