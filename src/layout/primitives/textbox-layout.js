import { emuToPt } from "../../common/units.js";
import { layoutParagraph } from "./text-layout.js";
import { layoutTable } from "./table-layout.js";

/**
 * Bounded textbox flow: rectangular box, paragraph/table children only.
 * Complex transforms/autofit/shape geometry remain outside this primitive.
 */
export function layoutTextbox(textBox, {
  x,
  y,
  widthPt,
  heightPt,
  insets = null,
  measurer,
  documentGrid = null,
  fontResolver = null,
  defaultTabStop = null,
  fieldContext = null,
  lineBreaker = null,
  lineBreakRules = null
} = {}) {
  if (!textBox?.content?.length) return null;
  const pad = resolveInsets(insets);
  const contentX = x + pad.leftPt;
  const contentY = y + pad.topPt;
  const contentWidthPt = Math.max(0, widthPt - pad.leftPt - pad.rightPt);
  const contentHeightPt = Math.max(0, heightPt - pad.topPt - pad.bottomPt);
  const blocks = [];
  let cursorY = contentY;

  for (const child of textBox.content) {
    let block = null;
    const common = {
      x: contentX,
      y: cursorY,
      widthPt: contentWidthPt,
      measurer,
      documentGrid,
      defaultTabStop,
      fieldContext,
      lineBreaker,
      lineBreakRules,
      ...(fontResolver ? { fontResolver } : {})
    };
    if (child.type === "paragraph") block = layoutParagraph(child, common);
    else if (child.type === "table") block = layoutTable(child, common);
    if (!block) continue;
    blocks.push(block);
    cursorY += block.heightPt;
  }

  return {
    x: contentX,
    y: contentY,
    widthPt: contentWidthPt,
    heightPt: contentHeightPt,
    overflow: Math.max(0, cursorY - (contentY + contentHeightPt)),
    blocks
  };
}

function resolveInsets(insets) {
  const read = key => insets?.[key] != null ? emuToPt(insets[key]) : 0;
  return {
    leftPt: read("leftEmu"),
    topPt: read("topEmu"),
    rightPt: read("rightEmu"),
    bottomPt: read("bottomEmu")
  };
}
