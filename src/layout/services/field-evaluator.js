/**
 * Bounded Word field evaluation used by layout.
 * Keeps page-dependent values and hyperlink semantics out of text layout.
 * Unsupported fields intentionally fall back to their cached DOCX result.
 */
export function evaluateFieldInstruction(instruction, context = null) {
  if (!context || !instruction) return null;
  const command = fieldCommand(instruction);
  switch (command) {
    case "PAGE": return context.pageNumberDisplay ?? context.pageNumber ?? null;
    case "NUMPAGES": return context.totalPages ?? null;
    case "SECTION": return context.sectionNumber ?? null;
    case "SECTIONPAGES": return context.sectionPageCount ?? null;
    case "REF": {
      const bookmark = firstArgument(instruction);
      return bookmark ? context.bookmarkTexts?.[bookmark] ?? null : null;
    }
    default: return null;
  }
}

export function resolveFieldLink(instruction) {
  if (!instruction) return null;
  const source = String(instruction).trim();
  const command = fieldCommand(source);

  if (command === "HYPERLINK") {
    const local = switchValue(source, "l");
    if (local) return { anchor: local, target: null, targetMode: null, field: true };
    const target = firstArgument(source);
    if (target) return { target, targetMode: /^https?:|^mailto:|^tel:/i.test(target) ? "External" : null, anchor: null, field: true };
    return null;
  }

  if ((command === "REF" || command === "PAGEREF") && hasSwitch(source, "h")) {
    const anchor = firstArgument(source);
    return anchor ? { anchor, target: null, targetMode: null, field: true } : null;
  }

  return null;
}

function fieldCommand(instruction) {
  return String(instruction || "").trim().match(/^([^\s]+)/)?.[1]?.toUpperCase() || "";
}

function firstArgument(instruction) {
  const rest = String(instruction || "").trim().replace(/^\S+\s*/, "");
  const match = rest.match(/^"([^"]+)"|^([^\\\s]+)/);
  return match?.[1] || match?.[2] || null;
}

function switchValue(instruction, name) {
  const expression = new RegExp(`\\\\${escapeRegExp(name)}\\s+(?:"([^"]+)"|([^\\s\\\\]+))`, "i");
  const match = String(instruction).match(expression);
  return match?.[1] || match?.[2] || null;
}

function hasSwitch(instruction, name) {
  return new RegExp(`(?:^|\\s)\\\\${escapeRegExp(name)}(?:\\s|$)`, "i").test(String(instruction));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
