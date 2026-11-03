import { twipToPt, halfPointToPt } from "../../common/units.js";
import { defaultFontResolver } from "../services/font-resolver.js";
import { createLineBreaker, defaultLineBreaker } from "../services/line-breaker.js";
import { evaluateFieldInstruction, resolveFieldLink } from "../services/field-evaluator.js";

export function layoutParagraph(node, { x = 0, y = 0, widthPt, measurer, flowResolver = null, documentGrid = null, fieldContext = null, defaultTabStop = null, fontResolver = defaultFontResolver, lineBreaker = null, lineBreakRules = null }) {
  const paragraphStyle = node.style || {};
  const indentation = resolveIndentation(paragraphStyle.indentation || {}, paragraphStyle, measurer, fontResolver);
  const spacing = resolveParagraphSpacing(paragraphStyle.spacing || {}, defaultNaturalHeight(paragraphStyle));
  const borderInsetsPt = resolveParagraphBorderInsets(paragraphStyle.borders);
  const contentWidthPt = Math.max(0, widthPt - indentation.leftPt - indentation.rightPt - borderInsetsPt.left - borderInsetsPt.right);
  const inlines = applyEastAsianAutoSpacing(collectInlineItems(node, paragraphStyle, fieldContext, fontResolver), paragraphStyle);
  const resolvedLineBreaker = lineBreaker || (lineBreakRules ? createLineBreaker(lineBreakRules) : defaultLineBreaker);
  const lines = breakIntoLines(inlines, {
    measurer,
    contentWidthPt,
    firstLineOffsetPt: indentation.firstLineOffsetPt,
    paragraphStyle,
    startXPt: x + indentation.leftPt + borderInsetsPt.left,
    startYPt: y + spacing.beforePt + borderInsetsPt.top,
    flowResolver,
    documentGrid: paragraphStyle.snapToGrid === false ? null : documentGrid,
    defaultTabStop,
    lineBreaker: resolvedLineBreaker
  });

  let cursorY = y + spacing.beforePt + borderInsetsPt.top;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineHeightPt = resolveEffectiveLineHeight(paragraphStyle.spacing || {}, line.naturalHeightPt, paragraphStyle.snapToGrid === false ? null : documentGrid, line);
    const firstOffset = i === 0 ? indentation.firstLineOffsetPt : 0;
    const lineBox = line.flowBox || {
      x: x + indentation.leftPt + borderInsetsPt.left,
      y: cursorY,
      widthPt: contentWidthPt
    };
    cursorY = Math.max(cursorY, lineBox.y ?? cursorY);
    const availableWidthPt = Math.max(0, (lineBox.widthPt ?? contentWidthPt) - firstOffset);
    const alignedX = resolveAlignedX(
      (lineBox.x ?? (x + indentation.leftPt + borderInsetsPt.left)) + firstOffset,
      availableWidthPt,
      line.widthPt,
      paragraphStyle.alignment || (paragraphStyle.bidi ? "right" : null)
    );
    line.x = alignedX;
    line.y = cursorY;
    line.heightPt = lineHeightPt;
    line.availableWidthPt = availableWidthPt;
    line.justification = resolveJustification(line, availableWidthPt, paragraphStyle.alignment, i === lines.length - 1);
    line.baselinePt = cursorY + Math.min(line.ascentPt, lineHeightPt);
    cursorY += lineHeightPt;
  }

  const linesHeightPt = lines.reduce((sum, line) => sum + line.heightPt, 0);
  const lastLineBottomPt = lines.length ? Math.max(...lines.map(line => line.y + line.heightPt)) : (y + spacing.beforePt + borderInsetsPt.top);
  const heightPt = Math.max(spacing.beforePt + borderInsetsPt.top + linesHeightPt, lastLineBottomPt - y) + borderInsetsPt.bottom + spacing.afterPt;
  const dominantLineHeightPt = lines[0]?.heightPt || resolveEffectiveLineHeight(paragraphStyle.spacing || {}, defaultNaturalHeight(paragraphStyle), paragraphStyle.snapToGrid === false ? null : documentGrid, null);

  return {
    type: "paragraph",
    x,
    y,
    widthPt,
    heightPt,
    contentXPt: x + indentation.leftPt + borderInsetsPt.left,
    contentWidthPt,
    borderInsetsPt,
    lineHeightPt: dominantLineHeightPt,
    spacingBeforePt: spacing.beforePt,
    spacingAfterPt: spacing.afterPt,
    indentation,
    style: paragraphStyle,
    keepLines: !!paragraphStyle.keepLines,
    keepNext: !!paragraphStyle.keepNext,
    pageBreakBefore: !!paragraphStyle.pageBreakBefore,
    contextualSpacing: !!paragraphStyle.contextualSpacing,
    widowControl: paragraphStyle.widowControl !== false,
    frame: paragraphStyle.frame || null,
    lines
  };
}

