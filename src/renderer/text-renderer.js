import { renderInlineMedia } from "./media-renderer.js";
import { renderMath } from "./math-renderer.js";
import { applyBoxStyle } from "./css-renderer.js";
import { applyRevisionPresentation } from "./revision-style.js";

export function renderTextBlock(block, doc = document, resources = {}, renderOptions = {}) {
  const p = doc.createElement("div");
  p.className = "docx-paragraph";
  applyBoxStyle(p, block);
  p.style.position = "absolute";
  applyShading(p, block.style?.shading);
  applyParagraphBorders(p, block.style?.borders);

  for (const line of block.lines || []) {
    const l = doc.createElement("div");
    l.className = "docx-line";
    l.style.position = "absolute";
    l.style.left = `${line.x - block.x}pt`;
    l.style.top = `${line.y - block.y}pt`;
    l.style.height = `${line.heightPt}pt`;
    l.style.lineHeight = `${line.heightPt}pt`;
    l.style.width = `${line.availableWidthPt ?? line.widthPt ?? 0}pt`;
    l.style.whiteSpace = "pre";
    if (block.style?.bidi) { l.style.direction = "rtl"; l.style.unicodeBidi = "plaintext"; }
    if (line.justification?.mode === "word") l.style.wordSpacing = `${line.justification.perGapPt}pt`;
    else if (line.justification?.mode === "character") l.style.letterSpacing = `${line.justification.perGapPt}pt`;

    if (line.fragments?.length) {
      for (const fragment of line.fragments) {
        if (fragment.type === "media") {
          l.appendChild(renderInlineMedia(fragment, doc, resources, renderOptions));
          continue;
        }
        if (fragment.type === "math") {
          const math = renderMath(fragment.math?.ast, doc);
          if (fragment.style?.fontSizePt) math.style.fontSize = `${fragment.style.fontSizePt}pt`;
          if (fragment.style?.fontFamily) math.style.fontFamily = fragment.style.fontFamily;
          math.style.display = "inline-block";
          math.style.verticalAlign = "middle";
          l.appendChild(math);
          continue;
        }
        if (fragment.type === "bookmark") {
          const marker = doc.createElement("span");
          marker.className = "docx-bookmark";
          marker.id = fragment.bookmarkName;
          l.appendChild(marker);
          continue;
        }
        const span = fragment.link ? doc.createElement("a") : doc.createElement("span");
        if (fragment.link) applyHyperlink(span, fragment.link);
        if (fragment.type === "tab") {
          span.textContent = renderTabLeader(fragment);
          span.style.display = "inline-block";
          span.style.width = `${fragment.widthPt || 0}pt`;
          span.style.overflow = "hidden";
          span.style.whiteSpace = "nowrap";
        } else {
          span.textContent = fragment.text;
        }
        applyFragmentStyle(span, fragment.style || {}, fragment, block.style?.textAlignment);
        applyRevisionPresentation(span, fragment.revision, renderOptions.changes);
        l.appendChild(span);
      }
    } else {
      l.textContent = line.text;
    }
    p.appendChild(l);
  }
  return p;
}

function applyFragmentStyle(element, style, fragment = {}, textAlignment = null) {
  if (style.fontFamily) element.style.fontFamily = style.fontFamily;
  if (style.rtl) { element.style.direction = "rtl"; element.style.unicodeBidi = "isolate"; }
  if (style.fontSizePt) element.style.fontSize = `${style.fontSizePt}pt`;
  if (style.bold) element.style.fontWeight = "700";
  if (style.italic) element.style.fontStyle = "italic";
  applyTextDecoration(element, style);
  applyRunBorder(element, style.border);
  applyShading(element, style.shading);
  applyHighlight(element, style.highlight);
  applyEmphasis(element, style.emphasis);
  if (style.resolvedColor) element.style.color = style.resolvedColor.startsWith("#") ? style.resolvedColor : `#${style.resolvedColor}`;
  if (style.characterSpacingPt) element.style.letterSpacing = `${style.characterSpacingPt}pt`;
  if (fragment.autoSpacingBeforePt) element.style.marginLeft = `${fragment.autoSpacingBeforePt}pt`;
  if (style.baselineShiftPt) {
    element.style.position = "relative";
    element.style.top = `${-style.baselineShiftPt}pt`;
  } else if (textAlignment) {
    element.style.verticalAlign = mapTextAlignment(textAlignment);
  }
  if (style.textScale && style.textScale !== 1) {
    const scaledGlyphWidthPt = fragment.glyphWidthPt ?? Math.max(0, (fragment.widthPt || 0) - (fragment.autoSpacingBeforePt || 0));
    const naturalWidthPt = scaledGlyphWidthPt ? scaledGlyphWidthPt / style.textScale : null;
    element.style.display = "inline-block";
    element.style.transformOrigin = "left center";
    element.style.transform = `scaleX(${style.textScale})`;
    if (naturalWidthPt != null) {
      element.style.width = `${naturalWidthPt}pt`;
      element.style.marginRight = `${scaledGlyphWidthPt - naturalWidthPt}pt`;
    }
  }
}


