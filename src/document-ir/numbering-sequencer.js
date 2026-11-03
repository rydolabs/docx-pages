import { formatNumber } from "../common/number-format.js";
/**
 * Resolve stateful list labels after semantic styles are resolved but before
 * layout. The sequencer knows numbering semantics only; it does not measure or
 * render text.
 */
export function applyNumberingLabels(document) {
  const bodySequencer = createNumberingSequencer();
  return {
    ...document,
    sections: (document.sections || []).map(section => ({
      ...section,
      children: (section.children || []).map(node => mapNode(node, bodySequencer))
    })),
    headers: mapStories(document.headers),
    footers: mapStories(document.footers),
    footnotes: mapFootnoteStory(document.footnotes),
    endnotes: mapFootnoteStory(document.endnotes)
  };
}

function mapStories(parts = {}) {
  return Object.fromEntries(Object.entries(parts).map(([id, part]) => {
    const sequencer = createNumberingSequencer();
    return [id, { ...part, content: (part.content || []).map(node => mapNode(node, sequencer)) }];
  }));
}

function mapFootnoteStory(parts = {}) {
  const sequencer = createNumberingSequencer();
  const entries = Object.entries(parts).sort(([a], [b]) => Number(a) - Number(b));
  return Object.fromEntries(entries.map(([id, part]) => [id, {
    ...part,
    content: (part.content || []).map(node => mapNode(node, sequencer))
  }]));
}

export function createNumberingSequencer() {
  const states = new Map();

  return {
    next(numbering) {
      if (!numbering?.numId && numbering?.numId !== 0) return null;
      const levelIndex = Math.max(0, Number(numbering.level || 0));
      const levels = numbering.levels || { [levelIndex]: numbering };
      const state = states.get(numbering.numId) || [];

      for (let i = 0; i <= levelIndex; i++) {
        const level = levels[i] || (i === levelIndex ? numbering : null);
        if (state[i] == null) state[i] = Number(level?.start ?? 1);
      }
      if (state[levelIndex] == null) state[levelIndex] = Number(numbering.start ?? 1);
      else if (state._seen?.[levelIndex]) state[levelIndex] += 1;

      state._seen ||= {};
      for (let i = levelIndex + 1; i < state.length; i++) {
        state[i] = null;
        state._seen[i] = false;
      }
      state._seen[levelIndex] = true;
      states.set(numbering.numId, state);

      const pattern = numbering.text || `%${levelIndex + 1}.`;
      let text = pattern.replace(/%([1-9])/g, (_, oneBased) => {
        const index = Number(oneBased) - 1;
        const level = levels[index] || (index === levelIndex ? numbering : null);
        const value = state[index] ?? Number(level?.start ?? 1);
        return formatNumber(value, level?.format || 'decimal');
      });

      const normalizedBullet = normalizeLegacyBullet(text, numbering.runProperties || {});
      text = normalizedBullet.text;
      return {
        text,
        suffix: normalizeSuffix(numbering.suffix),
        level: levelIndex,
        numId: numbering.numId,
        justification: numbering.justification || 'left',
        style: normalizedBullet.style
      };
    }
  };
}

function mapNode(node, sequencer) {
  if (!node) return node;
  if (node.type === 'paragraph') {
    return {
      ...node,
      numberingLabel: sequencer.next(node.numbering),
      children: (node.children || []).map(child => mapNode(child, sequencer))
    };
  }
  if (node.type === 'table') {
    return {
      ...node,
      rows: (node.rows || []).map(row => ({
        ...row,
        cells: (row.cells || []).map(cell => ({
          ...cell,
          children: (cell.children || []).map(child => mapNode(child, sequencer))
        }))
      }))
    };
  }
  if (node.children) return { ...node, children: node.children.map(child => mapNode(child, sequencer)) };
  return node;
}

function normalizeSuffix(value) {
  if (value === 'space') return 'space';
  if (value === 'nothing') return 'nothing';
  return 'tab';
}


/**
 * Older Word list definitions commonly store Symbol/Wingdings bullets as
 * private-use code points. Browsers without those legacy fonts render tofu.
 * Normalize a small, deterministic set of common bullet glyphs to their
 * Unicode equivalents so layout remains portable while preserving other
 * numbering text unchanged.
 */
function normalizeLegacyBullet(text, style = {}) {
  const fonts = style.fonts || {};
  const family = String(fonts.ascii || fonts.hAnsi || fonts.cs || style.fontFamily || '').toLowerCase();
  const symbolMap = {
    '\uf0b7': '•'
  };
  const wingdingsMap = {
    '\uf06c': '●',
    '\uf075': '◆',
    '\uf06e': '■',
    '\uf0e8': '➔',
    '\uf0d8': '➢',
    '\uf0fb': '✖',
    '\uf0fc': '✔'
  };
  const map = family.includes('wingdings') ? wingdingsMap : (family === 'symbol' || family.includes('symbol') ? symbolMap : null);
  if (!map) return { text, style };
  const normalized = Array.from(String(text || '')).map(ch => map[ch] || ch).join('');
  if (normalized === text) return { text, style };
  return {
    text: normalized,
    // Keep the legacy source family as a semantic hint. The font resolver adds
    // portable symbol-capable fallbacks for Symbol/Wingdings/OpenSymbol after
    // normalization, so browsers without those fonts still render the intended
    // glyph instead of falling back through a generic text serif.
    style
  };
}
