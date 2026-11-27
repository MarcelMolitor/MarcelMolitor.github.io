import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';
const root='epub-leser/';
for(const file of ['app.js','sw.js']) {
  new Script(readFileSync(root+file,'utf8'),{filename:file});
  console.log('Syntax OK:',file);
}
JSON.parse(readFileSync(root+'manifest.webmanifest','utf8'));
for(const file of ['index.html','english.html']){
  const html=readFileSync(root+file,'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\bsrc\s*=/.test(match[1]))continue;
    if(/application\/ld\+json/.test(match[1]))JSON.parse(match[2]);
    else if(!/type=["']module["']/.test(match[1]))new Script(match[2],{filename:file});
  }
  const markup=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'');
  const ids=[...markup.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,file+' duplicate IDs');
  for(const m of markup.matchAll(/\shref=["']#([^"']+)["']/g))assert(ids.includes(m[1]),file+' missing anchor '+m[1]);
  console.log('Markup and script checks OK:',file);
}
for(const file of ['app.js','style.css','reader-icon.svg','manifest.webmanifest','sw.js'])assert(existsSync(root+file),file+' missing');
console.log('Reader static checks passed.');
