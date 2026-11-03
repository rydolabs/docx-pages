import { twipToPt } from "../../common/units.js";
import { layoutParagraph, repositionParagraph, splitParagraphForHeight } from "./text-layout.js";
import { resolveTableGeometry } from "./table-width-resolver.js";

export function layoutTable(node, { x = 0, y = 0, widthPt, measurer, documentGrid = null, fontResolver = null, defaultTabStop = null, fieldContext = null, lineBreaker = null, lineBreakRules = null }) {
  const defaultMargins = resolveMargins(node.style?.cellMargins || node.properties?.cellMargins || {});
  const layoutMode = (node.properties?.layout || node.style?.layout) === "fixed" ? "fixed" : "autofit";
  const measureCell = layoutMode === "autofit"
    ? cell => measureCellWidthConstraints(cell, {
        defaultMargins, measurer, documentGrid, fontResolver, defaultTabStop, fieldContext, lineBreaker, lineBreakRules
      })
    : null;
  const geometry = resolveTableGeometry(node, widthPt, { measureCell });
  const tableWidthPt = geometry.tableWidthPt;
  const columnWidths = geometry.columnWidths;
  const cellSpacingPt = resolveCellSpacingPt(node.properties?.cellSpacing || node.style?.cellSpacing, tableWidthPt);
  const tableX = resolveTableX(node, x, widthPt, tableWidthPt);
  const rows = [];
  let cursorY = y;

  for (const rowNode of node.rows || []) {
    const row = layoutRow(rowNode, {
      x: tableX,
      y: cursorY,
      tableWidthPt,
      columnWidths,
      cellSpacingPt,
      defaultMargins,
      measurer,
      documentGrid,
      fontResolver,
      defaultTabStop,
      fieldContext,
      lineBreaker,
      lineBreakRules
    });
    rows.push(row);
    cursorY += row.heightPt;
  }

  rebalanceVerticalMergeRows(rows);
  applyVerticalMerges(rows);
  for (const row of rows) {
    for (const cell of row.cells || []) alignCellContent(cell);
  }

  const finalHeightPt = rows.reduce((sum, row) => sum + Number(row.heightPt || 0), 0);
  return {
    type: "table",
    x: tableX,
    y,
    widthPt: tableWidthPt,
    heightPt: finalHeightPt,
    style: node.style || {},
    properties: node.properties || {},
    columnWidths,
    cellSpacingPt,
    layoutMode,
    rows
  };
}

export function splitTableForHeight(block, availableHeightPt, {
  allowOversizedCantSplit = false,
  allowOversizedKeepLines = false,
  fullRegionHeightPt = availableHeightPt
} = {}) {
  if (block.type !== "table" || !block.rows?.length) return null;
  let used = 0;
  let fitCount = 0;
  for (const row of block.rows) {
    if (used + row.heightPt > availableHeightPt) break;
    used += row.heightPt;
    fitCount++;
  }
  if (fitCount >= block.rows.length) return null;
  fitCount = adjustForVerticalMergeBoundary(block.rows, fitCount);

  let firstRows = block.rows.slice(0, fitCount);
  let restRows = block.rows.slice(fitCount);
  const remainingHeightPt = Math.max(0, availableHeightPt - firstRows.reduce((sum, row) => sum + row.heightPt, 0));
  const splitRow = restRows.length
    ? splitSimpleRowForHeight(restRows[0], remainingHeightPt, {
        allowOversizedCantSplit,
        allowOversizedKeepLines: allowOversizedKeepLines
          && restRows[0].heightPt > fullRegionHeightPt + 0.001,
        fullRegionHeightPt
      })
    : null;
  if (splitRow) {
    firstRows = [...firstRows, splitRow.first];
    restRows = [splitRow.rest, ...restRows.slice(1)];
  }

  if (!firstRows.length || !restRows.length) return null;

  // A repeated table heading cannot occupy a physical page fragment by
  // itself. Move the heading together with the first data row instead.
  // A header-only fragment would otherwise be emitted at the bottom of a
  // page and repeated immediately on the next page.
  if (firstRows.every(row => row.repeatHeader)) return null;

  // OOXML tblHeader only repeats a contiguous sequence at the start of a
  // table. A row marked tblHeader after a data row is not a table heading.
  // This also keeps split-table continuation fragments from copying a
  // mid-table row onto every subsequent page.
  const headerRows = [];
  for (const row of block.rows) {
    if (!row.repeatHeader) break;
    headerRows.push(row);
  }
  const repeatedHeaders = headerRows.length && !restRows[0]?.repeatHeader
    ? headerRows.map(row => cloneRow(row))
    : [];

  return {
    first: cloneTableFragment(block, firstRows, splitRow ? "row-split-start" : "start"),
    rest: cloneTableFragment(block, [...repeatedHeaders, ...restRows], splitRow ? "row-split-end" : "end")
  };
}

