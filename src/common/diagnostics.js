export function createDiagnostics() {
  const items = [];
  return {
    items,
    info(code, message, details) { items.push({ level: "info", code, message, details }); },
    warn(code, message, details) { items.push({ level: "warning", code, message, details }); },
    error(code, message, details) { items.push({ level: "error", code, message, details }); }
  };
}

export function mergeDiagnostics(...groups) {
  return groups.flatMap(group => (group || []).filter(Boolean));
}

export function diagnosticsFromEmbeddedFonts(result) {
  return (result?.failed || []).map(item => ({
    level: "warning",
    code: "embedded-font-load-failed",
    message: `Embedded font failed to load: ${item.family || "unknown"}`,
    details: {
      family: item.family || null,
      type: item.type || null,
      path: item.path || null,
      error: item.error ? String(item.error?.message || item.error) : null
    }
  }));
}
