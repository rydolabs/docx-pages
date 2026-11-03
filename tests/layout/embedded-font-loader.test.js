import test from 'node:test';
import assert from 'node:assert/strict';
import { deobfuscateEmbeddedFont, registerEmbeddedFonts } from '../../src/layout/embedded-font-loader.js';

test('deobfuscateEmbeddedFont reverses the OOXML first-32-byte XOR', () => {
  const key = '{00112233-4455-6677-8899-AABBCCDDEEFF}';
  const original = Uint8Array.from({ length: 48 }, (_, i) => i);
  const obfuscated = deobfuscateEmbeddedFont(original, key);
  assert.notDeepEqual([...obfuscated.slice(0, 32)], [...original.slice(0, 32)]);
  const restored = deobfuscateEmbeddedFont(obfuscated, key);
  assert.deepEqual([...restored], [...original]);
});

test('registerEmbeddedFonts uses FontFace and registers variants without exposing layout internals', async () => {
  const added = [];
  class FakeFontFace {
    constructor(family, source, descriptors) { this.family = family; this.source = source; this.descriptors = descriptors; }
    async load() { return this; }
  }
  const doc = {
    defaultView: { FontFace: FakeFontFace },
    fonts: { add(face) { added.push(face); } }
  };
  const fonts = {
    EmbeddedDemo: {
      name: 'EmbeddedDemo',
      embedded: [{ type: 'boldItalic', fontKey: null, data: Uint8Array.from([1,2,3,4]) }]
    }
  };
  const result = await registerEmbeddedFonts(fonts, doc);
  assert.equal(result.loaded.length, 1);
  assert.equal(result.failed.length, 0);
  assert.equal(added[0].family, 'EmbeddedDemo');
  assert.equal(added[0].descriptors.weight, '700');
  assert.equal(added[0].descriptors.style, 'italic');
});