export function repositionTable(block, { x = block.x, y = block.y, widthPt = block.widthPt } = {}) {
  const dx = x - block.x;
  let cursorY = y;
  block.x = x;
  block.y = y;
  block.widthPt = widthPt;

  for (const row of block.rows || []) {
    row.x += dx;
    row.y = cursorY;
    let cellX = x + Number(row.leadingTrackWidthPt || 0);
    const spacingPt = Number(row.cellSpacingPt || block.cellSpacingPt || 0);
    for (const cell of row.cells || []) {
      const targetX = cellX + spacingPt / 2;
      const targetY = cursorY + spacingPt / 2;
      const cellDx = targetX - cell.x;
      const cellDy = targetY - cell.y;
      cell.x = targetX;
      cell.y = targetY;
      if (!cell.isMergeMaster) cell.heightPt = Math.max(0, row.heightPt - spacingPt);
      for (const child of cell.blocks || []) {
        if (child.type === "paragraph") repositionParagraph(child, { x: child.x + cellDx, y: child.y + cellDy, widthPt: child.widthPt });
        else if (child.type === "table") repositionTable(child, { x: child.x + cellDx, y: child.y + cellDy, widthPt: child.widthPt });
      }
      cellX += Number(cell.trackWidthPt || (cell.widthPt + spacingPt));
    }
    cursorY += row.heightPt;
  }
  block.heightPt = cursorY - y;
  return block;
}