function resolveParagraphBorderInsets(borders = null) {
  const read = side => {
    const edge = borders?.[side];
    if (!edge || ["none", "nil"].includes(String(edge.value || "").toLowerCase())) return 0;
    const value = Number(edge.space);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  return { top: read("top"), right: read("right"), bottom: read("bottom"), left: read("left") };
}

export function splitParagraphAtForcedBreak(block) {
  if (block.type !== "paragraph" || !block.lines?.length) return null;
  const index = block.lines.findIndex(line => line.breakAfter === "page" || line.breakAfter === "column");
  if (index < 0) return null;
  const firstLines = block.lines.slice(0, index + 1);
  const restLines = block.lines.slice(index + 1);
  const breakType = block.lines[index].breakAfter;
  const first = cloneParagraphFragment(block, firstLines, {
    before: block.spacingBeforePt,
    after: 0,
    fragment: "forced-break-start"
  });
  first.forcedBreakAfter = breakType;
  const rest = restLines.length ? cloneParagraphFragment(block, restLines, {
    before: 0,
    after: block.spacingAfterPt,
    fragment: "forced-break-end"
  }) : null;
  return { first, rest, breakType };
}

export function splitParagraphForHeight(block, availableHeightPt, {
  allowTrailingSpaceSplit = false,
  relaxWidowForTrailingSpace = false,
  allowOversizedKeepLines = false
} = {}) {
  if (block.type !== "paragraph" || (block.keepLines && !allowOversizedKeepLines) || block.lines.length <= 1) return null;
  const usableFirstHeight = availableHeightPt - block.spacingBeforePt;
  if (usableFirstHeight <= 0) return null;

  let used = 0;
  let fitCount = 0;
  for (const line of block.lines) {
    if (used + line.heightPt > usableFirstHeight) break;
    used += line.heightPt;
    fitCount++;
  }
  if (fitCount <= 0) return null;
  // In a splittable table row, the text can fit while its paragraph-after
  // spacing exceeds the remaining height. Splitting one line earlier can
  // retain content on the current page rather than pushing the entire row.
  const trailingSpaceOnlyOverflow = allowTrailingSpaceSplit && block.spacingAfterPt > 0
    && fitCount >= block.lines.length && block.heightPt > availableHeightPt + 0.001;
  if (fitCount >= block.lines.length) {
    if (!trailingSpaceOnlyOverflow) return null;
    fitCount = block.lines.length - 1;
  }
  if (block.widowControl && !(trailingSpaceOnlyOverflow && relaxWidowForTrailingSpace) && block.lines.length >= 4) {
    if (fitCount < 2) return null;
    if (block.lines.length - fitCount < 2) fitCount = block.lines.length - 2;
    if (fitCount < 2) return null;
  }

  const firstLines = block.lines.slice(0, fitCount);
  const restLines = block.lines.slice(fitCount);
  const first = cloneParagraphFragment(block, firstLines, {
    before: block.spacingBeforePt,
    after: 0,
    fragment: "start"
  });
  const rest = cloneParagraphFragment(block, restLines, {
    before: 0,
    after: block.spacingAfterPt,
    fragment: "end"
  });
  return { first, rest };
}

export function repositionParagraph(block, { x = block.x, y = block.y, widthPt = block.widthPt } = {}) {
  const dx = x - block.x;
  const dy = y - block.y;
  block.x = x;
  block.y = y;
  block.widthPt = widthPt;
  block.contentXPt += dx;
  for (const line of block.lines || []) {
    line.x += dx;
    line.y += dy;
  }
  return block;
}

function collectInlineItems(node, paragraphStyle, fieldContext = null, fontResolver = defaultFontResolver) {
  const items = [];
  const inheritedRun = paragraphStyle.runProperties || {};
  const fieldStack = [];

  const emitText = (value, runStyle, link = null, meta = null) => {
    for (const token of transformRunText(value, runStyle)) {
      const item = { type: "char", text: token.text, style: normalizeRunStyle(token.style, token.text, fontResolver), link, ...(meta || {}) };
      const active = fieldStack[fieldStack.length - 1];
      if (active?.separated) active.resultItems.push(item);
      else items.push(item);
    }
  };

  const emitItem = item => {
    const active = fieldStack[fieldStack.length - 1];
    if (active?.separated) active.resultItems.push(item);
    else items.push(item);
  };

  const closeField = (field, runStyle) => {
    const evaluated = evaluateFieldInstruction(field.instruction, fieldContext);
    const fieldLink = resolveFieldLink(field.instruction);
    const target = fieldStack[fieldStack.length - 1]?.separated
      ? fieldStack[fieldStack.length - 1].resultItems
      : items;
    if (evaluated != null) {
      const style = field.resultStyle || field.instructionStyle || runStyle || inheritedRun;
      for (const ch of Array.from(String(evaluated))) target.push({ type: "char", text: ch, style: normalizeRunStyle(style, ch, fontResolver), link: fieldLink });
    } else {
      target.push(...applyFieldLink(field.resultItems, fieldLink));
    }
  };

  const walk = (current, runStyle = inheritedRun, linkContext = null, revisionContext = node.revision || null) => {
    if (!current) return;
    if (current.type === "run") {
      const nextStyle = { ...inheritedRun, ...(current.style || {}) };
      if (nextStyle.vanish || nextStyle.webHidden) return;
      for (const child of current.children || []) walk(child, nextStyle, linkContext, revisionContext);
      return;
    }
    if (current.type === "hyperlink") {
      const nextLink = {
        target: current.target || null,
        targetMode: current.targetMode || null,
        anchor: current.anchor || null,
        relationshipId: current.relationshipId || null,
        tooltip: current.tooltip || null,
        targetFrame: current.targetFrame || null
      };
      for (const child of current.children || []) walk(child, runStyle, nextLink, revisionContext);
      return;
    }
    if (current.type === "revision") {
      const nextRevision = current.revision || revisionContext;
      for (const child of current.children || []) walk(child, runStyle, linkContext, nextRevision);
      return;
    }
    if (current.type === "bookmark-start") {
      if (current.name) emitItem({ type: "bookmark", name: current.name });
      return;
    }
    if (current.type === "bookmark-end") return;
    if (current.type === "field") {
      // Simple fields carry the instruction and result children on one node.
      if (current.instruction && current.children?.length) {
        const evaluated = evaluateFieldInstruction(current.instruction, fieldContext);
        const fieldLink = resolveFieldLink(current.instruction) || linkContext;
        if (evaluated != null) emitText(String(evaluated), runStyle, fieldLink, revisionContext ? { revision: revisionContext } : null);
        else for (const child of current.children) walk(child, runStyle, fieldLink, revisionContext);
        return;
      }
      if (current.fieldCharType === "begin") {
        fieldStack.push({ instruction: "", separated: false, resultItems: [], instructionStyle: runStyle, resultStyle: null });
        return;
      }
      const active = fieldStack[fieldStack.length - 1];
      if (current.instruction && active) {
        active.instruction += current.instruction;
        active.instructionStyle ||= runStyle;
        return;
      }
      if (current.fieldCharType === "separate" && active) {
        active.separated = true;
        active.resultStyle = runStyle;
        return;
      }
      if (current.fieldCharType === "end" && active) {
        const field = fieldStack.pop();
        closeField(field, runStyle);
        return;
      }
      return;
    }
    if (current.type === "text") {
      emitText(current.value, runStyle, linkContext, revisionContext ? { revision: revisionContext } : null);
      return;
    }
    if (current.type === "symbol") {
      const symbolStyle = current.font
        ? { ...runStyle, fonts: { ...(runStyle?.fonts || {}), ascii: current.font, hAnsi: current.font, eastAsia: current.font } }
        : runStyle;
      emitText(current.value || "", symbolStyle, linkContext, revisionContext ? { revision: revisionContext } : null);
      return;
    }
    if (["footnote-reference", "footnote-ref", "endnote-reference", "endnote-ref"].includes(current.type)) {
      const label = current.displayLabel ?? (current.id != null ? String(current.id) : "");
      if (label) {
        const noteKind = current.type.startsWith("endnote") ? "endnote" : "footnote";
        const style = normalizeRunStyle({ ...runStyle, verticalAlign: runStyle?.verticalAlign || "superscript" }, label, fontResolver);
        emitItem({
          type: "note-reference",
          text: String(label),
          style,
          noteKind,
          noteId: current.id ?? current.noteId ?? current.footnoteId ?? null,
          noteBodyMarker: current.type.endsWith("-ref")
        });
      }
      return;
    }
    if (current.type === "break") {
      emitItem({ type: "break", breakType: current.breakType || "line", clear: current.clear || null });
      return;
    }
    if ((current.type === "image" || current.type === "vml") && current.positioning?.mode !== "anchor") {
      emitItem({ type: "media", node: current, style: normalizeRunStyle(runStyle, "", fontResolver) });
      return;
    }
    if (current.type === "math") {
      emitItem({ type: "math", node: current, style: normalizeRunStyle(runStyle, current.text || "", fontResolver) });
      return;
    }
    if (current.type === "tab") {
      emitItem({ type: "tab", style: normalizeRunStyle(runStyle, "\t", fontResolver) });
      return;
    }
    for (const child of current.children || []) walk(child, runStyle, linkContext, revisionContext);
  };

  const label = node.numberingLabel;
  if (label?.text) {
    const labelStyle = { ...inheritedRun, ...(label.style || {}) };
    emitText(label.text, labelStyle, null, { numberingLabel: true });
    if (label.suffix === "space") emitText(" ", labelStyle, null, { numberingLabel: true });
    else if (label.suffix === "tab") emitItem({ type: "tab", style: normalizeRunStyle(labelStyle, "\t", fontResolver), numberingTab: true, numberingLabel: true });
  }

  for (const child of node.children || []) walk(child, inheritedRun, null, node.revision || null);
  // Malformed/unclosed fields should not make their visible cached result disappear.
  while (fieldStack.length) closeField(fieldStack.pop(), inheritedRun);
  return items;
}

function applyFieldLink(items, link) {
  if (!link) return items || [];
  return (items || []).map(item => item.link ? item : { ...item, link });
}

function breakIntoLines(items, { measurer, contentWidthPt, firstLineOffsetPt, paragraphStyle, startXPt = 0, startYPt = 0, flowResolver = null, documentGrid = null, defaultTabStop = null, lineBreaker = defaultLineBreaker }) {
  const lines = [];
  let line = createLine();
  let lineIndex = 0;
  let lastBreakIndex = -1;
  let cursorY = startYPt;

  const resolveLineBox = (clear = null) => {
    const fallback = { x: startXPt, y: cursorY, widthPt: contentWidthPt };
    if (!flowResolver) return fallback;
    const resolved = flowResolver({
      lineIndex,
      y: cursorY,
      estimatedHeightPt: defaultNaturalHeight(paragraphStyle),
      x: startXPt,
      widthPt: contentWidthPt,
      clear
    }) || fallback;
    return {
      x: resolved.x ?? fallback.x,
      y: resolved.y ?? fallback.y,
      widthPt: Math.max(0, resolved.widthPt ?? fallback.widthPt)
    };
  };
  let currentLineBox = resolveLineBox();

  const maxWidth = () => Math.max(0, currentLineBox.widthPt - (lineIndex === 0 ? firstLineOffsetPt : 0));
  const pushLine = (clearAfter = null) => {
    trimTrailingWhitespace(line);
    finalizeLine(line, paragraphStyle);
    line.flowBox = currentLineBox;
    lines.push(line);
    const lineHeightPt = resolveEffectiveLineHeight(paragraphStyle.spacing || {}, line.naturalHeightPt, documentGrid, line);
    cursorY = Math.max(cursorY, currentLineBox.y ?? cursorY) + lineHeightPt;
    line = createLine();
    lineIndex++;
    lastBreakIndex = -1;
    currentLineBox = resolveLineBox(clearAfter);
  };

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.type === "break") {
      if (!line.fragments.length) {
        finalizeLine(line, paragraphStyle);
      }
      line.breakAfter = item.breakType || "line";
      line.breakClear = item.clear || null;
      pushLine(item.clear || null);
      continue;
    }

    const fragment = item.type === "tab"
      ? measureTabInline(item, items, index, line.widthPt, measurer, paragraphStyle, defaultTabStop, firstLineOffsetPt)
      : measureInline(item, line.widthPt, measurer, paragraphStyle, defaultTabStop);
    const widthLimit = maxWidth();
    if (line.fragments.length && line.widthPt + fragment.widthPt > widthLimit) {
      // A space that itself crosses the right edge belongs to the break, not
      // to the following line. Preserve the already-fitting word on this line
      // instead of carrying that word forward merely because its trailing
      // whitespace overflowed by a few points.
      if (fragment.type === "text" && /^\s$/u.test(fragment.text || "")) {
        pushLine();
        continue;
      }
      const lineEndFragment = line.fragments[line.fragments.length - 1];
      if (lineEndFragment?.type === "text" && lineBreaker.isProhibitedAtLineEnd(lineEndFragment.text, lineEndFragment.style)) {
        const carry = detachLastTextCharacter(line, measurer);
        if (carry && line.fragments.length) {
          pushLine();
          appendFragment(line, carry);
          appendFragment(line, fragment);
          continue;
        }
        if (carry) appendFragment(line, carry);
      }
      if (lineBreaker.shouldCarryPreviousAtParagraphEnd(fragment.text, items, index, fragment.style)) {
        const carry = detachLastTextCharacter(line, measurer);
        if (carry && line.fragments.length) {
          pushLine();
          appendFragment(line, carry);
          appendFragment(line, fragment);
          continue;
        }
        if (carry) appendFragment(line, carry);
      }
      const allowsCharacterBreak = lineBreaker.allowsCharacterBreak({
        wordWrap: paragraphStyle.wordWrap,
        lineText: line.text,
        nextText: fragment.text
      });
      // Even when w:wordWrap=false permits character-level breaking, Word
      // normally uses an available preceding word boundary before cutting a
      // Latin word in half. Only fall back to a character break when the word
      // cannot otherwise fit (for example an oversized unspaced identifier).
      // Keep CJK overflow character-breakable; carrying everything since an
      // earlier space would incorrectly inflate Korean/Japanese paragraphs.
      const insideLatinWord = lineBreaker.prefersSoftBreak({lineText: line.text, nextText: fragment.text});
      if ((!allowsCharacterBreak || insideLatinWord) && lastBreakIndex >= 0 && lastBreakIndex < line.fragments.length - 1) {
        const carry = line.fragments.splice(lastBreakIndex + 1);
        recalculateLine(line);
        pushLine();
        for (const carried of carry) appendFragment(line, carried);
      } else if (!allowsCharacterBreak) {
        // Keep a space-delimited word intact. If the word itself is wider than
        // the line, Word allows it to exceed the text extent rather than
        // silently switching to character-level wrapping.
        appendFragment(line, fragment);
        continue;
      } else {
        pushLine();
      }
    }

    // A single glyph wider than the line is still emitted to avoid an infinite loop.
    appendFragment(line, fragment);
    if (lineBreaker.isSoftBreakOpportunity(fragment.text, fragment.style)) {
      lastBreakIndex = line.fragments.length - 1;
      // Preserve a soft-break boundary even when adjacent glyphs share the
      // same visual style. Without this marker appendFragment() merges the
      // following word back into the whitespace fragment, so the breaker can
      // no longer carry the word to the next line and the line may overflow.
      if (lastBreakIndex >= 0) line.fragments[lastBreakIndex].softBreakAfter = true;
    }
  }

  if (line.fragments.length || !lines.length) {
    trimTrailingWhitespace(line);
    finalizeLine(line, paragraphStyle);
    line.flowBox = currentLineBox;
    lines.push(line);
  }
  return lines;
}

