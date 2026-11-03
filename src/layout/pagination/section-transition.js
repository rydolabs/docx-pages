/**
 * Resolve how an incoming section begins after the current one.
 * A continuous break may share the physical page when page size is compatible;
 * region geometry (margins/columns/grid) may still change within that page.
 */
export function resolveSectionTransition(nextSection, currentContext, nextContext) {
  // w:sectPr belongs to a section, and w:type specifies how that section
  // starts relative to the preceding section. Therefore a boundary is
  // governed by the incoming (next) section, not by the section we just laid out.
  const type = nextSection?.properties?.type || "nextPage";
  if (type === "oddPage") return { type: "next-page", reason: type, pageParity: "odd" };
  if (type === "evenPage") return { type: "next-page", reason: type, pageParity: "even" };
  if (type !== "continuous") return { type: "next-page", reason: type };
  if (!samePhysicalPageSize(currentContext, nextContext)) {
    return { type: "next-page", reason: "page-size-change" };
  }
  return { type: "continuous", reason: "continuous" };
}

export function samePhysicalPageSize(a, b, epsilon = 0.01) {
  return Math.abs((a?.pageWidthPt || 0) - (b?.pageWidthPt || 0)) <= epsilon
    && Math.abs((a?.pageHeightPt || 0) - (b?.pageHeightPt || 0)) <= epsilon;
}