function layoutRow(rowNode, { x, y, tableWidthPt, columnWidths, cellSpacingPt = 0, defaultMargins, measurer, documentGrid, fontResolver, defaultTabStop, fieldContext, lineBreaker = null, lineBreakRules = null }) {
  const cells = [];
  const gridBefore = Math.max(0, Number(rowNode.properties?.gridBefore || 0));
  const gridAfter = Math.max(0, Number(rowNode.properties?.gridAfter || 0));
  const leadingTrackWidthPt = resolveOmittedTrackWidth(rowNode.properties?.widthBefore, columnWidths, 0, gridBefore, tableWidthPt);
  const trailingTrackWidthPt = resolveOmittedTrackWidth(rowNode.properties?.widthAfter, columnWidths, Math.max(0, columnWidths.length - gridAfter), gridAfter, tableWidthPt);
  let gridIndex = gridBefore;
  let cellX = x + leadingTrackWidthPt;
  let naturalHeightPt = 0;

  for (const cellNode of normalizeHorizontalMerges(rowNode.cells || [])) {
    const span = Math.max(1, Number(cellNode.properties?.gridSpan || 1));
    const trackWidthPt = columnWidths.slice(gridIndex, gridIndex + span).reduce((sum, w) => sum + w, 0)
      || tableWidthPt / Math.max(1, rowNode.cells.length);
    const widthPt = Math.max(0, trackWidthPt - cellSpacingPt);
    const cellXInset = cellSpacingPt / 2;
    const cellY = y + cellSpacingPt / 2;
    const margins = mergeMargins(defaultMargins, cellNode.properties?.margins);
    const contentWidthPt = Math.max(0, widthPt - margins.leftPt - margins.rightPt);
    const blocks = [];
    let contentY = cellY + margins.topPt;

    for (const child of cellNode.children || []) {
      let block = null;
      if (child.type === "paragraph") {
        block = layoutParagraph(child, { x: cellX + cellXInset + margins.leftPt, y: contentY, widthPt: contentWidthPt, measurer, documentGrid, defaultTabStop, fieldContext, lineBreaker, lineBreakRules, ...(fontResolver ? { fontResolver } : {}) });
      } else if (child.type === "table") {
        block = layoutTable(child, { x: cellX + cellXInset + margins.leftPt, y: contentY, widthPt: contentWidthPt, measurer, documentGrid, defaultTabStop, fieldContext, lineBreaker, lineBreakRules, ...(fontResolver ? { fontResolver } : {}) });
      }
      if (!block) continue;
      blocks.push(block);
      contentY += block.heightPt;
    }

    const contentHeightPt = Math.max(0, contentY - cellY - margins.topPt);
    const cellHeightPt = margins.topPt + contentHeightPt + margins.bottomPt;
    naturalHeightPt = Math.max(naturalHeightPt, cellHeightPt);
    cells.push({
      type: "cell",
      x: cellX + cellXInset,
      y: cellY,
      widthPt,
      trackWidthPt,
      heightPt: cellHeightPt,
      gridStart: gridIndex,
      gridSpan: span,
      margins,
      contentHeightPt,
      naturalHeightPt: cellHeightPt,
      blocks,
      properties: cellNode.properties || {}
    });
    cellX += trackWidthPt;
    gridIndex += span;
  }

  const requestedHeight = rowNode.properties?.height;
  const requestedPt = requestedHeight?.value != null ? twipToPt(requestedHeight.value) : 0;
  const naturalTrackHeightPt = naturalHeightPt + cellSpacingPt;
  const maxVerticalMarginsPt = cells.reduce((max, cell) => Math.max(
    max,
    Number(cell.margins?.topPt || 0) + Number(cell.margins?.bottomPt || 0)
  ), 0);
  const requestedTrackMinPt = requestedHeight?.rule === "atLeast"
    ? requestedPt + maxVerticalMarginsPt
    : requestedPt;
  const rowHeightPt = requestedHeight?.rule === "exact"
    ? Math.max(requestedPt, cellSpacingPt)
    : Math.max(naturalTrackHeightPt, requestedTrackMinPt);

  const visibleCellHeightPt = Math.max(0, rowHeightPt - cellSpacingPt);
  for (const cell of cells) cell.heightPt = visibleCellHeightPt;
  return {
    type: "row",
    x,
    y,
    widthPt: tableWidthPt,
    heightPt: rowHeightPt,
    cantSplit: !!rowNode.properties?.cantSplit,
    repeatHeader: !!rowNode.properties?.repeatHeader,
    cellSpacingPt,
    gridBefore,
    gridAfter,
    leadingTrackWidthPt,
    trailingTrackWidthPt,
    properties: rowNode.properties || {},
    cells
  };
}


function splitSimpleRowForHeight(row, availableHeightPt, {
  allowOversizedCantSplit = false,
  allowOversizedKeepLines = false,
  fullRegionHeightPt = availableHeightPt
} = {}) {
  if (!(availableHeightPt > 0) || !canSplitSimpleRow(row, {
    allowOversizedCantSplit: allowOversizedCantSplit && row.heightPt > fullRegionHeightPt + 0.001
  })) return null;
  const cellParts = [];
  let anyRest = false;
  for (const cell of row.cells || []) {
    const contentAvailable = Math.max(0, availableHeightPt - cell.margins.topPt - cell.margins.bottomPt);
    const parts = splitCellBlocks(cell, contentAvailable, {
      allowOversizedCantSplit,
      allowOversizedKeepLines,
      fullRegionHeightPt
    });
    if (!parts) return null;
    if (parts.rest.length) anyRest = true;
    cellParts.push(parts);
  }
  if (!anyRest) return null;

  const first = createRowFragment(row, cellParts.map(parts => parts.first), "start");
  const rest = createRowFragment(row, cellParts.map(parts => parts.rest), "end");
  if (!(first.heightPt > 0) || !(rest.heightPt > 0) || first.heightPt > availableHeightPt + 0.001) return null;
  return { first, rest };
}

