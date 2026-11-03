/**
 * Bounded Word-oriented line-breaking policy.
 *
 * This module intentionally does not implement the full Unicode Line Breaking
 * Algorithm or a complete Word compatibility engine. It owns only the small,
 * testable decisions needed by the layout primitive so the policy can evolve
 * independently without turning text-layout into a collection of Word quirks.
 */
export function createLineBreaker({
  noLineBreaksBefore = "",
  noLineBreaksAfter = "",
  noLineBreaksBeforeLanguage = null,
  noLineBreaksAfterLanguage = null
} = {}) {
  const prohibitedBefore = toCharacterSet(noLineBreaksBefore);
  const prohibitedAfter = toCharacterSet(noLineBreaksAfter);

  return Object.freeze({
    /** Ordinary soft break opportunities already supported by the viewer. */
    isSoftBreakOpportunity(text, style = null) {
      if (!text) return false;
      if (languageMatches(style, noLineBreaksAfterLanguage) && prohibitedAfter.has(lastCharacter(text))) return false;
      return /^\s$/u.test(text) || /[-‐–—/\u00AD]$/u.test(text);
    },

    /**
     * Narrow Word/CJK rule: if the final visible character in a paragraph is
     * forbidden at line start, carry the previous character with it rather
     * than leaving the punctuation on a line by itself.
     *
     * This deliberately does not attempt general kinsoku processing yet.
     */
    shouldCarryPreviousAtParagraphEnd(nextText, items, index, style = null) {
      if (!languageMatches(style, noLineBreaksBeforeLanguage)) return false;
      if (!nextText || !prohibitedBefore.has(firstCharacter(nextText))) return false;
      return hasOnlyIgnorableTail(items, index + 1);
    },

    isProhibitedAtLineStart(text, style = null) {
      return languageMatches(style, noLineBreaksBeforeLanguage) && prohibitedBefore.has(firstCharacter(text));
    },

    isProhibitedAtLineEnd(text, style = null) {
      return languageMatches(style, noLineBreaksAfterLanguage) && prohibitedAfter.has(lastCharacter(text));
    },

    /** Prefer a recorded soft boundary over dividing a Latin-like word. */
    prefersSoftBreak({ lineText = "", nextText = "" } = {}) {
      const previous = lastCharacter(lineText);
      const next = firstCharacter(nextText);
      // A hyphen joining letters/digits belongs to the preceding token.
      // When it alone would overflow, carry the whole token to the next
      // line at an earlier soft boundary, rather than starting a line '-'.
      return isSpaceDelimitedWordCharacter(previous)
        && (isSpaceDelimitedWordCharacter(next) || next === "-");
    },

    /**
     * Word's w:wordWrap=false permits character-level breaks. When true or
     * omitted, Latin-like words stay intact; CJK remains character-breakable.
     */
    allowsCharacterBreak({ wordWrap = null, lineText = "", nextText = "" } = {}) {
      // OOXML/Word default keeps a space-delimited word intact. Only an
      // explicit false opts into character-level breaking for Latin-like words.
      if (wordWrap === false) return true;
      const previous = lastCharacter(lineText);
      const next = firstCharacter(nextText);
      if (!previous || !next) return true;
      if (isCjkCharacter(previous) || isCjkCharacter(next)) return true;
      if (isSpaceDelimitedWordCharacter(previous) && isSpaceDelimitedWordCharacter(next)) return false;
      return true;
    }
  });
}

export const defaultLineBreaker = createLineBreaker();

function toCharacterSet(value) {
  return new Set(Array.from(String(value || "")));
}

function firstCharacter(value) {
  return Array.from(String(value || ""))[0] || "";
}

function lastCharacter(value) {
  const chars = Array.from(String(value || ""));
  return chars.at(-1) || "";
}

function hasOnlyIgnorableTail(items, startIndex) {
  for (let i = startIndex; i < (items || []).length; i++) {
    const next = items[i];
    if (next?.type === "break") return true;
    if (next?.type === "char" && /^\s$/u.test(next.text || "")) continue;
    return false;
  }
  return true;
}

function isSpaceDelimitedWordCharacter(ch) {
  return /^[\p{L}\p{N}_]$/u.test(ch) && !isCjkCharacter(ch);
}

function isCjkCharacter(ch) {
  const cp = String(ch || "").codePointAt(0);
  if (cp == null) return false;
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  );
}

function languageMatches(style, requiredLanguage) {
  if (!requiredLanguage) return true;
  const actual = style?.languages?.eastAsia || style?.language?.eastAsia || style?.language || null;
  // Auto-detection is outside our current scope. Preserve compatibility when
  // the run has no explicit language, but do not apply a Korean/Japanese rule
  // to text explicitly tagged as another language.
  if (!actual) return true;
  return String(actual).toLowerCase() === String(requiredLanguage).toLowerCase();
}
