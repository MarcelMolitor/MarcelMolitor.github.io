import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const root='epub-leser/';
for(const file of ['app.js','sw.js']) {
  new Script(readFileSync(root+file,'utf8'),{filename:file});
  console.log('Syntax OK:',file);
}
const manifest=JSON.parse(readFileSync(root+'manifest.webmanifest','utf8'));
assert.equal(manifest.scope,'/epub-leser/');
assert(manifest.start_url.startsWith(manifest.scope));
assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons){assert(existsSync(root+icon.src),'Missing icon '+icon.src);}
const handlers={};
const origin='https://example.test';
let cachedAssets=[];
const fakeCache={addAll:async assets=>{cachedAssets=assets;},match:async()=>new Response('offline'),put:async()=>{}};
runInNewContext(readFileSync(root+'sw.js','utf8'),{
  self:{location:{origin},addEventListener:(name,fn)=>{handlers[name]=fn;}},
  caches:{open:async()=>fakeCache},URL,Response,
  fetch:async()=>{throw new Error('offline');}
});
let installation;
handlers.install({waitUntil:p=>{installation=p;}});
await installation;
for(const asset of cachedAssets){const path=asset.endsWith('/')?asset+'index.html':asset;assert(existsSync(path.slice(1)),'Missing offline asset '+asset);}
let response;
handlers.fetch({request:{url:origin+'/epub-leser/app.js?v=test',method:'GET',mode:'cors'},respondWith:p=>{response=p;}});
assert.equal(await (await response).text(),'offline');
response=undefined;
handlers.fetch({request:{url:'https://other.test/epub-leser/app.js',method:'GET',mode:'cors'},respondWith:p=>{response=p;}});
assert.equal(response,undefined);
console.log('Manifest and simulated offline cache checks OK');

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
