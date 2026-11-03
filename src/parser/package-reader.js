import { ParserError } from "../common/errors.js";
import { parseXml, children, attr, localName } from "./xml-reader.js";

// Beta safety bounds. Metadata is checked before inflating any part, so a
// highly-compressible DOCX cannot force unrestricted allocation by default.
// Hosts handling trusted large documents may explicitly raise these limits.
export const DEFAULT_PACKAGE_LIMITS = Object.freeze({
  maxSourceBytes: 50 * 1024 * 1024,
  maxEntryCount: 3000,
  maxPartBytes: 25 * 1024 * 1024,
  maxTotalExpandedBytes: 100 * 1024 * 1024
});

export async function openPackage(source, { JSZipImpl, domParser, packageLimits } = {}) {
  const limits = { ...DEFAULT_PACKAGE_LIMITS, ...(packageLimits || {}) };
  const sourceBytes = source?.byteLength ?? source?.size ?? null;
  if (sourceBytes != null && sourceBytes > limits.maxSourceBytes) {
    throw new ParserError("DOCX input exceeds compressed size limit", { code: "DOCX_SIZE_LIMIT" });
  }
  const JSZip = JSZipImpl ?? (await import("jszip")).default;
  let zip;
  try { zip = await JSZip.loadAsync(source); }
  catch (cause) { throw new ParserError("Unable to open DOCX package", { code: "INVALID_DOCX_PACKAGE", cause }); }

  // JSZip exposes the uncompressed size in the ZIP central directory. Verify
  // every entry before the first read. Fake package adapters used in tests may
  // not expose .files; they are not network/untrusted ZIP sources.
  if (zip.files) {
    let count = 0;
    let expanded = 0;
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (++count > limits.maxEntryCount) {
        throw new ParserError("DOCX package contains too many entries", { code: "DOCX_SIZE_LIMIT" });
      }
      const size = entry._data?.uncompressedSize;
      if (Number.isFinite(size)) {
        if (size > limits.maxPartBytes) {
          throw new ParserError("DOCX package part exceeds size limit", { code: "DOCX_SIZE_LIMIT" });
        }
        expanded += size;
        if (expanded > limits.maxTotalExpandedBytes) {
          throw new ParserError("DOCX package expanded data exceeds size limit", { code: "DOCX_SIZE_LIMIT" });
        }
      }
    }
  }
  const checkData = data => {
    if (data != null && (typeof data === "string" ? data.length * 2 : data.byteLength) > limits.maxPartBytes) {
      throw new ParserError("DOCX package part exceeds size limit", { code: "DOCX_SIZE_LIMIT" });
    }
    return data;
  };
  const readText = async path => zip.file(path) ? checkData(await zip.file(path).async("string")) : null;
  const readBinary = async path => zip.file(path) ? checkData(await zip.file(path).async("uint8array")) : null;
  const readXml = async path => { const s = await readText(path); return s == null ? null : parseXml(s, domParser); };

  async function getRelationships(partPath = "") {
    const slash = partPath.lastIndexOf("/");
    const dir = slash >= 0 ? partPath.slice(0, slash + 1) : "";
    const file = slash >= 0 ? partPath.slice(slash + 1) : partPath;
    const relPath = partPath ? `${dir}_rels/${file}.rels` : "_rels/.rels";
    const doc = await readXml(relPath); if (!doc) return [];
    const root = doc.documentElement;
    return children(root, "Relationship").map(n => ({ id: attr(n,"Id"), type: attr(n,"Type"), target: attr(n,"Target"), targetMode: attr(n,"TargetMode") }));
  }

  function resolveTarget(sourcePart, target) {
    if (!target || target.startsWith("/") || /^[a-z]+:/i.test(target)) return target?.replace(/^\//, "") ?? target;
    const base = sourcePart.includes("/") ? sourcePart.slice(0, sourcePart.lastIndexOf("/")+1) : "";
    const parts = (base + target).split("/"); const out=[];
    for (const p of parts) { if (!p || p === ".") continue; if (p === "..") out.pop(); else out.push(p); }
    return out.join("/");
  }

  async function resolveRelationship(sourcePart, id) {
    const rel = (await getRelationships(sourcePart)).find(r => r.id === id);
    return rel ? { ...rel, path: resolveTarget(sourcePart, rel.target) } : null;
  }

  return { zip, readText, readBinary, readXml, getRelationships, resolveRelationship, resolveTarget, domParser };
}

export async function findMainDocument(pkg) {
  const rels = await pkg.getRelationships("");
  const office = rels.find(r => r.type?.endsWith("/officeDocument"));
  return office ? pkg.resolveTarget("", office.target) : "word/document.xml";
}
