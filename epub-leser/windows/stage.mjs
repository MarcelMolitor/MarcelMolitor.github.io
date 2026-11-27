import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..');
const source = join(root, 'epub-leser');
const dist = join(here, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'epub-leser'), { recursive: true });
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && /\.(html|css|js|mjs|png|svg|json|webmanifest|ico|woff2?)$/i.test(entry.name)) {
    await cp(join(source, entry.name), join(dist, 'epub-leser', entry.name));
  }
}
for (const name of ['molitor.css','molitor-identity.css','molitor-logo.svg']) {
  await cp(join(root,name),join(dist,name));
}
await cp(join(source,'index.html'),join(dist,'index.html'));
// Redirect to the staged reader so its relative assets resolve correctly.
import { writeFile } from 'node:fs/promises';
await writeFile(join(dist,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=epub-leser/index.html"><title>MOLITOR EPUB Reader</title><a href="epub-leser/index.html">Open reader</a></html>');
