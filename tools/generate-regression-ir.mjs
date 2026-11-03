import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { parseDocument } from '../src/parser/document-parser.js';
import { resolveStyles } from '../src/style-resolver/style-resolver.js';
import { buildDocumentIR } from '../src/document-ir/ir-builder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'tests/fixtures/regression');
const outDir = path.join(root, 'tests/regression/visual/ir');
await fs.mkdir(outDir, { recursive: true });
const names = (await fs.readdir(sourceDir)).filter(name => name.endsWith('.docx')).sort();
for (const file of names) {
  const source = await fs.readFile(path.join(sourceDir, file));
  const raw = await parseDocument(source, { JSZipImpl: JSZip, domParser: new DOMParser() });
  const ir = buildDocumentIR(resolveStyles(raw));
  const base = file.replace(/\.docx$/i, '');
  await fs.writeFile(path.join(outDir, `${base}.json`), JSON.stringify(ir));
  console.log(`regression IR: ${base}`);
}
