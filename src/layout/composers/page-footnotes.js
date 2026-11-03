import { createFlowFactories } from './flow-factory.js';
import { composeBlockFactories } from './flow-composer.js';
import { repositionBlock, splitBlockForHeight } from '../primitives/block-operations.js';

const MEASURE_HEIGHT_PT = 100000;
const DEFAULT_SEPARATOR_GAP_PT = 6;

/** Collect normal footnote ids in visual/page flow order. */
export function collectPageFootnoteIds(page) {
  const ids = [];
  const seen = new Set();
  const add = id => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  const scanParagraph = block => {
    for (const line of block.lines || []) {
      for (const fragment of line.fragments || []) {
        if (fragment.noteReference && fragment.noteKind === 'footnote' && !fragment.noteBodyMarker) add(fragment.noteId);
      }
    }
  };
  const scanBlock = block => {
    if (!block) return;
    if (block.type === 'paragraph') return scanParagraph(block);
    if (block.type === 'table') {
      for (const row of block.rows || []) {
        for (const cell of row.cells || []) {
          for (const child of cell.blocks || []) scanBlock(child);
        }
      }
    }
  };
  for (const region of page.regions || []) for (const column of region.columns || []) for (const block of column.blocks || []) scanBlock(block);
  for (const block of page.floats || []) scanBlock(block);
  return ids;
}

/**
 * Measure a page-wide basic footnote story using the same paragraph/table
 * primitives as body flow. No page/section policy lives here.
 */
export function measurePageFootnotes(ids, {
  documentIR,
  layoutContext,
  measurer,
  fontResolver,
  lineBreaker,
  separatorGapPt = DEFAULT_SEPARATOR_GAP_PT
}) {
  const notes = (ids || [])
    .map(id => documentIR.footnotes?.[id] ?? documentIR.footnotes?.[String(id)])
    .filter(note => note && (note.type === 'normal' || !note.type));
  if (!notes.length) return null;

  const nodes = notes.flatMap(note => note.content || []);
  const factories = createFlowFactories(nodes, {
    layoutContext,
    documentIR,
    measurer,
    fontResolver,
    lineBreaker
  });
  const column = {
    index: 0,
    x: layoutContext.margins.left,
    y: 0,
    widthPt: layoutContext.bodyWidthPt,
    heightPt: MEASURE_HEIGHT_PT,
    blocks: []
  };
  let y = 0;
  const flow = {
    current: () => ({ page:null, region:null, column, columnIndex:0, y }),
    setY: value => { y = value; },
    exclusions: () => [],
    hasPriorContent: () => column.blocks.length > 0,
    markContent: () => {},
    advancePage: () => column,
    advanceColumn: () => column
  };
  composeBlockFactories(factories, flow);
  const contentHeightPt = Math.max(0, ...column.blocks.map(block => (block.y || 0) + (block.heightPt || 0)));
  return {
    ids: [...ids],
    notes,
    blocks: column.blocks,
    contentHeightPt,
    separatorGapPt,
    reservePt: contentHeightPt + separatorGapPt
  };
}


/**
 * Split an already-measured footnote story into the portion that fits within
 * one page-bottom area and a normalized carry story for the following page.
 * This is deliberately metric-driven: no arbitrary fraction of the body is
 * reserved for footnotes. Continuation occurs only when the story physically
 * exceeds the supplied content height.
 */
export function splitFootnoteStoryForHeight(blocks, availableContentHeightPt) {
  const available = Math.max(0, Number(availableContentHeightPt || 0));
  const placed = [];
  const carry = [];
  let y = 0;
  let carrying = false;

  const pushCarry = block => {
    const clone = structuredClone(block);
    const normalized = repositionBlock(clone, { x: clone.x, y: 0, widthPt: clone.widthPt });
    carry.push(normalized);
  };

  for (let index = 0; index < (blocks || []).length; index++) {
    const source = blocks[index];
    if (!source) continue;
    if (carrying) {
      pushCarry(source);
      continue;
    }

    const block = structuredClone(source);
    const height = Math.max(0, Number(block.heightPt || 0));
    const remaining = Math.max(0, available - y);
    if (height <= remaining + 0.01) {
      placed.push(repositionBlock(block, { x: block.x, y, widthPt: block.widthPt }));
      y += height;
      continue;
    }

    const split = splitBlockForHeight(block, remaining);
    if (split?.first && split?.rest) {
      const head = repositionBlock(split.first, { x: split.first.x, y, widthPt: split.first.widthPt });
      placed.push(head);
      pushCarry(split.rest);
      carrying = true;
      continue;
    }

    // Keep an unsplittable block intact. If prior content exists, carry the
    // whole block; if it is the first block, place it to guarantee progress
    // even when an indivisible object is taller than the body area.
    if (placed.length) {
      pushCarry(block);
      carrying = true;
    } else {
      placed.push(repositionBlock(block, { x: block.x, y: 0, widthPt: block.widthPt }));
      y = height;
    }
  }

  // Re-stack carry blocks from y=0 while preserving their own heights.
  let carryY = 0;
  const normalizedCarry = carry.map(block => {
    const positioned = repositionBlock(block, { x: block.x, y: carryY, widthPt: block.widthPt });
    carryY += Math.max(0, Number(positioned.heightPt || 0));
    return positioned;
  });

  const contentHeightPt = placed.length
    ? Math.max(...placed.map(block => Number(block.y || 0) + Number(block.heightPt || 0)))
    : 0;
  return { placed, carry: normalizedCarry, contentHeightPt };
}

/** Position already-measured basic footnotes at the bottom of the body area. */
export function attachPageFootnotes(page, measured, layoutContext) {
  if (!measured?.blocks?.length) {
    page.footnotes = null;
    return null;
  }
  const bodyBottomPt = layoutContext.pageHeightPt - layoutContext.margins.bottom;
  const y = Math.max(layoutContext.margins.top, bodyBottomPt - measured.reservePt);
  const contentY = y + measured.separatorGapPt;
  const blocks = measured.blocks.map(block => cloneAndRepositionBlock(block, contentY));
  page.footnotes = {
    type: 'footnotes',
    ids: measured.ids,
    x: layoutContext.margins.left,
    y,
    widthPt: layoutContext.bodyWidthPt,
    heightPt: measured.reservePt,
    separatorY: y,
    blocks
  };
  return page.footnotes;
}

function cloneAndRepositionBlock(block, contentY) {
  const clone = structuredClone(block);
  // Measurement lays footnote blocks out from y=0. Preserve each block's
  // measured relative offset when moving the complete story to page bottom.
  return repositionBlock(clone, {
    x: clone.x,
    y: (clone.y || 0) + contentY,
    widthPt: clone.widthPt
  });
}

/**
 * Stack a continued footnote story before notes first referenced on this page.
 * Reposition every block, not just its outer y: paragraphs contain absolute
 * line coordinates and tables contain absolute row/cell/child coordinates.
 */
export function stackFootnoteStoryBlocks(carry, incoming) {
  let y = 0;
  const blocks = [];
  for (const source of [...(carry || []), ...(incoming || [])]) {
    const block = structuredClone(source);
    repositionBlock(block, { x: block.x, y, widthPt: block.widthPt });
    y += Math.max(0, Number(block.heightPt || 0));
    blocks.push(block);
  }
  return blocks;
}
