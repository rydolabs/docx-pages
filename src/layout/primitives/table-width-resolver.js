import { twipToPt } from "../../common/units.js";

/**
 * Resolve table and grid geometry without performing cell content layout.
 * This is intentionally a bounded Word-like width resolver rather than a
 * browser-table auto-layout replacement.
 */
export function resolveTableGeometry(node, availableWidthPt, { measureCell = null } = {}) {
  const available = Math.max(0, Number(availableWidthPt || 0));
  const layoutMode = normalizeLayoutMode(node.properties?.layout || node.style?.layout);
  const explicitTableWidthPt = resolveWidth(node.properties?.width || node.style?.width, available);
  const grid = normalizeGrid(node.grid || []);
  const columnCount = resolveColumnCount(node, grid);
  const preferred = grid.length
    ? normalizeColumnCount(grid, columnCount)
    : Array.from({ length: columnCount }, () => 0);
  const minimum = Array.from({ length: columnCount }, () => 0);
  const contentPreferred = Array.from({ length: columnCount }, () => 0);

  applyCellPreferredWidths(preferred, node.rows || [], available);
  if (layoutMode === "autofit" && measureCell) {
    applyCellContentConstraints({ minimum, contentPreferred }, node.rows || [], measureCell);
  }

  const baseColumns = resolveBaseColumns({
    preferred,
    minimum,
    contentPreferred,
    layoutMode,
    hasGrid: grid.length > 0
  });
  const naturalWidthPt = sum(baseColumns);
  const minimumWidthPt = sum(minimum);
  const tableWidthPt = resolveTableWidth({
    available,
    explicitTableWidthPt,
    naturalWidthPt,
    minimumWidthPt,
    layoutMode,
    hasGrid: grid.length > 0
  });

  const columnWidths = fitColumns(baseColumns, tableWidthPt, columnCount);
  return { tableWidthPt, columnWidths, layoutMode };
}

export function resolvePreferredCellWidth(width, tableBaseWidthPt) {
  return resolveWidth(width, tableBaseWidthPt);
}

function resolveTableWidth({ available, explicitTableWidthPt, naturalWidthPt, minimumWidthPt, layoutMode, hasGrid }) {
  if (explicitTableWidthPt != null) {
    const preferred = layoutMode === "autofit" ? Math.max(explicitTableWidthPt, minimumWidthPt) : explicitTableWidthPt;
    return clampWidth(preferred, available);
  }
  if (naturalWidthPt > 0) return clampWidth(naturalWidthPt, available);
  return available;
}

function resolveBaseColumns({ preferred, minimum, contentPreferred, layoutMode, hasGrid }) {
  if (layoutMode === "fixed") return preferred;
  if (hasGrid) {
    return preferred.map((value, index) => Math.max(value, minimum[index] || 0));
  }
  return preferred.map((value, index) => Math.max(value, contentPreferred[index] || 0, minimum[index] || 0));
}

function fitColumns(preferred, tableWidthPt, columnCount) {
  if (!columnCount) return [];
  const values = preferred.length
    ? preferred.map(v => Math.max(0, Number(v || 0)))
    : Array.from({ length: columnCount }, () => 0);
  const total = sum(values);
  if (total <= 0) return Array.from({ length: columnCount }, () => tableWidthPt / columnCount);
  const scale = tableWidthPt / total;
  return values.map(v => v * scale);
}

function applyCellPreferredWidths(columns, rows, tableBaseWidthPt) {
  for (const row of rows) {
    // A row may omit leading grid columns (w:gridBefore). The first stored
    // cell begins after those tracks, not at grid column zero.
    let gridIndex = Math.max(0, Number(row.properties?.gridBefore || 0));
    for (const cell of row.cells || []) {
      const span = Math.max(1, Number(cell.properties?.gridSpan || 1));
      ensureColumns(columns, gridIndex + span);
      const preferredPt = resolvePreferredCellWidth(cell.properties?.width, tableBaseWidthPt);
      if (preferredPt != null && preferredPt > 0) {
        ensureSpanWidth(columns, gridIndex, span, preferredPt);
      }
      gridIndex += span;
    }
  }
}

function applyCellContentConstraints(target, rows, measureCell) {
  for (const row of rows) {
    // A row may omit leading grid columns (w:gridBefore). The first stored
    // cell begins after those tracks, not at grid column zero.
    let gridIndex = Math.max(0, Number(row.properties?.gridBefore || 0));
    for (const cell of row.cells || []) {
      const span = Math.max(1, Number(cell.properties?.gridSpan || 1));
      ensureColumns(target.minimum, gridIndex + span);
      ensureColumns(target.contentPreferred, gridIndex + span);
      const metrics = measureCell(cell) || {};
      if (Number(metrics.minWidthPt) > 0) {
        ensureSpanWidth(target.minimum, gridIndex, span, Number(metrics.minWidthPt));
      }
      if (Number(metrics.preferredWidthPt) > 0) {
        ensureSpanWidth(target.contentPreferred, gridIndex, span, Number(metrics.preferredWidthPt));
      }
      gridIndex += span;
    }
  }
}

function ensureSpanWidth(columns, start, span, desiredPt) {
  const current = sum(columns.slice(start, start + span));
  if (current >= desiredPt) return;
  const delta = desiredPt - current;
  const basis = columns.slice(start, start + span);
  const basisTotal = sum(basis);
  for (let i = 0; i < span; i++) {
    const ratio = basisTotal > 0 ? basis[i] / basisTotal : 1 / span;
    columns[start + i] += delta * ratio;
  }
}

function resolveColumnCount(node, grid) {
  const rowColumns = (node.rows || []).map(row =>
    Math.max(0, Number(row.properties?.gridBefore || 0))
      + (row.cells || []).reduce((count, cell) => count + Math.max(1, Number(cell.properties?.gridSpan || 1)), 0)
      + Math.max(0, Number(row.properties?.gridAfter || 0))
  );
  return Math.max(1, grid.length, ...rowColumns, 1);
}

function normalizeGrid(grid) {
  return grid.map(twipToPt).map(Number).filter(v => Number.isFinite(v) && v > 0);
}

function normalizeColumnCount(grid, count) {
  const result = grid.slice(0, count);
  while (result.length < count) result.push(0);
  return result;
}

function ensureColumns(columns, count) {
  while (columns.length < count) columns.push(0);
}

function resolveWidth(width, baseWidthPt) {
  if (!width || width.value == null || width.type === "auto" || width.type === "nil") return null;
  if (width.type === "pct") return Math.max(0, Number(baseWidthPt || 0) * Number(width.value) / 5000);
  return Math.max(0, twipToPt(width.value));
}

function normalizeLayoutMode(value) {
  return value === "fixed" ? "fixed" : "autofit";
}

function clampWidth(value, available) {
  if (!Number.isFinite(value)) return available;
  return available > 0 ? Math.min(available, Math.max(0, value)) : Math.max(0, value);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}
