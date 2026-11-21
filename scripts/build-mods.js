import {readFile, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source=await readFile(path.join(root,'shared/ui.js'),'utf8');
for (const name of await readdir(path.join(root,'mods'))) {
  if (!/^herdr24(?:-|$)/.test(name)) continue;
  await writeFile(path.join(root,'mods',name,'ui.js'),source);
}
console.log('Shared UI copied into each self-contained mod.');