function canSplitSimpleRow(row, { allowOversizedCantSplit = false } = {}) {
  if ((row.cantSplit && !allowOversizedCantSplit) || row.repeatHeader || row.properties?.height?.rule === "exact" || Number(row.cellSpacingPt || 0) > 0) return false;
  return (row.cells || []).every(cell => {
    if (cell.properties?.verticalMerge) return false;
    const alignment = cell.properties?.verticalAlignment;
    if (alignment && alignment !== "top") return false;
    return (cell.blocks || []).every(block => block.type === "paragraph" || block.type === "table");
  });
}

function splitCellBlocks(cell, availableHeightPt, {
  allowOversizedCantSplit = false,
  allowOversizedKeepLines = false,
  fullRegionHeightPt = availableHeightPt
} = {}) {
  const first = [];
  const rest = [];
  let used = 0;
  let overflowed = false;
  for (const original of cell.blocks || []) {
    const block = cloneBlock(original);
    if (overflowed) { rest.push(block); continue; }
    if (used + block.heightPt <= availableHeightPt + 0.001) {
      first.push(block);
      used += block.heightPt;
      continue;
    }
    const remainingHeightPt = Math.max(0, availableHeightPt - used);
    const split = block.type === "paragraph"
      ? splitParagraphForHeight(block, remainingHeightPt, {
          allowTrailingSpaceSplit: true,
          // On a trailing-spacing-only overflow, implicit widow defaults
          // must not prevent the table row from splitting. Explicit widow
          // controls continue to take priority.
          relaxWidowForTrailingSpace: block.style?.widowControl == null,
          allowOversizedKeepLines: allowOversizedKeepLines && block.heightPt > fullRegionHeightPt + 0.001
        })
      : block.type === "table"
        ? splitTableForHeight(block, remainingHeightPt, {
            // Oversized flow exception must reach nested tables. Otherwise a
            // nested cantSplit row taller than an entire page is never
            // fragmented even though the outer row may fragment.
            allowOversizedCantSplit,
            allowOversizedKeepLines,
            fullRegionHeightPt: Math.max(0, fullRegionHeightPt - cell.margins.topPt - cell.margins.bottomPt)
          })
        : null;
    if (split) {
      first.push(split.first);
      rest.push(split.rest);
      overflowed = true;
      continue;
    }
    if (!first.length) return null;
    rest.push(block);
    overflowed = true;
  }
  return { first, rest };
}

function createRowFragment(row, cellBlockLists, fragment) {
  const cells = (row.cells || []).map((cell, index) => {
    const blocks = cellBlockLists[index] || [];
    const contentHeightPt = blocks.reduce((sum, block) => sum + Number(block.heightPt || 0), 0);
    return {
      ...cell,
      blocks,
      contentHeightPt,
      heightPt: cell.margins.topPt + contentHeightPt + cell.margins.bottomPt,
      rowFragment: fragment
    };
  });
  const heightPt = Math.max(0, ...cells.map(cell => cell.heightPt));
  for (const cell of cells) {
    cell.heightPt = heightPt;
    let cursorY = row.y + cell.margins.topPt;
    for (const block of cell.blocks) {
      if (block.type === "paragraph") repositionParagraph(block, { x: block.x, y: cursorY, widthPt: block.widthPt });
      else if (block.type === "table") repositionTable(block, { x: block.x, y: cursorY, widthPt: block.widthPt });
      cursorY += block.heightPt;
    }
  }
  return { ...row, heightPt, cells, rowFragment: fragment, repeatHeader: false };
}

function cloneBlock(block) {
  if (block.type === "paragraph") {
    return {
      ...block,
      indentation: block.indentation ? { ...block.indentation } : block.indentation,
      lines: (block.lines || []).map(line => ({
        ...line,
        fragments: (line.fragments || []).map(fragment => ({ ...fragment }))
      }))
    };
  }
  if (block.type === "table") {
    return {
      ...block,
      columnWidths: [...(block.columnWidths || [])],
      rows: (block.rows || []).map(row => ({
        ...row,
        cells: (row.cells || []).map(cell => ({
          ...cell,
          margins: cell.margins ? { ...cell.margins } : cell.margins,
          blocks: (cell.blocks || []).map(cloneBlock)
        }))
      }))
    };
  }
  return { ...block };
}

