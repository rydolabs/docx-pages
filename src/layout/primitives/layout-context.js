import { twipToPt } from "../../common/units.js";

export function createLayoutContext(options = {}) {
  const {
    pageWidthPt = 595.3,
    pageHeightPt = 841.9,
    margins = { top: 72, right: 56.7, bottom: 72, left: 56.7, header: 36, footer: 36, gutter: 0 },
    columnCount = 1,
    columnGapPt = 18,
    columnDefinitions = [],
    columnSeparator = false,
    documentGrid = null
  } = options;
  const bodyWidthPt = pageWidthPt - margins.left - margins.right;
  const bodyHeightPt = pageHeightPt - margins.top - margins.bottom;
  return { pageWidthPt, pageHeightPt, margins, bodyWidthPt, bodyHeightPt, columnCount, columnGapPt, columnDefinitions, columnSeparator: !!columnSeparator, documentGrid };
}

/** Resolve physical-page margins without mutating the section base context. */
export function createPageContext(baseContext, pageIndex = 0, settings = {}) {
  const baseMargins = baseContext.margins || {};
  const evenPage = ((Number(pageIndex) || 0) + 1) % 2 === 0;
  const mirrored = !!settings.mirrorMargins;
  const gutter = Math.max(0, Number(baseMargins.gutter || 0));
  let left = Number(baseMargins.left || 0);
  let right = Number(baseMargins.right || 0);
  let top = Number(baseMargins.top || 0);

  if (mirrored && evenPage) [left, right] = [right, left];
  if (mirrored && evenPage) right += gutter;
  else left += gutter;

  return createLayoutContext({
    ...baseContext,
    margins: { ...baseMargins, left, right, top }
  });
}

export function createLayoutContextFromSection(section = {}, overrides = {}) {
  const props = section.properties || {};
  const pageSize = props.pageSize || {};
  const marginsRaw = props.margins || {};
  const columns = props.columns || {};

  const base = {
    pageWidthPt: pageSize.width ? twipToPt(pageSize.width) : undefined,
    pageHeightPt: pageSize.height ? twipToPt(pageSize.height) : undefined,
    margins: {
      top: marginsRaw.top != null ? twipToPt(marginsRaw.top) : 72,
      right: marginsRaw.right != null ? twipToPt(marginsRaw.right) : 56.7,
      bottom: marginsRaw.bottom != null ? twipToPt(marginsRaw.bottom) : 72,
      left: marginsRaw.left != null ? twipToPt(marginsRaw.left) : 56.7,
      header: marginsRaw.header != null ? twipToPt(marginsRaw.header) : 36,
      footer: marginsRaw.footer != null ? twipToPt(marginsRaw.footer) : 36,
      gutter: marginsRaw.gutter != null ? twipToPt(marginsRaw.gutter) : 0
    },
    columnCount: columns.count || 1,
    columnGapPt: columns.space != null ? twipToPt(columns.space) : 18,
    columnDefinitions: (columns.definitions || []).map(c => ({
      widthPt: c.width != null ? twipToPt(c.width) : null,
      spacePt: c.space != null ? twipToPt(c.space) : null
    })),
    columnSeparator: isTruthyOnOff(columns.separator),
    documentGrid: props.documentGrid || null
  };

  const merged = {
    ...base,
    ...overrides,
    margins: { ...base.margins, ...(overrides.margins || {}) }
  };
  return createLayoutContext(merged);
}

function isTruthyOnOff(value) {
  if (value == null) return false;
  return !["0", "false", "off", "no"].includes(String(value).toLowerCase());
}
