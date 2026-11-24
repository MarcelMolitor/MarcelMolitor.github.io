'use strict';
const el = id => document.getElementById(id);
const labels = {'Indica Dominant':'Indica-dominant','Sativa Dominant':'Sativa-dominant','Balanced Hybrid':'Ausgewogener Hybrid','':'Ohne Typangabe'};
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const format = n => n.toLocaleString('de-DE');
const collator = new Intl.Collator('de',{numeric:true,sensitivity:'base'});
const size = 25;
let catalog = [], matches = [], page = 0, timer;
function node(tag,text) {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
function draw() {
  const results = el('results');
  results.replaceChildren();
  for (const [name, items] of matches.slice(page*size,(page+1)*size)) {
    const detail = document.createElement('details');
    const title = node('summary',name);
    title.append(node('span',items.length===1?'1 Eintrag':format(items.length)+' Einträge'));
    detail.append(title);
    detail.addEventListener('toggle',() => {
      if (!detail.open || detail.children.length>1) return;
      for (const {row:[,original,breeder,type,p1,p2,bank]} of items) {
        const card = document.createElement('article');
        card.append(node('h3',original),node('p',breeder+' · '+(labels[type]||type)),node('p','Elternlinien: '+([p1,p2].filter(Boolean).join(' × ')||'Keine Angabe')),node('p','Katalog: '+bank));
        detail.append(card);
      }
    });
    results.append(detail);
  }
  el('prev').disabled=page===0;
  el('next').disabled=(page+1)*size>=matches.length;
  el('page').textContent=matches.length?'Seite '+(page+1)+' von '+format(Math.ceil(matches.length/size)):'';
}
function search() {
  const query=normalize(el('q').value).trim();
  const words=query.split(/\s+/);
  const breeder=el('breeder').value, type=el('type').value;
  const ranked=[[],[],[],[]];
  for (const [name,items] of catalog) {
    const hits=items.filter(({row,terms})=>(!breeder||row[2]===breeder)&&(!type||(row[3]||'unknown')===type)&&words.every(w=>terms.includes(w)));
    if (!hits.length) continue;
    const normalizedName=normalize(name);
    let rank=3;
    if (!query || normalizedName===query) rank=0;
    else if (normalizedName.startsWith(query)) rank=1;
    else if (words.every(word=>normalizedName.includes(word))) rank=2;
    ranked[rank].push([name,hits]);
  }
  matches=ranked.flat();
  page=0;
  el('status').textContent=matches.length?format(matches.length)+' Sortennamen gefunden':'Keine Treffer. Ändere den Suchbegriff oder setze die Filter zurück.';
  draw();
}
async function start() {
  const response=await fetch('katalog.json.gz');
  if(!response.ok) throw Error(response.status);
  const payload = await response.blob();
  const signature = new Uint8Array(await payload.slice(0,2).arrayBuffer());
  const json = signature[0]===31 && signature[1]===139
    ? new Response(payload.stream().pipeThrough(new DecompressionStream('gzip')))
    : new Response(payload);
  const rows=await json.json(), groups=new Map(), breeders=new Set(), types=new Set();
  for(const row of rows) {
    const [name,,breeder,type]=row, key=name.toLowerCase();
    if(!groups.has(key)) groups.set(key,[name,[]]);
    groups.get(key)[1].push({row,terms:normalize(row.join(' '))});
    breeders.add(breeder); types.add(type);
  }
  catalog=[...groups.values()].sort((a,b)=>collator.compare(a[0],b[0]));
  for(const b of [...breeders].sort(collator.compare)) el('breeder').add(new Option(b,b));
  for(const t of [...types].sort()) el('type').add(new Option(labels[t]||t,t||'unknown'));
  el('total').textContent=format(rows.length)+' Katalogeinträge';
  search();
}
el('q').oninput=()=>{clearTimeout(timer);timer=setTimeout(search,120)};
el('breeder').onchange=el('type').onchange=search;
el('filters').onreset=()=>setTimeout(search);
el('filters').onsubmit=e=>{e.preventDefault();search()};
el('example').onclick=()=>{el('filters').reset();el('q').value='Blue Dream';search()};
for(const [id,step] of [['prev',-1],['next',1]]) el(id).onclick=()=>{page+=step;draw();el('register').scrollIntoView()};
start().catch(()=>{el('status').textContent='Der Katalog konnte nicht geladen werden. Bitte lade die Seite erneut.'});