function measureInline(item, currentWidthPt, measurer, paragraphStyle, defaultTabStop = null) {
  const style = item.style || normalizeRunStyle(paragraphStyle.runProperties || {});
  if (item.type === "bookmark") {
    return {
      text: "", widthPt: 0, glyphWidthPt: 0, heightPt: 0, ascentPt: 0, descentPt: 0, lineHeightPt: 0,
      style, type: "bookmark", bookmarkName: item.name, revision: item.revision || null
    };
  }
  if (item.type === "math") {
    const metrics = measureMathAst(item.node?.ast, measurer, style);
    return {
      text: item.node?.text || "",
      widthPt: metrics.widthPt,
      glyphWidthPt: metrics.widthPt,
      heightPt: metrics.heightPt,
      ascentPt: metrics.ascentPt,
      descentPt: metrics.descentPt,
      lineHeightPt: metrics.heightPt,
      style,
      type: "math",
      math: item.node,
      link: item.link || null,
      revision: item.revision || null
    };
  }
  if (item.type === "media") {
    const node = item.node || {};
    const extent = node.extent || {};
    const widthPt = node.widthPt ?? emuToPtSafe(extent.cx) ?? parseVmlSize(node.shape?.style, "width") ?? 0;
    const heightPt = node.heightPt ?? emuToPtSafe(extent.cy) ?? parseVmlSize(node.shape?.style, "height") ?? style.fontSizePt;
    return {
      text: "",
      widthPt,
      heightPt,
      ascentPt: heightPt,
      descentPt: 0,
      lineHeightPt: heightPt,
      style,
      type: "media",
      media: node,
      link: item.link || null,
      revision: item.revision || null
    };
  }
  if (item.type === "tab") {
    return { ...createTabFragment(style, resolveTabAdvance(currentWidthPt, paragraphStyle.tabs, defaultTabStop)), numberingLabel: !!item.numberingLabel, revision: item.revision || null };
  }
  const metrics = measurer.measure(item.text, style);
  const autoSpacingBeforePt = Number(item.autoSpacingBeforePt || 0);
  const baselineShiftPt = Number(style.baselineShiftPt || 0);
  return {
    text: item.text,
    ...metrics,
    widthPt: metrics.widthPt + autoSpacingBeforePt,
    glyphWidthPt: metrics.widthPt,
    autoSpacingBeforePt,
    baselineShiftPt,
    ascentPt: (metrics.ascentPt || 0) + Math.max(0, baselineShiftPt),
    descentPt: (metrics.descentPt || 0) + Math.max(0, -baselineShiftPt),
    lineHeightPt: Math.max(metrics.lineHeightPt || 0, (metrics.ascentPt || 0) + (metrics.descentPt || 0) + Math.abs(baselineShiftPt)),
    style,
    type: "text",
    noteId: item.noteId ?? null,
    noteKind: item.noteKind ?? null,
    noteReference: item.type === "note-reference",
    footnoteId: item.noteKind === "footnote" ? (item.noteId ?? null) : null,
    footnoteReference: item.type === "note-reference" && item.noteKind === "footnote",
    endnoteId: item.noteKind === "endnote" ? (item.noteId ?? null) : null,
    endnoteReference: item.type === "note-reference" && item.noteKind === "endnote",
    noteBodyMarker: !!item.noteBodyMarker,
    link: item.link || null,
    numberingLabel: !!item.numberingLabel,
    revision: item.revision || null
  };
}

