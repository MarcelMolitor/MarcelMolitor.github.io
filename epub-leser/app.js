/* MOLITOR EPUB-Leser · app.js
   Läuft komplett im Browser. Benötigt global JSZip (3.10.1) und ePub (epub.js 0.3.93). */
(function () {
  'use strict';

  /* ===================== Hilfsfunktionen ===================== */
  var $ = function (id) { return document.getElementById(id); };
  var PREFIX = 'epubleser:';
  var englishUI = new URLSearchParams(location.search).get('lang') === 'en' || location.pathname.indexOf('/epub-leser/en/') !== -1;
  function uiText(de,en){return englishUI?en:de;}

  var LIBRARY = [
    { file: 'kuechenlabor.epub', title: 'Küchenlabor ohne Labor', sub: 'Vier Gewürze und die Kunst, einen Rezeptorbefund zu lesen', cover: 'c1' },
    { file: 'gegenprobe.epub', title: 'Die Gegenprobe', sub: 'Ein Forschungsnotizbuch mit vier Fällen aus dem Endocannabinoid Hypothesenatlas', cover: 'c2' },
    { file: 'bildatlas.epub', title: 'Vom Pfefferzweig zum Hippocampus', sub: 'Ein Bildspaziergang durch die Endocannabinoid-Forschung', cover: 'c3' }
  ];
  var LIB_BASE = '/ecs-lesereihe/';

  var THEMES = {
    hell:   { bg: '#ffffff', fg: '#1d1d1f', link: '#1f6feb' },
    sepia:  { bg: '#f4ecd8', fg: '#3b2f22', link: '#9a5b1e' },
    dunkel: { bg: '#14171c', fg: '#d8dadf', link: '#7ab4ff' }
  };
  var FONTS = {
    serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  };

  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function lsDel(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* egal */ } }

  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  function makeKey(title, size) { return 'b' + hash(String(title || '') + '|' + size) + '-' + size; }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(message || 'timeout')); }, ms);
      Promise.resolve(promise).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function fmtPct(p) {
    if (typeof p !== 'number' || !isFinite(p)) return '';
    var v = Math.round(p * 100);
    if (v === 0 && p > 0) v = 1;
    return Math.max(0, Math.min(100, v)) + ' %';
  }
  function isTyping(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }
  function nextTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* ===================== Elemente ===================== */
  var home = $('home'), reader = $('reader');
  var dropzone = $('dropzone'), fileInput = $('file-input'), homeMsg = $('home-msg');
  var dropOverlay = $('drop-overlay');
  var recentSection = $('recent-section'), recentList = $('recent-list'), recentClear = $('recent-clear');
  var libraryList = $('library-list');
  var rTitle = $('r-book-title'), rChapter = $('r-chapter');
  var loading = $('r-loading'), loadingText = $('r-loading-text');
  var btnPrev = $('btn-prev'), btnNext = $('btn-next'), btnPrevSide = $('btn-prev-side'), btnNextSide = $('btn-next-side');
  var range = $('progress-range'), progPct = $('progress-pct'), progPage = $('progress-page');
  var btnBookmark = $('btn-bookmark'), btnToc = $('btn-toc'), btnSearch = $('btn-search');
  var btnSettings = $('btn-settings'), settingsBox = $('settings'), btnFullscreen = $('btn-fullscreen'), btnClose = $('btn-close');
  var drawer = $('drawer'), backdrop = $('drawer-backdrop'), drawerClose = $('drawer-close');
  var tabs = { toc: $('tab-toc'), search: $('tab-search'), marks: $('tab-marks') };
  var panes = { toc: $('pane-toc'), search: $('pane-search'), marks: $('pane-marks') };
  var tocList = $('toc-list');
  var searchForm = $('search-form'), searchInput = $('search-input'), searchStatus = $('search-status'), searchResults = $('search-results');
  var marksList = $('marks-list');
  var fontDec = $('font-dec'), fontInc = $('font-inc'), fontOut = $('font-size-out');
  var toastEl = $('toast');

  /* ===================== Zustand ===================== */
  var settings = Object.assign({ fontSize: 110, theme: 'hell', font: 'serif' }, lsGet('settings', {}));
  if (!THEMES[settings.theme]) settings.theme = 'hell';
  if (!FONTS[settings.font]) settings.font = 'serif';
  settings.fontSize = Math.max(80, Math.min(200, Number(settings.fontSize) || 100));

  var S = null;          // aktuelle Lesesitzung
  var openRequest = 0; var session = 0;       // Zähler, um veraltete async-Ergebnisse zu verwerfen
  var lastFocus = null;

  /* ===================== Toast & Meldungen ===================== */
  var toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
  }
  function homeMessage(text, isErr) {
    homeMsg.textContent = text || '';
    homeMsg.classList.toggle('err', !!isErr);
  }

  /* ===================== IndexedDB: Zuletzt gelesen ===================== */
  var DB_NAME = 'molitor-epub-leser', DB_VER = 1;
  var dbPromise = null, idbOk = true;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      try {
        if (!('indexedDB' in window) || !window.indexedDB) throw new Error('kein IndexedDB');
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        };
        req.onsuccess = function () { var db = req.result; db.onversionchange = function () { db.close(); dbPromise = null; }; resolve(db); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB-Fehler')); };
        req.onblocked = function () { reject(new Error('IndexedDB blockiert')); };
      } catch (e) { reject(e); }
    });
    dbPromise = withTimeout(dbPromise, 4000, 'IndexedDB antwortet nicht').catch(function (e) {
      dbPromise = null;
      idbOk = false;
      recentSection.hidden = true;
      throw e;
    });
    return dbPromise;
  }
  function idbTx(stores, mode, fn) {
    return openDB().then(function (db) {
      idbOk = true;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(stores, mode);
        var result;
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('abgebrochen')); };
        result = fn(tx);
        if (result && typeof result.then !== 'function' && 'onsuccess' in result) {
          var req = result;
          req.onsuccess = function () { result = req.result; };
        }
      });
    });
  }
  function idbAllMeta() {
    return idbTx(['meta'], 'readonly', function (tx) { return tx.objectStore('meta').getAll(); });
  }
  function idbGet(store, id) {
    return idbTx([store], 'readonly', function (tx) { return tx.objectStore(store).get(id); });
  }
  function idbSaveBook(meta, data) {
    return idbTx(['meta', 'files'], 'readwrite', function (tx) {
      tx.objectStore('meta').put(meta);
      if (data) tx.objectStore('files').put({ id: meta.id, data: data });
    });
  }
  function idbUpdateMeta(id, patch) {
    return idbTx(['meta'], 'readwrite', function (tx) {
      var store = tx.objectStore('meta');
      var req = store.get(id);
      req.onsuccess = function () { if (req.result) store.put(Object.assign(req.result, patch)); };
    });
  }
  function idbDelete(id) {
    return idbTx(['meta', 'files'], 'readwrite', function (tx) {
      tx.objectStore('meta').delete(id);
      tx.objectStore('files').delete(id);
    });
  }
  function idbClear() {
    return idbTx(['meta', 'files'], 'readwrite', function (tx) {
      tx.objectStore('meta').clear();
      tx.objectStore('files').clear();
    });
  }
  var coverUrls = [];
  function renderRecent() {
    if (!idbOk) { recentSection.hidden = true; if($('resume-reading'))$('resume-reading').hidden=true; return Promise.resolve(); }
    return idbAllMeta().then(function (all) {
      coverUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* egal */ } });
      coverUrls = [];
      clear(recentList);
      all = (all || []).sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      var en = new URLSearchParams(location.search).get('lang') === 'en';
      var resume=$('resume-reading');
      if(!resume){resume=el('section',{id:'resume-reading',class:'section'});recentSection.parentNode.insertBefore(resume,recentSection);}
      clear(resume);
      var latest=all.find(function(m){var p=lsGet('pos:'+m.id,null);return p&&p.cfi&&!(typeof p.pct==='number'&&p.pct>=0.99);})||all[0];
      resume.hidden=!latest;
      if(latest){
        resume.style.cssText='padding:20px;border:1px solid #829bd1;border-radius:18px;background:var(--reader-accent,#3458d4);color:white';
        resume.appendChild(el('h2',{text:en?'Continue reading':'Weiterlesen'}));
        var title=el('p',{text:latest.title||latest.name||'EPUB'});title.style.cssText='font-size:1.2rem;font-weight:700;margin:8px 0';resume.appendChild(title);
        var pos=lsGet('pos:'+latest.id,null);
        if(pos&&typeof pos.pct==='number'){var p=el('progress',{max:'1',value:String(Math.max(0,Math.min(1,pos.pct))),'aria-label':en?'Reading progress':'Lesefortschritt'});p.style.cssText='width:100%;accent-color:white';resume.appendChild(p);resume.appendChild(el('p',{text:fmtPct(pos.pct)}));}
        var go=el('button',{class:'btn',type:'button',text:en?'Open book':'Buch öffnen'});go.style.cssText='background:white;color:#17243a';go.onclick=function(){openFromRecent(latest)};resume.appendChild(go);
      }
      var controls = $('shelf-sort');
      if (!controls) {
        controls = el('select', { id: 'shelf-sort', 'aria-label': en ? 'Sort bookshelf' : 'Bücherregal sortieren' });
        [['recent',en?'Recently opened':'Zuletzt geöffnet'],['title',en?'Title A–Z':'Titel A–Z'],['author',en?'Author A–Z':'Autor A–Z'],['progress',en?'Reading progress':'Lesefortschritt']].forEach(function(pair){controls.appendChild(el('option',{value:pair[0],text:pair[1]}));});
        $('shelf-search').parentNode.after(controls);
        controls.addEventListener('change',renderRecent);
      }
      var favorites = lsGet('shelf-favorites', []);
      if(!Array.isArray(favorites)) favorites=[];
      var filter=$('shelf-favorites-only');
      if(!filter){
        filter=el('button',{id:'shelf-favorites-only',type:'button',class:'btn','aria-pressed':'false',text:en?'Favorites only':'Nur Favoriten'});
        controls.after(filter);
        filter.addEventListener('click',function(){filter.setAttribute('aria-pressed',String(filter.getAttribute('aria-pressed')!=='true'));renderRecent();});
      }
      var only=filter.getAttribute('aria-pressed')==='true';
      function progress(m){var p=lsGet('pos:'+m.id,null);return p&&typeof p.pct==='number'?p.pct:Number(m.pct)||0;}
      if(controls.value==='title')all.sort(function(a,b){return String(a.title||'').localeCompare(String(b.title||''),en?'en':'de');});
      if(controls.value==='author')all.sort(function(a,b){return String(a.author||'').localeCompare(String(b.author||''),en?'en':'de');});
      if(controls.value==='progress')all.sort(function(a,b){return progress(b)-progress(a);});
      recentSection.hidden = false;
      var summary=$('shelf-summary');
      if(!summary){summary=el('p',{id:'shelf-summary',role:'status','aria-live':'polite'});filter.after(summary);}
      var state=$('shelf-state');
      if(!state){state=el('select',{id:'shelf-state','aria-label':en?'Reading status':'Lesestatus'});[['all',en?'All books':'Alle Bücher'],['new',en?'Not started':'Nicht begonnen'],['active',en?'Reading':'In Arbeit'],['done',en?'Completed':'Abgeschlossen']].forEach(function(p){state.appendChild(el('option',{value:p[0],text:p[1]}));});filter.after(state);state.addEventListener('change',renderRecent);}
      var metrics=$('shelf-metrics');
      if(!metrics){metrics=el('div',{id:'shelf-metrics',class:'shelf-metrics'});$('shelf-search').parentNode.before(metrics);}
      clear(metrics);
      var counts=[all.length,all.filter(function(m){return progress(m)>0&&progress(m)<1;}).length,all.filter(function(m){return progress(m)>=1;}).length,all.filter(function(m){return favorites.includes(m.id);}).length];
      var names=en?['Books','Reading','Completed','Favorites']:['Bücher','In Arbeit','Abgeschlossen','Favoriten'];
      counts.forEach(function(n,i){var tile=el('div',{});tile.appendChild(el('strong',{text:String(n)}));tile.appendChild(el('span',{text:names[i]}));metrics.appendChild(tile);});
      var reset=$('shelf-reset-filters');
      if(!reset){reset=el('button',{id:'shelf-reset-filters',type:'button',class:'btn',text:en?'Reset filters':'Filter zurücksetzen'});state.after(reset);reset.addEventListener('click',function(){$('shelf-search').value='';controls.value='recent';state.value='all';filter.setAttribute('aria-pressed','false');renderRecent();});}
      var query=($('shelf-search').value||'').trim().toLocaleLowerCase();
      reset.disabled=!query&&!only&&state.value==='all'&&controls.value==='recent';
      var shown=0;
      all.forEach(function (m) {
        if(only && !favorites.includes(m.id))return;
        var p=progress(m);
        if(state.value==='new'&&p>0||state.value==='active'&&!(p>0&&p<1)||state.value==='done'&&p<1)return;
        if(query&&!String((m.title||'')+' '+(m.author||'')+' '+(m.name||'')).toLocaleLowerCase().includes(query))return;
        shown++;
        var pos = lsGet('pos:' + m.id, null);
        var pct = pos && typeof pos.pct === 'number' ? pos.pct : m.pct;
        var coverImg = null;
        if (m.cover instanceof Blob) {
          try {
            var u = URL.createObjectURL(m.cover);
            coverUrls.push(u);
            coverImg = el('img', { src: u, alt: '' });
          } catch (e) { coverImg = null; }
        }
        var card = bookCard({
          title: m.title || (en?'Untitled book':'Unbenanntes Buch'),
          sub: m.author || (m.name || ''),
          cover: 'c' + ((parseInt(hash(m.id), 16) % 3) + 1),
          coverImg: coverImg,
          pct: pct,
          label: (en?'Continue reading: ':'Weiterlesen: ') + (m.title || (en?'Book':'Buch')),
          onOpen: function () { openFromRecent(m); },
          onRemove: function () {
            if (!confirm(uiText('Dieses Buch aus deiner Bibliothek entfernen?','Remove this book from your library?'))) return;
            idbDelete(m.id).then(renderRecent).catch(function () { homeMessage(uiText('Buch konnte nicht entfernt werden.','Could not remove book.'),true); });
          }
        });
        var fav=el('button',{type:'button',class:'btn shelf-favorite','aria-pressed':String(favorites.includes(m.id)),text:favorites.includes(m.id)?'★':'☆','aria-label':(en?'Toggle favorite: ':'Favorit umschalten: ')+(m.title||m.name||'EPUB')});
        fav.style.cssText='position:relative;z-index:3;min-width:44px;min-height:44px;margin:6px;color:#3458d4;background:white;border:1px solid #d5deeb;border-radius:8px';
        fav.addEventListener('click',function(e){e.stopPropagation();var current=lsGet('shelf-favorites',[]);if(!Array.isArray(current))current=[];var next=current.includes(m.id)?current.filter(function(id){return id!==m.id;}):current.concat(m.id);if(lsSet('shelf-favorites',next))renderRecent();else homeMessage(en?'Unable to save favorite.':'Favorit konnte nicht gespeichert werden.',true);});
        card.appendChild(fav);
        recentList.appendChild(card);
        card.hidden = false;
      });
      if(!all.length){var empty=el('li',{class:'shelf-empty'});empty.style.cssText='grid-column:1/-1;padding:24px;border:1px dashed #829bd1;border-radius:14px;text-align:center';empty.appendChild(el('h3',{text:en?'Your library starts here':'Hier beginnt deine Bibliothek'}));empty.appendChild(el('p',{text:en?'Add a DRM-free EPUB to keep your books and reading progress on this device.':'Füge ein DRM-freies EPUB hinzu, um Bücher und Lesefortschritt auf diesem Gerät zu speichern.'}));var add=el('button',{class:'btn',type:'button',text:en?'Add your first book':'Erstes Buch hinzufügen'});add.onclick=function(){$('file-input').click();};empty.appendChild(add);recentList.appendChild(empty);summary.textContent=en?'0 books':'0 Bücher';return;}
      summary.textContent=shown?(en?shown+' of '+all.length+' books':shown+' von '+all.length+' Büchern'):(en?'No matching books. Try changing your filters.':'Keine passenden Bücher. Ändere deine Filter.');
    }).catch(function () { recentSection.hidden = true; });
  }

  function openFromRecent(m) {
    homeMessage('');
    showReader();
    setLoading(true, uiText("Buch wird geöffnet …","Opening book …"));
    idbGet('files', m.id).then(function (rec) {
      if (!rec || !rec.data) throw new Error('missing');
      var data = rec.data;
      if (data instanceof Blob) return data.arrayBuffer();
      return data;
    }).then(function (buf) {
      return openBook(buf, { name: m.name, storeRecent: true });
    }).catch(function (e) {
      if (e && e.handled) return;
      if (e && e.message === 'missing') {
        idbDelete(m.id).catch(function () {});
        failOpen(uiText("Die gespeicherte Datei ist nicht mehr vorhanden. Bitte öffne das Buch erneut.","The saved file is no longer available. Please open the book again."));
      } else {
        failOpen(uiText("Das Buch konnte nicht aus dem Speicher geladen werden.","Could not load the book from storage."));
      }
    });
  }

  /* ===================== Karten (Bibliothek / Zuletzt) ===================== */
  function bookCard(o) {
    var en = new URLSearchParams(location.search).get('lang') === 'en';
    var cover = el('div', { class: 'cover ' + (o.cover || 'c1'), 'aria-hidden': 'true' });
    if (o.coverImg) cover.appendChild(o.coverImg); else cover.textContent = o.title;
    var meta = el('div', { class: 'book-meta' }, [el('b', { text: o.title })]);
    if (o.sub) meta.appendChild(el('span', { class: 'sub', text: o.sub }));
    var pctBox = el('span', { class: 'pct' });
    if (typeof o.pct === 'number' && o.pct > 0) {
      pctBox.textContent = fmtPct(o.pct) + (en ? ' read' : ' gelesen');
      var bar = el('div', { class: 'bar', 'aria-hidden': 'true' }, [el('i')]);
      bar.firstChild.style.width = Math.round(Math.min(1, o.pct) * 100) + '%';
      pctBox.appendChild(bar);
    } else {
      pctBox.textContent = o.emptyText || (en ? 'Not started' : 'Noch nicht begonnen');
    }
    meta.appendChild(pctBox);
    var open = el('button', { class: 'open', type: 'button', 'aria-label': o.label || o.title });
    open.addEventListener('click', o.onOpen);
    var card = el('div', { class: 'book-card' }, [cover, meta, open]);
    if (o.onRemove) {
      var rm = el('button', { class: 'remove', type: 'button', 'aria-label': en ? 'Remove '+o.title+' from library' : '„' + o.title + '“ aus der Liste entfernen', title: en ? 'Remove from library' : 'Aus der Liste entfernen', text: '×' });
      rm.addEventListener('click', function (e) { e.stopPropagation(); o.onRemove(); });
      card.appendChild(rm);
    }
    return el('li', null, [card]);
  }

  function renderLibrary() {
    clear(libraryList);
    var map = lsGet('lib', {});
    LIBRARY.forEach(function (b) {
      var url = LIB_BASE + b.file;
      var key = map[url];
      var pos = key ? lsGet('pos:' + key, null) : null;
      libraryList.appendChild(bookCard({
        title: b.title, sub: b.sub, cover: b.cover,
        pct: pos ? pos.pct : null,
        emptyText: uiText('Kostenlos · EPUB','Free · EPUB'),
        label: uiText('„','Open “') + b.title + uiText('“ im Leser öffnen','” in reader'),
        onOpen: function () { openFromUrl(url, { library: true }); }
      }));
    });
  }

  /* ===================== Öffnen ===================== */
  function openFile(file) {
    if (!file) return;
    homeMessage('');
    if(file.size > 100 * 1024 * 1024){homeMessage(new URLSearchParams(location.search).get('lang')==='en'?'Please choose an EPUB up to 100 MiB.':'Bitte wähle eine EPUB-Datei bis 100 MiB.',true);return;}
    if (!file.size) { homeMessage(uiText('Die Datei ist leer. Bitte lade das Buch erneut herunter.','This file is empty. Please download the book again.'), true); return; }
    var name = file.name || 'buch.epub';
    if (!/\.epub$/i.test(name) && file.type && file.type !== 'application/epub+zip' && file.type !== 'application/zip') {
      homeMessage(uiText('Bitte wähle eine EPUB-Datei mit der Endung .epub.','Please choose a file ending in .epub.'), true);
      return;
    }
    var request = ++openRequest;
    showReader();
    setLoading(true, uiText("Datei wird gelesen …","Reading file …"));
    var p = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsArrayBuffer(file);
    });
    p.then(function (buf) {
      if (request !== openRequest || reader.hidden) return;
      var signature = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4));
      if (signature.length < 4 || signature[0] !== 80 || signature[1] !== 75 || signature[2] !== 3 || signature[3] !== 4) throw new Error('Invalid EPUB ZIP');
      return openBook(buf, { name: name, storeRecent: true });
    })
      .catch(function (e) { if (request !== openRequest || reader.hidden || (e && e.handled)) return; failOpen(uiText('Die Datei konnte nicht gelesen werden. Prüfe, ob sie eine vollständige, DRM-freie EPUB-Datei ist.','Could not read the file. Check that it is a complete, DRM-free EPUB.')); });
  }

  function safeUrl(raw) {
    try {
      var u = new URL(raw, location.href);
      if (u.origin !== location.origin) return null;
      if (!/^https?:$/.test(u.protocol)) return null;
      return u;
    } catch (e) { return null; }
  }

  function openFromUrl(raw, opts) {
    opts = opts || {};
    homeMessage('');
    var u = safeUrl(raw);
    if (!u) {
      homeMessage(uiText("Dieses Buch kann nicht geöffnet werden: Aus Sicherheitsgründen lädt der Leser nur Bücher von dieser Website.","For security, the reader only loads remote books hosted on this website."), true);
      return;
    }
    var request = ++openRequest;
    showReader();
    setLoading(true, uiText("Buch wird geladen …","Loading book …"));
    fetch(u.href, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      if (request !== openRequest || reader.hidden) return;
      var path = u.pathname;
      var libEntry = LIBRARY.some(function (b) { return LIB_BASE + b.file === path; });
      return openBook(buf, { name: decodeURIComponent(path.split('/').pop() || 'buch.epub'), libUrl: libEntry ? path : null, storeRecent: !libEntry });
    }).catch(function (e) {
      if (request !== openRequest || reader.hidden || (e && e.handled)) return;
      failOpen(uiText("Das Buch konnte nicht geladen werden. Bitte prüfe deine Internetverbindung und versuche es erneut.","Could not load the book. Check your internet connection and try again."));
    });
  }

  function failOpen(message) {
    closeBook({ silent: true });
    homeMessage(message, true);
    try { homeMsg.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* egal */ }
  }

  function isZip(buf) {
    try {
      var b = new Uint8Array(buf, 0, 4);
      return b[0] === 0x50 && b[1] === 0x4b;
    } catch (e) { return false; }
  }

  function openBook(buf, opts) {
    opts = opts || {};
    if (typeof window.ePub !== 'function' || typeof window.JSZip !== 'function') {
      failOpen(uiText("Der Leser konnte nicht vollständig geladen werden (epub.js/JSZip fehlen). Bitte lade die Seite neu – eventuell blockiert ein Werbe- oder Skriptblocker jsdelivr.net.","The reader libraries could not load (epub.js/JSZip). Reload the page and check whether jsdelivr.net is blocked."));
      return Promise.resolve();
    }
    if (!buf || !buf.byteLength) { failOpen(uiText("Die Datei ist leer.","The file is empty.")); return Promise.resolve(); }
    if (!isZip(buf)) { failOpen(uiText("Das ist keine gültige EPUB-Datei. Ein EPUB ist intern ein ZIP-Archiv – diese Datei ist es nicht.","This is not a valid EPUB file. EPUB uses a ZIP container, which this file lacks.")); return Promise.resolve(); }

    // Vorheriges Buch sauber schließen, ohne die Ansicht zu wechseln
    destroySession();
    var my = ++session;
    showReader();
    setLoading(true, uiText("Buch wird geöffnet …","Opening book …"));

    var copy = opts.storeRecent && idbOk ? buf.slice(0) : null;
    var book;
    try { book = window.ePub(buf); } catch (e) {
      failOpen(uiText("Das EPUB konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt.","Could not open the EPUB. The file may be damaged."));
      return Promise.resolve();
    }
    S = {
      book: book, rendition: null, key: null, title: 'Buch', size: buf.byteLength,
      toc: [], tocLinks: [], location: null, marks: [], locationsReady: false, dragging: false,
      rtl: false, searchToken: 0, hl: null, saveTimer: null
    };
    var st = S;

    var failed = new Promise(function (resolve, reject) {
      try { book.on('openFailed', function (err) { reject(err || new Error('openFailed')); }); } catch (e) { /* egal */ }
    });
    return withTimeout(Promise.race([book.ready, failed]), 30000, 'Zeitüberschreitung').then(function () {
      if (my !== session) return;
      return book.loaded.metadata;
    }).then(function (md) {
      if (my !== session) return;
      md = md || {};
      st.title = (md.title || '').trim() || (opts.name || 'Unbenanntes Buch').replace(/\.epub$/i, '');
      st.author = (md.creator || '').trim();
      st.key = makeKey(st.title, st.size);
      st.rtl = md.direction === 'rtl' || (book.package && book.package.metadata && book.package.metadata.direction === 'rtl');
      rTitle.textContent = st.title;
      document.title = st.title + (englishUI ? ' · EPUB Reader · MOLITOR' : ' · EPUB-Leser · MOLITOR');
      st.marks = lsGet('marks:' + st.key, []) || [];

      if (opts.libUrl) {
        var map = lsGet('lib', {}); map[opts.libUrl] = st.key; lsSet('lib', map);
      }

      // Rendition aufbauen
      var rendition = book.renderTo('viewer', { width: '100%', height: '100%', flow: 'paginated', spread: settings.spread === 'none' ? 'none' : 'auto' });
      st.rendition = rendition;
      setupRendition(st);

      var pos = lsGet('pos:' + st.key, null);
      setLoading(true, uiText("Seite wird aufgebaut …","Rendering page …"));
      var shown = pos && pos.cfi
        ? rendition.display(pos.cfi).catch(function () { return rendition.display(); })
        : rendition.display();
      return withTimeout(shown, 30000, 'Zeitüberschreitung').then(function () {
        if (my !== session) return;
        setLoading(false);
        questReady=true;questActiveAt=Date.now();questTick=Date.now();questAdd('open',1);
        if (pos && pos.cfi) toast(uiText("Weiter an deiner letzten Leseposition","Resuming your last reading position"));

        // Inhaltsverzeichnis
        book.loaded.navigation.then(function (nav) {
          if (my !== session) return;
          buildToc(st, (nav && nav.toc) || []);
          if (st.location) markCurrentChapter(st, st.location);
        }).catch(function () { tocList.appendChild(el('li', { class: 'pane-note', text: uiText('Dieses Buch hat kein Inhaltsverzeichnis.','This book has no table of contents.') })); });

        renderMarks(st);
        updateBookmarkButton(st);

        // Zuletzt gelesen speichern
        if (opts.storeRecent && idbOk) {
          var meta = { id: st.key, title: st.title, author: st.author, name: opts.name || '', size: st.size, time: Date.now(), pct: pos ? pos.pct : 0 };
          getCoverBlob(book).then(function (blob) {
            if (blob) meta.cover = blob;
          }).catch(function () {}).then(function () {
            return idbSaveBook(meta, copy);
          }).catch(function () { toast(uiText('Buch konnte nicht dauerhaft gespeichert werden. Behalte deine Originaldatei.','Could not save this book permanently. Keep your original file.')); });
        }

        // Positionen berechnen (für Prozent & Regler)
        generateLocations(st, my);
      });
    }).catch(function (e) {
      if (my !== session) return;
      var msg = e && e.message === 'Zeitüberschreitung'
        ? uiText('Das Öffnen hat zu lange gedauert. Die Datei ist möglicherweise beschädigt oder sehr groß.','Opening the book timed out. The file may be damaged or very large.')
        : uiText('Das EPUB konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt oder kein gültiges E-Book.','Could not open this EPUB. The file may be damaged or not a valid ebook.');
      failOpen(msg);
      var err = new Error(msg); err.handled = true; throw err;
    });
  }

  function getCoverBlob(book) {
    return withTimeout(Promise.resolve(book.coverUrl()).then(function (url) {
      if (!url) return null;
      return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
        return b && b.size && b.size < 1.5 * 1024 * 1024 ? b : null;
      });
    }), 5000).catch(function () { return null; });
  }

  function generateLocations(st, my) {
    var book = st.book;
    progPage.textContent = uiText("Seiten werden berechnet …","Calculating pages …");
    var cached = null;
    try { cached = localStorage.getItem(PREFIX + 'loc:' + st.key); } catch (e) { cached = null; }
    var p;
    if (cached) {
      try { book.locations.load(cached); p = Promise.resolve(); } catch (e) { p = null; }
    }
    if (!p) {
      p = book.locations.generate(1600).then(function () {
        try { localStorage.setItem(PREFIX + 'loc:' + st.key, book.locations.save()); } catch (e) { /* zu groß – egal */ }
      });
    }
    p.then(function () {
      if (my !== session) return;
      st.locationsReady = true;
      range.disabled = false;
      var loc = null;
      try { loc = st.rendition.currentLocation(); } catch (e) { loc = null; }
      if (loc && loc.start) onRelocated(st, loc); else if (st.location) onRelocated(st, st.location);
    }).catch(function () {
      if (my !== session) return;
      progPage.textContent = '';
    });
  }

  /* ===================== Rendition: Themes, Events ===================== */
  /* Alle drei Farbschemata stecken in EINEM registrierten Theme und werden über
     html[data-lt] im iframe umgeschaltet. Grund: epub.js 0.3 entfernt beim
     Wechsel per themes.select() die Regeln des vorherigen Themes nicht. */
  function themeRules() {
    var txt = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'em', 'strong', 'b', 'i', 'small', 'cite', 'section', 'article'];
    var rules = {};
    Object.keys(THEMES).forEach(function (name) {
      var t = THEMES[name], sc = 'html[data-lt="' + name + '"] ';
      rules[sc + 'body'] = { background: t.bg + ' !important', color: t.fg + ' !important' };
      rules[sc + 'p, ' + sc + 'li, ' + sc + 'blockquote'] = { 'line-height': '1.65 !important', 'overflow-wrap': 'break-word' };
      rules[sc + 'img'] = { 'max-width': '100%', 'object-fit': 'contain' };
      rules[sc + 'a, ' + sc + 'a:link, ' + sc + 'a:visited'] = { color: t.link + ' !important' };
      if (name !== 'hell') rules[txt.map(function (x) { return sc + x; }).join(', ')] = { color: t.fg + ' !important' };
    });
    return rules;
  }
  function applyThemeToContents(contents) {
    try {
      var doc=contents.document, el=doc.getElementById('molitor-reading-spacing');
      if(!el){el=doc.createElement('style');el.id='molitor-reading-spacing';doc.head.appendChild(el);}
      var lh=[1.4,1.65,1.9].includes(settings.lineHeight)?settings.lineHeight:1.65;
      el.textContent='html[data-lt] body p,html[data-lt] body li,html[data-lt] body blockquote{line-height:'+lh+' !important}';
    } catch(e) {}

    try { contents.document.documentElement.setAttribute('data-lt', settings.theme); } catch (e) { /* egal */ }
  }

  function setupRendition(st) {
    var r = st.rendition;
    try {
      r.themes.register('molitor', themeRules());
      r.themes.select('molitor');
    } catch (e) { /* ältere Versionen */ }
    applySettingsToRendition();

    st.highlights = lsGet('highlights:'+st.key, []);
    if(!Array.isArray(st.highlights))st.highlights=[];
    st.highlights=st.highlights.filter(function(h){return h&&typeof h.cfi==='string'&&typeof h.text==='string'&&['#facc15','#4ade80','#60a5fa','#f472b6'].indexOf(h.color)!==-1;});
    st.highlights.forEach(function(h){paintHighlight(st,h);});
    r.on('selected',function(cfi,contents){if(S!==st)return;var sel=contents.window.getSelection();if(!sel||!String(sel).trim())return;st.pendingHighlight={cfi:cfi,text:sel?String(sel).slice(0,500):''};if(sel)sel.removeAllRanges();renderHighlights();if(!$('highlight-dialog').open)$('highlight-dialog').showModal();});
    r.on('relocated', function (loc) { if (S === st) { stopSpeech(); onRelocated(st, loc); } });
    r.on('keyup', onKey);
    r.on('click', function () { closeSettings(); });
    r.on('displayError', function () { toast(uiText("Diese Stelle konnte nicht angezeigt werden.","This location could not be displayed.")); });

    // Wischen + Tippen an den Rand (im iframe)
    r.hooks.content.register(function (contents) {
      var doc = contents.document;
      if (!doc) return;
      applyThemeToContents(contents);
      var sx = 0, sy = 0, stime = 0, multi = false;
      doc.addEventListener('touchstart', function (e) {
        multi = e.touches.length > 1;
        var t = e.changedTouches[0];
        sx = t.clientX; sy = t.clientY; stime = Date.now();
      }, { passive: true });
      doc.addEventListener('touchend', function (e) {
        if (multi) return;
        var t = e.changedTouches[0];
        var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - stime;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 900) {
          if (dx < 0) goForward(); else goBack();
          return;
        }
        // Kurzes Tippen an den Seitenrand
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 400) {
          var target = e.target;
          if (target && target.closest && target.closest('a, button, input, textarea, select, label, audio, video')) return;
          try { var sel = doc.getSelection && doc.getSelection(); if (sel && String(sel).length) return; } catch (er) { /* egal */ }
          var frame = doc.defaultView && doc.defaultView.frameElement;
          if (!frame) return;
          var x = frame.getBoundingClientRect().left + t.clientX;
          var w = window.innerWidth;
          if (x < w * 0.22) { e.preventDefault(); goLeft(); }
          else if (x > w * 0.78) { e.preventDefault(); goRight(); }
        }
      }, { passive: false });
    });
  }

  function applySettingsToRendition() {
    document.body.setAttribute('data-theme', settings.theme); 
    $('viewer').style.paddingInline='clamp(4px, 3vw, '+([0,12,24].includes(settings.margin)?settings.margin+4:16)+'px)';
    if(settings.margin===0)$('viewer').style.paddingInline='4px';
    fontOut.textContent = settings.fontSize + ' %';
    fontDec.disabled = settings.fontSize <= 80;
    fontInc.disabled = settings.fontSize >= 200;
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-theme-set') === settings.theme ? 'true' : 'false');
    });
    document.querySelectorAll('[data-font-set]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-font-set') === settings.font ? 'true' : 'false');
    });
    var r = S && S.rendition;
    if (!r) return;
    try {
      var all = r.getContents();
      (Array.isArray(all) ? all : [all]).forEach(function (c) { if (c) applyThemeToContents(c); });
    } catch (e) { /* egal */ }
    try { r.themes.fontSize(settings.fontSize + '%'); } catch (e) { /* egal */ }
    try { r.themes.font(FONTS[settings.font]); } catch (e) { /* egal */ }
  }
  function saveSettings() { lsSet('settings', settings); applySettingsToRendition(); }
  window.molitorReadingPreferences={get:function(){var o={};['fontSize','theme','font','lineHeight','spread','margin'].forEach(function(k){if(settings[k]!==undefined)o[k]=settings[k];});return o;},set:function(o){if(!o||typeof o!=='object')throw Error('Invalid preferences');if(typeof o.fontSize==='number'&&o.fontSize>=50&&o.fontSize<=300)settings.fontSize=o.fontSize;if(['hell','sepia','dunkel'].includes(o.theme))settings.theme=o.theme;if(['serif','sans'].includes(o.font))settings.font=o.font;if([1.4,1.65,1.9].includes(o.lineHeight))settings.lineHeight=o.lineHeight;if(['none','auto'].includes(o.spread))settings.spread=o.spread;if([0,12,24].includes(o.margin))settings.margin=o.margin;lsSet('settings',settings);location.reload();}};

  var readingOptions=document.createElement('div');
  readingOptions.className='set-row';
  var english=new URLSearchParams(location.search).get('lang')==='en';
  readingOptions.innerHTML='<label class="set-label" for="reading-spacing">'+(english?'Line spacing':'Zeilenabstand')+'</label><select id="reading-spacing"><option value="1.4">'+(english?'Compact':'Kompakt')+'</option><option value="1.65">'+(english?'Comfortable':'Komfortabel')+'</option><option value="1.9">'+(english?'Spacious':'Großzügig')+'</option></select><label class="set-label" for="reading-spread">'+(english?'Page layout':'Seitenlayout')+'</label><select id="reading-spread"><option value="auto">'+(english?'Automatic (two pages on wide screens)':'Automatisch (Doppelseite auf breiten Bildschirmen)')+'</option><option value="none">'+(english?'Single page':'Einzelseite')+'</option></select>';
  $('settings').appendChild(readingOptions);
  readingOptions.insertAdjacentHTML('beforeend','<label class="set-label" for="reading-margin">'+(english?'Page margins':'Seitenränder')+'</label><select id="reading-margin"><option value="0">'+(english?'Narrow':'Schmal')+'</option><option value="12">'+(english?'Medium':'Mittel')+'</option><option value="24">'+(english?'Wide':'Breit')+'</option></select>');
  $('reading-margin').value=String([0,12,24].includes(settings.margin)?settings.margin:12);
  $('reading-margin').onchange=function(){settings.margin=Number(this.value);saveSettings();};
  $('reading-spacing').value=String(settings.lineHeight||1.65);
  $('reading-spread').value=settings.spread==='none'?'none':'auto';
  $('reading-spacing').onchange=function(){settings.lineHeight=Number(this.value);saveSettings();};
  $('reading-spread').onchange=function(){settings.spread=this.value;saveSettings();if(S&&S.rendition){try{S.rendition.spread(settings.spread);}catch(e){}}};


  /* ===================== Navigation ===================== */
  function goForward() { if (S && S.rendition) S.rendition.next(); }
  function goBack() { if (S && S.rendition) S.rendition.prev(); }
  function goLeft() { if (S && S.rtl) goForward(); else goBack(); }
  function goRight() { if (S && S.rtl) goBack(); else goForward(); }

  function onKey(e) {
    if (!S || reader.hidden) return;
    if (e.key === 'Escape') { if (closeOverlays()) e.preventDefault && e.preventDefault(); return; }
    if (!drawer.hidden || isTyping(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || e.isComposing) return;
    switch (e.key) {
      case 'ArrowLeft': goLeft(); break;
      case 'ArrowRight': goRight(); break;
      case 'PageUp': goBack(); break;
      case 'PageDown': goForward(); break;
      default: return;
    }
    if (e.preventDefault) e.preventDefault();
  }

  /* ===================== Fortschritt / Kapitel ===================== */
  function onRelocated(st, loc) {
    if (!loc || !loc.start || st !== S) return;
    if(questReady)questActiveAt=Date.now();
    st.location = loc;
    var cfi = loc.start.cfi;
    var pct = null;
    if (st.locationsReady) {
      try { pct = st.book.locations.percentageFromCfi(cfi); } catch (e) { pct = null; }
      if (typeof pct !== 'number' || !isFinite(pct)) pct = typeof loc.start.percentage === 'number' ? loc.start.percentage : null;
      if (loc.atEnd) pct = 1;
      if (typeof pct === 'number' && isFinite(pct)) pct = Math.max(0, Math.min(1, pct)); else pct = null;
    }
    // Anzeige
    if (pct != null) {
      progPct.textContent = fmtPct(pct);
      if (!st.dragging) range.value = String(Math.round(pct * 1000));
      range.setAttribute('aria-valuetext', fmtPct(pct) + uiText(' gelesen',' read'));
    } else if (!st.locationsReady) {
      progPct.textContent = '–';
    }
    var disp = loc.start.displayed;
    if (st.locationsReady) {
      var pageTxt = '';
      if (disp && disp.total) pageTxt = uiText('Kapitelseite ','Chapter page ') + disp.page + uiText(' von ',' of ') + disp.total;
      try {
        var li = st.book.locations.locationFromCfi(cfi);
        var tot = st.book.locations.total;
        if (typeof li === 'number' && li >= 0 && tot > 0) pageTxt = uiText('Position ','Location ') + (li + 1) + uiText(' von ',' of ') + (tot + 1) + (pageTxt ? ' · ' + pageTxt : '');
      } catch (e) { /* egal */ }
      progPage.textContent = pageTxt;
    }
    btnPrev.disabled = !!loc.atStart; btnPrevSide.disabled = !!loc.atStart;
    btnNext.disabled = !!loc.atEnd; btnNextSide.disabled = !!loc.atEnd;

    markCurrentChapter(st, loc);
    updateBookmarkButton(st);

    // Speichern
    if (st.key) {
      var prev = lsGet('pos:' + st.key, {}) || {};
      lsSet('pos:' + st.key, { cfi: cfi, pct: pct != null ? pct : prev.pct || 0, time: Date.now() });
      clearTimeout(st.saveTimer);
      if (idbOk && pct != null) {
        st.saveTimer = setTimeout(function () {
          idbUpdateMeta(st.key, { pct: pct, time: Date.now() }).catch(function () {});
        }, 1500);
      }
    }
  }

  function spineIndexOf(book, href) {
    if (!href) return -1;
    try {
      var s = book.spine.get(href);
      if (s && typeof s.index === 'number') return s.index;
    } catch (e) { /* weiter */ }
    var clean = String(href).split('#')[0];
    try { clean = decodeURIComponent(clean); } catch (e) { /* egal */ }
    clean = clean.replace(/^(\.\.\/|\.\/)+/, '');
    var items = (book.spine && book.spine.spineItems) || [];
    for (var i = 0; i < items.length; i++) {
      var h = String(items[i].href || '');
      try { h = decodeURIComponent(h); } catch (e) { /* egal */ }
      if (h === clean || h.slice(-clean.length - 1) === '/' + clean || clean.slice(-h.length - 1) === '/' + h) return items[i].index;
    }
    return -1;
  }

  function buildToc(st, toc) {
    clear(tocList);
    st.tocLinks = [];
    function walk(items, parent, depth) {
      items.forEach(function (item) {
        var label = String(item.label || '').trim() || uiText('Ohne Titel','Untitled');
        var a = el('a', { href: '#', text: label });
        var entry = { label: label, href: item.href, index: spineIndexOf(st.book, item.href), a: a, depth: depth };
        st.tocLinks.push(entry);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          closeDrawer();
          st.rendition.display(item.href).catch(function () {
            if (entry.index >= 0) return st.rendition.display(entry.index);
            throw new Error('x');
          }).catch(function () { toast(uiText("Dieses Kapitel konnte nicht geöffnet werden.","Could not open this chapter.")); });
        });
        var li = el('li', null, [a]);
        if (item.subitems && item.subitems.length) {
          var ol = el('ol');
          walk(item.subitems, ol, depth + 1);
          li.appendChild(ol);
        }
        parent.appendChild(li);
      });
    }
    walk(toc, tocList, 0);
    if (!toc.length) tocList.appendChild(el('li', { class: 'pane-note', text: 'Dieses Buch hat kein Inhaltsverzeichnis.' }));
  }

  function chapterEntryFor(st, index) {
    var best = null;
    for (var i = 0; i < st.tocLinks.length; i++) {
      var t = st.tocLinks[i];
      if (t.index < 0) continue;
      if (t.index === index) return t;
      if (t.index < index && (!best || t.index >= best.index)) best = t;
    }
    return best;
  }
  function chapterLabel(st, index) {
    var e = chapterEntryFor(st, index);
    return e ? e.label : (typeof index === 'number' ? uiText('Abschnitt ','Section ') + (index + 1) : '');
  }

  function markCurrentChapter(st, loc) {
    var idx = loc && loc.start ? loc.start.index : -1;
    var cur = chapterEntryFor(st, idx);
    st.tocLinks.forEach(function (t) {
      var on = t === cur;
      t.a.classList.toggle('current', on);
      if (on) t.a.setAttribute('aria-current', 'true'); else t.a.removeAttribute('aria-current');
    });
    rChapter.textContent = cur ? cur.label : '';
  }

  /* ===================== Fortschrittsregler ===================== */
  range.addEventListener('input', function () {
    if (!S || !S.locationsReady) return;
    S.dragging = true;
    progPct.textContent = fmtPct(range.value / 1000);
  });
  range.addEventListener('change', function () {
    if (!S || !S.locationsReady) return;
    S.dragging = false;
    var p = Math.max(0, Math.min(1, range.value / 1000));
    var cfi = null;
    try { cfi = S.book.locations.cfiFromPercentage(p); } catch (e) { cfi = null; }
    if (cfi) S.rendition.display(cfi).catch(function () { toast(uiText("Diese Stelle konnte nicht angezeigt werden.","This location could not be displayed.")); });
  });

  /* ===================== Lesezeichen ===================== */
  function cfiCompare(a, b) {
    try {
      if (window.ePub && window.ePub.CFI) return new window.ePub.CFI().compare(a, b);
    } catch (e) { /* weiter */ }
    return a === b ? 0 : (a < b ? -1 : 1);
  }
  function markIndexAtLocation(st) {
    var loc = st.location;
    if (!loc || !loc.start) return -1;
    for (var i = 0; i < st.marks.length; i++) {
      var c = st.marks[i].cfi;
      if (c === loc.start.cfi) return i;
      if (loc.end && loc.end.cfi) {
        try { if (cfiCompare(c, loc.start.cfi) >= 0 && cfiCompare(c, loc.end.cfi) <= 0) return i; } catch (e) { /* egal */ }
      }
    }
    return -1;
  }
  function updateBookmarkButton(st) {
    var on = markIndexAtLocation(st) >= 0;
    btnBookmark.setAttribute('aria-pressed', on ? 'true' : 'false');
    btnBookmark.setAttribute('aria-label', on ? 'Lesezeichen entfernen' : 'Lesezeichen setzen');
  }
  function currentExcerpt(st) {
    try {
      var loc = st.location;
      var contents = st.rendition.getContents();
      contents = Array.isArray(contents) ? contents : [contents];
      for (var i = 0; i < contents.length; i++) {
        var c = contents[i];
        if (c.sectionIndex !== loc.start.index) continue;
        var start = c.range(loc.start.cfi);
        var r = c.document.createRange();
        r.setStart(start.startContainer, start.startOffset);
        if (loc.end && loc.end.index === loc.start.index) {
          var end = c.range(loc.end.cfi);
          r.setEnd(end.startContainer, end.startOffset);
        } else {
          r.setEndAfter(c.document.body.lastChild || c.document.body);
        }
        var text = String(r.toString()).replace(/\s+/g, ' ').trim();
        if (text) return text.length > 140 ? text.slice(0, 140).replace(/\s\S*$/, '') + ' …' : text;
      }
    } catch (e) { /* egal */ }
    return '';
  }
  function toggleBookmark() {
    var st = S;
    if (!st || !st.location) return;
    var idx = markIndexAtLocation(st);
    if (idx >= 0) {
      st.marks.splice(idx, 1);
      toast(uiText("Lesezeichen entfernt","Bookmark removed"));
    } else {
      var loc = st.location;
      var pct = null;
      if (st.locationsReady) { try { pct = st.book.locations.percentageFromCfi(loc.start.cfi); } catch (e) { pct = null; } }
      st.marks.push({ cfi: loc.start.cfi, index: loc.start.index, chapter: chapterLabel(st, loc.start.index), pct: pct, text: currentExcerpt(st), time: Date.now() });
      st.marks.sort(function (a, b) { try { return cfiCompare(a.cfi, b.cfi); } catch (e) { return 0; } });
      toast(uiText("Lesezeichen gesetzt","Bookmark added"));
    }
    lsSet('marks:' + st.key, st.marks);
    renderMarks(st);
    updateBookmarkButton(st);
  }
  function renderMarks(st) {
    clear(marksList);
    if (!st.marks.length) {
      marksList.appendChild(el('li', { class: 'pane-note', text: 'Noch keine Lesezeichen gesetzt.' }));
      return;
    }
    st.marks.forEach(function (m, i) {
      var meta = [m.chapter || 'Lesezeichen'];
      if (typeof m.pct === 'number') meta.push(fmtPct(m.pct));
      try { meta.push(new Date(m.time).toLocaleDateString('de-DE')); } catch (e) { /* egal */ }
      var a = el('a', { href: '#' }, [el('small', { text: meta.join(' · ') }), m.text || 'Gespeicherte Stelle']);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
        st.rendition.display(m.cfi).catch(function () { toast(uiText("Diese Stelle konnte nicht angezeigt werden.","This location could not be displayed.")); });
      });
      var rm = el('button', { class: 'remove', type: 'button', 'aria-label': 'Lesezeichen entfernen', title: 'Entfernen', text: '×' });
      rm.addEventListener('click', function () {
        st.marks.splice(i, 1);
        lsSet('marks:' + st.key, st.marks);
        renderMarks(st);
        updateBookmarkButton(st);
      });
      marksList.appendChild(el('li', null, [a, rm]));
    });
  }

  /* ===================== Suche ===================== */
  function highlightInto(node, text, q) {
    var lower = text.toLowerCase(), ql = q.toLowerCase(), pos = 0, i;
    while ((i = lower.indexOf(ql, pos)) !== -1) {
      if (i > pos) node.appendChild(document.createTextNode(text.slice(pos, i)));
      node.appendChild(el('mark', { text: text.slice(i, i + q.length) }));
      pos = i + q.length;
    }
    if (pos < text.length) node.appendChild(document.createTextNode(text.slice(pos)));
  }

  function runSearch(q) {
    var st = S;
    if (!st) return;
    q = String(q || '').trim();
    var token = ++st.searchToken;
    clear(searchResults);
    if (q.length < 2) { searchStatus.textContent = uiText("Bitte gib mindestens 2 Zeichen ein.","Enter at least 2 characters."); return; }
    var items = (st.book.spine && st.book.spine.spineItems) || [];
    var total = 0, LIMIT = 300, i = 0;
    searchStatus.textContent = uiText("Suche läuft …","Searching …");

    function step() {
      if (token !== st.searchToken || S !== st) return;
      if (i >= items.length || total >= LIMIT) {
        searchStatus.textContent = total === 0
          ? uiText('Keine Treffer für „','No results for “') + q + uiText('“.','”.')
          : (total >= LIMIT ? uiText('Mindestens ','At least ') + LIMIT + uiText(' Treffer – angezeigt werden bis zu ',' results – showing up to ') + LIMIT : total + (total === 1 ? uiText(' Treffer',' result') : uiText(' Treffer',' results')) + uiText(' für „',' for “') + q + uiText('“.','”.'));
        return;
      }
      var item = items[i++];
      searchStatus.textContent = uiText('Suche läuft … (','Searching … (') + i + uiText(' von ',' of ') + items.length + ')';
      Promise.resolve().then(function () {
        return item.load(st.book.load.bind(st.book));
      }).then(function () {
        var found = [];
        try { found = item.find(q) || []; } catch (e) { found = []; }
        try { item.unload(); } catch (e) { /* egal */ }
        if (token !== st.searchToken || S !== st) return;
        var label = chapterLabel(st, item.index);
        found.forEach(function (r) {
          if (total >= LIMIT) return;
          total++;
          var a = el('a', { href: '#' }, [el('small', { text: label })]);
          var ex = el('span');
          highlightInto(ex, String(r.excerpt || '').replace(/\s+/g, ' ').trim(), q);
          a.appendChild(ex);
          a.addEventListener('click', function (e) {
            e.preventDefault();
            closeDrawer();
            showSearchHit(st, r.cfi);
          });
          searchResults.appendChild(el('li', null, [a]));
        });
      }).catch(function () {
        try { item.unload(); } catch (e) { /* egal */ }
      }).then(nextTick).then(step);
    }
    step();
  }

  function showSearchHit(st, cfi) {
    st.rendition.display(cfi).then(function () {
      try {
        if (st.hl) st.rendition.annotations.remove(st.hl, 'highlight');
        st.rendition.annotations.highlight(cfi, {}, null, 'search-hl', { fill: '#ffd54a', 'fill-opacity': '0.45', 'mix-blend-mode': 'multiply' });
        st.hl = cfi;
      } catch (e) { /* Markierung optional */ }
    }).catch(function () { toast(uiText("Diese Stelle konnte nicht angezeigt werden.","This location could not be displayed.")); });
  }

  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    runSearch(searchInput.value);
  });

  /* ===================== Seitenleiste ===================== */
  function selectTab(name, focusTab) {
    Object.keys(tabs).forEach(function (k) {
      var on = k === name;
      tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[k].tabIndex = on ? 0 : -1;
      panes[k].hidden = !on;
    });
    if (focusTab) tabs[name].focus();
  }
  function openDrawer(name) {
    if (!S) return;
    closeSettings();
    lastFocus = document.activeElement;
    selectTab(name || 'toc');
    drawer.hidden = false;
    backdrop.hidden = false;
    if (name === 'search') {
      setTimeout(function () { searchInput.focus(); searchInput.select(); }, 30);
    } else {
      tabs[name || 'toc'].focus();
      if (name === 'toc' || !name) {
        var cur = tocList.querySelector('a.current');
        if (cur) try { cur.scrollIntoView({ block: 'center' }); } catch (e) { /* egal */ }
      }
    }
  }
  function closeDrawer() {
    if (drawer.hidden) return false;
    drawer.hidden = true;
    backdrop.hidden = true;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    return true;
  }
  Object.keys(tabs).forEach(function (k, idx, keys) {
    tabs[k].addEventListener('click', function () { selectTab(k); if (k === 'search') searchInput.focus(); });
    tabs[k].addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.key === 'Home') { selectTab(keys[0], true); e.preventDefault(); return; }
      if (e.key === 'End') { selectTab(keys[keys.length - 1], true); e.preventDefault(); return; }
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      selectTab(keys[(idx + d + keys.length) % keys.length], true);
    });
  });
  btnToc.addEventListener('click', function () { openDrawer('toc'); });
  btnSearch.addEventListener('click', function () { openDrawer('search'); });
  drawerClose.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  /* ===================== Darstellung ===================== */
  function openSettings() {
    settingsBox.hidden = false;
    btnSettings.setAttribute('aria-expanded', 'true');
  }
  function closeSettings() {
    if (settingsBox.hidden) return false;
    settingsBox.hidden = true;
    btnSettings.setAttribute('aria-expanded', 'false');
    return true;
  }
  btnSettings.addEventListener('click', function (e) {
    e.stopPropagation();
    if (settingsBox.hidden) openSettings(); else closeSettings();
  });
  document.addEventListener('click', function (e) {
    if (!settingsBox.hidden && !settingsBox.contains(e.target) && !btnSettings.contains(e.target)) closeSettings();
  });
  fontDec.addEventListener('click', function () { settings.fontSize = Math.max(80, settings.fontSize - 10); saveSettings(); });
  fontInc.addEventListener('click', function () { settings.fontSize = Math.min(200, settings.fontSize + 10); saveSettings(); });
  document.querySelectorAll('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { settings.theme = b.getAttribute('data-theme-set'); saveSettings(); });
  });
  document.querySelectorAll('[data-font-set]').forEach(function (b) {
    b.addEventListener('click', function () { settings.font = b.getAttribute('data-font-set'); saveSettings(); });
  });
  // Pfeiltasten in den Radiogruppen
  document.querySelectorAll('#settings [role="radiogroup"]').forEach(function (g) {
    g.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      var btns = Array.prototype.slice.call(g.querySelectorAll('[role="radio"]'));
      var i = btns.indexOf(document.activeElement);
      var n = btns[(i + d + btns.length) % btns.length];
      n.focus(); n.click();
    });
  });

  /* ===================== Vollbild ===================== */
  var fsTarget = document.documentElement;
  var fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  if (!fsSupported) btnFullscreen.hidden = true;
  btnFullscreen.addEventListener('click', function () {
    try {
      if (fsElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        var req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen;
        var p = req && req.call(fsTarget);
        if (p && p.catch) p.catch(function () { toast(uiText("Vollbild ist hier nicht möglich.","Fullscreen is unavailable here.")); });
      }
    } catch (e) { toast(uiText("Vollbild ist hier nicht möglich.","Fullscreen is unavailable here.")); }
  });
  function onFsChange() {
    var on = !!fsElement();
    btnFullscreen.setAttribute('aria-label', on ? 'Vollbild beenden' : 'Vollbild');
    btnFullscreen.title = on ? 'Vollbild beenden' : 'Vollbild';
    btnFullscreen.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  /* ===================== Ansicht wechseln ===================== */
  function setLoading(on, text) {
    loading.hidden = !on;
    if (text) loadingText.textContent = text;
  }
  function showReader() {
    if (!reader.hidden) return;
    home.hidden = true;
    reader.hidden = false;
    document.body.classList.add('reading');
    try { if (!(history.state && history.state.epubReader)) history.pushState({ epubReader: true }, ''); } catch (e) { /* egal */ }
    btnClose.focus();
  }
  function resetReaderUi() {
    clear(tocList); clear(searchResults); clear(marksList);
    searchStatus.textContent = ''; searchInput.value = '';
    rTitle.textContent = uiText('Buch','Book'); rChapter.textContent = '';
    range.value = '0'; range.disabled = true; range.removeAttribute('aria-valuetext');
    progPct.textContent = '–'; progPage.textContent = '';
    btnBookmark.setAttribute('aria-pressed', 'false');
    [btnPrev, btnNext, btnPrevSide, btnNextSide].forEach(function (b) { b.disabled = false; });
    closeSettings();
    drawer.hidden = true; backdrop.hidden = true;
    selectTab('toc');
  }
  function destroySession() {
    questReady=false;
    stopSpeech();
    ['highlight-dialog','note-dialog'].forEach(function(id){var d=$(id);if(d&&d.open)d.close();});
    document.body.classList.remove('focus-mode');
    var st = S;
    S = null;
    session++;
    if (st) {
      clearTimeout(st.saveTimer);
      st.searchToken++;
      try { if (st.rendition) st.rendition.destroy(); } catch (e) { /* egal */ }
      try { st.book.destroy(); } catch (e) { /* egal */ }
    }
    clear($('viewer'));
    resetReaderUi();
  }
  function closeBook(opts) {
    openRequest++;
    opts = opts || {};
    destroySession();
    if (fsElement()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* egal */ } }
    reader.hidden = true;
    home.hidden = false;
    document.body.classList.remove('reading');
    document.title = baseTitle;
    // ?book= entfernen, damit ein Neuladen nicht erneut öffnet
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('book')) { u.searchParams.delete('book'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
    } catch (e) { /* egal */ }
    if (!opts.fromPop) {
      try { if (history.state && history.state.epubReader) { ignorePop = true; history.back(); } } catch (e) { /* egal */ }
    }
    renderLibrary();
    renderRecent();
    if (!opts.silent) try { dropzone.focus({ preventScroll: true }); } catch (e) { /* egal */ }
  }
  var baseTitle = document.title;
  var ignorePop = false;
  window.addEventListener('popstate', function () {
    if (ignorePop) { ignorePop = false; return; }
    if (!reader.hidden) closeBook({ fromPop: true });
  });

  function closeOverlays() {
    return closeSettings() || closeDrawer();
  }

  /* ===================== Ereignisse: Startseite ===================== */
  // Original bilingual sample, generated locally as a valid EPUB 3 archive.
  var sampleButton = document.createElement('button');
  sampleButton.type = 'button';
  sampleButton.className = 'btn';
  sampleButton.id = 'reader-sample';
  sampleButton.style.cssText = 'display:block;margin:12px auto;min-height:44px;max-width:100%;';
  function sampleLabel() { sampleButton.textContent = uiText('Beispielbuch lesen','Try a sample book'); }
  var sampleChoice=document.createElement('select');sampleChoice.id='reader-sample-choice';sampleChoice.style.cssText='display:block;margin:12px auto;min-height:44px;max-width:100%;padding:8px;border-radius:10px';
  function updateSampleChoices(){var previous=sampleChoice.value;sampleChoice.setAttribute('aria-label',uiText('Beispielbuch auswählen','Choose a sample book'));sampleChoice.replaceChildren();[uiText('Jenseits des blauen Horizonts','Beyond the Blue Horizon'),uiText('Der Mitternachtsgarten','The Midnight Garden'),uiText('Die Kunst der kleinen Schritte','The Art of Small Steps')].forEach(function(t,i){sampleChoice.add(new Option(t,String(i)));});sampleChoice.value=previous||'0';}
  updateSampleChoices();sampleLabel();
  var languageSelect = document.getElementById('reader-language');
  if (languageSelect) languageSelect.addEventListener('change', function () { setTimeout(function(){sampleLabel();updateSampleChoices();}, 0); });
  dropzone.insertAdjacentElement('afterend', sampleButton);sampleButton.before(sampleChoice);
  sampleButton.addEventListener('click', async function () {
    sampleButton.disabled = true;
    try {
      if (typeof JSZip !== 'function') throw new Error('JSZip unavailable');
      var en = uiText('de','en') === 'en';
      var lang = en ? 'en' : 'de';
      var catalog = [
        {id:'stars',title:en?'Beyond the Blue Horizon':'Jenseits des blauen Horizonts',chapters:en?['The signal','A silent moon','The return']:['Das Signal','Ein stiller Mond','Die Rückkehr'],paragraphs:en?['Mira watched the stars from the observation deck. A faint pulse appeared on the receiver, repeating every eleven seconds. She checked the instruments twice before waking the crew.','The expedition reached a moon covered in silver dust. Beneath the surface, a forgotten beacon was still transmitting. Its message was not a warning, but a map of the sky.','Mira carried the map home. The discovery raised more questions than it answered, and for the first time in years she felt that the universe was inviting her to explore.']:['Mira beobachtete die Sterne vom Aussichtsdeck. Ein schwacher Impuls erschien auf dem Empfänger und wiederholte sich alle elf Sekunden. Sie prüfte die Instrumente zweimal, bevor sie die Besatzung weckte.','Die Expedition erreichte einen Mond aus silbernem Staub. Unter seiner Oberfläche sendete ein vergessener Leuchtturm. Seine Botschaft war keine Warnung, sondern eine Karte des Himmels.','Mira brachte die Karte nach Hause. Die Entdeckung warf mehr Fragen auf, als sie beantwortete. Zum ersten Mal seit Jahren fühlte sie sich vom Universum zum Entdecken eingeladen.']},
        {id:'garden',title:en?'The Midnight Garden':'Der Mitternachtsgarten',chapters:en?['The hidden gate','The lantern','Morning light']:['Das verborgene Tor','Die Laterne','Morgenlicht'],paragraphs:en?['Behind the old house, a narrow path led to a gate covered in ivy. Elin found a small brass key beneath a flowerpot and turned it carefully.','Inside, pale flowers opened under the moon. A lantern hung from a tree, illuminating a notebook filled with drawings of plants and birds. Elin recognized her grandmother’s handwriting.','At dawn she returned with a pencil. The garden was not a secret to keep forever, but a place to care for. She began with a single page of her own.']:['Hinter dem alten Haus führte ein schmaler Pfad zu einem Tor voller Efeu. Elin fand einen kleinen Messingschlüssel unter einem Blumentopf und drehte ihn vorsichtig.','Im Inneren öffneten sich helle Blüten unter dem Mond. Eine Laterne beleuchtete ein Notizbuch voller Zeichnungen von Pflanzen und Vögeln. Elin erkannte die Handschrift ihrer Großmutter.','Bei Sonnenaufgang kehrte sie mit einem Bleistift zurück. Der Garten war kein Geheimnis für die Ewigkeit, sondern ein Ort, den es zu pflegen galt. Sie begann mit einer eigenen Seite.']},
        {id:'focus',title:en?'The Art of Small Steps':'Die Kunst der kleinen Schritte',chapters:en?['Begin simply','Make room','Keep going']:['Einfach beginnen','Raum schaffen','Weitergehen'],paragraphs:en?['A large goal can feel distant. Choose one action that fits into today, and make it specific enough to begin without further planning.','Remove one distraction from your surroundings. A quiet corner, a notebook or a short walk can create room for deliberate attention.','Review what worked without demanding perfection. Small experiments help you discover a routine that fits your life.']:['Ein großes Ziel kann weit entfernt wirken. Wähle eine Handlung, die in den heutigen Tag passt und ohne weitere Planung beginnen kann.','Entferne eine Ablenkung aus deiner Umgebung. Eine ruhige Ecke, ein Notizbuch oder ein kurzer Spaziergang können Raum für Aufmerksamkeit schaffen.','Prüfe, was funktioniert hat, ohne Perfektion zu verlangen. Kleine Experimente helfen dir, eine passende Routine zu entdecken.']}
      ];
      var selected = catalog[Number(sampleChoice.value)] || catalog[0];
      var title=selected.title,chapters=selected.chapters,paragraphs=selected.paragraphs;
      var zip = new JSZip();
      zip.file('mimetype','application/epub+zip',{compression:'STORE'});
      zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
      var palettes={stars:['#101b38','#74b9ed','<circle cx="180" cy="135" r="85" fill="#74b9ed" opacity=".8"/><ellipse cx="180" cy="135" rx="125" ry="25" fill="none" stroke="#fff" transform="rotate(-25 180 135)"/>'],garden:['#102d29','#9bd7a7','<path d="M75 310V150Q180 20 285 150V310M180 310V95M75 230H285" stroke="#9bd7a7" stroke-width="8" fill="none"/>'],focus:['#332c50','#e9c889','<path d="M65 290H140V240H215V190H290V140" fill="none" stroke="#e9c889" stroke-width="15"/>']};var palette=palettes[selected.id];var xmlEscape=function(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};var lines=title.split(' '), line='',coverLines=[];lines.forEach(function(word){if(line && (line+' '+word).length>19){coverLines.push(line);line=word;}else{line+=(line?' ':'')+word;}});if(line)coverLines.push(line);zip.file('EPUB/cover.svg','<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520"><rect width="360" height="520" fill="'+palette[0]+'"/>'+palette[2]+'<g font-family="serif" font-size="26" fill="#fff" text-anchor="middle">'+coverLines.map(function(t,i){return '<text x="180" y="'+(355+i*32)+'">'+xmlEscape(t)+'</text>';}).join('')+'</g><text x="180" y="484" font-family="sans-serif" font-size="13" text-anchor="middle" fill="'+palette[1]+'">'+(en?'ORIGINAL SAMPLE BOOK':'ORIGINAL-LESEPROBE')+'</text></svg>');var manifest = '<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>', spine = '', nav = '';
      chapters.forEach(function (heading,i) {
        var name = 'chapter'+i+'.xhtml';
        manifest += '<item id="c'+i+'" href="'+name+'" media-type="application/xhtml+xml"/>';
        spine += '<itemref idref="c'+i+'"/>';
        nav += '<li><a href="'+name+'">'+heading+'</a></li>';
        zip.file('EPUB/'+name,'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" lang="'+lang+'"><head><title>'+heading+'</title></head><body><h1>'+heading+'</h1><p>'+paragraphs[i]+'</p></body></html>');
      });
      zip.file('EPUB/nav.xhtml','<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>'+nav+'</ol></nav></body></html>');
      zip.file('EPUB/package.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:molitor:sample:'+selected.id+':'+lang+'</dc:identifier><dc:title>'+title+'</dc:title><dc:language>'+lang+'</dc:language><meta property="dcterms:modified">2026-11-27T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'+manifest+'</manifest><spine>'+spine+'</spine></package>');
      var bytes = await zip.generateAsync({type:'uint8array',compression:'STORE'});
      openFile(new File([bytes], 'reader-sample-'+selected.id+'-'+lang+'.epub', {type:'application/epub+zip'}));
    } catch (err) {
      homeMessage(uiText('Beispielbuch konnte nicht geöffnet werden. Bitte lade die Seite neu.','Could not open the sample book. Please reload the page.'),true);
    } finally { sampleButton.disabled = false; }
  });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) openFile(f);
  });
  recentClear.addEventListener('click', function () {
    if (!confirm(uiText('Alle lokal gespeicherten Bücher entfernen? Deine Originaldateien bleiben erhalten.','Remove all locally saved books? Your original files will remain unchanged.'))) return;
    idbClear().then(function () {
      renderRecent();
      homeMessage(uiText("Die Liste „Zuletzt gelesen“ wurde geleert.","Recently read list cleared."));
    }).catch(function () { homeMessage(uiText("Die Liste konnte nicht geleert werden.","Could not clear the list."), true); });
  });

  // Drag & Drop (überall auf der Seite)
  var dragDepth = 0;
  function hasFiles(e) {
    var t = e.dataTransfer && e.dataTransfer.types;
    if (!t) return false;
    for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
    return false;
  }
  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
    dropzone.classList.add('over');
  });
  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) { dropOverlay.hidden = true; dropzone.classList.remove('over'); }
  });
  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    dropzone.classList.remove('over');
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });

  /* ===================== Ereignisse: Leseansicht ===================== */
  btnPrev.addEventListener('click', goBack);
  btnNext.addEventListener('click', goForward);
  btnPrevSide.addEventListener('click', goLeft);
  btnNextSide.addEventListener('click', goRight);
  btnBookmark.addEventListener('click', toggleBookmark);
  btnClose.addEventListener('click', function () { closeBook(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('pagehide', function () {
    if (S && S.key && S.location) lsSet('pos:' + S.key, Object.assign(lsGet('pos:' + S.key, {}) || {}, { cfi: S.location.start.cfi, time: Date.now() }));
  });

  var shelfSearchTimer; $('shelf-search').addEventListener('input',function(){clearTimeout(shelfSearchTimer);shelfSearchTimer=setTimeout(renderRecent,180);});
  var nd=$('note-dialog'), nt=$('note-text'), nl=$('note-list'), ns=$('note-status'), speak=$('btn-speak');
  function notes(){var a=S&&S.key?lsGet('notes:'+S.key,[]):[];return Array.isArray(a)?a:[];}
  function showNotes(){clear(nl);notes().forEach(function(n,i){var jump=el('button',{type:'button',text:n.text});jump.addEventListener('click',function(){if(S&&S.rendition){nd.close();S.rendition.display(n.cfi).catch(function(){toast(uiText("Stelle nicht verfügbar","Location unavailable"));});}});var del=el('button',{type:'button',text:uiText("Löschen","Delete")});del.addEventListener('click',function(){var a=notes();a.splice(i,1);if(lsSet('notes:'+S.key,a))showNotes();else ns.textContent=uiText("Speichern fehlgeschlagen","Could not save");});nl.appendChild(el('li',null,[jump,del]));});}
  $('btn-note').addEventListener('click',function(){if(!S||!S.key||!S.location||!S.location.start)return;nt.value='';ns.textContent='';showNotes();nd.showModal();});
  $('note-close').addEventListener('click',function(){nd.close();});
  $('note-save').addEventListener('click',function(){if(!S||!S.location||!nt.value.trim())return;var a=notes();a.push({cfi:S.location.start.cfi,text:nt.value.trim()});if(lsSet('notes:'+S.key,a)){questAdd('note',1);nt.value='';ns.textContent=uiText("Gespeichert","Saved");showNotes();}else ns.textContent=uiText("Speicher nicht verfügbar","Storage unavailable");});
  function stopSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speak.setAttribute('aria-pressed','false');}
  if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))speak.hidden=true;
  speak.addEventListener('click',function(){if(speak.getAttribute('aria-pressed')==='true'){stopSpeech();return;}if(!S||!S.rendition)return;var voices=window.speechSynthesis.getVoices().filter(function(v){return v.localService;});if(!voices.length){toast(uiText("Keine lokale Vorlesestimme verfügbar.","No local speech voice available."));return;}var contents=S.rendition.getContents()[0];if(!contents||!contents.document.body)return;var lang=contents.document.documentElement.lang||'de';var voice=voices.find(function(v){return v.lang.split('-')[0]===lang.split('-')[0];});if(!voice){toast(uiText("Keine passende lokale Stimme verfügbar.","No matching local speech voice available."));return;}var text=contents.document.body.innerText.trim().slice(0,12000);if(!text)return;var u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.onend=u.onerror=stopSpeech;speak.setAttribute('aria-pressed','true');window.speechSynthesis.speak(u);});
  btnClose.addEventListener('click',stopSpeech);window.addEventListener('pagehide',stopSpeech);
  function paintHighlight(st,h){try{st.rendition.annotations.highlight(h.cfi,{},null,'molitor-highlight',{fill:h.color,'fill-opacity':'0.35','mix-blend-mode':'multiply'});}catch(e){toast(uiText("Markierung konnte nicht angezeigt werden.","Could not display highlight."));}}
  function renderHighlights(){var list=$('highlight-list');clear(list);if(!S)return;$('highlight-status').textContent=S.pendingHighlight?uiText("Farbe für ausgewählten Text wählen.","Choose a color for the selected text."):uiText("Text im Buch auswählen, um eine Markierung hinzuzufügen.","Select text in the book to add a highlight.");document.querySelectorAll('[data-highlight]').forEach(function(b){b.disabled=!S.pendingHighlight;});(S.highlights||[]).forEach(function(h,i){var jump=el('button',{type:'button',text:h.text||uiText("Markierte Stelle","Highlighted passage")});jump.addEventListener('click',function(){$('highlight-dialog').close();S.rendition.display(h.cfi).catch(function(){toast(uiText("Stelle nicht verfügbar","Location unavailable"));});});var del=el('button',{type:'button',text:uiText("Löschen","Delete")});del.addEventListener('click',function(){var next=S.highlights.filter(function(_,j){return j!==i;});if(!lsSet('highlights:'+S.key,next)){toast(uiText("Speicher nicht verfügbar","Storage unavailable"));return;}S.rendition.annotations.remove(h.cfi,'highlight');S.highlights=next;renderHighlights();});list.appendChild(el('li',null,[jump,del]));});}
  $('btn-highlight').addEventListener('click',function(){if(!S||!S.key)return;renderHighlights();$('highlight-dialog').showModal();});
  $('highlight-close').addEventListener('click',function(){$('highlight-dialog').close();});
  $('highlight-dialog').addEventListener('close',function(){if(S)S.pendingHighlight=null;});
  document.querySelectorAll('[data-highlight]').forEach(function(b){b.addEventListener('click',function(){if(!S||!S.pendingHighlight)return;var h=Object.assign({},S.pendingHighlight,{color:b.dataset.highlight});var next=(S.highlights||[]).filter(function(x){return x.cfi!==h.cfi;}).concat(h);if(!lsSet('highlights:'+S.key,next)){toast(uiText("Speicher nicht verfügbar","Storage unavailable"));return;}S.rendition.annotations.remove(h.cfi,'highlight');if(next.length>(S.highlights||[]).length)questAdd('highlight',1);S.highlights=next;paintHighlight(S,h);S.pendingHighlight=null;renderHighlights();$('highlight-dialog').close();});});

  /* Optional local reading quests. No titles, passages or account data stored. */
  var questKey='quests-v1', quest=lsGet(questKey,null), questActiveAt=0, questTick=Date.now(), questReady=false;
  function questDay(){var d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  function questNew(){return {enabled:false,xp:0,day:questDay(),counts:{open:0,minutes:0,note:0,highlight:0},claimed:{},seconds:0,days:0};}
  if(!quest||typeof quest.xp!=='number'||!quest.counts||!quest.claimed)quest=questNew();
  var questDefs=[['open',1,50,'Erstes Kapitel','First chapter','Öffne ein Buch','Open a book'],['minutes',15,100,'Deep Focus','Deep focus','15 Minuten aktive Lesezeit','15 minutes of active reading time'],['highlight',3,75,'Wissensjäger','Knowledge hunter','Speichere drei neue Markierungen','Save three new highlights'],['note',1,50,'Der Gelehrte','The scholar','Speichere eine Notiz','Save a note']];
  function questWeek(){var d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  var weeklyDefs=[['minutes',60,200,'Lesereise','Reading journey','60 Minuten aktive Lesezeit','60 minutes of active reading time'],['note',5,125,'Ideensammler','Idea collector','5 gespeicherte Notizen','5 saved notes'],['highlight',10,150,'Textentdecker','Passage explorer','10 neue Markierungen','10 new highlights']];
  function questRoll(){if(quest.week!==questWeek()||!quest.weekCounts||!quest.weekClaimed){quest.week=questWeek();quest.weekCounts={minutes:0,note:0,highlight:0};quest.weekClaimed={};}if(quest.day!==questDay()){quest.day=questDay();quest.counts={open:0,minutes:0,note:0,highlight:0};quest.claimed={};quest.seconds=0;}}
  function questSave(){return lsSet(questKey,quest);}
  function questWeekly(kind,n){var d=weeklyDefs.find(function(x){return x[0]===kind;});if(!d)return;quest.weekCounts[kind]=Math.min(d[1],(quest.weekCounts[kind]||0)+n);if(quest.weekCounts[kind]>=d[1]&&!quest.weekClaimed[kind]){quest.weekClaimed[kind]=true;quest.xp+=d[2];toast(uiText('Wochenquest abgeschlossen! +','Weekly quest complete! +')+d[2]+' XP');}}
  function questAdd(kind,n){if(!quest.enabled)return;questRoll();if(kind!=='minutes')questWeekly(kind,n);var def=questDefs.find(function(d){return d[0]===kind;});if(!def)return;quest.counts[kind]=Math.min(def[1],(quest.counts[kind]||0)+n);if(quest.counts[kind]>=def[1]&&!quest.claimed[kind]){quest.claimed[kind]=true;quest.xp+=def[2];if(questDefs.every(function(d){return quest.claimed[d[0]];}))quest.days=(quest.days||0)+1;toast(uiText('Quest abgeschlossen! +','Quest complete! +')+def[2]+' XP');}questSave();questRender();}
  var questPanel=$('reading-quests');
  function questRender(){if(!questPanel)return;questRoll();var level=1+Math.floor(quest.xp/100);$('quest-level').textContent=uiText('Level ','Level ')+level+' · '+quest.xp+' XP';$('quest-xp').value=quest.xp%100;$('quest-xp-label').textContent=(quest.xp%100)+' / 100 XP';$('quest-toggle').textContent=quest.enabled?uiText('Quests pausieren','Pause quests'):uiText('Quests aktivieren','Enable quests');$('quest-list').hidden=!quest.enabled;$('quest-xp').hidden=!quest.enabled;$('quest-xp-label').hidden=!quest.enabled;$('quest-achievement').textContent=uiText('Titel: ','Title: ')+(level>=20?'Reading Legend':level>=10?'Scholar':level>=5?'Bookworm':'Explorer');$('quest-days').textContent=uiText('Vollständige Quest-Tage: ','Completed quest days: ')+(quest.days||0);clear($('quest-list'));questDefs.forEach(function(d){var li=el('li');var count=quest.counts[d[0]]||0;li.appendChild(el('strong',{text:uiText(d[3],d[4])}));li.appendChild(el('span',{text:uiText(d[5],d[6])+' · '+count+'/'+d[1]+' · +'+d[2]+' XP'+(quest.claimed[d[0]]?' ✓':'')}));var p=document.createElement('progress');p.max=d[1];p.value=count;p.setAttribute('aria-label',uiText(d[3],d[4]));li.appendChild(p);$('quest-list').appendChild(li);});}
  function questExtras(){var list=$('quest-week-list'),ach=$('quest-badges');if(!list||!ach)return;list.hidden=ach.hidden=!quest.enabled;$('quest-week-heading').hidden=$('quest-badge-heading').hidden=!quest.enabled;$('quest-week-heading').textContent=uiText('Wochenquests','Weekly quests');$('quest-badge-heading').textContent=uiText('Erfolge','Achievements');clear(list);weeklyDefs.forEach(function(d){var li=el('li'),count=quest.weekCounts[d[0]]||0;li.appendChild(el('strong',{text:uiText(d[3],d[4])}));li.appendChild(el('span',{text:uiText(d[5],d[6])+' · '+count+'/'+d[1]+' · +'+d[2]+' XP'+(quest.weekClaimed[d[0]]?' ✓':'')}));var p=document.createElement('progress');p.max=d[1];p.value=count;p.setAttribute('aria-label',uiText(d[3],d[4]));li.appendChild(p);list.appendChild(li);});clear(ach);[['Explorer',0],['Bookworm',400],['Scholar',900],['Reading Legend',1900]].forEach(function(b){var unlocked=quest.xp>=b[1],li=el('li',{text:(unlocked?'✓ ':'○ ')+b[0]+' · '+b[1]+' XP'});li.setAttribute('data-unlocked',String(unlocked));ach.appendChild(li);});}
  var questLeagues=[['Bronze',0,'#a86d42'],['Silver',500,'#8294a8'],['Gold',1500,'#c79a36'],['Platinum',3500,'#399e9e'],['Diamond',7000,'#5489e8'],['Master',12000,'#9166d5'],['Legend',20000,'#d29632']];
  function questRank(xp){var i=0;while(i+1<questLeagues.length&&xp>=questLeagues[i+1][1])i++;var current=questLeagues[i],next=questLeagues[i+1]||null;return {index:i,current:current,next:next,remaining:next?next[1]-xp:0,progress:next?Math.max(0,Math.min(1,(xp-current[1])/(next[1]-current[1]))):1};}
  var questClasses=[['explorer','Entdecker','Explorer'],['scholar','Gelehrter','Scholar'],['archivist','Archivar','Archivist'],['strategist','Stratege','Strategist']];
  function questClass(){return questClasses.find(function(x){return x[0]===quest.readerClass;})||questClasses[0];}
  function questLeagueRender(){var panel=$('quest-league-panel');if(!panel)return;panel.hidden=!quest.enabled;var r=questRank(quest.xp),p=$('quest-league-progress'),select=$('quest-class-select');$('quest-league-title').textContent=uiText('Persönliche Liga','Personal league');$('quest-league-name').textContent=r.current[0];$('quest-league-name').style.color='inherit';p.style.accentColor=r.current[2];p.value=r.progress*100;$('quest-league-next').textContent=r.next?r.remaining+' XP '+uiText('bis','to')+' '+r.next[0]:uiText('Höchste Liga erreicht','Highest league reached');$('quest-class-label').textContent=uiText('Leserklasse','Reader class');$('quest-league-note').textContent=uiText('Dein persönlicher Rang basiert auf Gesamt-XP. Keine Online-Rangliste. Klassen sind frei wählbar und ändern keine Belohnungen.','Your personal rank is based on lifetime XP. No online leaderboard. Classes are freely selectable and do not change rewards.');if(!select.options.length){questClasses.forEach(function(a){var o=document.createElement('option');o.value=a[0];o.textContent=uiText(a[1],a[2]);select.appendChild(o);});}select.value=questClass()[0];var list=$('quest-league-list');clear(list);questLeagues.forEach(function(a,i){var li=el('li',{text:a[0]+' · '+a[1].toLocaleString(englishUI?'en':'de')+' XP'});li.dataset.rank=i===r.index?'current':i<r.index?'unlocked':'locked';if(i===r.index)li.setAttribute('aria-current','true');list.appendChild(li);});}
  var questRewards=[{level:1,name:'First Light',de:'Erstes Licht',frame:'slate',symbol:'✧'},{level:2,name:'Page Turner',de:'Seitenstürmer',frame:'bronze',symbol:'✦'},{level:3,name:'Blue Horizon',de:'Blauer Horizont',frame:'blue',symbol:'◇'},{level:5,name:'Bookworm',de:'Bücherwurm',frame:'emerald',symbol:'✿'},{level:10,name:'Scholar',de:'Gelehrter',frame:'violet',symbol:'✷'},{level:20,name:'Reading Legend',de:'Leselegende',frame:'gold',symbol:'♛'},{level:35,name:'Platinum Archive',de:'Platinarchiv',frame:'platinum',symbol:'⬡'},{level:70,name:'Diamond Mind',de:'Diamantgeist',frame:'diamond',symbol:'◆'},{level:120,name:'Grand Master',de:'Großmeister',frame:'master',symbol:'✵'},{level:200,name:'Eternal Library',de:'Ewige Bibliothek',frame:'legend',symbol:'✹'}];
  function questRewardState(xp){var level=1+Math.floor(Math.max(0,xp)/100),available=questRewards.filter(function(r){return r.level<=level;});return {level:level,available:available,next:questRewards.find(function(r){return r.level>level;})||null};}
  function questRewardRender(){var panel=$('quest-reward-panel');if(!panel)return;panel.hidden=!quest.enabled;var state=questRewardState(quest.xp),selected=state.available.find(function(r){return r.frame===quest.rewardFrame;})||state.available[0],list=$('quest-reward-list');$('quest-reward-heading').textContent=uiText('Sammlung der Auszeichnungen','Reward collection');$('quest-reward-sub').textContent=uiText('Bei jedem Levelaufstieg wächst dein Rang. Meilensteine schalten besondere Abzeichen und Rahmen frei.','Every level increases your rank. Milestones unlock special badges and frames.');$('quest-reward-next').textContent=state.next?uiText('Nächste Auszeichnung: ','Next reward: ')+uiText(state.next.de,state.next.name)+' · Level '+state.next.level+' · '+((state.next.level-1)*100-quest.xp)+' XP':uiText('Alle Meilensteine freigeschaltet','All milestones unlocked');$('quest-reward-profile').dataset.frame=selected.frame;$('quest-reward-symbol').textContent=selected.symbol;$('quest-reward-equipped').textContent=uiText(selected.de,selected.name)+' · Level '+state.level;clear(list);questRewards.forEach(function(r){var unlocked=r.level<=state.level,li=el('li'),b=el('button',{type:'button'});b.disabled=!unlocked;b.dataset.frame=r.frame;b.setAttribute('aria-pressed',String(selected.frame===r.frame));b.appendChild(el('span',{class:'quest-medal',text:r.symbol}));b.appendChild(el('strong',{text:uiText(r.de,r.name)}));b.appendChild(el('small',{text:'Level '+r.level+' · '+(unlocked?uiText('Freigeschaltet','Unlocked'):uiText('Gesperrt','Locked'))}));b.onclick=function(){if(!unlocked)return;quest.rewardFrame=r.frame;questSave();questRewardRender();};li.appendChild(b);list.appendChild(li);});}
  var questLastLevel=1+Math.floor(quest.xp/100);
  function questLevelNotice(){var level=1+Math.floor(quest.xp/100);if(quest.enabled&&level>questLastLevel){var milestones=questRewards.filter(function(r){return r.level>questLastLevel&&r.level<=level;});var msg=uiText('Levelaufstieg! Level ','Level up! Level ')+level;if(milestones.length)msg+=' · '+uiText('Neu: ','Unlocked: ')+milestones.map(function(r){return uiText(r.de,r.name);}).join(', ');var banner=$('quest-level-notice');if(banner){banner.textContent=msg;banner.hidden=false;}toast(msg);}questLastLevel=level;}
  function questSummary(){var daily=questDefs.filter(function(d){return quest.claimed[d[0]];}).length,weekly=weeklyDefs.filter(function(d){return quest.weekClaimed[d[0]];}).length;return {daily:daily,weekly:weekly,level:1+Math.floor(quest.xp/100),next:100-quest.xp%100};}
  function questStatus(){var info=questSummary(),hud=$('quest-reader-hud'),summary=$('quest-summary'),next=$('quest-next-level');if(hud){hud.hidden=!quest.enabled;hud.textContent=uiText('Level ','Level ')+info.level+' · '+questRank(quest.xp).current[0]+' · '+quest.xp+' XP · '+info.daily+'/'+questDefs.length+uiText(' Tagesquests',' daily quests');}if(summary){summary.hidden=!quest.enabled;summary.textContent=uiText('Heute: ','Today: ')+info.daily+'/'+questDefs.length+' · '+uiText('Diese Woche: ','This week: ')+info.weekly+'/'+weeklyDefs.length;}if(next){next.hidden=!quest.enabled;next.textContent=info.next+uiText(' XP bis zum nächsten Level',' XP to next level');}}
  function leaguePremium(){var hero=$('league-premium-hero');if(!hero)return;hero.hidden=!quest.enabled;var rank=questRank(quest.xp),info=questSummary(),reward=questRewardState(quest.xp);hero.style.setProperty('--league-metal',rank.current[2]);$('league-premium-rank').textContent=rank.current[0]+' '+uiText('Liga','League');$('league-premium-class').textContent=uiText(questClass()[1],questClass()[2])+' · Level '+info.level;$('league-premium-xp').textContent=quest.xp.toLocaleString(englishUI?'en':'de')+' XP';$('league-premium-next').textContent=rank.next?rank.remaining.toLocaleString(englishUI?'en':'de')+' XP '+uiText('bis','to')+' '+rank.next[0]:uiText('Höchste Liga erreicht','Highest league reached');$('league-premium-progress').value=rank.progress*100;[['daily',info.daily,questDefs.length,uiText('Tagesquests','Daily quests')],['weekly',info.weekly,weeklyDefs.length,uiText('Wochenquests','Weekly quests')],['awards',reward.available.length,questRewards.length,uiText('Auszeichnungen','Awards')]].forEach(function(a){$('league-stat-'+a[0]).textContent=a[1]+'/'+a[2];$('league-label-'+a[0]).textContent=a[3];});}
  var questBaseRender=questRender;questRender=function(){questBaseRender();if(questPanel){questExtras();questStatus();questLeagueRender();questRewardRender();questLevelNotice();leaguePremium();}};
  if(questPanel){if($('quest-class-select'))$('quest-class-select').onchange=function(){quest.readerClass=this.value;questSave();questRender();};$('quest-toggle').onclick=function(){quest.enabled=!quest.enabled;questActiveAt=Date.now();questTick=Date.now();if(!questSave())toast(uiText('Lokaler Speicher nicht verfügbar','Local storage unavailable'));questRender();};$('quest-reset').onclick=function(){if(confirm(uiText('Nur Quest-Fortschritt löschen?','Reset quest progress only?'))){quest=questNew();questLastLevel=1;if($('quest-level-notice'))$('quest-level-notice').hidden=true;questSave();questRender();}};questRender();document.addEventListener('visibilitychange',function(){questTick=Date.now();});['pointerdown','keydown','touchstart'].forEach(function(e){document.addEventListener(e,function(){questActiveAt=Date.now();},{passive:true});});setInterval(function(){var now=Date.now(),delta=Math.min(5,Math.max(0,(now-questTick)/1000));questTick=now;if(!quest.enabled||!questReady||!S||reader.hidden||document.hidden||now-questActiveAt>120000)return;var oldDay=quest.day,oldWeek=quest.week;questRoll();if(oldDay!==quest.day||oldWeek!==quest.week)questRender();var before=Math.floor(quest.seconds/60);quest.seconds+=delta;var mins=Math.floor(quest.seconds/60);if(mins>before){questWeekly('minutes',mins-before);questAdd('minutes',mins-before);}else questSave();},5000);}

  /* ===================== Start ===================== */
  applySettingsToRendition();
  renderLibrary();
  openDB().then(renderRecent).catch(function () { recentSection.hidden = true; });

  var param = null;
  try { param = new URL(location.href).searchParams.get('book'); } catch (e) { param = null; }
  if (param) openFromUrl(param);
})();
