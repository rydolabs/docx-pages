import { resolveParagraphStyle, resolveRunStyle } from "./text-style-resolver.js";
import { resolveTableStyle, resolveTableTextStyle, resolveTableConditionalStyles, resolveConditionalStyleForCell } from "./table-style-resolver.js";
import { resolveNumbering } from "./numbering-resolver.js";
import { resolveFont, resolveThemeColor } from "./theme-font-resolver.js";
import { mergeStyleObjects } from "./text-style-resolver.js";

export function resolveStyles(rawDocument) {
  const resolveNode = (node, inheritedRunStyle = {}, tableTextContext = null) => {
    if (!node) return node;

    if (node.type === "paragraph") {
      const numbering = resolveNumbering(rawDocument.numbering, node.properties?.numbering);
      let computedStyle = resolveParagraphStyle(node, rawDocument.styles, numbering, tableTextContext);
      computedStyle = resolveTextShading(computedStyle, rawDocument.theme);
      computedStyle = resolveParagraphBorders(computedStyle, rawDocument.theme);
      if (computedStyle.runProperties) computedStyle = { ...computedStyle, runProperties: resolveRunDecorations(resolveTextShading(computedStyle.runProperties, rawDocument.theme), rawDocument.theme) };
      return {
        ...node,
        computedStyle,
        numbering,
        children: (node.children || []).map(c => resolveNode(c, computedStyle.runProperties || {}))
      };
    }

    if (node.type === "run") {
      let computedStyle = resolveRunStyle(node, rawDocument.styles, inheritedRunStyle, {
        theme: rawDocument.theme,
        fonts: rawDocument.fonts,
        resolveFont,
        resolveThemeColor
      });
      computedStyle = resolveRunDecorations(resolveTextShading(computedStyle, rawDocument.theme), rawDocument.theme);
      return { ...node, computedStyle, children: (node.children || []).map(c => resolveNode(c, computedStyle)) };
    }

    if (node.type === "image" || node.type === "vml") {
      return {
        ...node,
        visual: resolveMediaVisual(node.visual, rawDocument.theme),
        textBox: node.textBox ? {
          ...node.textBox,
          content: (node.textBox.content || []).map(c => resolveNode(c, inheritedRunStyle))
        } : null
      };
    }

    if (node.type === "table") {
      const computedStyle = resolveTableDecorations(resolveTableStyle(node, rawDocument.styles), rawDocument.theme);
      const baseTextStyle = resolveTableTextStyle(node, rawDocument.styles);
      const conditionalStyles = resolveTableConditionalStyles(node, rawDocument.styles);
      const rows = node.rows || [];
      const columnCount = Math.max(
        node.grid?.length || 0,
        ...rows.map(row => Math.max(0, Number(row.properties?.gridBefore || 0))
          + (row.cells || []).reduce((sum, cell) => sum + Math.max(1, Number(cell.properties?.gridSpan || 1)), 0)
          + Math.max(0, Number(row.properties?.gridAfter || 0))),
        0
      );
      const resolvedRows = rows.map((row, rowIndex) => {
        let gridStart = Math.max(0, Number(row.properties?.gridBefore || 0));
        const cells = (row.cells || []).map(cell => {
          const gridSpan = Math.max(1, Number(cell.properties?.gridSpan || 1));
          const conditional = resolveConditionalStyleForCell({
            conditionalStyles,
            look: node.properties?.look || computedStyle?.look || null,
            rowIndex, rowCount: rows.length, gridStart, gridSpan, columnCount,
            rowBandSize: node.properties?.rowBandSize || computedStyle?.rowBandSize || 1,
            columnBandSize: node.properties?.columnBandSize || computedStyle?.columnBandSize || 1
          });
          const properties = resolveTableDecorations(
            mergeStyleObjects(conditional.cellProperties || {}, cell.properties || {}),
            rawDocument.theme
          );
          const children = (cell.children || []).map(child => resolveNode(child, inheritedRunStyle, {
            paragraphProperties: mergeStyleObjects(baseTextStyle.paragraphProperties || {}, conditional.paragraphProperties || {}),
            runProperties: mergeStyleObjects(baseTextStyle.runProperties || {}, conditional.runProperties || {})
          }));
          gridStart += gridSpan;
          return { ...cell, properties, children };
        });
        return { ...row, cells };
      });
      return {
        ...node,
        computedStyle,
        properties: resolveTableDecorations(node.properties, rawDocument.theme),
        rows: resolvedRows
      };
    }
    if (node.type === "row") return { ...node, cells: (node.cells || []).map(c => resolveNode(c, inheritedRunStyle, tableTextContext)) };
    if (node.type === "cell") return { ...node, properties: resolveTableDecorations(node.properties, rawDocument.theme), children: (node.children || []).map(c => resolveNode(c, inheritedRunStyle, tableTextContext)) };
    if (node.children) return { ...node, children: node.children.map(c => resolveNode(c, inheritedRunStyle)) };
    return { ...node };
  };

  const resolvePartMap = parts => Object.fromEntries(Object.entries(parts || {}).map(([id, part]) => [id, {
    ...part,
    content: (part.content || []).map(n => resolveNode(n))
  }]));

  return {
    type: "resolved-document",
    body: (rawDocument.body || []).map(n => resolveNode(n)),
    background: resolveDocumentBackground(rawDocument.background, rawDocument.theme),
    finalSection: rawDocument.finalSection,
    styles: rawDocument.styles,
    numbering: rawDocument.numbering,
    settings: rawDocument.settings,
    resources: rawDocument.resources,
    theme: rawDocument.theme,
    fonts: rawDocument.fonts,
    headers: resolvePartMap(rawDocument.headers),
    footers: resolvePartMap(rawDocument.footers),
    footnotes: resolvePartMap(rawDocument.footnotes),
    endnotes: resolvePartMap(rawDocument.endnotes),
    comments: resolvePartMap(rawDocument.comments),
    metadata: rawDocument.metadata,
    diagnostics: [...(rawDocument.diagnostics || [])]
  };
}

