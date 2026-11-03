export const SUPPORT_LEVELS = Object.freeze({
  FULL: "full",
  PARTIAL: "partial",
  FALLBACK: "fallback",
  UNSUPPORTED: "unsupported"
});

export const DEFAULT_CAPABILITIES = Object.freeze({
  paragraph: SUPPORT_LEVELS.FULL,
  table: SUPPORT_LEVELS.FULL,
  section: SUPPORT_LEVELS.FULL,
  pagination: SUPPORT_LEVELS.FULL,
  headerFooter: SUPPORT_LEVELS.FULL,
  basicImage: SUPPORT_LEVELS.FULL,
  hyperlink: SUPPORT_LEVELS.FULL,
  bookmark: SUPPORT_LEVELS.FULL,
  symbol: SUPPORT_LEVELS.FULL,
  contentControl: SUPPORT_LEVELS.PARTIAL,
  trackedChanges: SUPPORT_LEVELS.PARTIAL,
  comments: SUPPORT_LEVELS.PARTIAL,
  floatingDrawing: SUPPORT_LEVELS.PARTIAL,
  math: SUPPORT_LEVELS.PARTIAL,
  textbox: SUPPORT_LEVELS.PARTIAL,
  embeddedObject: SUPPORT_LEVELS.PARTIAL,
  bidiText: SUPPORT_LEVELS.PARTIAL,
  footnote: SUPPORT_LEVELS.PARTIAL,
  endnote: SUPPORT_LEVELS.PARTIAL,
  chart: SUPPORT_LEVELS.FALLBACK,
  smartArt: SUPPORT_LEVELS.FALLBACK,
  wordArt: SUPPORT_LEVELS.FALLBACK
});

export function createCapabilityPolicy(overrides = {}) {
  const levels = Object.freeze({ ...DEFAULT_CAPABILITIES, ...(overrides || {}) });
  return Object.freeze({
    levels,
    get(feature) { return levels[feature] || SUPPORT_LEVELS.UNSUPPORTED; }
  });
}

export function getSupportLevel(feature, overrides = null) {
  return overrides ? createCapabilityPolicy(overrides).get(feature) : (DEFAULT_CAPABILITIES[feature] || SUPPORT_LEVELS.UNSUPPORTED);
}
