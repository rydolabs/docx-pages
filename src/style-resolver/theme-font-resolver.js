const THEME_FONT_MAP = Object.freeze({
  majorAscii: ["major", "latin"],
  majorHAnsi: ["major", "latin"],
  majorEastAsia: ["major", "eastAsia"],
  majorBidi: ["major", "complexScript"],
  minorAscii: ["minor", "latin"],
  minorHAnsi: ["minor", "latin"],
  minorEastAsia: ["minor", "eastAsia"],
  minorBidi: ["minor", "complexScript"]
});

export function resolveFont(fonts = {}, theme = {}, requested = {}) {
  const resolved = {};
  const directKeys = ["ascii", "hAnsi", "eastAsia", "cs"];
  for (const key of directKeys) if (requested[key]) resolved[key] = requested[key];

  const themeKeys = {
    ascii: requested.asciiTheme,
    hAnsi: requested.hAnsiTheme,
    eastAsia: requested.eastAsiaTheme,
    cs: requested.csTheme
  };
  for (const [target, themeKey] of Object.entries(themeKeys)) {
    if (resolved[target] || !themeKey) continue;
    const path = THEME_FONT_MAP[themeKey];
    const value = path ? theme?.fonts?.[path[0]]?.[path[1]] : null;
    if (value) resolved[target] = value;
  }

  // Word commonly falls back between ascii/hAnsi and then to eastAsia for CJK text.
  if (!resolved.hAnsi && resolved.ascii) resolved.hAnsi = resolved.ascii;
  if (!resolved.ascii && resolved.hAnsi) resolved.ascii = resolved.hAnsi;

  return {
    ...resolved,
    primary: resolved.eastAsia || resolved.ascii || resolved.hAnsi || resolved.cs || null,
    available: Object.fromEntries(Object.keys(resolved).filter(k => fonts?.[resolved[k]]).map(k => [k, true]))
  };
}

export function resolveThemeColor(theme = {}, color) {
  if (!color) return null;
  if (typeof color === "string") return color;
  let value = color.value && color.value !== "auto" ? color.value : (color.themeColor ? theme?.colors?.[color.themeColor] : null);
  if (!value) return color.value ?? null;
  value = String(value).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = [0, 2, 4].map(i => Number.parseInt(value.slice(i, i + 2), 16));
  const lumMod = color.lumMod != null ? Number(color.lumMod) / 100000 : 1;
  const lumOff = color.lumOff != null ? Number(color.lumOff) / 100000 : 0;
  let adjusted = rgb.map(channel => Math.max(0, Math.min(255, Math.round(channel * lumMod + 255 * lumOff))));
  const tint = parseWordThemeFactor(color.themeTint);
  const shade = parseWordThemeFactor(color.themeShade);
  if (shade != null) adjusted = adjusted.map(channel => Math.round(channel * shade));
  if (tint != null) adjusted = adjusted.map(channel => Math.round(channel + (255 - channel) * tint));
  return adjusted.map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function parseWordThemeFactor(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  const numeric = /^[0-9a-f]{1,2}$/i.test(text) ? Number.parseInt(text, 16) : Number(text);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(255, numeric)) / 255;
}
