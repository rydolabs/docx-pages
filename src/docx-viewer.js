import { parseDocument } from "./parser/document-parser.js";
import { resolveStyles } from "./style-resolver/style-resolver.js";
import { buildDocumentIR } from "./document-ir/ir-builder.js";
import { layoutDocument } from "./layout/layout-engine.js";
import { registerEmbeddedFonts } from "./layout/services/embedded-font-loader.js";
import { renderDocument } from "./renderer/renderer.js";
import { diagnosticsFromEmbeddedFonts, mergeDiagnostics } from "./common/diagnostics.js";
import { buildChangeIndex } from "./changes/change-index.js";
import { createChangeNavigator } from "./changes/change-navigation.js";
import { createChangeReviewUI } from "./changes/change-review-ui.js";
import { createChangeMarginUI } from "./changes/change-margin-ui.js";
import { normalizeOptions } from "./options/normalize-options.js";

export async function openDocx(source, target, options = {}) {
  options = normalizeOptions(options);
  throwIfAborted(options.signal);
  const raw = await parseDocument(source, options.parser);
  throwIfAborted(options.signal);
  const resolved = resolveStyles(raw);
  const ir = buildDocumentIR(resolved);
  throwIfAborted(options.signal);

  const ownerDocument = target?.ownerDocument || globalThis.document || null;
  let embeddedFonts = { loaded: [], failed: [] };
  if (options.loadEmbeddedFonts !== false) {
    embeddedFonts = await registerEmbeddedFonts(resolved.fonts, ownerDocument);
  }
  if (options.waitForFonts !== false && ownerDocument?.fonts?.ready) {
    try { await ownerDocument.fonts.ready; } catch { /* font readiness is best-effort */ }
  }

  const layoutOptions = mergeLayoutMeasurementDocument(options.layout, ownerDocument);
  const layout = layoutDocument(ir, layoutOptions);
  throwIfAborted(options.signal);
  const changeIndex = buildChangeIndex(layout);
  const rendererOptions = { ...(options.renderer || {}), changes: options.changes ?? options.renderer?.changes };
  const renderResult = target ? renderDocument(layout, target, rendererOptions) : null;
  const changeNavigation = target ? createChangeNavigator(target, changeIndex) : null;
  const reviewTarget = resolveChangeReviewTarget(options.changes?.ui?.target, ownerDocument);
  const changeReview = reviewTarget ? createChangeReviewUI(reviewTarget, changeIndex, changeNavigation, options.changes?.ui || {}) : null;
  const indicatorOptions = options.changes?.indicators;
  const changeIndicators = target && indicatorOptions !== false
    ? createChangeMarginUI(target, changeIndex, changeNavigation, changeReview, typeof indicatorOptions === "object" ? indicatorOptions : {})
    : null;
  const diagnostics = mergeDiagnostics(
    raw.diagnostics,
    resolved.diagnostics,
    ir.diagnostics,
    layout.diagnostics,
    diagnosticsFromEmbeddedFonts(embeddedFonts)
  );
  const result = { raw, resolved, ir, layout, renderResult, changeIndex, changeNavigation, changeReview, changeIndicators, embeddedFonts, diagnostics };
  result.dispose = () => {
    changeIndicators?.destroy?.();
    changeReview?.destroy?.();
    if (target?.replaceChildren) target.replaceChildren();
  };
  return result;
}

function mergeLayoutMeasurementDocument(layoutOptions = {}, ownerDocument) {
  if (!ownerDocument || layoutOptions?.measurer || layoutOptions?.measurement?.context2d) return layoutOptions || {};
  return {
    ...(layoutOptions || {}),
    measurement: {
      ...(layoutOptions?.measurement || {}),
      document: ownerDocument
    }
  };
}

export { parseDocument, resolveStyles, buildDocumentIR, layoutDocument, renderDocument };

function resolveChangeReviewTarget(target, ownerDocument) {
  if (!target) return null;
  if (typeof target !== "string") return target;
  return ownerDocument?.querySelector?.(target) || null;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}
