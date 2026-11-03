import { repositionBlock, splitBlockAtForcedBreak, splitBlockForHeight } from "../primitives/block-operations.js";

/**
 * Compose block factories into a flow controller.
 *
 * The controller owns navigation (region/column/page). This module only owns
 * Word block-flow rules, so the same composer can be reused by ordinary page
 * pagination and continuous-section region pagination.
 */
export function composeBlockFactories(blockFactories, flow) {
  for (let factoryIndex = 0; factoryIndex < blockFactories.length; factoryIndex++) {
    const make = blockFactories[factoryIndex];
    let { column, y } = flow.current();
    let block = createBlockForFlow(make, column, y, flow.exclusions());
    ({ block, y } = applyContextualSpacing(column, block, y));
    y = block?.flowStartY ?? y;
    flow.setY(y);

    if (block?.pageBreakBefore && flow.hasPriorContent()) {
      column = flow.advancePage();
      y = flow.current().y;
      block = createBlockForFlow(make, column, y, flow.exclusions());
      y = block?.flowStartY ?? y;
      flow.setY(y);
    }

    if (block?.type === "paragraph" && block.keepNext) {
      const remaining = Math.max(0, column.y + column.heightPt - y);
      const chainHeightPt = measureKeepNextChain(blockFactories, factoryIndex, {
        x: column.x, y, widthPt: column.widthPt
      });
      if (chainHeightPt > remaining && chainHeightPt <= column.heightPt) {
        column = flow.advanceColumn();
        y = flow.current().y;
        block = createBlockForFlow(make, column, y, flow.exclusions());
        y = block?.flowStartY ?? y;
        flow.setY(y);
      }
    }

    while (block) {
      ({ column, y } = flow.current());
      const bottom = column.y + column.heightPt;
      const remaining = Math.max(0, bottom - y);

      if (block.type === "paragraph") {
        const forced = splitBlockAtForcedBreak(block);
        if (forced) {
          let breakSatisfiedByOverflow = false;
          if (forced.first.heightPt > remaining && (column.blocks.length || y > column.y)) {
            column = forced.breakType === "page" ? flow.advancePage() : flow.advanceColumn();
            y = flow.current().y;
            // A break-only paragraph that no longer fits at the bottom of the
            // current page has already crossed the physical page boundary.
            // Advancing once more for its forced page break would create an
            // extra blank page (Word consumes the break at that boundary).
            breakSatisfiedByOverflow = forced.breakType === "page" && !hasVisibleParagraphContent(forced.first);
          }
          placeBlock(column, forced.first, y);
          flow.markContent();
          if (!breakSatisfiedByOverflow) {
            if (forced.breakType === "page") column = flow.advancePage();
            else column = flow.advanceColumn();
          }
          y = flow.current().y;
          block = forced.rest ? repositionBlock(forced.rest, { x: column.x, y, widthPt: column.widthPt }) : null;
          flow.setY(y);
          continue;
        }
      }

      if (block.heightPt <= remaining) {
        placeBlock(column, block, y);
        y += block.heightPt;
        flow.setY(y);
        flow.markContent();
        block = null;
        continue;
      }

      // keepLines and cantSplit normally move intact content to a fresh
      // region. When even an empty region is too short, those hints must
      // yield to a physical-page break so the content is not clipped.
      let split = splitBlockForHeight(block, remaining);
      if (!split && (block.type === "table" || block.type === "paragraph")
          && block.heightPt > column.heightPt + 0.001
          && column.blocks.length === 0 && y <= column.y + 0.001) {
        split = splitBlockForHeight(block, remaining, {
          allowOversizedCantSplit: true,
          allowOversizedKeepLines: true,
          fullRegionHeightPt: column.heightPt
        });
      }
      if (split) {
        placeBlock(column, split.first, y);
        flow.markContent();
        column = flow.advanceColumn();
        y = flow.current().y;
        block = repositionBlock(split.rest, { x: column.x, y, widthPt: column.widthPt });
        flow.setY(y);
        continue;
      }

      if (column.blocks.length) {
        column = flow.advanceColumn();
        y = flow.current().y;
        block = createBlockForFlow(make, column, y, flow.exclusions());
        y = block?.flowStartY ?? y;
        flow.setY(y);
        continue;
      }

      placeBlock(column, block, y);
      y += block.heightPt;
      flow.setY(y);
      flow.markContent();
      block = null;
    }
  }
  return flow.current();
}