function normalizeHorizontalMerges(cells) {
  const result = [];
  let active = null;
  for (const cell of cells) {
    const merge = cell.properties?.horizontalMerge;
    if (merge === "restart") {
      active = {
        ...cell,
        properties: {
          ...(cell.properties || {}),
          gridSpan: Math.max(1, Number(cell.properties?.gridSpan || 1))
        }
      };
      result.push(active);
      continue;
    }
    if (merge === "continue" && active) {
      active.properties.gridSpan += Math.max(1, Number(cell.properties?.gridSpan || 1));
      continue;
    }
    active = null;
    result.push(cell);
  }
  return result;
}

function rebalanceVerticalMergeRows(rows) {
  const spanningMasters = new Map();
  const active = new Map();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (const cell of row.cells || []) {
      const key = `${cell.gridStart}:${cell.gridSpan}`;
      const merge = cell.properties?.verticalMerge;
      if (merge === "restart") {
        active.set(key, { rowIndex, cell, endRowIndex: rowIndex });
        continue;
      }
      if (merge === "continue") {
        const entry = active.get(key);
        if (entry) {
          entry.endRowIndex = rowIndex;
          spanningMasters.set(`${entry.rowIndex}:${key}`, entry);
        }
        continue;
      }
      active.delete(key);
    }
    for (const key of [...active.keys()]) {
      const continues = (row.cells || []).some(cell => `${cell.gridStart}:${cell.gridSpan}` === key && cell.properties?.verticalMerge === "continue");
      const restarts = (row.cells || []).some(cell => `${cell.gridStart}:${cell.gridSpan}` === key && cell.properties?.verticalMerge === "restart");
      if (!continues && !restarts) active.delete(key);
    }
  }

  if (!spanningMasters.size) return;
  const spanningCells = new Set([...spanningMasters.values()].map(entry => entry.cell));

  // Recompute each physical row from cells that actually occupy that row.
  // A vertically merged master contributes content to the merged rectangle,
  // not exclusively to its first row; continuation cells similarly do not
  // impose their placeholder paragraph height on the physical row.
  for (const row of rows) {
    let natural = 0;
    for (const cell of row.cells || []) {
      const merge = cell.properties?.verticalMerge;
      // A continuation cell still establishes the physical row baseline
      // (for example the normal empty-paragraph + cell-margin minimum).
      // Only the spanning restart/master must be excluded, otherwise its
      // entire merged content is incorrectly charged to the first row.
      if (merge === "restart" && spanningCells.has(cell)) continue;
      natural = Math.max(natural, Number(cell.naturalHeightPt ?? cell.heightPt ?? 0));
    }
    const requested = row.properties?.height;
    const requestedPt = requested?.value != null ? twipToPt(requested.value) : 0;
    const spacingPt = Number(row.cellSpacingPt || 0);
    const naturalTrackHeightPt = natural + spacingPt;
    row.heightPt = requested?.rule === "exact"
      ? Math.max(requestedPt, spacingPt)
      : Math.max(naturalTrackHeightPt, requestedPt);
  }

  // If merged content still needs more room than the rows underneath provide,
  // add only the missing amount to the final row in the span. This avoids the
  // old behavior of charging the whole merged-cell height to the first row.
  for (const entry of spanningMasters.values()) {
    const required = Number(entry.cell.naturalHeightPt || 0) + Number(rows[entry.rowIndex]?.cellSpacingPt || 0);
    let available = 0;
    for (let i = entry.rowIndex; i <= entry.endRowIndex; i++) available += Number(rows[i]?.heightPt || 0);
    const deficit = required - available;
    if (deficit > 0.001 && rows[entry.endRowIndex]) rows[entry.endRowIndex].heightPt += deficit;
  }

  // Row-height changes need to be propagated to row/cell coordinates before
  // applyVerticalMerges() expands the master cell across the final span.
  let cursorY = rows[0]?.y ?? 0;
  for (const row of rows) {
    const dy = cursorY - row.y;
    row.y = cursorY;
    const visibleHeight = Math.max(0, row.heightPt - Number(row.cellSpacingPt || 0));
    for (const cell of row.cells || []) {
      cell.y += dy;
      if (!cell.isMergeMaster) cell.heightPt = visibleHeight;
      for (const block of cell.blocks || []) {
        if (block.type === "paragraph") repositionParagraph(block, { x: block.x, y: block.y + dy, widthPt: block.widthPt });
        else if (block.type === "table") repositionTable(block, { x: block.x, y: block.y + dy, widthPt: block.widthPt });
      }
    }
    cursorY += row.heightPt;
  }
}

