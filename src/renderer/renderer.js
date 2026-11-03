import { renderPage } from "./page-renderer.js";

export function renderDocument(layout, target, { document:doc=globalThis.document, clear=true, changes } = {}) {
  if (!doc) throw new Error("DOM document is required to render");
  if (clear) target.replaceChildren();
  const frag = doc.createDocumentFragment();
  const renderOptions = { changes };
  for (const page of layout.pages || []) frag.appendChild(renderPage(page, doc, layout.resources || {}, renderOptions));
  target.appendChild(frag);
  return { pages:layout.pages?.length || 0, target };
}
