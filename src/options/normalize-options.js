export function normalizeOptions(input = {}) {
  const user = input || {};
  const simple = {};

  applyRevisionShorthand(simple, user.revisions);
  applyChangesPanelShorthand(simple, user.changesPanel);
  applyFontsShorthand(simple, user.fonts);

  const advanced = user.advanced || {};
  const resolved = {
    ...user,
    ...simple,
    parser: merge(simple.parser, advanced.parser, user.parser),
    layout: merge(simple.layout, advanced.layout, user.layout),
    renderer: merge(simple.renderer, advanced.renderer, user.renderer),
    changes: mergeChanges(simple.changes, advanced.changes, user.changes)
  };

  delete resolved.revisions;
  delete resolved.changesPanel;
  delete resolved.fonts;
  delete resolved.advanced;
  return resolved;
}

function applyRevisionShorthand(out, value) {
  if (value == null || value === false) return;
  if (value === true) {
    out.parser = { revisionMode: 'markup' };
    out.changes = { style: 'review', indicators: true };
    return;
  }
  if (typeof value !== 'object') return;
  const mode = value.mode === 'final' ? 'final' : 'markup';
  out.parser = { revisionMode: mode };
  out.changes = {};
  if (value.style !== undefined) out.changes.style = value.style;
  else if (mode === 'markup') out.changes.style = 'review';
  if (mode === 'markup') out.changes.indicators = value.indicators !== false ? (value.indicators ?? true) : false;
  if (value.ui !== undefined) out.changes.ui = value.ui;
}

function applyChangesPanelShorthand(out, value) {
  if (value == null || value === false || value === true) return;
  const ui = isDomLike(value) || typeof value === 'string'
    ? { target: value }
    : { ...(value || {}) };
  out.changes = mergeChanges(out.changes, { ui });
}

function applyFontsShorthand(out, value) {
  if (value == null || value === true) return;
  if (value === false) {
    out.loadEmbeddedFonts = false;
    out.waitForFonts = false;
    return;
  }
  if (typeof value !== 'object') return;
  if (value.embedded !== undefined) out.loadEmbeddedFonts = value.embedded !== false;
  if (value.waitUntilReady !== undefined) out.waitForFonts = value.waitUntilReady !== false;
}

function merge(...values) {
  const present = values.filter(v => v && typeof v === 'object');
  return present.length ? Object.assign({}, ...present) : undefined;
}

function mergeChanges(...values) {
  const present = values.filter(v => v && typeof v === 'object');
  if (!present.length) return undefined;
  const merged = Object.assign({}, ...present);
  const uiParts = present.map(v => v.ui).filter(v => v && typeof v === 'object');
  if (uiParts.length) merged.ui = Object.assign({}, ...uiParts);
  return merged;
}

function isDomLike(value) {
  return Boolean(value && typeof value === 'object' && (
    typeof value.appendChild === 'function' ||
    typeof value.replaceChildren === 'function' ||
    value.nodeType != null
  ));
}