function applyContextualSpacing(column, block, y) {
  if (!block || block.type !== "paragraph") return { block, y };
  const previous = column.blocks?.[column.blocks.length - 1];
  if (!previous || previous.type !== "paragraph") return { block, y };

  const before = Math.max(0, Number(block.spacingBeforePt || 0));
  const after = Math.max(0, Number(previous.spacingAfterPt || 0));
  const currentStyleId = block.style?.styleId ?? null;
  const previousStyleId = previous.style?.styleId ?? null;
  const suppressContextual = !!block.contextualSpacing && !!currentStyleId && currentStyleId === previousStyleId;

  // Word collapses adjacent paragraph after/before spacing to the larger value
  // instead of adding the two values. contextualSpacing suppresses the gap
  // entirely for consecutive paragraphs of the same style.
  const desiredGap = suppressContextual ? 0 : Math.max(after, before);
  const encodedGap = after + before;
  const reduction = Math.max(0, encodedGap - desiredGap);
  if (!reduction) return { block, y };

  const adjustedY = Math.max(column.y, y - reduction);
  const adjusted = repositionBlock(block, { x: block.x, y: adjustedY, widthPt: block.widthPt });
  adjusted.flowStartY = adjustedY;
  return { block: adjusted, y: adjustedY };
}

function createBlockForFlow(make, column, y, exclusions) {
  if (make.kind === "paragraph") {
    const block = make({
      x: column.x,
      y,
      widthPt: column.widthPt,
      flowResolver: ({ y: lineY, estimatedHeightPt = 0, clear = null, x: lineX = column.x, widthPt: lineWidthPt = column.widthPt }) =>
        resolveFlowBox(column, lineY, exclusions, estimatedHeightPt, clear, { x: lineX, widthPt: lineWidthPt })
    });
    const firstLineY = block?.lines?.[0]?.y;
    if (firstLineY != null) block.flowStartY = Math.max(y, firstLineY - (block.spacingBeforePt || 0));
    return block;
  }
  let flowBox = resolveFlowBox(column, y, exclusions, 0);
  let block = make({ x: flowBox.x, y: flowBox.y, widthPt: flowBox.widthPt });

  // Paragraphs resolve exclusions line-by-line. A table is measured as one block,
  // so its start point alone is not enough: it can begin above a float and still
  // overlap it vertically. Re-evaluate the available box using the measured table
  // height, then relayout once in that bounded box. This keeps the policy in the
  // flow composer instead of teaching the table primitive about page floats.
  if (block && make.kind === "table") {
    const bounded = resolveFlowBox(column, y, exclusions, block.heightPt);
    if (bounded.x !== flowBox.x || bounded.y !== flowBox.y || bounded.widthPt !== flowBox.widthPt) {
      flowBox = bounded;
      block = make({ x: flowBox.x, y: flowBox.y, widthPt: flowBox.widthPt });
    }
  }

  if (block) block.flowStartY = flowBox.y;
  return block;
}

function placeBlock(column, block, y) {
  repositionBlock(block, { x: block.x, y, widthPt: block.widthPt });
  column.blocks.push(block);
}

function measureKeepNextChain(factories, startIndex, box) {
  let total = 0;
  let y = box.y;
  for (let i = startIndex; i < factories.length; i++) {
    const block = factories[i]({ x: box.x, y, widthPt: box.widthPt });
    total += block?.heightPt || 0;
    y += block?.heightPt || 0;
    if (block?.type !== "paragraph" || !block.keepNext) break;
  }
  return total;
}

