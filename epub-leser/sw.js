const CACHE='molitor-reader-shell-v5';
const ROOT='/epub-leser/';
const ASSETS=[ROOT,ROOT+'index.html',ROOT+'style.css',ROOT+'app.js',ROOT+'reader-icon.svg',ROOT+'manifest.webmanifest','/molitor.css','/molitor-identity.css'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('molitor-reader-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.includes(u.pathname))return;
  const navigation=e.request.mode==='navigate';
  const versionedAsset=[ROOT+'app.js',ROOT+'style.css','/molitor.css','/molitor-identity.css'].includes(u.pathname)&&/^\?v=[a-zA-Z0-9._-]+$/.test(u.search);
  if(u.search&&!navigation&&!versionedAsset)return;
  const key=new URL(u.pathname,self.location.origin).href;
  e.respondWith(fetch(e.request).then(async response=>{
    if(response.ok){try{const c=await caches.open(CACHE);await c.put(key,response.clone());}catch(err){/* cache failure must not block reading */}}
    return response;
  }).catch(async()=>{const c=await caches.open(CACHE);return await c.match(key)||Response.error();}));
});
