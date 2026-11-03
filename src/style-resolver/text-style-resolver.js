export function mergeStyleObjects(base = {}, extra = {}) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeStyleObjects(out[key] || {}, value);
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

export function mergeParagraphProperties(base = {}, extra = {}) {
  const merged = mergeStyleObjects(base, extra);
  if (base?.tabs || extra?.tabs) merged.tabs = mergeTabs(base?.tabs || [], extra?.tabs);
  return merged;
}

function mergeTabs(baseTabs = [], extraTabs = undefined) {
  if (extraTabs == null) return [...baseTabs];
  const byPosition = new Map();
  for (const tab of baseTabs || []) {
    if (!tab || !Number.isFinite(Number(tab.position))) continue;
    if (tab.value === "clear") byPosition.delete(Number(tab.position));
    else byPosition.set(Number(tab.position), { ...tab });
  }
  for (const tab of extraTabs || []) {
    if (!tab || !Number.isFinite(Number(tab.position))) continue;
    const position = Number(tab.position);
    if (tab.value === "clear") byPosition.delete(position);
    else byPosition.set(position, { ...tab });
  }
  return [...byPosition.values()].sort((a, b) => Number(a.position) - Number(b.position));
}

export function resolveStyleChain(styles, styleId, key, seen = new Set()) {
  if (!styleId || seen.has(styleId)) return {};
  seen.add(styleId);
  const style = styles?.styles?.[styleId];
  if (!style) return {};
  const base = resolveStyleChain(styles, style.basedOn, key, seen);
  return key === "paragraphProperties"
    ? mergeParagraphProperties(base, style[key] || {})
    : mergeStyleObjects(base, style[key] || {});
}

export function resolveParagraphStyle(rawParagraph, styles, numbering = null, tableTextContext = null) {
  const styleId = rawParagraph?.properties?.styleId || findDefaultStyleId(styles, "paragraph");
  const paragraphFromStyle = resolveStyleChain(styles, styleId, "paragraphProperties");
  const runFromStyle = resolveStyleChain(styles, styleId, "runProperties");
  const paragraphProperties = mergeParagraphProperties(
    mergeParagraphProperties(
      mergeParagraphProperties(
        mergeParagraphProperties(styles?.defaults?.paragraph || {}, paragraphFromStyle),
        numbering?.paragraphProperties || {}
      ),
      tableTextContext?.paragraphProperties || {}
    ),
    rawParagraph?.properties || {}
  );
  // Numbering level run properties (w:lvl/w:rPr) style the generated
  // numbering label only. They must not leak into the paragraph body runs.
  // The label keeps its own style through paragraph.numbering -> numberingLabel.
  const runProperties = mergeStyleObjects(
    mergeStyleObjects(styles?.defaults?.run || {}, runFromStyle),
    tableTextContext?.runProperties || {}
  );
  return { ...paragraphProperties, runProperties };
}

export function resolveRunStyle(rawRun, styles, inherited = {}, { theme = {}, fonts = {}, resolveFont, resolveThemeColor } = {}) {
  const characterStyleId = rawRun?.properties?.styleId || findDefaultStyleId(styles, "character");
  const characterStyle = resolveStyleChain(styles, characterStyleId, "runProperties");
  let result = mergeStyleObjects(
    mergeStyleObjects(
      mergeStyleObjects(styles?.defaults?.run || {}, inherited || {}),
      characterStyle
    ),
    rawRun?.properties || {}
  );

  if (result.fonts && resolveFont) {
    result = { ...result, fonts: { ...result.fonts, ...resolveFont(fonts, theme, result.fonts) } };
  }
  if (result.color && resolveThemeColor) {
    // WordprocessingML stores w:color/@w:val as the concrete fallback color
    // alongside optional themeColor/themeTint/themeShade metadata. Prefer the
    // concrete value when present; otherwise resolve the theme color. This
    // avoids applying the theme tint/shade a second time to an already-resolved
    // fallback value (for example A8D08D + accent6/themeTint=99).
    const explicitColor = result.color.value && result.color.value !== "auto"
      ? result.color.value
      : null;
    const resolvedColor = explicitColor || resolveThemeColor(theme, result.color);
    if (resolvedColor) result = { ...result, resolvedColor: String(resolvedColor).replace(/^#/, "").toUpperCase() };
  }
  return result;
}

function findDefaultStyleId(styles, type) {
  const match = Object.values(styles?.styles || {}).find(style => style?.type === type && style?.isDefault);
  return match?.id || null;
}
