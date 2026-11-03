const NS_PREFIX = /^.*:/;
export function localName(node) { return node?.localName || node?.nodeName?.replace(NS_PREFIX, "") || ""; }
export function parseXml(xml, domParser = globalThis.DOMParser ? new globalThis.DOMParser() : null) {
  if (!domParser) throw new Error("DOMParser is not available. Provide a browser DOMParser-compatible implementation.");
  return domParser.parseFromString(xml, "application/xml");
}
export function child(node, name) { return children(node, name)[0] ?? null; }
export function children(node, name) { return Array.from(node?.childNodes ?? []).filter(x => x.nodeType === 1 && (!name || localName(x) === name)); }
export function attr(node, name, fallback = null) {
  if (!node?.attributes) return fallback;
  for (const a of Array.from(node.attributes)) if (localName(a) === name || a.name === name) return a.value;
  return fallback;
}
export function intAttr(node, name, fallback = null) { const v = attr(node, name); return v == null ? fallback : Number.parseInt(v, 10); }
export function boolAttr(node, name, fallback = true) { const v = attr(node, name); return v == null ? fallback : !["0","false","off","no"].includes(String(v).toLowerCase()); }
export function text(node) { return node?.textContent ?? ""; }
