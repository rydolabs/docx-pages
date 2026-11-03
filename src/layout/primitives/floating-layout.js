import { twipToPt, emuToPt } from "../../common/units.js";
import { layoutParagraph } from "./text-layout.js";
import { layoutTextbox } from "./textbox-layout.js";

export function layoutFloating(node, context = {}) {
  const extent = node.extent || {};
  const vmlBox = node.type === "vml" ? parseVmlBox(node.shape?.style) : null;
  const widthPt = node.widthPt ?? (extent.cx != null ? emuToPt(extent.cx) : (vmlBox?.widthPt || 0));
  const heightPt = node.heightPt ?? (extent.cy != null ? emuToPt(extent.cy) : (vmlBox?.heightPt || 0));
  const positioning = node.positioning || {};
  const horizontal = positioning.horizontal || {};
  const vertical = positioning.vertical || {};
  const x = node.xPt ?? (vmlBox?.xPt ?? resolveDrawingAxis(horizontal, "horizontal", widthPt, context));
  const desiredY = node.yPt ?? (vmlBox?.yPt ?? resolveDrawingAxis(vertical, "vertical", heightPt, context));
  const y = resolveFloatingOverlapY({ x, y: desiredY, widthPt, heightPt, positioning }, context.floatingObstacles || []);
  const textBox = node.textBox ? layoutTextbox(node.textBox, {
    x, y, widthPt, heightPt,
    insets: node.visual?.textInsets,
    measurer: context.measurer,
    documentGrid: context.documentGrid,
    fontResolver: context.fontResolver,
    defaultTabStop: context.defaultTabStop,
    fieldContext: context.fieldContext,
    lineBreaker: context.lineBreaker,
    lineBreakRules: context.lineBreakRules
  }) : null;
  return {
    type: node.type,
    x, y, widthPt, heightPt,
    positioning,
    wrap: positioning.wrap || null,
    relationshipId: node.relationshipId || null,
    resourceKey: node.resourceKey || null,
    resource: node.resourceKey ? context.resources?.[node.resourceKey] || null : null,
    textBox,
    source: node
  };
}

function resolveFloatingOverlapY(block, obstacles = []) {
  if (!block || !obstacles.length) return block?.y ?? 0;
  let y = block.y ?? 0;
  for (let guard = 0; guard < 32; guard++) {
    let nextY = y;
    const current = { ...block, y };
    for (const obstacle of obstacles) {
      if (!requiresNonOverlap(current, obstacle)) continue;
      if (!rectsOverlap(current, obstacle)) continue;
      nextY = Math.max(nextY, (obstacle.y || 0) + (obstacle.heightPt || 0));
    }
    if (nextY <= y + 0.0001) return y;
    y = nextY;
  }
  return y;
}

function requiresNonOverlap(a, b) {
  // Placement is governed by the *current* anchor's allowOverlap setting.
  // An earlier anchor's prohibition does not move a later object that
  // explicitly permits overlap (Word's floating-no-overlap reference).
  return isExplicitNoOverlap(a?.positioning?.allowOverlap);
}

function isExplicitNoOverlap(value) {
  return value === false || value === 0 || value === "0" || value === "false";
}

function rectsOverlap(a, b) {
  const ax1 = a.x || 0;
  const ay1 = a.y || 0;
  const ax2 = ax1 + (a.widthPt || 0);
  const ay2 = ay1 + (a.heightPt || 0);
  const bx1 = b.x || 0;
  const by1 = b.y || 0;
  const bx2 = bx1 + (b.widthPt || 0);
  const by2 = by1 + (b.heightPt || 0);
  return ax2 > bx1 && ax1 < bx2 && ay2 > by1 && ay1 < by2;
}

export function isPageAnchoredFrameParagraph(node) {
  const frame = node?.type === "paragraph" ? node.style?.frame : null;
  if (!frame) return false;
  return frame.hAnchor === "page" || frame.hAnchor === "margin";
}

export function layoutLeadingFrameParagraphs(nodes, context, measurer) {
  const blocks = [];
  let cursorY = context.margins.top;

  for (const group of groupAdjacentFrameParagraphs(nodes)) {
    const frame = group[0]?.style?.frame || {};
    const widthPt = frame.width != null ? twipToPt(frame.width) : context.bodyWidthPt;
    const requestedHeightPt = frame.height != null ? twipToPt(frame.height) : 0;
    const x = resolveFrameAxis(frame, "horizontal", widthPt, context, context.margins.left);
    const alignedY = resolveFrameAxis(frame, "vertical", requestedHeightPt, context, cursorY);
    const y = frame.y != null ? alignedY : Math.max(cursorY, alignedY);

    // OOXML groups adjacent paragraphs with identical framePr attributes into
    // one text frame. The frame height therefore applies once to the whole
    // group, not once per paragraph. Applying w:h to every paragraph pushes
    // following body text down noticeably in Word templates such as KIMST.
    let contentY = y;
    const groupBlocks = [];
    for (const node of group) {
      const block = layoutParagraph(node, { x, y: contentY, widthPt, measurer });
      block.isFloatingFrame = true;
      block.frame = frame;
      block.frameGroupIndex = blocks.length;
      groupBlocks.push(block);
      blocks.push(block);
      contentY += block.heightPt;
    }

    const contentHeightPt = Math.max(0, contentY - y);
    const frameHeightPt = frame.heightRule === "exact"
      ? requestedHeightPt
      : Math.max(contentHeightPt, requestedHeightPt);
    const bounds = { x, y, widthPt, heightPt: frameHeightPt };
    if (groupBlocks.length) {
      groupBlocks[0].isFrameGroupRoot = true;
      groupBlocks[0].frameGroupBounds = bounds;
      for (let i = 1; i < groupBlocks.length; i++) groupBlocks[i].suppressFrameExclusion = true;
    }

    const vSpacePt = frame.vSpace != null ? twipToPt(frame.vSpace) : 0;
    cursorY = Math.max(cursorY, y + frameHeightPt + vSpacePt);
  }

  return {
    blocks,
    bodyStartPt: cursorY
  };
}

