import { layoutParagraph } from "../primitives/text-layout.js";
import { layoutTable } from "../primitives/table-layout.js";
import { layoutFloating } from "../primitives/floating-layout.js";

/** Layout page-owned header/footer content and page-dependent fields. */
export function applyHeaderFooter(page, section, documentIR, context, services, isFirstSectionPage, fieldCounts = {}) {
  const { measurer, fontResolver, lineBreaker, lineBreakRules } = services;
  const physicalPageNumber = page.index + 1;
  const sectionPageNumber = fieldCounts.sectionPageNumber ?? 1;
  const numberingStart = Number(section.properties?.pageNumbering?.start ?? 1);
  const pageNumber = numberingStart + sectionPageNumber - 1;
  const pageNumberDisplay = formatPageNumber(pageNumber, section.properties?.pageNumbering?.format);
  const selection = { isFirstSectionPage, titlePage: !!section.properties?.titlePage };
  const headerRef = selectReference(section.headerRefs, pageNumber, documentIR.settings, selection);
  const footerRef = selectReference(section.footerRefs, pageNumber, documentIR.settings, selection);
  const headerPart = headerRef ? documentIR.headers?.[headerRef.relationshipId] || null : null;
  const footerPart = footerRef ? documentIR.footers?.[footerRef.relationshipId] || null : null;
  const fieldContext = {
    pageNumber,
    pageNumberDisplay,
    physicalPageNumber,
    totalPages: fieldCounts.totalPages,
    sectionNumber: fieldCounts.sectionNumber ?? 1,
    sectionPageCount: fieldCounts.sectionPageCount,
    sectionPageNumber: fieldCounts.sectionPageNumber
  };

  page.header = headerPart ? layoutPagePart(headerPart, {
    x: context.margins.left,
    y: context.margins.header,
    widthPt: context.bodyWidthPt,
    measurer,
    edge: "top",
    pageHeightPt: context.pageHeightPt,
    footerDistancePt: context.margins.footer,
    defaultTabStop: documentIR.settings?.defaultTabStop,
    fontResolver,
    lineBreaker,
    lineBreakRules,
    fieldContext
  }) : null;

  page.footer = footerPart ? layoutPagePart(footerPart, {
    x: context.margins.left,
    y: 0,
    widthPt: context.bodyWidthPt,
    measurer,
    edge: "bottom",
    pageHeightPt: context.pageHeightPt,
    footerDistancePt: context.margins.footer,
    defaultTabStop: documentIR.settings?.defaultTabStop,
    fontResolver,
    lineBreaker,
    lineBreakRules,
    fieldContext
  }) : null;
}

export function layoutPagePart(part, {
  x, y, widthPt, measurer, edge, pageHeightPt, footerDistancePt,
  fieldContext = null, defaultTabStop = null, fontResolver = null, lineBreaker = null, lineBreakRules = null
}) {
  const blocks = [];
  let cursorY = y;
  for (const node of part.content || []) {
    let block = null;
    if (node.type === "paragraph") {
      block = layoutParagraph(node, { x, y: cursorY, widthPt, measurer, fieldContext, defaultTabStop, lineBreaker, lineBreakRules, ...(fontResolver ? { fontResolver } : {}) });
    } else if (node.type === "table") {
      block = layoutTable(node, { x, y: cursorY, widthPt, measurer, fieldContext, defaultTabStop, lineBreaker, lineBreakRules, ...(fontResolver ? { fontResolver } : {}) });
    } else {
      block = layoutFloating(node, { x, y: cursorY, widthPt });
    }
    blocks.push(block);
    cursorY += block.heightPt || 0;
  }

  const heightPt = Math.max(0, cursorY - y);
  if (edge === "bottom") {
    const top = Math.max(0, pageHeightPt - footerDistancePt - heightPt);
    const dy = top - y;
    repositionPartBlocks(blocks, dy);
    return { ...part, x, y: top, widthPt, heightPt, blocks };
  }
  return { ...part, x, y, widthPt, heightPt, blocks };
}

export function selectReference(refs = [], pageNumber, settings = {}, { isFirstSectionPage = false, titlePage = false } = {}) {
  if (!refs.length) return null;
  if (isFirstSectionPage && titlePage) {
    const first = refs.find(r => r.type === "first");
    if (first) return first;
  }
  if (settings.evenAndOddHeaders && pageNumber % 2 === 0) {
    const even = refs.find(r => r.type === "even");
    if (even) return even;
  }
  return refs.find(r => r.type === "default") || refs[0];
}

export function formatPageNumber(value, format) {
  const n = Math.max(1, Math.trunc(Number(value) || 1));
  switch (format) {
    case "upperRoman": return toRoman(n);
    case "lowerRoman": return toRoman(n).toLowerCase();
    case "upperLetter": return toLetters(n);
    case "lowerLetter": return toLetters(n).toLowerCase();
    case "decimal":
    default: return String(n);
  }
}

function repositionPartBlocks(blocks, dy) {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      for (const line of block.lines || []) line.y += dy;
    } else if (block.type === "table") {
      for (const row of block.rows || []) {
        row.y += dy;
        for (const cell of row.cells || []) {
          cell.y += dy;
          for (const child of cell.blocks || []) {
            child.y += dy;
            for (const line of child.lines || []) line.y += dy;
          }
        }
      }
    }
    block.y += dy;
  }
}

function toRoman(value) {
  const pairs = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let n = value;
  let out = "";
  for (const [amount, glyph] of pairs) while (n >= amount) { out += glyph; n -= amount; }
  return out;
}

function toLetters(value) {
  let n = value;
  let out = "";
  while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
}