function resolveRunDecorations(style, theme) {
  if (!style) return style;
  let out = style;
  if (style.border) {
    const explicit = style.border.color && style.border.color !== "auto" ? style.border.color : null;
    const themed = style.border.themeColor ? resolveThemeColor(theme, wordThemeColor(style.border)) : null;
    out = { ...out, border: { ...style.border, resolvedColor: String(explicit || themed || "000000").replace(/^#/, "").toUpperCase() } };
  }
  if (style.underlineColor) {
    const explicit = style.underlineColor.color && style.underlineColor.color !== "auto" ? style.underlineColor.color : null;
    const themed = style.underlineColor.themeColor ? resolveThemeColor(theme, style.underlineColor) : null;
    const resolvedUnderlineColor = explicit || themed;
    if (resolvedUnderlineColor) out = { ...out, resolvedUnderlineColor: String(resolvedUnderlineColor).replace(/^#/, "").toUpperCase() };
  }
  return out;
}

function resolveMediaVisual(visual, theme) {
  if (!visual) return visual;
  return {
    ...visual,
    fill: visual.fill ? resolveThemeColor(theme, visual.fill) : null,
    line: visual.line ? { ...visual.line, color: visual.line.color ? resolveThemeColor(theme, visual.line.color) : null } : null
  };
}

function resolveTextShading(style, theme) {
  if (!style?.shading) return style;
  const shading = style.shading;
  const fill = shading.fill && shading.fill !== "auto"
    ? shading.fill
    : (shading.themeFill ? resolveThemeColor(theme, {
        themeColor: shading.themeFill,
        themeTint: shading.themeFillTint,
        themeShade: shading.themeFillShade
      }) : null);
  return {
    ...style,
    shading: {
      ...shading,
      resolvedFill: fill ? String(fill).replace(/^#/, "").toUpperCase() : null
    }
  };
}

function resolveShadingOnProperties(properties, theme) {
  if (!properties?.shading) return properties;
  return resolveTextShading(properties, theme);
}

function resolveTableDecorations(properties, theme) {
  if (!properties) return properties;
  let out = resolveShadingOnProperties(properties, theme);
  if (!out?.borders) return out;
  const borders = {};
  for (const [name, edge] of Object.entries(out.borders)) {
    if (!edge) continue;
    const explicit = edge.color && edge.color !== "auto" ? edge.color : null;
    const themed = edge.themeColor ? resolveThemeColor(theme, wordThemeColor(edge)) : null;
    const resolvedColor = explicit || themed;
    borders[name] = resolvedColor
      ? { ...edge, resolvedColor: String(resolvedColor).replace(/^#/, "").toUpperCase() }
      : { ...edge };
  }
  return { ...out, borders };
}

function resolveDocumentBackground(background, theme) {
  if (!background) return null;
  const explicit = background.color && background.color !== "auto" ? background.color : null;
  const themed = background.themeColor ? resolveThemeColor(theme, background) : null;
  const color = explicit || themed;
  return color ? { ...background, resolvedColor: String(color).replace(/^#/, "").toUpperCase() } : { ...background };
}

function resolveParagraphBorders(style, theme) {
  if (!style?.borders) return style;
  const borders = {};
  for (const [name, edge] of Object.entries(style.borders)) {
    const explicit = edge.color && edge.color !== "auto" ? edge.color : null;
    const themed = edge.themeColor ? resolveThemeColor(theme, wordThemeColor(edge)) : null;
    borders[name] = { ...edge, resolvedColor: String(explicit || themed || "000000").replace(/^#/, "").toUpperCase() };
  }
  return { ...style, borders };
}

function wordThemeColor(source = {}) {
  return { themeColor: source.themeColor, themeTint: source.themeTint, themeShade: source.themeShade };
}