function applyVerticalMerges(rows) {
  const active = new Map();
  for (const row of rows) {
    const continued = new Set();
    for (const cell of row.cells || []) {
      const key = `${cell.gridStart}:${cell.gridSpan}`;
      const merge = cell.properties?.verticalMerge;
      if (merge === "restart") {
        active.set(key, cell);
        cell.isMergeMaster = true;
        continue;
      }
      if (merge === "continue") {
        const master = active.get(key);
        if (master) {
          master.heightPt += row.heightPt;
          cell.isMergeContinuation = true;
          cell.mergeMaster = master;
          continued.add(key);
        }
        continue;
      }
      active.delete(key);
    }
    for (const key of [...active.keys()]) {
      const hasContinuation = (row.cells || []).some(cell => `${cell.gridStart}:${cell.gridSpan}` === key && cell.properties?.verticalMerge === "continue");
      const hasRestart = (row.cells || []).some(cell => `${cell.gridStart}:${cell.gridSpan}` === key && cell.properties?.verticalMerge === "restart");
      if (!hasContinuation && !hasRestart) active.delete(key);
    }
  }
}

function alignCellContent(cell) {
  if (cell.isMergeContinuation) return;
  const alignment = cell.properties?.verticalAlignment;
  if (!alignment || alignment === "top") return;
  const contentHeight = Number(cell.contentHeightPt || 0);
  const available = Math.max(0, cell.heightPt - cell.margins.topPt - cell.margins.bottomPt - contentHeight);
  const offset = alignment === "center" ? available / 2 : (["bottom", "bot"].includes(alignment) ? available : 0);
  if (!offset) return;
  for (const block of cell.blocks || []) {
    if (block.type === "paragraph") repositionParagraph(block, { x: block.x, y: block.y + offset, widthPt: block.widthPt });
    else if (block.type === "table") repositionTable(block, { x: block.x, y: block.y + offset, widthPt: block.widthPt });
  }
}

function measureCellWidthConstraints(cellNode, { defaultMargins, measurer, documentGrid, fontResolver, defaultTabStop, fieldContext, lineBreaker, lineBreakRules }) {
  const margins = mergeMargins(defaultMargins, cellNode.properties?.margins);
  const marginWidthPt = margins.leftPt + margins.rightPt;
  let minWidthPt = 0;
  let preferredWidthPt = 0;

  for (const child of cellNode.children || []) {
    if (child.type !== "paragraph") continue;
    const common = {
      x: 0, y: 0, measurer, documentGrid, defaultTabStop, fieldContext, lineBreaker, lineBreakRules,
      ...(fontResolver ? { fontResolver } : {})
    };
    const preferred = layoutParagraph(child, { ...common, widthPt: 100000 });
    const minimum = layoutParagraph(child, { ...common, widthPt: 0.01 });
    preferredWidthPt = Math.max(preferredWidthPt, paragraphOuterContentWidth(preferred));
    minWidthPt = Math.max(minWidthPt, paragraphOuterContentWidth(minimum));
  }

  const preferredWithMargins = preferredWidthPt + marginWidthPt;
  return {
    minWidthPt: cellNode.properties?.noWrap ? preferredWithMargins : minWidthPt + marginWidthPt,
    preferredWidthPt: preferredWithMargins
  };
}

