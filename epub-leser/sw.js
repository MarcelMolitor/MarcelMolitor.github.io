const CACHE='molitor-reader-shell-v8';
const ROOT='/epub-leser/';
const ASSETS=[ROOT,ROOT+'index.html',ROOT+'english.html',ROOT+'style.css',ROOT+'app.js',ROOT+'reader-icon.svg',ROOT+'manifest.webmanifest','/molitor.css','/molitor-identity.css','/molitor-logo.svg','/ecs-lesereihe/english-epub.js'];
const LIBS=['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{
  await c.addAll(ASSETS);
  await Promise.allSettled(LIBS.map(async url=>{
    const response=await fetch(url,{mode:'cors',credentials:'omit',redirect:'error'});
    if(response.ok)await c.put(url,response);
  }));
})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('molitor-reader-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method==='GET'&&LIBS.includes(u.href)){
    e.respondWith((async()=>{
      const c=await caches.open(CACHE);
      const saved=await c.match(u.href);
      if(saved)return saved;
      const response=await fetch(u.href,{mode:'cors',credentials:'omit',redirect:'error'});
      if(response.ok){try{await c.put(u.href,response.clone());}catch(err){/* storage unavailable */}}
      return response;
    })());
    return;
  }
  if(e.request.method!=='GET'||u.origin!==self.location.origin||!ASSETS.includes(u.pathname))return;
  const navigation=e.request.mode==='navigate';
  const versionedAsset=[ROOT+'app.js',ROOT+'style.css','/molitor.css','/molitor-identity.css','/molitor-logo.svg','/ecs-lesereihe/english-epub.js'].includes(u.pathname)&&/^\?v=[a-zA-Z0-9._-]+$/.test(u.search);
  if(u.search&&!navigation&&!versionedAsset)return;
  const key=new URL(u.pathname,self.location.origin).href;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(async response=>{
    if(response.ok&&!response.redirected){try{const c=await caches.open(CACHE);await c.put(key,response.clone());}catch(err){/* cache failure must not block reading */}}
    return response;
  }).catch(async()=>{const c=await caches.open(CACHE);return await c.match(key)||Response.error();}));
});