function createLine() {
  return { text: "", widthPt: 0, ascentPt: 0, descentPt: 0, naturalHeightPt: 0, fragments: [] };
}

function appendFragment(line, fragment) {
  const previous = line.fragments[line.fragments.length - 1];
  if (fragment.type !== "media" && fragment.type !== "bookmark" && !fragment.noteReference && !previous?.noteReference && !fragment.autoSpacingBeforePt && previous && !previous.softBreakAfter && previous.type === fragment.type && sameLink(previous.link, fragment.link) && sameRevision(previous.revision, fragment.revision) && sameVisualStyle(previous.style, fragment.style)) {
    previous.text += fragment.text;
    const previousGlyphWidthPt = previous.glyphWidthPt ?? previous.widthPt;
    previous.widthPt += fragment.widthPt;
    previous.glyphWidthPt = previousGlyphWidthPt + (fragment.glyphWidthPt ?? fragment.widthPt);
    previous.ascentPt = Math.max(previous.ascentPt, fragment.ascentPt || 0);
    previous.descentPt = Math.max(previous.descentPt, fragment.descentPt || 0);
  } else {
    line.fragments.push({ ...fragment });
  }
  line.text += fragment.text;
  line.widthPt += fragment.widthPt;
  // Word's numbering-level w:rPr styles the generated label but does not let
  // a Symbol/Wingdings glyph enlarge the paragraph's natural text line box.
  // Base line metrics on body runs; label-only lines fall back to the paragraph
  // default in finalizeLine().
  if (!fragment.numberingLabel) {
    line.ascentPt = Math.max(line.ascentPt, fragment.ascentPt || 0);
    line.descentPt = Math.max(line.descentPt, fragment.descentPt || 0);
    line.naturalHeightPt = Math.max(line.naturalHeightPt, fragment.lineHeightPt || 0, (fragment.ascentPt || 0) + (fragment.descentPt || 0), fragment.style?.fontSizePt || 9);
  }
}