function paragraphOuterContentWidth(block) {
  const indent = block.indentation || {};
  const lineWidth = Math.max(0, ...(block.lines || []).map(line => Number(line.widthPt || 0)));
  return Number(indent.leftPt || 0) + Number(indent.rightPt || 0) + Math.max(0, Number(indent.firstLineOffsetPt || 0)) + lineWidth;
}

function resolveTableX(node, availableX, availableWidthPt, tableWidthPt) {
  const alignment = node.properties?.alignment || node.style?.alignment || "left";
  const indent = node.properties?.indent || node.style?.indent;
  const indentPt = indent?.value != null && indent.type !== "pct" ? twipToPt(indent.value) : 0;
  if (["center"].includes(alignment)) return availableX + Math.max(0, (availableWidthPt - tableWidthPt) / 2);
  if (["right", "end"].includes(alignment)) return availableX + Math.max(0, availableWidthPt - tableWidthPt);
  return availableX + indentPt;
}

function resolveOmittedTrackWidth(explicitWidth, columnWidths, start, count, tableWidthPt) {
  if (!(count > 0)) return 0;
  const fromGrid = (columnWidths || []).slice(start, start + count).reduce((sum, value) => sum + Number(value || 0), 0);
  if (fromGrid > 0) return fromGrid;
  if (!explicitWidth || explicitWidth.value == null || explicitWidth.type === "nil" || explicitWidth.type === "auto") return 0;
  if (explicitWidth.type === "pct") return Math.max(0, Number(tableWidthPt || 0) * Number(explicitWidth.value || 0) / 5000);
  return Math.max(0, twipToPt(explicitWidth.value));
}

function resolveCellSpacingPt(spacing, tableWidthPt) {
  if (!spacing || spacing.value == null || spacing.type === "nil" || spacing.type === "auto") return 0;
  if (spacing.type === "pct") return Math.max(0, Number(tableWidthPt || 0) * Number(spacing.value || 0) / 5000);
  return Math.max(0, twipToPt(spacing.value));
}

function resolveMargins(margins) {
  // With neither a table nor a table-style setting, OOXML defines 115
  // twentieths of a point on the left/right and zero on top/bottom.
  // An explicitly supplied zero must override these built-in defaults.
  const read = (keys, fallbackPt) => {
    for (const key of keys) {
      const value = margins?.[key];
      if (value?.value != null && (value.type == null || value.type === "dxa")) {
        return twipToPt(value.value);
      }
    }
    return fallbackPt;
  };
  return {
    topPt: read(["top"], 0),
    rightPt: read(["right", "end"], 115 / 20),
    bottomPt: read(["bottom"], 0),
    leftPt: read(["left", "start"], 115 / 20)
  };
}

function cloneTableFragment(block, rows, fragment) {
  const cloned = {
    ...block,
    rows: rows.map(row => cloneRow(row)),
    fragment
  };
  return repositionTable(cloned, { x: block.x, y: block.y, widthPt: block.widthPt });
}

function cloneRow(row) {
  return {
    ...row,
    cells: (row.cells || []).map(cell => ({
      ...cell,
      blocks: (cell.blocks || []).map(cloneBlock)
    }))
  };
}


function mergeMargins(defaultMargins, rawMargins) {
  if (!rawMargins) return { ...defaultMargins };
  const own = resolveMargins(rawMargins);
  const result = { ...defaultMargins };
  for (const side of ["topPt", "rightPt", "bottomPt", "leftPt"]) {
    if (hasMarginValue(rawMargins, side)) result[side] = own[side];
  }
  return result;
}

function hasMarginValue(raw, sidePt) {
  const side = sidePt.replace("Pt", "");
  if (side === "left") return raw.left?.value != null || raw.start?.value != null;
  if (side === "right") return raw.right?.value != null || raw.end?.value != null;
  return raw[side]?.value != null;
}

function adjustForVerticalMergeBoundary(rows, fitCount) {
  let count=fitCount;
  while(count>0 && count<rows.length) {
    if (!(rows[count].cells||[]).some(cell=>cell.properties?.verticalMerge === "continue")) break;
    count--;
  }
  return count;
}
