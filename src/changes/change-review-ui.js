const DEFAULT_LABELS = {
  title: '변경사항',
  previous: '이전 변경',
  next: '다음 변경',
  all: '전체',
  insert: '추가',
  delete: '삭제',
  move: '이동',
  moveFrom: '이동 전',
  moveTo: '이동 후',
  page: '페이지',
  empty: '변경사항이 없습니다.'
};

const DEFAULT_STYLE = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "NanumGothic", sans-serif',
  fontSize: '14px',
  color: '#1f1f1f',
  background: '#ffffff',
  borderColor: '#dedede',
  mutedColor: '#6b6b6b',
  activeBackground: '#f2f5f8',
  insertColor: '#3b6d11',
  deleteColor: '#a32d2d',
  moveColor: '#7a5b00'
};

export function createChangeReviewUI(target, changeIndex, navigator, options = {}) {
  if (!target) return null;
  const doc = target.ownerDocument || globalThis.document;
  if (!doc?.createElement) return null;
  const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
  const theme = resolveTheme(options.style);
  let filter = normalizeFilter(options.filter || 'all');
  let selectedId = null;

  const root = doc.createElement('section');
  root.className = 'docx-change-review';
  root.dataset.changeReview = 'true';
  if (theme) applyRootStyle(root, theme);

  const header = doc.createElement('div');
  header.className = 'docx-change-review__header';
  const heading = doc.createElement('strong');
  heading.className = 'docx-change-review__title';
  const total = changeIndex?.counts?.total || 0;
  heading.textContent = `${labels.title} ${total}`;
  header.appendChild(heading);
  root.appendChild(header);

  const summary = doc.createElement('div');
  summary.className = 'docx-change-review__summary';
  summary.textContent = summaryText(changeIndex?.counts, labels);
  root.appendChild(summary);

  const filters = doc.createElement('div');
  filters.className = 'docx-change-review__filters';
  const filterDefs = [
    ['all', labels.all],
    ['insert', `${labels.insert} ${changeIndex?.counts?.insert || 0}`],
    ['delete', `${labels.delete} ${changeIndex?.counts?.delete || 0}`],
    ['move', `${labels.move} ${(changeIndex?.counts?.moveFrom || 0) + (changeIndex?.counts?.moveTo || 0)}`]
  ];
  const filterButtons = new Map();
  for (const [value, label] of filterDefs) {
    const button = makeButton(doc, label, 'docx-change-review__filter');
    button.dataset.changeFilter = value;
    button.addEventListener?.('click', () => setFilter(value));
    filters.appendChild(button);
    filterButtons.set(value, button);
  }
  root.appendChild(filters);

  const list = doc.createElement('div');
  list.className = 'docx-change-review__list';
  root.appendChild(list);

  const controls = doc.createElement('div');
  controls.className = 'docx-change-review__controls';
  const previous = makeNavButton(doc, labels.previous, 'previous', 'docx-change-review__previous');
  const next = makeNavButton(doc, labels.next, 'next', 'docx-change-review__next');
  previous.addEventListener?.('click', () => selectNavigation(navigator?.previous?.(options.navigation)));
  next.addEventListener?.('click', () => selectNavigation(navigator?.next?.(options.navigation)));
  controls.appendChild(previous);
  controls.appendChild(next);
  root.appendChild(controls);

  target.replaceChildren?.(root);
  if (!target.replaceChildren) {
    while (target.firstChild) target.removeChild(target.firstChild);
    target.appendChild(root);
  }

  renderList();

  const api = {
    root,
    get filter() { return filter; },
    get selectedId() { return selectedId; },
    setFilter,
    select(id, navigationOptions = options.navigation) {
      const item = navigator?.goTo?.(id, navigationOptions) || (changeIndex?.items || []).find(entry => entry.id === id) || null;
      selectNavigation(item);
      return item;
    },
    next(navigationOptions = options.navigation) {
      const item = navigator?.next?.(navigationOptions) || null;
      selectNavigation(item);
      return item;
    },
    previous(navigationOptions = options.navigation) {
      const item = navigator?.previous?.(navigationOptions) || null;
      selectNavigation(item);
      return item;
    },
    destroy() {
      target.replaceChildren?.();
      if (!target.replaceChildren) {
        while (target.firstChild) target.removeChild(target.firstChild);
      }
    }
  };
  return api;

  function setFilter(value) {
    filter = normalizeFilter(value);
    renderList();
    return filter;
  }

  function renderList() {
    list.replaceChildren?.();
    if (!list.replaceChildren) list.children = [];
    for (const [value, button] of filterButtons) {
      button.dataset.active = value === filter ? 'true' : 'false';
      if (theme) applyFilterButtonStyle(button, theme, value === filter);
    }
    const items = (changeIndex?.items || []).filter(item => matchesFilter(item, filter));
    if (!items.length) {
      const empty = doc.createElement('div');
      empty.className = 'docx-change-review__empty';
      empty.textContent = labels.empty;
      list.appendChild(empty);
      return;
    }
    for (const item of items) {
      const row = doc.createElement('button');
      row.className = 'docx-change-review__item';
      row.dataset.changeId = item.id;
      row.dataset.changeKind = item.kind;
      row.type = 'button';
      row.addEventListener?.('click', () => api.select(item.id));
      if (theme) applyItemStyle(row, theme, item, selectedId === item.id);

      const top = doc.createElement('div');
      top.className = 'docx-change-review__item-top';
      const kind = doc.createElement('strong');
      kind.className = 'docx-change-review__kind';
      kind.textContent = kindLabel(item.kind, labels);
      const page = doc.createElement('span');
      page.className = 'docx-change-review__page';
      page.textContent = item.pageNumber ? `${labels.page} ${item.pageNumber}` : '';
      top.appendChild(kind);
      top.appendChild(page);
      row.appendChild(top);

      const text = doc.createElement('div');
      text.className = 'docx-change-review__text';
      text.textContent = item.text || '';
      row.appendChild(text);

      if (item.author || item.date) {
        const meta = doc.createElement('div');
        meta.className = 'docx-change-review__meta';
        meta.textContent = [item.author, item.date].filter(Boolean).join(' · ');
        row.appendChild(meta);
      }
      list.appendChild(row);
    }
  }

  function selectNavigation(item) {
    if (!item) return null;
    selectedId = item.id;
    renderList();
    return item;
  }
}