function sameRevision(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id && a.author === b.author && a.date === b.date;
}

function sameLink(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.target === b.target && a.anchor === b.anchor && a.targetMode === b.targetMode;
}

function recalculateLine(line) {
  const fragments = line.fragments;
  line.text = "";
  line.widthPt = 0;
  line.ascentPt = 0;
  line.descentPt = 0;
  line.naturalHeightPt = 0;
  const copy = fragments.map(fragment => ({ ...fragment }));
  line.fragments = [];
  for (const fragment of copy) appendFragment(line, fragment);
}

function trimTrailingWhitespace(line) {
  while (line.fragments.length) {
    const last = line.fragments[line.fragments.length - 1];
    const trimmed = last.text.replace(/\s+$/u, "");
    if (trimmed === last.text) break;
    if (!trimmed) {
      line.fragments.pop();
    } else {
      const ratio = trimmed.length / last.text.length;
      last.widthPt *= ratio;
      last.text = trimmed;
      break;
    }
  }
  recalculateLine(line);
}

function finalizeLine(line, paragraphStyle) {
  if (!line.naturalHeightPt) line.naturalHeightPt = defaultNaturalHeight(paragraphStyle);
}

function transformRunText(value, style = {}) {
  const out = [];
  for (const original of Array.from(value || "")) {
    if (style.caps) {
      for (const ch of Array.from(original.toLocaleUpperCase())) out.push({ text: ch, style });
      continue;
    }
    if (style.smallCaps && isLowercaseCasedLetter(original)) {
      const scaledStyle = { ...style, smallCapsScale: 0.8 };
      for (const ch of Array.from(original.toLocaleUpperCase())) out.push({ text: ch, style: scaledStyle });
      continue;
    }
    out.push({ text: original, style });
  }
  return out;
}

function isLowercaseCasedLetter(ch) {
  return ch.toLocaleLowerCase() === ch && ch.toLocaleUpperCase() !== ch;
}

function normalizeRunStyle(style = {}, text = "", fontResolver = defaultFontResolver) {
  const complexScript = style.rtl === true || isComplexScriptText(text);
  const sizeValue = complexScript && style.sizeCs != null ? style.sizeCs : style.size;
  const baseFontSizePt = sizeValue != null ? halfPointToPt(sizeValue) : (style.sizePt || style.fontSizePt || 9);
  const fontSizePt = baseFontSizePt * Number(style.smallCapsScale || 1);
  const textScale = normalizeTextScale(style.scale ?? style.textScale);
  const baselineShiftPt = resolveBaselineShift(style, fontSizePt);
  return {
    ...style,
    bold: complexScript && style.boldCs != null ? style.boldCs : style.bold,
    italic: complexScript && style.italicCs != null ? style.italicCs : style.italic,
    fontSizePt,
    fontFamily: selectFontFamily(style, text, fontResolver),
    characterSpacingPt: style.spacing != null ? twipToPt(style.spacing) : Number(style.characterSpacingPt || 0),
    textScale,
    baselineShiftPt
  };
}

function selectFontFamily(style, text, fontResolver = defaultFontResolver) {
  if (style.fontFamily) return fontResolver(style.fontFamily);
  const fonts = style.fonts || {};
  const family = (style.rtl === true || isComplexScriptText(text))
    ? fonts.cs || fonts.primary || fonts.ascii || fonts.hAnsi || fonts.eastAsia || "serif"
    : isEastAsianText(text)
      ? fonts.eastAsia || fonts.primary || fonts.ascii || fonts.hAnsi || "serif"
      : fonts.ascii || fonts.hAnsi || fonts.primary || fonts.eastAsia || fonts.cs || "serif";
  return fontResolver(family);
}

