import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of (await readdir(path.join(root,'mods'))).sort()) {
  console.log(`Checking ${name}`);
  const result=spawnSync('herdr-app',['check',path.join(root,'mods',name)],{stdio:'inherit'});
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
