import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const assets = await readdir(new URL('assets/', dist), { withFileTypes: true });
const shell = ['/index.html'];
const hash = createHash('sha256');
for (const asset of assets) {
  if (asset.isFile()) shell.push(`/assets/${encodeURIComponent(asset.name)}`);
}
shell.sort();
for (const path of shell) hash.update(await readFile(new URL(path.slice(1), dist)));
const source = await readFile(new URL('../src/offline-shell.js', import.meta.url), 'utf8');
hash.update(source);
await writeFile(new URL('offline-shell.js', dist),
  `const cacheName = 'ob-shell-${hash.digest('hex')}';\nconst shell = ${JSON.stringify(shell)};\n${source}`);