function isComplexScriptText(text) {
  const cp = String(text || "").codePointAt(0);
  if (cp == null) return false;
  return (
    (cp >= 0x0590 && cp <= 0x08ff) ||
    (cp >= 0xfb1d && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isEastAsianText(text) {
  const cp = String(text || "").codePointAt(0);
  if (cp == null) return false;
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef)
  );
}


function measureTabInline(item, items, index, currentWidthPt, measurer, paragraphStyle, defaultTabStop, firstLineOffsetPt = 0) {
  const style = item.style || normalizeRunStyle(paragraphStyle.runProperties || {});
  if (item.numberingTab && firstLineOffsetPt < 0) {
    // Numbering labels are laid out in the hanging-indent area. Word's list
    // suffix tab advances from that hanging position to the normal paragraph
    // text start, rather than applying the paragraph tab stop a second time
    // relative to the already-indented first-line origin.
    const targetWidthPt = -firstLineOffsetPt;
    return createTabFragment(style, {
      positionPt: targetWidthPt,
      widthPt: Math.max(0, targetWidthPt - currentWidthPt),
      leader: null,
      alignment: "left"
    });
  }
  const tabStop = findNextTabStop(currentWidthPt, paragraphStyle.tabs, defaultTabStop);
  let followingWidthPt = 0;
  let widthBeforeDecimalPt = null;

  if (["right", "center", "decimal"].includes(tabStop.alignment)) {
    for (let i = index + 1; i < items.length; i++) {
      const next = items[i];
      if (next.type === "tab" || next.type === "break") break;
      const measured = measureInline(next, followingWidthPt, measurer, paragraphStyle, defaultTabStop);
      if (tabStop.alignment === "decimal" && widthBeforeDecimalPt == null && next.type === "char" && /[.,]/u.test(next.text || "")) {
        widthBeforeDecimalPt = followingWidthPt;
      }
      followingWidthPt += measured.widthPt || 0;
    }
  }

  let targetStartPt = tabStop.positionPt;
  if (tabStop.alignment === "right") targetStartPt -= followingWidthPt;
  else if (tabStop.alignment === "center") targetStartPt -= followingWidthPt / 2;
  else if (tabStop.alignment === "decimal") targetStartPt -= widthBeforeDecimalPt ?? followingWidthPt;

  return createTabFragment(style, {
    ...tabStop,
    widthPt: Math.max(0, targetStartPt - currentWidthPt)
  });
}

function createTabFragment(style, tab) {
  return {
    text: "\t",
    widthPt: tab.widthPt,
    glyphWidthPt: tab.widthPt,
    ascentPt: style.fontSizePt * 0.8,
    descentPt: style.fontSizePt * 0.2,
    lineHeightPt: style.fontSizePt,
    style,
    type: "tab",
    leader: tab.leader || null,
    tabAlignment: tab.alignment || "left"
  };
}

function resolveTabAdvance(currentWidthPt, tabs = [], defaultTabStop = null) {
  const tab = findNextTabStop(currentWidthPt, tabs, defaultTabStop);
  return { ...tab, widthPt: Math.max(0, tab.positionPt - currentWidthPt) };
}

function findNextTabStop(currentWidthPt, tabs = [], defaultTabStop = null) {
  const explicit = (tabs || [])
    .filter(tab => tab && tab.value !== "clear" && Number.isFinite(Number(tab.position)))
    .map(tab => ({ ...tab, positionPt: twipToPt(Number(tab.position)) }))
    .filter(tab => tab.positionPt > currentWidthPt + 0.01)
    .sort((a, b) => a.positionPt - b.positionPt)[0];

  if (explicit) {
    return {
      positionPt: explicit.positionPt,
      leader: explicit.leader || null,
      alignment: explicit.value || "left"
    };
  }

  const stopPt = defaultTabStop != null ? twipToPt(Number(defaultTabStop)) : 36;
  const safeStopPt = stopPt > 0 ? stopPt : 36;
  return {
    positionPt: (Math.floor(currentWidthPt / safeStopPt) + 1) * safeStopPt,
    leader: null,
    alignment: "left"
  };
}

function resolveEffectiveLineHeight(spacing, naturalHeightPt, documentGrid, line) {
  const mediaHeightPt = maxInlineMediaHeight(line);
  const spacingNaturalHeightPt = mediaHeightPt > 0
    ? resolveTextNaturalHeightForMediaLine(line)
    : naturalHeightPt;
  const base = mediaHeightPt > 0 && !["exact", "exactly"].includes(spacing?.lineRule || "auto")
    ? Math.max(mediaHeightPt, resolveLineHeight(spacing, spacingNaturalHeightPt))
    : resolveLineHeight(spacing, naturalHeightPt);
  if (!shouldSnapLineToGrid(spacing, documentGrid, line)) return base;
  const pitchPt = twipToPt(documentGrid.linePitch);
  if (!(pitchPt > 0)) return base;
  // Treat the section grid as the minimum baseline pitch. Explicit/natural
  // line spacing larger than the grid pitch is preserved rather than rounded
  // up to another full grid interval.
  return Math.max(base, pitchPt);
}

function maxInlineMediaHeight(line) {
  if (!line?.fragments?.length) return 0;
  return Math.max(0, ...line.fragments
    .filter(fragment => fragment.type === "media")
    .map(fragment => Number(fragment.heightPt || fragment.lineHeightPt || 0)));
}

function resolveTextNaturalHeightForMediaLine(line) {
  if (!line?.fragments?.length) return 1;
  let natural = 0;
  for (const fragment of line.fragments) {
    if (fragment.type === "media") {
      // Word does not multiply an inline drawing's physical extent by
      // automatic paragraph line spacing. Use the surrounding run size only
      // to establish the text-leading requirement, then let the media extent
      // act as the minimum line-box height.
      natural = Math.max(natural, Number(fragment.style?.fontSizePt || 0) * 1.2);
      continue;
    }
    natural = Math.max(
      natural,
      Number(fragment.lineHeightPt || 0),
      Number(fragment.ascentPt || 0) + Number(fragment.descentPt || 0),
      Number(fragment.style?.fontSizePt || 0)
    );
  }
  return Math.max(natural, 1);
}

function shouldSnapLineToGrid(spacing, documentGrid, line) {
  if (!documentGrid?.linePitch) return false;
  // OOXML docGrid@type defaults to "default", which means no document grid.
  // A line pitch is active only for grid modes that include a line grid.
  // Word treats snapToChars compatibly with linesAndChars.
  const gridType = documentGrid.type || "default";
  if (!["lines", "linesAndChars", "snapToChars"].includes(gridType)) return false;
  const rule = spacing?.lineRule || "auto";
  if (rule === "exact" || rule === "exactly") return false;
  if (!line?.fragments?.length) return true;
  const textFragments = line.fragments.filter(fragment => fragment.type === "text" || fragment.type === "tab");
  if (!textFragments.length) return true;
  return textFragments.some(fragment => fragment.style?.snapToGrid !== false);
}

function resolveLineHeight(spacing, naturalHeightPt) {
  const natural = Math.max(naturalHeightPt || 0, 1);
  if (spacing.line == null) return natural;
  const rule = spacing.lineRule || "auto";
  if (rule === "exact" || rule === "exactly") return twipToPt(spacing.line);
  if (rule === "atLeast") return Math.max(natural, twipToPt(spacing.line));
  return natural * (Number(spacing.line) / 240);
}

function resolveParagraphSpacing(spacing, lineUnitPt = 0) {
  const unit = Math.max(0, Number(lineUnitPt) || 0);
  return {
    beforePt: spacing.before != null
      ? twipToPt(spacing.before)
      : (spacing.beforeLines != null ? unit * Number(spacing.beforeLines) / 100 : 0),
    afterPt: spacing.after != null
      ? twipToPt(spacing.after)
      : (spacing.afterLines != null ? unit * Number(spacing.afterLines) / 100 : 0)
  };
}

function resolveIndentation(indentation, paragraphStyle = {}, measurer = null, fontResolver = defaultFontResolver) {
  const hasCharacterIndent = indentation.leftChars != null
    || indentation.rightChars != null
    || indentation.firstLineChars != null
    || indentation.hangingChars != null;
  let characterWidthPt = null;
  if (hasCharacterIndent) {
    const runStyle = normalizeRunStyle(paragraphStyle.runProperties || paragraphStyle || {}, "0", fontResolver);
    const measuredZero = measurer?.measure?.("0", runStyle);
    characterWidthPt = Number(measuredZero?.widthPt || runStyle.fontSizePt * 0.52 || 4.5);
  }
  const charUnitsToPt = value => Math.max(0, Number(value || 0)) / 100 * Number(characterWidthPt || 0);

  // OOXML character-based indentation is expressed in hundredths of a
  // character. Prefer explicit twip geometry when the DOCX carries both forms:
  // Word commonly writes both, and the twip value is the stable physical result.
  // Character units are therefore a bounded fallback for documents that omit
  // the physical value. This avoids a font-metric feedback loop while still
  // supporting character-only documents.
  const leftPt = indentation.left != null
    ? twipToPt(indentation.left)
    : (indentation.leftChars != null ? charUnitsToPt(indentation.leftChars) : 0);
  const rightPt = indentation.right != null
    ? twipToPt(indentation.right)
    : (indentation.rightChars != null ? charUnitsToPt(indentation.rightChars) : 0);

  let firstLineOffsetPt = 0;
  if (indentation.firstLine != null) firstLineOffsetPt = twipToPt(indentation.firstLine);
  else if (indentation.hanging != null) firstLineOffsetPt = -twipToPt(indentation.hanging);
  else if (indentation.firstLineChars != null) firstLineOffsetPt = charUnitsToPt(indentation.firstLineChars);
  else if (indentation.hangingChars != null) firstLineOffsetPt = -charUnitsToPt(indentation.hangingChars);

  return { leftPt, rightPt, firstLineOffsetPt, characterWidthPt };
}


function resolveJustification(line, availableWidthPt, alignment, isLastLine) {
  if (!['both', 'justify', 'distribute'].includes(alignment) || isLastLine) return null;
  const extraPt = Math.max(0, availableWidthPt - line.widthPt);
  if (extraPt <= 0.01) return null;
  const wordGaps = (line.text.match(/\s+/gu) || []).length;
  if (wordGaps > 0) return { mode: 'word', extraPt, perGapPt: extraPt / wordGaps, gaps: wordGaps };
  const glyphs = Array.from(line.text || '').length;
  if (glyphs > 1) return { mode: 'character', extraPt, perGapPt: extraPt / (glyphs - 1), gaps: glyphs - 1 };
  return null;
}
function resolveAlignedX(baseX, availableWidthPt, lineWidthPt, alignment) {
  if (alignment === "center") return baseX + Math.max(0, (availableWidthPt - lineWidthPt) / 2);
  if (alignment === "right" || alignment === "end") return baseX + Math.max(0, availableWidthPt - lineWidthPt);
  return baseX;
}

function defaultNaturalHeight(paragraphStyle) {
  const run = normalizeRunStyle(paragraphStyle.runProperties || paragraphStyle || {});
  return run.fontSizePt * 1.2;
}



function sameVisualStyle(a = {}, b = {}) {
  return a.fontSizePt === b.fontSizePt
    && a.fontFamily === b.fontFamily
    && !!a.bold === !!b.bold
    && !!a.italic === !!b.italic
    && !!a.strike === !!b.strike
    && !!a.doubleStrike === !!b.doubleStrike
    && a.emphasis === b.emphasis
    && !!a.rtl === !!b.rtl
    && a.resolvedColor === b.resolvedColor
    && a.underline === b.underline
    && a.resolvedUnderlineColor === b.resolvedUnderlineColor
    && a.highlight === b.highlight
    && (a.border?.value || null) === (b.border?.value || null)
    && Number(a.border?.size || 0) === Number(b.border?.size || 0)
    && Number(a.border?.space || 0) === Number(b.border?.space || 0)
    && (a.border?.resolvedColor || a.border?.color || null) === (b.border?.resolvedColor || b.border?.color || null)
    && Number(a.characterSpacingPt || 0) === Number(b.characterSpacingPt || 0)
    && (a.shading?.value || null) === (b.shading?.value || null)
    && (a.shading?.resolvedFill || a.shading?.fill || null) === (b.shading?.resolvedFill || b.shading?.fill || null)
    && a.textScale === b.textScale
    && a.baselineShiftPt === b.baselineShiftPt;
}

function measureMathAst(ast, measurer, style) {
  const fontSizePt = style.fontSizePt || 9;
  if (!ast) return { widthPt: fontSizePt, heightPt: fontSizePt * 1.4, ascentPt: fontSizePt, descentPt: fontSizePt * 0.4 };
  if (ast.type === "text") {
    const m = measurer.measure(ast.value || "", style);
    return { widthPt: m.widthPt, heightPt: Math.max(fontSizePt, (m.ascentPt || 0) + (m.descentPt || 0)), ascentPt: m.ascentPt || fontSizePt * 0.8, descentPt: m.descentPt || fontSizePt * 0.2 };
  }
  if (ast.type === "fraction") {
    const num = measureMathAst(ast.numerator, measurer, { ...style, fontSizePt: fontSizePt * 0.9 });
    const den = measureMathAst(ast.denominator, measurer, { ...style, fontSizePt: fontSizePt * 0.9 });
    const gap = fontSizePt * 0.25;
    const widthPt = Math.max(num.widthPt, den.widthPt) + fontSizePt * 0.4;
    const heightPt = num.heightPt + den.heightPt + gap;
    return { widthPt, heightPt, ascentPt: num.heightPt + gap * 0.6, descentPt: den.heightPt + gap * 0.4 };
  }
  if (ast.type === "radical") {
    const body = measureMathAst(ast.body, measurer, style);
    return { widthPt: body.widthPt + fontSizePt * 0.8, heightPt: body.heightPt + fontSizePt * 0.15, ascentPt: body.ascentPt + fontSizePt * 0.15, descentPt: body.descentPt };
  }
  if (ast.type === "superscript") {
    const base = measureMathAst(ast.base, measurer, style);
    const sup = measureMathAst(ast.superscript, measurer, { ...style, fontSizePt: fontSizePt * 0.7 });
    return { widthPt: base.widthPt + sup.widthPt, heightPt: Math.max(base.heightPt, base.ascentPt + sup.heightPt), ascentPt: Math.max(base.ascentPt, base.ascentPt + sup.heightPt * 0.8), descentPt: base.descentPt };
  }
  if (ast.type === "subscript") {
    const base = measureMathAst(ast.base, measurer, style);
    const sub = measureMathAst(ast.subscript, measurer, { ...style, fontSizePt: fontSizePt * 0.7 });
    return { widthPt: base.widthPt + sub.widthPt, heightPt: Math.max(base.heightPt, base.descentPt + sub.heightPt + base.ascentPt), ascentPt: base.ascentPt, descentPt: Math.max(base.descentPt, base.descentPt + sub.heightPt * 0.8) };
  }
  const parts = (ast.children || []).map(child => measureMathAst(child, measurer, style));
  const widthPt = parts.reduce((sum, part) => sum + part.widthPt, 0);
  const ascentPt = Math.max(fontSizePt * 0.8, ...parts.map(part => part.ascentPt || 0));
  const descentPt = Math.max(fontSizePt * 0.2, ...parts.map(part => part.descentPt || 0));
  return { widthPt, heightPt: ascentPt + descentPt, ascentPt, descentPt };
}

function normalizeTextScale(value) {
  if (value == null || value === "") return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return numeric > 10 ? numeric / 100 : numeric;
}

function resolveBaselineShift(style = {}, fontSizePt = 9) {
  if (style.position != null) return halfPointToPt(Number(style.position));
  if (style.verticalAlign === "superscript") return fontSizePt * 0.35;
  if (style.verticalAlign === "subscript") return -fontSizePt * 0.2;
  return 0;
}

function applyEastAsianAutoSpacing(items, paragraphStyle = {}) {
  const autoLatin = paragraphStyle.autoSpaceDE !== false;
  const autoNumeric = paragraphStyle.autoSpaceDN !== false;
  let previous = null;
  return items.map(item => {
    if (item.type !== "char") {
      if (item.type !== "break" && item.type !== "tab") previous = null;
      return item;
    }
    const currentClass = classifyAutoSpaceCharacter(item.text);
    let autoSpacingBeforePt = 0;
    if (previous) {
      const prevClass = classifyAutoSpaceCharacter(previous.text);
      const cjkLatin = (prevClass === "cjk" && currentClass === "latin") || (prevClass === "latin" && currentClass === "cjk");
      const cjkNumeric = (prevClass === "cjk" && currentClass === "numeric") || (prevClass === "numeric" && currentClass === "cjk");
      if ((cjkLatin && autoLatin) || (cjkNumeric && autoNumeric)) {
        const size = Math.max(previous.style?.fontSizePt || 0, item.style?.fontSizePt || 0, 9);
        autoSpacingBeforePt = size * 0.25;
      }
    }
    previous = item;
    return autoSpacingBeforePt ? { ...item, autoSpacingBeforePt } : item;
  });
}

function classifyAutoSpaceCharacter(text) {
  if (!text) return "other";
  if (/^[0-9]$/u.test(text)) return "numeric";
  if (/^[A-Za-z]$/u.test(text)) return "latin";
  return isEastAsianText(text) ? "cjk" : "other";
}

function emuToPtSafe(value) {
  if (value == null) return null;
  return Number(value) / 12700;
}

function parseVmlSize(styleText, key) {
  if (!styleText) return null;
  const re = new RegExp(`(?:^|;)\\s*${key}\\s*:\s*(-?[\\d.]+)pt`, "i");
  const match = re.exec(String(styleText));
  return match ? Number(match[1]) : null;
}

function cloneParagraphFragment(block, lines, { before, after, fragment }) {
  const insets = block.borderInsetsPt || { top: 0, right: 0, bottom: 0, left: 0 };
  const topInset = fragment === "end" ? 0 : Number(insets.top || 0);
  const bottomInset = fragment === "start" ? 0 : Number(insets.bottom || 0);
  let cursorY = block.y + before + topInset;
  const clonedLines = lines.map(line => {
    const cloned = { ...line, y: cursorY, fragments: (line.fragments || []).map(f => ({ ...f })) };
    cursorY += line.heightPt;
    return cloned;
  });
  const linesHeight = clonedLines.reduce((sum, line) => sum + line.heightPt, 0);
  return {
    ...block,
    lines: clonedLines,
    spacingBeforePt: before,
    spacingAfterPt: after,
    heightPt: before + topInset + linesHeight + bottomInset + after,
    fragment
  };
}

function detachLastTextCharacter(line, measurer) {
  const last = line.fragments?.[line.fragments.length - 1];
  if (!last || last.type !== "text" || !last.text) return null;
  const chars = Array.from(last.text);
  const text = chars.pop();
  const measured = measurer.measure(text, last.style || {});
  const carried = {
    ...last,
    text,
    widthPt: measured.widthPt,
    glyphWidthPt: measured.widthPt,
    autoSpacingBeforePt: 0,
    ascentPt: measured.ascentPt || last.ascentPt || 0,
    descentPt: measured.descentPt || last.descentPt || 0,
    lineHeightPt: measured.lineHeightPt || last.lineHeightPt || 0
  };
  if (!chars.length) line.fragments.pop();
  else {
    const remaining = chars.join("");
    const rest = measurer.measure(remaining, last.style || {});
    last.text = remaining;
    last.widthPt = rest.widthPt + Number(last.autoSpacingBeforePt || 0);
    last.glyphWidthPt = rest.widthPt;
    last.ascentPt = rest.ascentPt || last.ascentPt || 0;
    last.descentPt = rest.descentPt || last.descentPt || 0;
    last.lineHeightPt = rest.lineHeightPt || last.lineHeightPt || 0;
  }
  recalculateLine(line);
  return carried;
}
