import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/site');
await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'src'), { recursive: true });
await mkdir(resolve(out, 'vendor'), { recursive: true });
await cp(resolve(root, 'web'), out, { recursive: true });
await cp(resolve(root, 'src'), resolve(out, 'src'), { recursive: true });
await cp(resolve(root, 'node_modules/jszip/dist/jszip.min.js'), resolve(out, 'vendor/jszip.min.js'));
await cp(resolve(root, 'node_modules/jszip/LICENSE.markdown'), resolve(out, 'vendor/JSZIP-LICENSE.markdown'));
await cp(resolve(root, 'node_modules/pako/LICENSE'), resolve(out, 'vendor/PAKO-LICENSE'));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await writeFile(resolve(out, 'release.json'), JSON.stringify({name:pkg.name,version:pkg.version,sourceBaseline:'phase48ay'},null,2)+'\n');
await writeFile(resolve(out, '.nojekyll'), '');
console.log(`Static preview build: ${out}`);