export function resolveFlowBox(column, y, exclusions, lineHeightPt = 0, clear = null, horizontalBounds = null) {
  const requestedLeft = horizontalBounds?.x ?? column.x;
  const requestedRight = requestedLeft + (horizontalBounds?.widthPt ?? column.widthPt);
  const colLeft = Math.max(column.x, requestedLeft);
  const colRight = Math.min(column.x + column.widthPt, requestedRight);
  let nextY = resolveClearY(column, y, exclusions, clear);

  for (let guard = 0; guard < 32; guard++) {
    const lineBottom = nextY + Math.max(0.01, lineHeightPt || 0.01);
    const overlapping = (exclusions || []).filter(ex => {
      const exBottom = ex.y + ex.heightPt;
      return lineBottom > ex.y && nextY < exBottom;
    });

    const topBottom = overlapping.filter(ex => ex.type === "top-bottom");
    if (topBottom.length) {
      nextY = Math.max(...topBottom.map(ex => ex.y + ex.heightPt));
      continue;
    }

    const occupied = overlapping
      .filter(ex => ex.type === "side")
      .map(ex => [Math.max(colLeft, ex.x), Math.min(colRight, ex.x + ex.widthPt)])
      .filter(([left, right]) => right > left)
      .sort((a, b) => a[0] - b[0]);

    if (!occupied.length) return { x: colLeft, y: nextY, widthPt: Math.max(0, colRight - colLeft) };

    const merged = [];
    for (const interval of occupied) {
      const last = merged[merged.length - 1];
      if (!last || interval[0] > last[1]) merged.push([...interval]);
      else last[1] = Math.max(last[1], interval[1]);
    }

    const free = [];
    let cursor = colLeft;
    for (const [left, right] of merged) {
      if (left > cursor) free.push([cursor, left]);
      cursor = Math.max(cursor, right);
    }
    if (cursor < colRight) free.push([cursor, colRight]);

    if (free.length) {
      const preferred = chooseWrapSideInterval(free, overlapping, colLeft, colRight);
      const [left, right] = preferred || [...free].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0])[0];
      return { x: left, y: nextY, widthPt: Math.max(0, right - left) };
    }

    nextY = Math.min(...overlapping.map(ex => ex.y + ex.heightPt));
  }

  return { x: colLeft, y: nextY, widthPt: Math.max(0, colRight - colLeft) };
}


function chooseWrapSideInterval(free, overlapping, colLeft, colRight) {
  const sideExclusions = (overlapping || []).filter(ex => ex.type === "side");
  if (sideExclusions.length !== 1) return null;
  const ex = sideExclusions[0];
  const mode = String(ex.wrapText || "").toLowerCase();
  if (!["left", "right", "largest"].includes(mode)) return null;
  if (mode === "largest") return [...free].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0])[0] || null;
  const exLeft = Math.max(colLeft, ex.x);
  const exRight = Math.min(colRight, ex.x + ex.widthPt);
  const candidates = free.filter(([left, right]) => mode === "left" ? right <= exLeft + 0.0001 : left >= exRight - 0.0001);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0])[0];
}

function resolveClearY(column, y, exclusions, clear) {
  const mode = String(clear || "").toLowerCase();
  if (!["left", "right", "all"].includes(mode)) return y;
  const colLeft = column.x;
  const colRight = column.x + column.widthPt;
  const center = (colLeft + colRight) / 2;
  let clearedY = y;

  for (const ex of exclusions || []) {
    const exLeft = Math.max(colLeft, ex.x);
    const exRight = Math.min(colRight, ex.x + ex.widthPt);
    const exBottom = ex.y + ex.heightPt;
    if (exRight <= exLeft || exBottom <= y) continue;
    if (ex.type === "top-bottom") {
      clearedY = Math.max(clearedY, exBottom);
      continue;
    }
    if (ex.type !== "side") continue;
    const spansCenter = exLeft < center && exRight > center;
    const onLeft = exRight <= center || spansCenter;
    const onRight = exLeft >= center || spansCenter;
    if (mode === "all" || (mode === "left" && onLeft) || (mode === "right" && onRight)) {
      clearedY = Math.max(clearedY, exBottom);
    }
  }
  return clearedY;
}

function hasVisibleParagraphContent(block) {
  return !!block?.lines?.some(line => (line.fragments || []).length > 0);
}
