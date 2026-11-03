import { createPageLayout } from "./primitives/page-layout.js";
import { createRegionLayout } from "./primitives/region-layout.js";
import { composeBlockFactories } from "./composers/flow-composer.js";

/**
 * Backward-compatible single-section paginator.
 * Internally it uses the same Region -> Column -> Block composition model as
 * continuous-section pagination.
 */
export function paginate(blockFactories, context, { pageIndexOffset = 0, onPageCreated = null, firstPageBodyTopPt = null } = {}) {
  const pages = [];
  let page = null;
  let region = null;
  let columnIndex = 0;
  let y = 0;
  let contentPlaced = false;

  const createPageAndRegion = (bodyTopPt = null) => {
    page = createPageLayout(pageIndexOffset + pages.length, context);
    region = createRegionLayout(page, context, {
      topPt: bodyTopPt ?? context.margins.top,
      sectionIndex: 0,
      regionIndex: 0
    });
    page.regions.push(region);
    page.columns = region.columns;
    pages.push(page);
    columnIndex = 0;
    y = region.columns[0].y;
    onPageCreated?.(page);
    return region.columns[0];
  };

  createPageAndRegion(firstPageBodyTopPt);

  const flow = {
    current: () => ({ page, region, column: region.columns[columnIndex], columnIndex, y }),
    setY: value => { y = value; },
    exclusions: () => page.exclusions || [],
    hasPriorContent: () => contentPlaced || pages.length > 1 || columnIndex > 0 || y > region.columns[columnIndex].y,
    markContent: () => { contentPlaced = true; },
    advancePage: () => createPageAndRegion(null),
    advanceColumn: () => {
      columnIndex += 1;
      if (columnIndex >= region.columns.length) return createPageAndRegion(null);
      y = region.columns[columnIndex].y;
      return region.columns[columnIndex];
    }
  };

  composeBlockFactories(blockFactories, flow);
  return pages;
}
