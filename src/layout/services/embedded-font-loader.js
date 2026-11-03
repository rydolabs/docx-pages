export async function registerEmbeddedFonts(fonts = {}, ownerDocument = globalThis.document || null) {
  const FontFaceCtor = ownerDocument?.defaultView?.FontFace || globalThis.FontFace;
  const fontSet = ownerDocument?.fonts;
  if (!FontFaceCtor || !fontSet?.add) return { loaded: [], failed: [] };

  const loaded = [];
  const failed = [];
  for (const font of Object.values(fonts || {})) {
    for (const ref of font.embedded || []) {
      if (!ref?.data) continue;
      try {
        const bytes = deobfuscateEmbeddedFont(ref.data, ref.fontKey);
        const face = new FontFaceCtor(font.name, toArrayBuffer(bytes), descriptorsFor(ref.type));
        await face.load();
        fontSet.add(face);
        loaded.push({ family: font.name, type: ref.type, path: ref.path || null });
      } catch (error) {
        failed.push({ family: font.name, type: ref.type, path: ref.path || null, error });
      }
    }
  }
  return { loaded, failed };
}

export function deobfuscateEmbeddedFont(data, guidKey) {
  const out = data instanceof Uint8Array ? Uint8Array.from(data) : new Uint8Array(data || []);
  if (!guidKey || out.length === 0) return out;
  const trimmed = String(guidKey).replace(/[{}-]/g, "");
  if (trimmed.length < 32) return out;
  const key = new Uint8Array(16);
  for (let i = 0; i < 16; i++) key[15 - i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
  const limit = Math.min(32, out.length);
  for (let i = 0; i < limit; i++) out[i] ^= key[i % 16];
  return out;
}

function descriptorsFor(type) {
  return {
    weight: type === "bold" || type === "boldItalic" ? "700" : "400",
    style: type === "italic" || type === "boldItalic" ? "italic" : "normal"
  };
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
