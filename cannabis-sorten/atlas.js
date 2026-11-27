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
const savedKey = 'molitor-sortenatlas-merkliste-v1';
function readSaved() {
  try {
    const values = JSON.parse(localStorage.getItem(savedKey));
    return new Set(Array.isArray(values) ? values.filter(v => typeof v === 'string') : []);
  } catch { return new Set(); }
}
let saved = readSaved();
function showSavedCount() {
  el('saved-count').textContent = '(' + format(saved.size) + ')';
}
showSavedCount();
function savedButton(name) {
  const button = node('button', '');
  const key = name.toLowerCase();
  function refresh() {
    button.setAttribute('aria-pressed', String(saved.has(key)));
    button.textContent = saved.has(key) ? 'Gemerkt ✓' : 'Sorte merken';
  }
  refresh();
  button.onclick = () => {
    if (saved.has(key)) saved.delete(key);
    else saved.add(key);
    let persisted = true;
    try { localStorage.setItem(savedKey, JSON.stringify([...saved])); }
    catch { persisted = false; }
    refresh();
    showSavedCount();
    syncComparison();
    if (el('saved-only').checked) {
      search();
      el('saved-only').focus();
    }
    if (!persisted) el('status').textContent += ' Die Merkliste gilt nur für diese Sitzung.';
  };
  return button;
}
window.addEventListener('storage', event => {
  if (event.key !== savedKey && event.key !== null) return;
  saved = readSaved();
  showSavedCount();
  syncComparison();
  if (el('saved-only').checked) search();
  else for (const button of el('results').querySelectorAll('.sortenaktionen button')) {
    button.replaceWith(savedButton(button.closest('details').dataset.name));
  }
});
const sortennamen = new Map();
function sortenlink(name, text) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('sorte', name);
  url.hash = 'register';
  const link = node('a', text);
  link.href = url.href;
  return link;
}
function parentLabel(value) {
  return /(?:Ã.|Â.){3}/u.test(value) ? 'Elternname in der Quelle unleserlich' : value;
}
function datenquelle(row) {
  if (typeof row[10] === 'string' && row[10].startsWith('https://')) {
    const breederCatalog = row[2].trim().toLowerCase() === row[6].trim().toLowerCase();
    const link = node('a', breederCatalog ? 'Zum Katalog des Züchters' : 'Zum Eintrag bei ' + row[6]);
    link.href = row[10];
    return link;
  }
  const link = node('a', 'Quelldatensatz ansehen');
  link.href = 'https://github.com/Shannon-Goddard/ci-strains-pro/blob/80fbe5d40fac8dda5120f50b946f069c4961f253/raw-data.csv';
  return link;
}
function elternlinien(first, second) {
  const line = node('p', 'Elternlinien: ');
  const parents = [first, second].filter(Boolean);
  if (!parents.length) line.append('Keine Angabe');
  parents.forEach((parent, i) => {
    if (i) line.append(' × ');
    const label = parentLabel(parent);
    const name = label === parent && sortennamen.get(parent.toLowerCase());
    line.append(name ? sortenlink(name, parent) : label);
  });
  return line;
}
let comparisonGroups = new Map();
const sides = ['a', 'b'];
function syncComparison() {
  const keys = [...saved].filter(key => comparisonGroups.has(key));
  const ready = keys.length >= 2;
  el('vergleich-hilfe').hidden = ready;
  el('vergleich-inhalt').hidden = !ready;
  if (!ready) return;
  const selected = sides.map(side => el('sorte-' + side).value);
  sides.forEach((side, i) => {
    if (!keys.includes(selected[i]) || selected[0] === selected[1]) {
      selected[i] = keys.find(key => key !== selected[1-i]);
    }
    const select = el('sorte-' + side);
    select.replaceChildren(...keys.map(key => new Option(comparisonGroups.get(key)[0], key)));
    select.value = selected[i];
  });
  refreshComparison();
}
function refreshComparison() {
  for (const [i, side] of sides.entries()) {
    const select = el('sorte-' + side);
    const other = el('sorte-' + sides[1-i]).value;
    for (const option of select.options) option.disabled = option.value === other;
    const variants = el('eintrag-' + side);
    if (variants.dataset.group === select.value) continue;
    const items = comparisonGroups.get(select.value)[1];
    variants.replaceChildren(...items.map(({row}, index) =>
      new Option(row[1] + ' · ' + row[2] + ' · ' + row[6] + ' (' + (index+1) + ')', String(index))));
    variants.dataset.group = select.value;
  }
  drawComparison();
}
const percent = new Intl.NumberFormat('de-DE', {maximumFractionDigits: 4});
function gehalt(value) {
  if (!value) return 'Keine belegte Angabe';
  if (value[0] === 'avg') return percent.format(value[1]) + ' % (Katalogmittel)';
  return value.map(n => percent.format(n)).join('–') + ' %';
}
function cbdAngabe(row) {
  const datenfassung = gehalt(row[9]);
  if (row[10] === 'https://herbiesheadshop.com/cannabis-seeds/blue-dream-growers-choice') {
    return 'ca. 1 % laut Herbies Seeds (Anbieterangabe, geprüft am 26.11.2026). Verwendete Datenfassung: ' + datenfassung + '.';
  }
  return datenfassung;
}
function drawComparison() {
  const rows = sides.map(side => {
    const group = comparisonGroups.get(el('sorte-' + side).value);
    return group[1][el('eintrag-' + side).selectedIndex].row;
  });
  const table = el('vergleich-tabelle');
  const head = document.createElement('tr');
  for (const title of ['Merkmal', ...rows.map(row => row[0])]) {
    const th = node('th', title);
    th.scope = 'col';
    head.append(th);
  }
  table.tHead.replaceChildren(head);
  const body = table.tBodies[0];
  body.replaceChildren();
  for (const [label, value] of [
    ['Variante', row => row[1]], ['Züchter', row => row[2]],
    ['Katalogtyp', row => labels[row[3]] || row[3]],
    ['Elternlinien', row => row.slice(4,6).filter(Boolean).map(parentLabel).join(' × ')],
    ['THC laut Katalog', row => gehalt(row[8])], ['CBD laut Katalog', cbdAngabe],
    ['Terpene laut Katalog', row => row[7] || 'Keine belegte Angabe'], ['Katalog', row => row[6]], ['Datenquelle', datenquelle]
  ]) {
    const tr = body.insertRow();
    const th = node('th', label);
    th.scope = 'row';
    tr.append(th);
    for (const row of rows) tr.insertCell().append(value(row) || 'Keine Angabe');
  }
}
for (const side of sides) {
  el('sorte-' + side).onchange = refreshComparison;
  el('eintrag-' + side).onchange = drawComparison;
}
// A photo documents one breeder's cultivar. Match the original listing and catalog too.
const cultivarPhotos = [
  {name: 'Blueberry', original: 'Blueberry', breeder: 'Dutch Passion', catalog: 'Dutch Passion',
    file: 'blueberry-dutch-passion', source: 'Blueberry_(Dutch_Passion)_02.jpg'},
  {name: 'White Widow', original: 'White Widow', breeder: 'Dutch Passion', catalog: 'Dutch Passion',
    file: 'white-widow-dutch-passion', source: 'White_Widow_(Dutch_Passion),_29_day_of_bloom,_v._2.jpg'},
  {name: 'White Widow', original: 'Green House Seeds White Widow', breeder: 'Green House Seed Co.', catalog: 'The Attitude Seedbank',
    file: 'white-widow-green-house', source: 'White_Widow_(Green_House_Seeds)_01.jpg'}
];
function listingPhoto(row) {
  return cultivarPhotos.find(photo => photo.name === row[0] && photo.original === row[1] &&
    photo.breeder === row[2] && photo.catalog === row[6]);
}
function photoFigure(photo) {
  const figure = document.createElement('figure');
  figure.className = 'sortenfoto';
  const image = document.createElement('img');
  image.width = 800;
  image.height = 600;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.alt = 'Blühende Pflanze der Sorte ' + photo.name + ' von ' + photo.breeder;
  image.src = 'bilder/' + photo.file + '.webp';
  const source = node('a', 'Originalfoto');
  source.href = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(photo.source);
  const license = node('a', 'CC BY-SA 3.0');
  license.href = 'https://creativecommons.org/licenses/by-sa/3.0/';
  const caption = node('figcaption', photo.name + ' · ' + photo.breeder + ' · Foto von Yuri Che. ');
  caption.append(source, ' · ', license, ' · Verkleinert und als WebP gespeichert.');
  figure.append(image, caption);
  return figure;
}
function draw() {
  const results = el('results');
  results.replaceChildren();
  for (const [name, items] of matches.slice(page*size,(page+1)*size)) {
    const detail = document.createElement('details');
    const title = node('summary',name);
    title.append(node('span',items.length===1?'1 Eintrag':format(items.length)+' Einträge'));
    detail.dataset.name = name;
    detail.append(title);
    detail.addEventListener('toggle',() => {
      if (!detail.open || detail.children.length>1) return;
      const linkRow = node('p', '');
      linkRow.className = 'sortenaktionen';
      linkRow.append(savedButton(name), sortenlink(name, 'Direktlink zu dieser Sorte'));
      detail.append(linkRow);
      const coverage = [
        ['THC', 8], ['CBD', 9], ['Terpene', 7]
      ].map(([label, index]) => {
        const count = items.filter(({row}) => Boolean(row[index])).length;
        return label + ': ' + format(count) + ' von ' + format(items.length);
      });
      detail.append(node('p', 'Katalogeinträge mit Angabe · ' + coverage.join(' · ')));const info=node('div','');info.className='coverage-grid';for(const [label,index] of [['THC',8],['CBD',9],['Terpene',7]]){const box=node('div','');box.append(node('small',label+' · Datenabdeckung'),node('strong',Math.round(items.filter(x=>!!x.row[index]).length/items.length*100)+' %'));info.append(box)}detail.append(info);
      const cards = items.map(({row}) => ({row, photo: listingPhoto(row)}));
      cards.sort((a, b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo)));
      for (const {row, photo} of cards) {
        const [,original,breeder,type,p1,p2,bank,terpenes,thc] = row;
        const card = document.createElement('article');
        card.append(node('h3',original),node('p',breeder+' · '+(labels[type]||type)),elternlinien(p1,p2),node('p','THC laut Katalog: '+gehalt(thc)),node('p','CBD laut Katalog: '+cbdAngabe(row)),node('p','Terpene laut Katalog: '+(terpenes || 'Keine belegte Angabe')),node('p','Katalog: '+bank), datenquelle(row));
        if (photo) card.insertBefore(photoFigure(photo), card.children[2]);
        detail.append(card);
      }
    });
    results.append(detail);
  }
  el('prev').disabled=page===0;
  el('next').disabled=(page+1)*size>=matches.length;
  el('page').textContent=matches.length?'Seite '+(page+1)+' von '+format(Math.ceil(matches.length/size)):'';
}
function featured(groups){const target=el('featured-strains');if(!target)return;target.replaceChildren();const ranked=[...groups.values()].map(([name,items])=>({name,entries:items.length,breeders:new Set(items.map(x=>x.row[2]).filter(Boolean)).size,catalogs:new Set(items.map(x=>x.row[6]).filter(Boolean)).size})).sort((a,b)=>b.breeders-a.breeders||b.catalogs-a.catalogs||b.entries-a.entries||collator.compare(a.name,b.name)).slice(0,12);for(const [i,s] of ranked.entries()){const card=node('article','');card.append(node('small','RANG '+String(i+1).padStart(2,'0')+' · KATALOGPRÄSENZ'),node('h3',s.name),node('p',format(s.breeders)+' Züchter · '+format(s.catalogs)+' Kataloge'),node('p',format(s.entries)+' Einträge'),sortenlink(s.name,'Sortenprofil öffnen →'));target.append(card)}}
function coverageMatch(row){const v=el('coverage').value;return !v||({thc:!!row[8],cbd:!!row[9],both:!!row[8]&&!!row[9],all:!!row[8]&&!!row[9]&&!!row[7],missing:!row[8]||!row[9]||!row[7]})[v]}
function dashboard(rows){const grid=el('coverage-grid');grid.hidden=false;grid.replaceChildren();for(const [label,index] of [['THC',8],['CBD',9],['Terpene',7]]){const n=rows.filter(r=>!!r[index]).length;const card=node('div','');card.append(node('small',label+' · Katalogabdeckung'),node('strong',rows.length?Math.round(n/rows.length*100)+' %':'–'));const p=document.createElement('progress');p.max=rows.length||1;p.value=n;p.setAttribute('aria-label',label+' Datenabdeckung');card.append(p,node('small',format(n)+' / '+format(rows.length)));grid.append(card)}const counts=new Map();for(const r of rows)for(const t of new Set((r[7]||'').split(', ').filter(Boolean)))counts.set(t,(counts.get(t)||0)+1);const card=node('div','');card.style.gridColumn='1 / -1';card.append(node('h3','Terpenprofil · häufigste Katalognennungen'),node('p','Häufigkeit der Nennung, keine Konzentration oder Wirkstärke.'));for(const [t,n] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8)){const line=node('div','');line.style.border='0';line.style.padding='5px';line.append(node('small',t+' · '+format(n)));const p=document.createElement('progress');p.max=Math.max(1,...counts.values());p.value=n;p.setAttribute('aria-label',t+' Katalognennungen, relativ zur häufigsten Nennung');line.append(p);card.append(line)}grid.append(card);const types=new Map();for(const r of rows){const t=labels[r[3]]||r[3]||'Ohne Typangabe';types.set(t,(types.get(t)||0)+1)}const typeCard=node('div','');typeCard.style.gridColumn='1 / -1';typeCard.append(node('h3','Verteilung der Katalogtypen'));for(const [t,n] of [...types].sort((a,b)=>b[1]-a[1])){typeCard.append(node('p',t+' · '+format(n)+' ('+Math.round(n/rows.length*100)+' %)'));const p=document.createElement('progress');p.max=rows.length||1;p.value=n;p.setAttribute('aria-label',t);typeCard.append(p)}grid.append(typeCard);el('export').disabled=!rows.length}
el('coverage').onchange=search;
el('export').onclick=()=>{const rows=matches.flatMap(g=>g[1].map(x=>x.row));const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'function search() {").replace(/"/g,'""')+'"';const csv=[['Sorte','Variante','Züchter','Typ','Elternlinie 1','Elternlinie 2','Katalog','Terpene','THC Katalog','CBD Katalog','Quelle'],...rows.map(r=>r.map((v,i)=>i===8||i===9?gehalt(v):v))].map(r=>r.map(cell).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='molitor-sortenatlas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
function search() {
  const url = new URL(location.href);
  if (url.searchParams.has('sorte')) {
    url.searchParams.delete('sorte');
    history.replaceState(null, '', url);
  }
  const query=normalize(el('q').value).trim();
  const words=query.split(/\s+/);
  const breeder=el('breeder').value, type=el('type').value;
  const terpene = el('terpene').value;
  const ranked=[[],[],[],[]];
  for (const [name,items] of catalog) {
    if (el('saved-only').checked && !saved.has(name.toLowerCase())) continue;
    const hits=items.filter(({row,terms})=>coverageMatch(row)&&(!breeder||row[2]===breeder)&&(!type||(row[3]||'unknown')===type)&&(!terpene || (row[7] && (terpene==='*' || row[7].split(', ').includes(terpene))))&&words.every(w=>terms.includes(w)));
    if (!hits.length) continue;
    const normalizedName=normalize(name);
    let rank=3;
    if (!query || normalizedName===query) rank=0;
    else if (normalizedName.startsWith(query)) rank=1;
    else if (words.every(word=>normalizedName.includes(word))) rank=2;
    ranked[rank].push([name,hits]);
  }
  matches=ranked.flat();
  dashboard(matches.flatMap(g=>g[1].map(x=>x.row)));
  page=0;
  el('status').textContent=matches.length?format(matches.length)+' Sortennamen gefunden':'Keine Treffer. Ändere den Suchbegriff oder setze die Filter zurück.';
  if (el('saved-only').checked && !saved.size) el('status').textContent = 'Deine Merkliste ist leer. Öffne eine Sorte im Register und wähle „Sorte merken“.';
  draw();
}
el('saved-only').onchange=search;
async function start() {
  const response=await fetch('katalog.json.gz');
  if(!response.ok) throw Error(response.status);
  const payload = await response.blob();
  const signature = new Uint8Array(await payload.slice(0,2).arrayBuffer());
  const json = signature[0]===31 && signature[1]===139
    ? new Response(payload.stream().pipeThrough(new DecompressionStream('gzip')))
    : new Response(payload);
  const rows=await json.json(), groups=new Map(), breeders=new Set(), types=new Set(), terpenes=new Set();
  for(const row of rows) {
    const [name,,breeder,type]=row, key=name.toLowerCase();
    if(!groups.has(key)) groups.set(key,[name,[]]);
    groups.get(key)[1].push({row,terms:normalize(row.slice(0,8).join(' '))});
    if (row[7]) for (const name of row[7].split(', ')) terpenes.add(name);
    breeders.add(breeder); types.add(type);
  }
  catalog=[...groups.values()].sort((a,b)=>collator.compare(a[0],b[0]));
  for(const b of [...breeders].sort(collator.compare)) el('breeder').add(new Option(b,b));
  for (const name of [...terpenes].sort(collator.compare)) el('terpene').add(new Option(name,name));
  for(const t of [...types].sort()) el('type').add(new Option(labels[t]||t,t||'unknown'));
  el('total').textContent=format(rows.length)+' Katalogeinträge';
  for (const [key, [name]] of groups) sortennamen.set(key, name);
  comparisonGroups = groups;
  featured(groups);
  syncComparison();
  const requested = new URL(location.href).searchParams.get('sorte');
  if (requested) {
    const group = groups.get(requested.toLowerCase());
    el('q').value = group ? group[0] : requested;
    if (group) {
      matches = [group];
      dashboard(group[1].map(x=>x.row));
      el('status').textContent = group[0] + ' · ' + format(group[1].length) + (group[1].length===1?' Katalogeintrag':' Katalogeinträge');
      draw();
      el('results').firstElementChild.open = true;
      return;
    }
  }
  search();
}
el('q').oninput=()=>{clearTimeout(timer);timer=setTimeout(search,120)};
el('breeder').onchange=el('type').onchange=el('terpene').onchange=search;
el('filters').onreset=()=>setTimeout(search);
el('filters').onsubmit=e=>{e.preventDefault();search()};
el('example').onclick=()=>{el('filters').reset();el('q').value='Blue Dream';search()};
for(const [id,step] of [['prev',-1],['next',1]]) el(id).onclick=()=>{page+=step;draw();el('register').scrollIntoView()};
start().catch(error=>{console.error(error);el('status').textContent='Der Katalog konnte nicht geladen werden: '+error.message;const grid=el('coverage-grid');grid.hidden=false;grid.replaceChildren(node('p','Auswertung nicht verfügbar. Bitte Seite neu laden.'));});
