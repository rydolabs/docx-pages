export function createChangeNavigator(target, changeIndex = { items: [] }) {
  const items = changeIndex.items || [];
  let currentIndex = -1;

  const api = {
    get count() { return items.length; },
    get currentIndex() { return currentIndex; },
    get current() { return currentIndex >= 0 ? items[currentIndex] : null; },
    goTo(indexOrId, options = {}) {
      if (!items.length) return null;
      const index = typeof indexOrId === 'number'
        ? clampIndex(indexOrId, items.length)
        : items.findIndex(item => item.id === String(indexOrId));
      if (index < 0) return null;
      currentIndex = index;
      const item = items[index];
      focusChange(target, item.id, options);
      return item;
    },
    next(options = {}) {
      if (!items.length) return null;
      return api.goTo(currentIndex < 0 ? 0 : (currentIndex + 1) % items.length, options);
    },
    previous(options = {}) {
      if (!items.length) return null;
      return api.goTo(currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length, options);
    }
  };
  return api;
}

function focusChange(target, id, options) {
  const elements = findChangeElements(target, id);
  const first = elements[0];
  if (!first) return;
  if (options.markCurrent !== false) markCurrent(target, id);
  if (options.scroll !== false && typeof first.scrollIntoView === 'function') {
    first.scrollIntoView({ block: options.block || 'center', inline: options.inline || 'nearest', behavior: options.behavior || 'auto' });
  }
  if (options.focus === true && typeof first.focus === 'function') first.focus({ preventScroll: true });
}

function findChangeElements(target, id) {
  if (!target) return [];
  if (typeof target.querySelectorAll === 'function') {
    return [...target.querySelectorAll(`[data-change-id="${cssEscape(id)}"]`)];
  }
  const out = [];
  walk(target, node => {
    if (node?.dataset?.changeId === id) out.push(node);
  });
  return out;
}

function markCurrent(target, id) {
  if (typeof target?.querySelectorAll === 'function') {
    for (const element of target.querySelectorAll('[data-change-current="true"]')) delete element.dataset.changeCurrent;
    for (const element of target.querySelectorAll(`[data-change-id="${cssEscape(id)}"]`)) element.dataset.changeCurrent = 'true';
    return;
  }
  walk(target, node => {
    if (!node?.dataset) return;
    if (node.dataset.changeCurrent === 'true') delete node.dataset.changeCurrent;
    if (node.dataset.changeId === id) node.dataset.changeCurrent = 'true';
  });
}

function walk(node, visit) {
  visit(node);
  for (const child of node?.children || []) walk(child, visit);
}

function clampIndex(index, length) {
  const numeric = Number(index);
  if (!Number.isFinite(numeric)) return -1;
  const normalized = Math.trunc(numeric);
  return normalized >= 0 && normalized < length ? normalized : -1;
}

function cssEscape(value) {
  return String(value).replace(/(["\\])/g, '\\$1');
}
