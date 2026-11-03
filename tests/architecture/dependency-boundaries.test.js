import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../../src');

const rules = [
  {
    name: 'parser stays below resolver/IR/layout/renderer',
    dir: 'parser',
    forbidden: ['style-resolver/', 'document-ir/', 'layout/', 'renderer/']
  },
  {
    name: 'style resolver does not depend on IR/layout/renderer',
    dir: 'style-resolver',
    forbidden: ['document-ir/', 'layout/', 'renderer/']
  },
  {
    name: 'document IR does not depend on layout/renderer',
    dir: 'document-ir',
    forbidden: ['layout/', 'renderer/']
  },
  {
    name: 'layout primitives do not depend upward on composers/pagination/renderer',
    dir: 'layout/primitives',
    forbidden: ['layout/composers/', 'layout/pagination/', 'renderer/']
  },
  {
    name: 'layout services do not depend on layout policy layers',
    dir: 'layout/services',
    forbidden: ['layout/primitives/', 'layout/composers/', 'layout/pagination/', 'renderer/']
  },
  {
    name: 'layout composers do not depend upward on pagination/renderer',
    dir: 'layout/composers',
    forbidden: ['layout/pagination/', 'renderer/']
  },
  {
    name: 'pagination does not depend on renderer',
    dir: 'layout/pagination',
    forbidden: ['renderer/']
  },
  {
    name: 'renderer paints layout only and does not reach parser/resolver/IR',
    dir: 'renderer',
    forbidden: ['parser/', 'style-resolver/', 'document-ir/']
  }
];

for (const rule of rules) {
  test(rule.name, () => {
    const violations = [];
    for (const file of walk(path.join(srcRoot, rule.dir))) {
      if (!file.endsWith('.js')) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(file), specifier);
        const relative = path.relative(srcRoot, resolved).replaceAll(path.sep, '/');
        if (rule.forbidden.some(prefix => relative.startsWith(prefix))) {
          violations.push(`${path.relative(srcRoot, file)} -> ${relative}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

function importSpecifiers(source) {
  const out = [];
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g)) out.push(match[1]);
  return out;
}
