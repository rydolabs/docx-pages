import { paginateSectionPlans } from './section-pagination.js';
import { createPageLayout } from '../primitives/page-layout.js';
import {
  collectPageFootnoteIds,
  measurePageFootnotes,
  attachPageFootnotes,
  splitFootnoteStoryForHeight,
  stackFootnoteStoryBlocks
} from '../composers/page-footnotes.js';

const MAX_FOOTNOTE_PASSES = 6;
const MAX_CONTINUATION_PAGES = 64;
const MAX_FOOTNOTE_RECOVERY_PASSES = 12;

/**
 * Bounded footnote pagination: reserve a page-wide bottom region for normal
 * footnotes and repaginate until page/reference assignment stabilizes.
 * A measured footnote story that is physically taller than a page body is
 * split and carried onto following physical pages.
 */
export function paginateWithFootnotes(plans, documentIR, services, lineBreaker, options = {}) {
  if (!hasNormalFootnotes(documentIR)) {
    return { ...paginateSectionPlans(plans, options), diagnostics: [] };
  }

  let reserves = [];
  let pagination = null;
  let signature = null;
  const diagnostics = collectFootnotePolicyDiagnostics(plans);
  let maximumObservedReserves = [];

  for (let pass = 0; pass < MAX_FOOTNOTE_PASSES; pass++) {
    pagination = paginateSectionPlans(plans, { ...options, pageBottomReserves: reserves });
    const measured = measurePaginationFootnotes(pagination, plans, documentIR, services, lineBreaker);
    const nextReserves = measured.map(item => item?.reservePt || 0);
    maximumObservedReserves = mergePageReserves(maximumObservedReserves, nextReserves);
    const nextSignature = measured.map(item => `${item?.ids?.join(',') || ''}:${item?.continued ? 'c' : ''}`).join('|');
    if (sameReserves(reserves, nextReserves) && signature === nextSignature) {
      attachMeasurements(pagination, plans, measured);
      return { ...pagination, diagnostics };
    }
    reserves = nextReserves;
    signature = nextSignature;
  }

  // Cyclic footnote assignment is possible: a note referenced near the page
  // bottom reserves space, moves its own anchor to the next page, then moves
  // back when the reservation disappears. The old final-pass fallback laid
  // out the body with one reservation vector but attached notes measured from
  // another, allowing the note area to overlap body text or a table.
  //
  // Recover conservatively: keep the largest reservation seen for each page.
  // A subsequent measurement may discover a note on another page; grow that
  // page's reservation and repaginate. Never shrink during recovery, so the
  // pagination/measurement pair returned from the same pass cannot under-
  // reserve its footnote region merely because an anchor oscillated.
  let conservativeReserves = mergePageReserves(maximumObservedReserves, reserves);
  for (let attempt = 0; attempt < MAX_FOOTNOTE_RECOVERY_PASSES; attempt++) {
    pagination = paginateSectionPlans(plans, { ...options, pageBottomReserves: conservativeReserves });
    const measured = measurePaginationFootnotes(pagination, plans, documentIR, services, lineBreaker);
    const required = measured.map(item => item?.reservePt || 0);
    const expanded = mergePageReserves(conservativeReserves, required);
    if (sameReserves(conservativeReserves, expanded)) {
      // Drop excess reservations left behind when references changed pages.
      // Preserve the safety invariant after each bounded refinement.
      const compact = compactFootnoteReserves(conservativeReserves, plans, documentIR, services, lineBreaker, options);
      pagination = compact.pagination;
      attachMeasurements(pagination, plans, compact.measured);
      diagnostics.push({
        level: 'warning', code: 'footnote-pagination-conservative-reserve',
        message: 'Footnote anchors did not stabilize; kept conservative page-bottom reservations to avoid overlap.',
        details: { initialPasses: MAX_FOOTNOTE_PASSES, recoveryPasses: attempt + 1 }
      });
      return { ...pagination, diagnostics };
    }
    conservativeReserves = expanded;
  }

  // Even if recovery cannot converge, keep the warning visible. Do not
  // silently claim that the final measurement matches its page reservation.
  pagination = paginateSectionPlans(plans, { ...options, pageBottomReserves: conservativeReserves });
  const measured = measurePaginationFootnotes(pagination, plans, documentIR, services, lineBreaker);
  attachMeasurements(pagination, plans, measured);
  diagnostics.push({
    level: 'warning',
    code: 'footnote-pagination-not-stable',
    message: `Basic footnote pagination did not stabilize within ${MAX_FOOTNOTE_PASSES + MAX_FOOTNOTE_RECOVERY_PASSES} passes.`,
    details: { passes: MAX_FOOTNOTE_PASSES + MAX_FOOTNOTE_RECOVERY_PASSES }
  });
  return { ...pagination, diagnostics };
}

/** Page-indexed upper bound; absent and invalid measurements reserve no space. */
export function mergePageReserves(previous, measured) {
  return Array.from({ length: Math.max(previous.length, measured.length) }, (_, i) =>
    Math.max(0, Number(previous[i]) || 0, Number(measured[i]) || 0)
  );
}

/** Reduce reserved-but-unused room without reintroducing cyclic footnote overlap.
 * Only a trial whose newly measured notes all fit its own reservation is used.
 */
