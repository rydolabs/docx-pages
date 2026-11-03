import { createTextNode } from "./text-nodes.js";

export function createTableNode(node) {
  return {
    type: "table",
    revision: node.revision || null,
    style: node.computedStyle || {},
    properties: node.properties || {},
    grid: node.grid || [],
    rows: (node.rows || []).map(row => ({
      type: "row",
      properties: row.properties || {},
      cells: (row.cells || []).map(cell => ({
        type: "cell",
        properties: cell.properties || {},
        children: (cell.children || []).map(createTableChild).filter(Boolean)
      }))
    }))
  };
}

function createTableChild(node) {
  if (!node) return null;
  if (node.type === "table") return createTableNode(node);
  return createTextNode(node);
}
