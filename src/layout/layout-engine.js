import { createTextMeasurer } from "./services/text-measurer.js";
import { createFontResolver } from "./services/font-resolver.js";
import { paginateWithFootnotes } from "./pagination/footnote-pagination.js";
import { buildSectionPlans, finalizeSectionPageParts } from "./pagination/section-plan-builder.js";
import { collectEndnoteFallbackDiagnostics } from "./composers/endnote-story.js";

/**
 * Public Layout facade. Detailed Word layout behavior lives in lower layers.
 */
export function layoutDocument(ir, options = {}) {
  const services = createLayoutServices(options);
  const { plans, lineBreaker } = buildSectionPlans(ir, services, options);
  const pagination = paginateWithFootnotes(plans, ir, services, lineBreaker, {
    noColumnBalance: !!ir.settings?.compatibility?.noColumnBalance
  });
  finalizeSectionPageParts(pagination, plans, ir, services, lineBreaker);
  for (const page of pagination.pages || []) page.background = ir.background || null;
  return {
    type: "layout-document",
    pages: pagination.pages,
    resources: ir.resources,
    diagnostics: [
      ...(pagination.diagnostics || []),
      ...collectEndnoteFallbackDiagnostics(ir)
    ]
  };
}

function createLayoutServices(options) {
  return {
    measurer: options.measurer || createTextMeasurer(options.measurement || {}),
    fontResolver: options.fontResolver || createFontResolver({ fontMap: options.fontMap || {} })
  };
}