export function groupAdjacentFrameParagraphs(nodes = []) {
  const groups = [];
  let current = [];
  let signature = null;
  for (const node of nodes) {
    const frame = node?.style?.frame || null;
    const nextSignature = frame ? frameSignature(frame) : null;
    if (!current.length || nextSignature === signature) {
      current.push(node);
      signature = nextSignature;
      continue;
    }
    groups.push(current);
    current = [node];
    signature = nextSignature;
  }
  if (current.length) groups.push(current);
  return groups;
}

function frameSignature(frame) {
  return JSON.stringify(Object.keys(frame).sort().map(key => [key, frame[key]]));
}


function resolveFrameAxis(frame, axis, sizePt, context, fallback) {
  const isHorizontal = axis === "horizontal";
  const explicit = isHorizontal ? frame.x : frame.y;
  if (explicit != null) return twipToPt(explicit);
  const align = isHorizontal ? frame.xAlign : frame.yAlign;
  const anchor = isHorizontal ? frame.hAnchor : frame.vAnchor;
  const region = resolveAnchorRegion(anchor, axis, context);
  if (!align) return fallback;
  if (["center"].includes(align)) return region.start + Math.max(0, (region.size - sizePt) / 2);
  if (["right", "bottom", "outside"].includes(align)) return region.start + Math.max(0, region.size - sizePt);
  return region.start;
}

function resolveDrawingAxis(position, axis, sizePt, context) {
  const region = resolveAnchorRegion(position.relativeFrom, axis, context);
  if (position.offset != null) return region.start + emuToPt(position.offset);
  const align = position.align;
  if (align === "center") return region.start + Math.max(0, (region.size - sizePt) / 2);
  if (["right", "bottom", "outside"].includes(align)) return region.start + Math.max(0, region.size - sizePt);
  return region.start;
}

function resolveAnchorRegion(anchor, axis, context) {
  const horizontal = axis === "horizontal";
  const pageSize = horizontal ? context.pageWidthPt : context.pageHeightPt;
  const startMargin = horizontal ? context.margins?.left || 0 : context.margins?.top || 0;
  const endMargin = horizontal ? context.margins?.right || 0 : context.margins?.bottom || 0;
  const bodySize = Math.max(0, pageSize - startMargin - endMargin);
  if (["margin", "column", "text", "insideMargin", "outsideMargin"].includes(anchor)) {
    return { start: startMargin, size: bodySize };
  }
  return { start: 0, size: pageSize };
}


function parseVmlBox(styleText) {
  if (!styleText) return null;
  const values = {};
  for (const item of String(styleText).split(";")) {
    const [rawKey, rawValue] = item.split(":");
    if (!rawKey || rawValue == null) continue;
    values[rawKey.trim().toLowerCase()] = rawValue.trim();
  }
  const toPt = value => {
    const match = /^(-?[\d.]+)pt$/i.exec(value || "");
    return match ? Number(match[1]) : null;
  };
  return {
    xPt: toPt(values["margin-left"]),
    yPt: toPt(values["margin-top"]),
    widthPt: toPt(values.width),
    heightPt: toPt(values.height)
  };
}

export function createWrapExclusion(block) {
  if (!block) return null;

  if (block.isFloatingFrame && block.frame) {
    if (block.suppressFrameExclusion) return null;
    const frameWrap = block.frame.wrap;
    if (!frameWrap || frameWrap === "none") return null;
    const hSpacePt = block.frame.hSpace != null ? twipToPt(block.frame.hSpace) : 0;
    const vSpacePt = block.frame.vSpace != null ? twipToPt(block.frame.vSpace) : 0;
    const bounds = block.frameGroupBounds || { x: block.x, y: block.y, widthPt: block.widthPt, heightPt: block.heightPt };
    return {
      type: frameWrap === "notBeside" ? "top-bottom" : "side",
      x: bounds.x - hSpacePt,
      y: bounds.y - vSpacePt,
      widthPt: bounds.widthPt + hSpacePt * 2,
      heightPt: bounds.heightPt + vSpacePt * 2
    };
  }

  if (!block.wrap || block.wrap.type === "wrapNone") return null;
  const positioning = block.positioning || {};
  const wrap = block.wrap || {};
  const toPt = value => value == null ? 0 : emuToPt(value);
  const left = toPt(wrap.distanceLeft ?? positioning.distanceLeft);
  const right = toPt(wrap.distanceRight ?? positioning.distanceRight);
  const top = toPt(wrap.distanceTop ?? positioning.distanceTop);
  const bottom = toPt(wrap.distanceBottom ?? positioning.distanceBottom);
  return {
    type: wrap.type === "wrapTopAndBottom" ? "top-bottom" : "side",
    wrapText: wrap.wrapText || null,
    x:block.x-left,
    y:block.y-top,
    widthPt:block.widthPt+left+right,
    heightPt:block.heightPt+top+bottom
  };
}
