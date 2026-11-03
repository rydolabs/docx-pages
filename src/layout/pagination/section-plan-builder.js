import { createLayoutContext, createLayoutContextFromSection, createPageContext } from "../primitives/layout-context.js";
import {
  createWrapExclusion,
  isPageAnchoredFrameParagraph,
  layoutFloating,
  layoutLeadingFrameParagraphs
} from "../primitives/floating-layout.js";
import { createFlowFactories } from "../composers/flow-factory.js";
import { applyHeaderFooter } from "./page-parts.js";
import { createLineBreaker } from "../services/line-breaker.js";
import { createDocumentEndnoteNodes } from "../composers/endnote-story.js";

/** Build section-level pagination plans from the renderer-independent IR. */
export function buildSectionPlans(documentIR, services, options = {}) {
  const lineBreaker = createLineBreaker({
    noLineBreaksBefore: documentIR.settings?.noLineBreaksBefore?.characters || "",
    noLineBreaksAfter: documentIR.settings?.noLineBreaksAfter?.characters || "",
    noLineBreaksBeforeLanguage: documentIR.settings?.noLineBreaksBefore?.language || null,
    noLineBreaksAfterLanguage: documentIR.settings?.noLineBreaksAfter?.language || null
  });
  const fieldContext = { bookmarkTexts: collectBookmarkTexts(documentIR) };
  const plans = (documentIR.sections || []).map((section, sectionIndex) =>
    buildSectionPlan(section, sectionIndex, documentIR, services, lineBreaker, options, fieldContext)
  );
  return { plans, lineBreaker };
}

export function finalizeSectionPageParts(pagination, plans, documentIR, services, lineBreaker) {
  const pages = pagination.pages;
  const totalPages = pages.length;
  pages.forEach(page => {
    const ownerIndex = page.sectionOwnerIndex ?? 0;
    const plan = plans[ownerIndex];
    if (!plan) return;
    const ownedPages = pagination.sectionPages[ownerIndex] || [];
    const sectionPageNumber = Math.max(1, ownedPages.indexOf(page) + 1);
    applyHeaderFooter(page, plan.section, documentIR, page.layoutContext || plan.context, { ...services, lineBreaker }, sectionPageNumber === 1, {
      totalPages,
      sectionPageCount: ownedPages.length,
      sectionNumber: ownerIndex + 1,
      sectionPageNumber
    });
  });
}

function buildSectionPlan(section, sectionIndex, documentIR, services, lineBreaker, options, fieldContext) {
  const context = section.properties && Object.keys(section.properties).length
    ? createLayoutContextFromSection(section, options.page || {})
    : createLayoutContext(options.page || {});
  const { leadingFrames, flowNodes } = splitLeadingPageFrames(section.children || []);
  const isFinalSection = sectionIndex === (documentIR.sections || []).length - 1;
  const documentFlowNodes = isFinalSection
    ? [...flowNodes, ...createDocumentEndnoteNodes(documentIR.endnotes)]
    : flowNodes;
  const anchoredMedia = collectAnchoredMedia(section.children || []);
  const frameLayout = layoutLeadingFrameParagraphs(leadingFrames, context, services.measurer);
  const factories = createFlowFactories(documentFlowNodes, {
    layoutContext: context,
    documentIR,
    measurer: services.measurer,
    fontResolver: services.fontResolver,
    lineBreaker,
    fieldContext
  });
  let decoratedStartPage = null;

  return {
    section,
    context,
    pageContextForIndex: pageIndex => createPageContext(context, pageIndex, documentIR.settings || {}),
    factories,
    firstPageBodyTopPt: frameLayout.blocks.length ? Math.max(context.margins.top, frameLayout.bodyStartPt) : null,
    onPageCreated(page, { isSectionStart }) {
      applyHeaderFooter(page, section, documentIR, page.layoutContext || context, { ...services, lineBreaker }, isSectionStart, {
        sectionNumber: sectionIndex + 1,
        sectionPageNumber: 1
      });
    },
    onRegionStarted(page, region, { isSectionStart }) {
      if (!isSectionStart || decoratedStartPage === page) return;
      decoratedStartPage = page;
      decorateSectionStartPage(page, frameLayout.blocks, anchoredMedia, region.context || context, documentIR.resources);
    }
  };
}

function decorateSectionStartPage(page, frameBlocks, anchoredMedia, context, resources) {
  if (frameBlocks.length) {
    page.floats.push(...frameBlocks);
    for (const frameBlock of frameBlocks) {
      const exclusion = createWrapExclusion(frameBlock);
      if (exclusion) page.exclusions.push(exclusion);
    }
  }
  for (const media of anchoredMedia) {
    const floating = layoutFloating(media, { ...context, resources, floatingObstacles: page.floats });
    page.floats.push(floating);
    const exclusion = createWrapExclusion(floating);
    if (exclusion) page.exclusions.push(exclusion);
  }
}

function collectBookmarkTexts(documentIR) {
  const texts = {};
  const active = new Map();
  const append = value => {
    for (const item of active.values()) item.text += value;
  };
  const walk = node => {
    if (!node) return;
    if (node.type === "bookmark-start" && node.name) {
      const entry = { name: node.name, text: "" };
      active.set(String(node.id ?? node.name), entry);
      return;
    }
    if (node.type === "bookmark-end") {
      const key = String(node.id ?? "");
      const entry = active.get(key);
      if (entry) {
        texts[entry.name] = entry.text;
        active.delete(key);
      }
      return;
    }
    if (node.type === "text") append(String(node.value || ""));
    if (node.type === "symbol") append(String(node.value || ""));
    for (const child of node.children || []) walk(child);
    for (const row of node.rows || []) walk(row);
    for (const cell of node.cells || []) walk(cell);
  };
  for (const section of documentIR.sections || []) for (const node of section.children || []) walk(node);
  for (const entry of active.values()) texts[entry.name] = entry.text;
  return texts;
}

function splitLeadingPageFrames(nodes) {
  const leadingFrames = [];
  let index = 0;
  while (index < nodes.length && isPageAnchoredFrameParagraph(nodes[index])) {
    leadingFrames.push(nodes[index]);
    index++;
  }
  return { leadingFrames, flowNodes: nodes.slice(index) };
}

function collectAnchoredMedia(nodes) {
  const found = [];
  const walk = node => {
    if (!node) return;
    if ((node.type === "image" || node.type === "vml") && node.positioning?.mode === "anchor") {
      found.push(node);
      return;
    }
    for (const child of node.children || []) walk(child);
    for (const row of node.rows || []) walk(row);
    for (const cell of node.cells || []) walk(cell);
  };
  for (const node of nodes) walk(node);
  return found;
}