function applyHyperlink(element, link = {}) {
  const href = resolveHyperlinkHref(link);
  if (!href) return;
  element.href = href;
  // Field switches such as HYPERLINK and REF \h make the cached field result
  // clickable, but Word does not implicitly apply the Hyperlink character style.
  // Keep the result visually neutral unless the run itself carries color/underline.
  if (link.field) {
    element.style.color = "inherit";
    element.style.textDecoration = "none";
  }
  if (link.tooltip) element.title = link.tooltip;
  if (link.targetFrame) element.target = link.targetFrame;
  if (link.targetMode === "External") element.rel = "noopener noreferrer";
}

function resolveHyperlinkHref(link = {}) {
  if (link.anchor) return `#${encodeURIComponent(link.anchor)}`;
  const target = String(link.target || "").trim();
  if (!target) return null;
  if (/^(https?:|mailto:|tel:)/i.test(target)) return target;
  if (target.startsWith("#")) return target;
  return null;
}

function mapTextAlignment(value) {
  switch (value) {
    case "top": return "top";
    case "center": return "middle";
    case "bottom": return "bottom";
    case "baseline":
    case "auto":
    default: return "baseline";
  }
}

function renderTabLeader(fragment) {
  switch (fragment.leader) {
    case "dot": return "................................";
    case "hyphen": return "--------------------------------";
    case "underscore": return "________________________________";
    case "middleDot": return "································";
    default: return "";
  }
}