function makeNavButton(doc, label, direction, className) {
  const button = makeButton(doc, '', className);
  button.dataset.direction = direction;

  const icon = doc.createElement('span');
  icon.className = 'docx-change-review__nav-icon';
  icon.dataset.direction = direction;
  icon.setAttribute?.('aria-hidden', 'true');
  Object.assign(icon.style, {
    display: 'inline-block',
    width: '0.48em',
    height: '0.48em',
    borderLeft: '1.6px solid currentColor',
    borderBottom: '1.6px solid currentColor',
    transform: direction === 'previous' ? 'rotate(45deg)' : 'rotate(225deg)',
    flex: 'none'
  });

  const text = doc.createElement('span');
  text.className = 'docx-change-review__nav-label';
  text.textContent = label;

  button.appendChild(icon);
  button.appendChild(text);
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4em'
  });
  return button;
}

function makeButton(doc, text, className) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function normalizeFilter(value) {
  return ['all', 'insert', 'delete', 'move'].includes(value) ? value : 'all';
}

function matchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'insert') return item.kind === 'ins';
  if (filter === 'delete') return item.kind === 'del';
  if (filter === 'move') return item.kind === 'moveFrom' || item.kind === 'moveTo';
  return true;
}

function kindLabel(kind, labels) {
  if (kind === 'ins') return labels.insert;
  if (kind === 'del') return labels.delete;
  if (kind === 'moveFrom') return labels.moveFrom;
  if (kind === 'moveTo') return labels.moveTo;
  return kind || labels.title;
}

function summaryText(counts = {}, labels) {
  return `${labels.insert} ${counts.insert || 0} · ${labels.delete} ${counts.delete || 0} · ${labels.move} ${(counts.moveFrom || 0) + (counts.moveTo || 0)}`;
}

function resolveTheme(style) {
  if (style === 'none' || style === false) return null;
  if (!style || style === 'default') return { ...DEFAULT_STYLE };
  if (typeof style === 'object') return { ...DEFAULT_STYLE, ...style };
  return { ...DEFAULT_STYLE };
}

function applyRootStyle(root, theme) {
  Object.assign(root.style, {
    fontFamily: theme.fontFamily,
    fontSize: theme.fontSize,
    color: theme.color,
    background: theme.background,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  });
}

function applyFilterButtonStyle(button, theme, active) {
  Object.assign(button.style, {
    border: `1px solid ${theme.borderColor}`,
    borderRadius: '999px',
    padding: '5px 9px',
    background: active ? theme.activeBackground : 'transparent',
    color: theme.color,
    cursor: 'pointer'
  });
}

function applyItemStyle(row, theme, item, selected) {
  const accent = item.kind === 'ins' ? theme.insertColor : item.kind === 'del' ? theme.deleteColor : theme.moveColor;
  Object.assign(row.style, {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: `1px solid ${selected ? accent : theme.borderColor}`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: '7px',
    padding: '8px 9px',
    margin: '0 0 6px',
    background: selected ? theme.activeBackground : theme.background,
    color: theme.color,
    cursor: 'pointer'
  });
}
