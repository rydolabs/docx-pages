import { applyBoxStyle } from "./css-renderer.js";
import { renderTextBlock } from "./text-renderer.js";

export function renderTable(block, doc = document, renderOptions = {}) {
  const table = doc.createElement("div");
  table.className = "docx-table";
  applyBoxStyle(table, block);
  applyShading(table, block.properties?.shading || block.style?.shading);

  const rows = block.rows || [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = row.cells || [];
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex];
      if (cell.isMergeContinuation) continue;
      const cellElement = doc.createElement("div");
      cellElement.className = "docx-table-cell";
      cellElement.style.position = "absolute";
      cellElement.style.left = `${cell.x - block.x}pt`;
      cellElement.style.top = `${cell.y - block.y}pt`;
      cellElement.style.width = `${cell.widthPt}pt`;
      cellElement.style.height = `${cell.heightPt}pt`;
      cellElement.style.boxSizing = "border-box";
      applyShading(cellElement, cell.properties?.shading);
      applyCellBorders(cellElement, block, cell, rowIndex, cellIndex, rows.length, cells.length);

      for (const child of cell.blocks || []) {
        const rendered = child.type === "paragraph"
          ? renderTextBlock(child, doc, {}, renderOptions)
          : child.type === "table"
            ? renderTable(child, doc, renderOptions)
            : null;
        if (!rendered) continue;
        rendered.style.left = `${child.x - cell.x}pt`;
        rendered.style.top = `${child.y - cell.y}pt`;
        cellElement.appendChild(rendered);
      }
      table.appendChild(cellElement);
    }
  }
  return table;
}


function applyCellBorders(el, table, cell, rowIndex, cellIndex, rowCount, cellCount) {
  const own = cell.properties?.borders || {};
  const tableBorders = table.properties?.borders || table.style?.borders || {};
  // Shared table borders are a single Word border, not two CSS borders.
  // Paint table-level insideH/insideV only on the preceding cell's bottom/right
  // edge. Explicit cell borders remain eligible on any side.
  const columnCount = Math.max(0, table.columnWidths?.length || 0);
  const gridStart = Number.isFinite(Number(cell.gridStart)) ? Number(cell.gridStart) : cellIndex;
  const gridSpan = Math.max(1, Number(cell.gridSpan || 1));
  const atLeftEdge = gridStart <= 0;
  const atRightEdge = columnCount > 0 ? gridStart + gridSpan >= columnCount : cellIndex === cellCount - 1;
  const sides = {
    top: own.top || (rowIndex === 0 ? tableBorders.top : null),
    right: own.right || own.end || (atRightEdge ? (tableBorders.right || tableBorders.end) : tableBorders.insideV),
    bottom: own.bottom || (rowIndex === rowCount - 1 ? tableBorders.bottom : tableBorders.insideH),
    left: own.left || own.start || (atLeftEdge
      ? (tableBorders.left || tableBorders.start)
      : (cellIndex === 0 && gridStart > 0 ? tableBorders.insideV : null))
  };
  for (const [side, border] of Object.entries(sides)) applyBorder(el, side, border);
}

function applyBorder(el, side, border) {
  if (!border || border.value === "nil" || border.value === "none") return;
  const widthPt = border.size != null ? Math.max(0.25, Number(border.size) / 8) : 0.5;
  const style = borderStyle(border.value);
  const rawColor = border.resolvedColor || ((!border.color || border.color === "auto") ? "000000" : border.color);
  const color = `#${String(rawColor).replace(/^#/, "")}`;
  el.style[`border${capitalize(side)}Width`] = `${widthPt}pt`;
  el.style[`border${capitalize(side)}Style`] = style;
  el.style[`border${capitalize(side)}Color`] = color;
}

function borderStyle(value) {
  if (["dashed", "dashSmallGap", "dashDotStroked"].includes(value)) return "dashed";
  if (["dotted", "dotDash", "dotDotDash"].includes(value)) return "dotted";
  if (["double", "triple"].includes(value)) return "double";
  return "solid";
}

function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

function applyShading(el, shading) {
  if (!shading) return;
  const fill = shading.resolvedFill || (shading.fill && shading.fill !== "auto" ? shading.fill : null);
  if (!fill) return;
  const value = String(fill).replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(value)) el.style.backgroundColor = `#${value}`;
}