function applyParagraphBorders(element, borders) {
  if (!borders) return;
  for (const name of ["top", "right", "bottom", "left"]) {
    const edge = borders[name];
    if (!edge || ["none", "nil"].includes(String(edge.value || "").toLowerCase())) continue;
    const side = name[0].toUpperCase() + name.slice(1);
    const widthPt = edge.size != null ? Number(edge.size) / 8 : 0.5;
    const color = String(edge.resolvedColor || edge.color || "000000").replace(/^#/, "");
    element.style[`border${side}Style`] = mapBorderStyle(edge.value);
    element.style[`border${side}Width`] = `${Math.max(widthPt, 0.25)}pt`;
    if (/^[0-9a-f]{6}$/i.test(color)) element.style[`border${side}Color`] = `#${color}`;
  }
}

function mapBorderStyle(value) {
  const v = String(value || "single");
  if (["double", "triple"].includes(v)) return "double";
  if (["dotted", "dashDotStroked"].includes(v)) return "dotted";
  if (["dashed", "dashSmallGap", "dotDash", "dotDotDash"].includes(v)) return "dashed";
  return "solid";
}

function applyEmphasis(element, emphasis) {
  const value = String(emphasis || "").trim();
  if (!value || value === "none") return;
  const map = {
    dot: "dot",
    comma: "sesame",
    circle: "circle",
    underDot: "dot"
  };
  const mark = map[value];
  if (!mark) return;
  element.style.textEmphasisStyle = mark;
  element.style.textEmphasisPosition = value === "underDot" ? "under right" : "over right";
}

function applyHighlight(element, highlight) {
  const value = String(highlight || "").trim();
  if (!value || value === "none") return;
  const colors = {
    black: "#000000", blue: "#0000FF", cyan: "#00FFFF", green: "#00FF00",
    magenta: "#FF00FF", red: "#FF0000", yellow: "#FFFF00", white: "#FFFFFF",
    darkBlue: "#000080", darkCyan: "#008080", darkGreen: "#008000", darkMagenta: "#800080",
    darkRed: "#800000", darkYellow: "#808000", darkGray: "#808080", lightGray: "#C0C0C0"
  };
  const color = colors[value];
  if (color) element.style.backgroundColor = color;
}

function applyTextDecoration(element, style = {}) {
  const underline = String(style.underline || "");
  const hasUnderline = underline && !["none", "nil", "0", "false"].includes(underline);
  const customPattern = hasUnderline ? createPatternUnderline(underline, style.resolvedUnderlineColor) : null;
  const lines = [];
  if (hasUnderline && !customPattern) lines.push("underline");
  if (style.strike || style.doubleStrike) lines.push("line-through");
  if (lines.length) element.style.textDecorationLine = lines.join(" ");

  if (customPattern) {
    element.style.backgroundImage = customPattern.image;
    element.style.backgroundRepeat = "repeat-x";
    element.style.backgroundPosition = "left bottom";
    element.style.backgroundSize = customPattern.size;
    element.style.paddingBottom = customPattern.paddingBottom;
  }

  if (!lines.length && !customPattern) return;
  if (style.doubleStrike || underline === "double") element.style.textDecorationStyle = "double";
  else if (["dotted", "dottedHeavy"].includes(underline)) element.style.textDecorationStyle = "dotted";
  else if (["dash", "dashedHeavy", "dashLong", "dashLongHeavy"].includes(underline)) element.style.textDecorationStyle = "dashed";
  else if (["wave", "wavyHeavy"].includes(underline)) element.style.textDecorationStyle = "wavy";
  else element.style.textDecorationStyle = "solid";
  if (["thick", "dottedHeavy", "dashedHeavy", "dashLongHeavy", "wavyHeavy"].includes(underline)) element.style.textDecorationThickness = "0.12em";
  if (style.resolvedUnderlineColor) element.style.textDecorationColor = normalizeDecorationColor(style.resolvedUnderlineColor);
}

function createPatternUnderline(underline, rawColor) {
  if (!["dotDash", "dotDotDash", "wavyDouble"].includes(underline)) return null;
  const color = normalizeDecorationColor(rawColor || "000000");
  const stroke = color;
  let svg;
  let size;
  let paddingBottom = "0.13em";
  if (underline === "dotDash") {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 3"><path d="M0 1.5H7" stroke="${stroke}" stroke-width="1.2"/><circle cx="11" cy="1.5" r="1" fill="${stroke}"/></svg>`;
    size = "0.9em 0.18em";
  } else if (underline === "dotDotDash") {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 3"><path d="M0 1.5H7" stroke="${stroke}" stroke-width="1.2"/><circle cx="11" cy="1.5" r="1" fill="${stroke}"/><circle cx="15" cy="1.5" r="1" fill="${stroke}"/></svg>`;
    size = "1.15em 0.18em";
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 6"><path d="M0 2 Q3 0 6 2 T12 2 M0 5 Q3 3 6 5 T12 5" fill="none" stroke="${stroke}" stroke-width="0.9"/></svg>`;
    size = "0.75em 0.30em";
    paddingBottom = "0.20em";
  }
  return { image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, size, paddingBottom };
}

function normalizeDecorationColor(value) {
  const raw = String(value || "000000").trim();
  if (raw.startsWith("#")) return raw;
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : raw;
}

function applyRunBorder(element, border) {
  if (!border || ["none", "nil"].includes(String(border.value || "").toLowerCase())) return;
  const widthPt = border.size != null ? Number(border.size) / 8 : 0.5;
  const color = String(border.resolvedColor || border.color || "000000").replace(/^#/, "");
  element.style.borderStyle = mapBorderStyle(border.value);
  element.style.borderWidth = `${Math.max(widthPt, 0.25)}pt`;
  if (/^[0-9a-f]{6}$/i.test(color)) element.style.borderColor = `#${color}`;
  element.style.boxSizing = "border-box";
}

function applyShading(element, shading) {
  if (!shading || ["nil", "clear"].includes(shading.value) && (!shading.resolvedFill || shading.resolvedFill === "AUTO")) return;
  const fill = shading.resolvedFill || (shading.fill && shading.fill !== "auto" ? shading.fill : null);
  if (fill && /^[0-9a-f]{6}$/i.test(String(fill).replace(/^#/, ""))) {
    element.style.backgroundColor = `#${String(fill).replace(/^#/, "")}`;
  }
}
