import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){
 const path=join(dir,e.name);if(e.isDirectory())out.push(...await walk(path));else if(path.endsWith('.js'))out.push(path);
}return out;}
let count=0;
for(const file of await walk(resolve(root,'src'))){
 const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 if(p.status!==0){process.stderr.write(`${file}\n${p.stderr}`);process.exit(1);}
 count++;
}
console.log(`Source syntax: PASS (${count} modules)`);
