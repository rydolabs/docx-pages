export function createPageLayout(index, context) {
  return {
    type: "page",
    index,
    widthPt: context.pageWidthPt,
    heightPt: context.pageHeightPt,
    margins: context.margins,
    layoutContext: context,
    regions: [],
    columns: [],
    floats: [],
    exclusions: [],
    header: null,
    footer: null,
    footnotes: null
  };
}

export function createColumns(context, { bodyTopPt = context.margins.top, bodyBottomPt = context.pageHeightPt - context.margins.bottom } = {}) {
  const count = Math.max(1, context.columnCount || 1);
  const definitions = context.columnDefinitions || [];
  const bodyHeightPt = Math.max(0, bodyBottomPt - bodyTopPt);

  if (definitions.length === count && definitions.every(d => d.widthPt != null)) {
    let x = context.margins.left;
    return definitions.map((definition, index) => {
      const column = { index, x, y: bodyTopPt, widthPt: definition.widthPt, heightPt: bodyHeightPt, blocks: [] };
      x += definition.widthPt + (definition.spacePt ?? context.columnGapPt);
      return column;
    });
  }

  const totalGap = (count - 1) * context.columnGapPt;
  const width = (context.bodyWidthPt - totalGap) / count;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    x: context.margins.left + i * (width + context.columnGapPt),
    y: bodyTopPt,
    widthPt: width,
    heightPt: bodyHeightPt,
    blocks: []
  }));
}
