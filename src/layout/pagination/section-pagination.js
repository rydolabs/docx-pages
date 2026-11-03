import { createPageLayout } from "../primitives/page-layout.js";
import { createRegionLayout, regionContentBottom } from "../primitives/region-layout.js";
import { resolveSectionTransition } from "./section-transition.js";
import { composeBlockFactories } from "../composers/flow-composer.js";
import { balanceRegionColumns } from "../composers/region-balancer.js";

/**
 * Paginate a sequence of section plans into physical pages and layout regions.
 *
 * Each plan is intentionally data-oriented:
 * { section, context, factories, firstPageBodyTopPt, onPageCreated, onRegionStarted }
 *
 * The block composer is shared with ordinary pagination; this module only owns
 * section-to-region/page transitions.
 */
export function paginateSectionPlans(plans, { pageIndexOffset = 0, noColumnBalance = false, pageBottomReserves = [] } = {}) {
  const pages = [];
  const sectionPages = plans.map(() => []);
  let activePlanIndex = -1;
  let page = null;
  let region = null;
  let columnIndex = 0;
  let y = 0;
  let contentPlaced = false;

  const activePlan = () => plans[activePlanIndex];

  const rememberSectionPage = (sectionIndex, targetPage) => {
    const list = sectionPages[sectionIndex];
    if (!list.includes(targetPage)) list.push(targetPage);
    targetPage.sectionIndices ||= [];
    if (!targetPage.sectionIndices.includes(sectionIndex)) targetPage.sectionIndices.push(sectionIndex);
  };

  const refreshPageColumns = targetPage => {
    // Compatibility surface for existing callers. Region-aware callers should
    // prefer page.regions. Keeping the flattened alias avoids a flag day.
    targetPage.columns = (targetPage.regions || []).flatMap(item => item.columns || []);
  };

  const createRegion = (planIndex, topPt, { isSectionStart = false, isNewPage = false } = {}) => {
    const plan = plans[planIndex];
    const pageContext = plan.pageContextForIndex?.(page.index) || plan.context;
    const pageLocalIndex = Math.max(0, page.index - pageIndexOffset);
    const reservePt = Math.max(0, Number(pageBottomReserves[pageLocalIndex] || 0));
    region = createRegionLayout(page, pageContext, {
      topPt,
      bottomPt: Math.min(
        pageContext.pageHeightPt - pageContext.margins.bottom - reservePt,
        page.footer ? Number(page.footer.y ?? Infinity) : Infinity
      ),
      sectionIndex: planIndex,
      regionIndex: page.regions.length
    });
    page.regions.push(region);
    refreshPageColumns(page);
    columnIndex = 0;
    y = region.columns[0]?.y ?? topPt;
    rememberSectionPage(planIndex, page);
    plan.onRegionStarted?.(page, region, { isSectionStart, isNewPage });
    return region.columns[0];
  };

  const createPageForPlan = (planIndex, { bodyTopPt = null, isSectionStart = false } = {}) => {
    const plan = plans[planIndex];
    const pageIndex = pageIndexOffset + pages.length;
    const pageContext = plan.pageContextForIndex?.(pageIndex) || plan.context;
    page = createPageLayout(pageIndex, pageContext);
    page.sectionOwnerIndex = planIndex;
    page.regions = [];
    pages.push(page);
    plan.onPageCreated?.(page, { isSectionStart, sectionIndex: planIndex });
    const requestedTopPt = bodyTopPt ?? pageContext.margins.top;
    // Word keeps ordinary body flow below a header that physically extends
    // past the configured top margin. Header distance is an anchor from the
    // page edge, not permission to overlap normal body text.
    const headerBottomPt = page.header ? Number(page.header.y || 0) + Number(page.header.heightPt || 0) : 0;
    const topPt = Math.max(requestedTopPt, headerBottomPt);
    return createRegion(planIndex, topPt, { isSectionStart, isNewPage: true });
  };

  const createBlankParityPage = planIndex => {
    const plan = plans[planIndex];
    const pageIndex = pageIndexOffset + pages.length;
    const pageContext = plan.pageContextForIndex?.(pageIndex) || plan.context;
    const blank = createPageLayout(pageIndex, pageContext);
    blank.sectionOwnerIndex = planIndex;
    blank.regions = [];
    blank.isSectionParityBlank = true;
    pages.push(blank);
    rememberSectionPage(planIndex, blank);
    plan.onPageCreated?.(blank, { isSectionStart: false, sectionIndex: planIndex, isParityBlank: true });
    page = blank;
    region = null;
    columnIndex = 0;
    y = 0;
    return blank;
  };

  const needsParityBlankPage = parity => {
    if (!parity || !page) return false;
    const nextPhysicalPageNumber = page.index + 2;
    return parity === "odd" ? nextPhysicalPageNumber % 2 === 0 : nextPhysicalPageNumber % 2 === 1;
  };

  const current = () => ({ page, region, column: region.columns[columnIndex], columnIndex, y });

  const flow = {
    current,
    setY: value => { y = value; },
    exclusions: () => page?.exclusions || [],
    hasPriorContent: () => contentPlaced || pages.length > 1 || (page?.regions?.length || 0) > 1 || columnIndex > 0 || y > (region?.columns?.[columnIndex]?.y ?? y),
    markContent: () => { contentPlaced = true; },
    advancePage: () => createPageForPlan(activePlanIndex, { isSectionStart: false }),
    advanceColumn: () => {
      columnIndex += 1;
      if (columnIndex >= region.columns.length) return createPageForPlan(activePlanIndex, { isSectionStart: false });
      y = region.columns[columnIndex].y;
      return region.columns[columnIndex];
    }
  };

  for (let planIndex = 0; planIndex < plans.length; planIndex++) {
    const plan = plans[planIndex];
    const previousPlan = planIndex > 0 ? plans[planIndex - 1] : null;
    activePlanIndex = planIndex;
    contentPlaced = false;

    if (!page) {
      createPageForPlan(planIndex, {
        bodyTopPt: plan.firstPageBodyTopPt,
        isSectionStart: true
      });
    } else {
      const transition = resolveSectionTransition(plan.section, previousPlan.context, plan.context);
      if (transition.type === "continuous") {
        const previousBottom = regionContentBottom(region);
        const pageLocalIndex = Math.max(0, page.index - pageIndexOffset);
        const reservePt = Math.max(0, Number(pageBottomReserves[pageLocalIndex] || 0));
        const pageContext = plan.pageContextForIndex?.(page.index) || plan.context;
        const pageBottom = pageContext.pageHeightPt - pageContext.margins.bottom - reservePt;
        if (previousBottom < pageBottom - 0.01) {
          createRegion(planIndex, previousBottom, { isSectionStart: true });
        } else {
          createPageForPlan(planIndex, {
            bodyTopPt: plan.firstPageBodyTopPt,
            isSectionStart: true
          });
        }
      } else {
        if (needsParityBlankPage(transition.pageParity)) createBlankParityPage(planIndex - 1);
        createPageForPlan(planIndex, {
          bodyTopPt: plan.firstPageBodyTopPt,
          isSectionStart: true
        });
      }
    }

    composeBlockFactories(plan.factories || [], flow);

    const endsWithContinuousBreak = planIndex < plans.length - 1 && plans[planIndex + 1]?.section?.properties?.type === "continuous";
    const endsDocument = planIndex === plans.length - 1;
    const shouldBalanceFinalRegion = endsDocument || (endsWithContinuousBreak && !noColumnBalance);
    if (shouldBalanceFinalRegion && region?.sectionIndex === planIndex) {
      balanceRegionColumns(region);
      refreshPageColumns(page);
      // A following continuous region must begin below the balanced column set.
      // At document end this also normalizes the final multi-column fragment.
      const activeColumn = region.columns[Math.min(columnIndex, region.columns.length - 1)];
      columnIndex = Math.min(columnIndex, region.columns.length - 1);
      y = activeColumn?.blocks?.length
        ? Math.max(...activeColumn.blocks.map(block => (block.y || 0) + (block.heightPt || 0)))
        : (activeColumn?.y ?? y);
    }
  }

  return { pages, sectionPages };
}
