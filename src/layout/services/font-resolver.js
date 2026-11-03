const DEFAULT_FALLBACKS = new Map([
  ["batang", ["UnBatang", "Noto Serif CJK KR", "serif"]],
  ["바탕", ["UnBatang", "Noto Serif CJK KR", "serif"]],
  ["batangche", ["UnBatang", "Noto Serif CJK KR", "serif"]],
  ["바탕체", ["UnBatang", "Noto Serif CJK KR", "serif"]],
  ["dotum", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["돋움", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["dotumche", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["돋움체", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["gulim", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["굴림", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["malgun gothic", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["맑은 고딕", ["UnDotum", "Noto Sans CJK KR", "sans-serif"]],
  ["cambria math", ["STIX Math", "Noto Sans Math", "DejaVu Math TeX Gyre", "serif"]],
  ["symbol", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]],
  ["wingdings", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]],
  ["wingdings 2", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]],
  ["wingdings 3", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]],
  ["webdings", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]],
  ["opensymbol", ["Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "sans-serif"]]
]);

export function createFontResolver({ fontMap = {} } = {}) {
  const normalizedMap = new Map(
    Object.entries(fontMap || {}).map(([name, fallback]) => [normalizeName(name), normalizeFallbackList(fallback)])
  );

  return function resolveFontFamily(family) {
    const source = String(family || "").trim();
    if (!source) return "serif";
    const key = normalizeName(source);
    const configured = normalizedMap.get(key) || [];
    const defaults = DEFAULT_FALLBACKS.get(key) || [];
    return buildFontStack([source, ...configured, ...defaults]);
  };
}

export const defaultFontResolver = createFontResolver();

function normalizeName(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase();
}

function normalizeFallbackList(value) {
  if (Array.isArray(value)) return value.flatMap(item => normalizeFallbackList(item));
  if (value == null) return [];
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.replace(/^['"]|['"]$/g, ""));
}

function buildFontStack(values) {
  const result = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || "").trim().replace(/^['"]|['"]$/g, "");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const isSourceFamily = result.length === 0;
    result.push(isGenericFamily(key) || isSourceFamily ? value : `"${value}"`);
  }
  return result.join(", ") || "serif";
}


function isGenericFamily(value) {
  return ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "math"].includes(value);
}
