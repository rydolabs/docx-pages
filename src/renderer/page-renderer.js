import { renderTextBlock } from "./text-renderer.js";
import { renderTable } from "./table-renderer.js";
import { renderMedia } from "./media-renderer.js";

export function renderPage(page, doc = document, resources = {}, renderOptions = {}) {
  const el = doc.createElement("section");
  el.className = "docx-page";
  el.style.position = "relative";
  el.style.width = `${page.widthPt}pt`;
  el.style.height = `${page.heightPt}pt`;
  const background = page.background?.resolvedColor || page.background?.color;
  if (background && background !== "auto") {
    const normalized = String(background).replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(normalized)) el.style.backgroundColor = `#${normalized}`;
  }

  renderPagePart(page.header, el, doc, "docx-header", resources, renderOptions);
  renderPagePart(page.footer, el, doc, "docx-footer", resources, renderOptions);
  const floatingLayers = partitionFloatingLayers(page.floats || []);
  for (const block of floatingLayers.behind) el.appendChild(renderBlock(block, doc, resources, renderOptions));
  const columns = page.regions?.length
    ? page.regions.flatMap(region => region.columns || [])
    : (page.columns || []);
  for (const region of page.regions || []) renderColumnSeparators(region.columnSeparators, el, doc);
  for (const col of columns) {
    for (const block of col.blocks || []) el.appendChild(renderBlock(block, doc, resources, renderOptions));
  }
  for (const block of floatingLayers.front) el.appendChild(renderBlock(block, doc, resources, renderOptions));
  renderFootnotes(page.footnotes, el, doc, resources, renderOptions);
  return el;
}

function renderBlock(block, doc, resources, renderOptions) {
  if (block.type === "paragraph") return renderTextBlock(block, doc, resources, renderOptions);
  if (block.type === "table") return renderTable(block, doc, renderOptions);
  return renderMedia(block, doc, resources, renderOptions);
}

function renderPagePart(part, pageElement, doc, className, resources, renderOptions) {
  if (!part?.blocks?.length) return;
  const region = doc.createElement("div");
  region.className = className;
  region.style.position = "absolute";
  region.style.left = "0";
  region.style.top = "0";
  region.style.width = "100%";
  region.style.height = "100%";
  for (const block of part.blocks) region.appendChild(renderBlock(block, doc, resources, renderOptions));
  pageElement.appendChild(region);
}


function renderFootnotes(footnotes, pageElement, doc, resources, renderOptions) {
  if (!footnotes?.blocks?.length) return;
  const region = doc.createElement("div");
  region.className = "docx-footnotes";
  region.style.position = "absolute";
  region.style.left = "0";
  region.style.top = "0";
  region.style.width = "100%";
  region.style.height = "100%";
  const separator = doc.createElement("div");
  separator.className = "docx-footnote-separator";
  separator.style.position = "absolute";
  separator.style.left = `${footnotes.x}pt`;
  separator.style.top = `${footnotes.separatorY}pt`;
  separator.style.width = `${Math.min(footnotes.widthPt, 72)}pt`;
  separator.style.borderTop = "0.5pt solid currentColor";
  region.appendChild(separator);
  for (const block of footnotes.blocks) region.appendChild(renderBlock(block, doc, resources, renderOptions));
  pageElement.appendChild(region);
}

function renderColumnSeparators(separators, pageElement, doc) {
  for (const separator of separators || []) {
    const line = doc.createElement("div");
    line.className = "docx-column-separator";
    line.style.position = "absolute";
    line.style.left = `${separator.x}pt`;
    line.style.top = `${separator.y}pt`;
    line.style.height = `${separator.heightPt}pt`;
    line.style.borderLeft = `${separator.widthPt || 0.5}pt solid currentColor`;
    pageElement.appendChild(line);
  }
}

function partitionFloatingLayers(floats = []) {
  const ordered = [...floats].sort((a, b) => floatingOrder(a) - floatingOrder(b));
  return {
    behind: ordered.filter(block => isBehindDocument(block)),
    front: ordered.filter(block => !isBehindDocument(block))
  };
}

function isBehindDocument(block) {
  const value = block?.positioning?.behindDoc;
  return value === true || value === 1 || value === "1" || value === "true";
}

function floatingOrder(block) {
  const value = Number(block?.positioning?.relativeHeight);
  return Number.isFinite(value) ? value : 0;
}