function compactFootnoteReserves(initial, plans, documentIR, services, lineBreaker, options) {
  let reserves = [...initial];
  const evaluate = candidate => {
    const pagination = paginateSectionPlans(plans, { ...options, pageBottomReserves: candidate });
    const measured = measurePaginationFootnotes(pagination, plans, documentIR, services, lineBreaker);
    const required = measured.map(item => item?.reservePt || 0);
    const safe = required.every((height, i) => height <= (candidate[i] || 0) + 0.01);
    return { safe, pagination, measured };
  };
  let accepted = evaluate(reserves);
  // The recovery phase already established an upper bound. If an unsupported
  // unsplittable block prevented that, avoid incorrectly compacting it.
  if (!accepted.safe) return accepted;
  for (let i = 0; i < reserves.length; i++) {
    const original = reserves[i] || 0;
    if (original <= 0.01) continue;
    let low = 0, high = original;
    let best = accepted;
    for (let step = 0; step < 7; step++) {
      const proposed = (low + high) / 2;
      const candidate = [...reserves];
      candidate[i] = proposed;
      const trial = evaluate(candidate);
      if (trial.safe && trial.pagination.pages.length <= accepted.pagination.pages.length) {
        high = proposed;
        best = trial;
      } else {
        low = proposed;
      }
    }
    if (high < original - 0.01) {
      reserves[i] = high;
      accepted = best;
    }
  }
  return accepted;
}

function measurePaginationFootnotes(pagination, plans, documentIR, services, lineBreaker) {
  const measuredPages = [];
  let carryBlocks = [];
  let carryIds = [];
  const enqueuedIds = new Set();
  let pageIndex = 0;
  let continuationPages = 0;

  while (pageIndex < (pagination.pages || []).length || carryBlocks.length) {
    if (pageIndex >= pagination.pages.length) {
      if (continuationPages >= MAX_CONTINUATION_PAGES) break;
      if (!appendFootnoteContinuationPage(pagination, plans)) break;
      continuationPages += 1;
    }

    const page = pagination.pages[pageIndex];
    const plan = plans[page.sectionOwnerIndex ?? 0];
    if (!plan) {
      measuredPages[pageIndex] = null;
      pageIndex += 1;
      continue;
    }

    const pageIds = collectPageFootnoteIds(page).filter(id => {
      const key = String(id);
      if (enqueuedIds.has(key)) return false;
      enqueuedIds.add(key);
      return true;
    });
    const incoming = pageIds.length ? measurePageFootnotes(pageIds, {
      documentIR,
      layoutContext: plan.pageContextForIndex?.(page.index) || plan.context,
      measurer: services.measurer,
      fontResolver: services.fontResolver,
      lineBreaker
    }) : null;

    const storyBlocks = stackFootnoteStoryBlocks(carryBlocks, incoming?.blocks || []);
    const activeIds = uniqueIds(carryIds, incoming?.ids || []);
    if (!storyBlocks.length) {
      measuredPages[pageIndex] = null;
      carryBlocks = [];
      carryIds = [];
      pageIndex += 1;
      continue;
    }

    const context = plan.pageContextForIndex?.(page.index) || plan.context;
    const separatorGapPt = incoming?.separatorGapPt ?? 6;
    const bodyHeightPt = Math.max(0, context.pageHeightPt - context.margins.top - context.margins.bottom);
    const availableContentHeightPt = Math.max(0, bodyHeightPt - separatorGapPt);
    const split = splitFootnoteStoryForHeight(storyBlocks, availableContentHeightPt);
    const continued = split.carry.length > 0;
    measuredPages[pageIndex] = split.placed.length ? {
      ids: activeIds,
      blocks: split.placed,
      contentHeightPt: split.contentHeightPt,
      separatorGapPt,
      reservePt: split.contentHeightPt + separatorGapPt,
      continued
    } : null;
    carryBlocks = split.carry;
    carryIds = continued ? activeIds : [];
    pageIndex += 1;
  }

  return measuredPages;
}

function uniqueIds(a, b) {
  const out = [];
  const seen = new Set();
  for (const id of [...(a || []), ...(b || [])]) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

function appendFootnoteContinuationPage(pagination, plans) {
  const previous = pagination.pages[pagination.pages.length - 1];
  if (!previous) return null;
  const owner = previous.sectionOwnerIndex ?? 0;
  const plan = plans[owner];
  if (!plan) return null;
  const pageIndex = previous.index + 1;
  const context = plan.pageContextForIndex?.(pageIndex) || plan.context;
  const page = createPageLayout(pageIndex, context);
  page.sectionOwnerIndex = owner;
  page.sectionIndices = [owner];
  page.isFootnoteContinuationPage = true;
  plan.onPageCreated?.(page, { isSectionStart: false, sectionIndex: owner, isFootnoteContinuation: true });
  pagination.pages.push(page);
  pagination.sectionPages?.[owner]?.push(page);
  return page;
}

function attachMeasurements(pagination, plans, measured) {
  (pagination.pages || []).forEach((page, index) => {
    const plan = plans[page.sectionOwnerIndex ?? 0];
    if (plan) attachPageFootnotes(page, measured[index], plan.pageContextForIndex?.(page.index) || plan.context);
  });
}

function hasNormalFootnotes(documentIR) {
  return Object.values(documentIR.footnotes || {}).some(note => !note.type || note.type === 'normal');
}

function sameReserves(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(Number(value || 0) - Number(b[index] || 0)) < 0.01);
}

function collectFootnotePolicyDiagnostics(plans) {
  const diagnostics = [];
  for (let index = 0; index < (plans || []).length; index++) {
    const props = plans[index]?.section?.properties?.footnotes || {};
    if (props.restart === 'eachPage') diagnostics.push({
      level:'info',
      code:'footnote-each-page-restart-fallback',
      message:'Footnote numbering restart on each page is not implemented; numbering remains section/document based.',
      details:{sectionIndex:index}
    });
    if (props.position && props.position !== 'pageBottom') diagnostics.push({
      level:'info',
      code:'footnote-position-fallback',
      message:`Footnote position ${props.position} is approximated using page-bottom placement.`,
      details:{sectionIndex:index,position:props.position}
    });
  }
  return diagnostics;
}
