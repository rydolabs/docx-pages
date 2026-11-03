import {
  repositionParagraph,
  splitParagraphAtForcedBreak,
  splitParagraphForHeight
} from "./text-layout.js";
import { repositionTable, splitTableForHeight } from "./table-layout.js";

/**
 * Small polymorphic facade used by higher-level flow composers.
 * Flow/pagination code should not depend on paragraph/table internals directly.
 */
export function repositionBlock(block, box) {
  if (!block) return block;
  if (block.type === "paragraph") return repositionParagraph(block, box);
  if (block.type === "table") return repositionTable(block, box);
  if (box.x != null) block.x = box.x;
  if (box.y != null) block.y = box.y;
  if (box.widthPt != null) block.widthPt = box.widthPt;
  return block;
}

export function splitBlockForHeight(block, availableHeightPt, options = {}) {
  if (!block || !(availableHeightPt > 0)) return null;
  if (block.type === "paragraph") return splitParagraphForHeight(block, availableHeightPt, options);
  if (block.type === "table") return splitTableForHeight(block, availableHeightPt, options);
  return null;
}

export function splitBlockAtForcedBreak(block) {
  if (!block || block.type !== "paragraph") return null;
  return splitParagraphAtForcedBreak(block);
}
