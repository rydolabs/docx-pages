import { access, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site=resolve(root,'dist/site');
for(const file of ['index.html','app.js','styles.css','src/index.js','src/docx-viewer.js','vendor/jszip.min.js','vendor/JSZIP-LICENSE.markdown','vendor/PAKO-LICENSE','release.json']) {
  await access(resolve(site,file));
}
const html=await readFile(resolve(site,'index.html'),'utf8');
assert.match(html, /\.\/vendor\/jszip\.min\.js/);
assert.match(html, /\.\/app\.js/);
const app=await readFile(resolve(site,'app.js'),'utf8');
assert.match(app, /import \{ openDocx \} from '\.\/src\/index\.js'/);
assert.match(app, /JSZipImpl: window\.JSZip/);
assert.deepEqual((await readdir(resolve(site,'src'))).includes('layout'),true);
console.log('Static site asset contract: PASS');
