/* MOLITOR EPUB-Leser · app.js
   Läuft komplett im Browser. Benötigt global JSZip (3.10.1) und ePub (epub.js 0.3.93). */
(function () {
  'use strict';

  /* ===================== Hilfsfunktionen ===================== */
  var $ = function (id) { return document.getElementById(id); };
  var PREFIX = 'epubleser:';

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
  var settings = Object.assign({ fontSize: 100, theme: 'hell', font: 'serif' }, lsGet('settings', {}));
  if (!THEMES[settings.theme]) settings.theme = 'hell';
  if (!FONTS[settings.font]) settings.font = 'serif';
  settings.fontSize = Math.max(80, Math.min(200, Number(settings.fontSize) || 100));

  var S = null;          // aktuelle Lesesitzung
  var session = 0;       // Zähler, um veraltete async-Ergebnisse zu verwerfen
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
  var DB_NAME = 'molitor-epub-leser', DB_VER = 1, MAX_RECENT = 40;
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
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB-Fehler')); };
        req.onblocked = function () { reject(new Error('IndexedDB blockiert')); };
      } catch (e) { reject(e); }
    });
    dbPromise = withTimeout(dbPromise, 4000, 'IndexedDB antwortet nicht').catch(function (e) {
      idbOk = false;
      recentSection.hidden = true;
      throw e;
    });
    return dbPromise;
  }
  function idbTx(stores, mode, fn) {
    return openDB().then(function (db) {
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
    }).then(pruneRecent);
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
  function pruneRecent() {
    return idbAllMeta().then(function (all) {
      all = (all || []).sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      var extra = all.slice(MAX_RECENT);
      return Promise.all(extra.map(function (m) { return idbDelete(m.id); }));
    });
  }

  var coverUrls = [];
  function renderRecent() {
    if (!idbOk) { recentSection.hidden = true; return Promise.resolve(); }
    return idbAllMeta().then(function (all) {
      coverUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* egal */ } });
      coverUrls = [];
      clear(recentList);
      all = (all || []).sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      recentSection.hidden = all.length === 0;
      all.forEach(function (m) {
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
          title: m.title || 'Unbenanntes Buch',
          sub: m.author || (m.name || ''),
          cover: 'c' + ((parseInt(hash(m.id), 16) % 3) + 1),
          coverImg: coverImg,
          pct: pct,
          label: 'Weiterlesen: ' + (m.title || 'Buch'),
          onOpen: function () { openFromRecent(m); },
          onRemove: function () {
            idbDelete(m.id).then(renderRecent).catch(function () { /* still */ });
          }
        });
        recentList.appendChild(card);
        card.hidden = !card.textContent.toLowerCase().includes(($('shelf-search').value || '').toLowerCase());
      });
    }).catch(function () { recentSection.hidden = true; });
  }

  function openFromRecent(m) {
    homeMessage('');
    showReader();
    setLoading(true, 'Buch wird geöffnet …');
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
        failOpen('Die gespeicherte Datei ist nicht mehr vorhanden. Bitte öffne das Buch erneut.');
      } else {
        failOpen('Das Buch konnte nicht aus dem Speicher geladen werden.');
      }
    });
  }

  /* ===================== Karten (Bibliothek / Zuletzt) ===================== */
  function bookCard(o) {
    var cover = el('div', { class: 'cover ' + (o.cover || 'c1'), 'aria-hidden': 'true' });
    if (o.coverImg) cover.appendChild(o.coverImg); else cover.textContent = o.title;
    var meta = el('div', { class: 'book-meta' }, [el('b', { text: o.title })]);
    if (o.sub) meta.appendChild(el('span', { class: 'sub', text: o.sub }));
    var pctBox = el('span', { class: 'pct' });
    if (typeof o.pct === 'number' && o.pct > 0) {
      pctBox.textContent = fmtPct(o.pct) + ' gelesen';
      var bar = el('div', { class: 'bar', 'aria-hidden': 'true' }, [el('i')]);
      bar.firstChild.style.width = Math.round(Math.min(1, o.pct) * 100) + '%';
      pctBox.appendChild(bar);
    } else {
      pctBox.textContent = o.emptyText || 'Noch nicht begonnen';
    }
    meta.appendChild(pctBox);
    var open = el('button', { class: 'open', type: 'button', 'aria-label': o.label || o.title });
    open.addEventListener('click', o.onOpen);
    var card = el('div', { class: 'book-card' }, [cover, meta, open]);
    if (o.onRemove) {
      var rm = el('button', { class: 'remove', type: 'button', 'aria-label': '„' + o.title + '“ aus der Liste entfernen', title: 'Aus der Liste entfernen', text: '×' });
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
        emptyText: 'Kostenlos · EPUB',
        label: '„' + b.title + '“ im Leser öffnen',
        onOpen: function () { openFromUrl(url, { library: true }); }
      }));
    });
  }

  /* ===================== Öffnen ===================== */
  function openFile(file) {
    if (!file) return;
    homeMessage('');
    var name = file.name || 'buch.epub';
    if (!/\.epub$/i.test(name) && file.type && file.type !== 'application/epub+zip' && file.type !== 'application/zip') {
      homeMessage('„' + name + '“ scheint keine EPUB-Datei zu sein. Bitte wähle eine Datei mit der Endung .epub.', true);
      return;
    }
    showReader();
    setLoading(true, 'Datei wird gelesen …');
    var p = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsArrayBuffer(file);
    });
    p.then(function (buf) { return openBook(buf, { name: name, storeRecent: true }); })
      .catch(function (e) { if (e && e.handled) return; failOpen('Die Datei „' + name + '“ konnte nicht gelesen werden.'); });
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
      homeMessage('Dieses Buch kann nicht geöffnet werden: Aus Sicherheitsgründen lädt der Leser nur Bücher von dieser Website.', true);
      return;
    }
    showReader();
    setLoading(true, 'Buch wird geladen …');
    fetch(u.href, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      var path = u.pathname;
      var libEntry = LIBRARY.some(function (b) { return LIB_BASE + b.file === path; });
      return openBook(buf, { name: decodeURIComponent(path.split('/').pop() || 'buch.epub'), libUrl: libEntry ? path : null, storeRecent: !libEntry });
    }).catch(function (e) {
      if (e && e.handled) return;
      failOpen('Das Buch konnte nicht geladen werden. Bitte prüfe deine Internetverbindung und versuche es erneut.');
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
      failOpen('Der Leser konnte nicht vollständig geladen werden (epub.js/JSZip fehlen). Bitte lade die Seite neu – eventuell blockiert ein Werbe- oder Skriptblocker jsdelivr.net.');
      return Promise.resolve();
    }
    if (!buf || !buf.byteLength) { failOpen('Die Datei ist leer.'); return Promise.resolve(); }
    if (!isZip(buf)) { failOpen('Das ist keine gültige EPUB-Datei. Ein EPUB ist intern ein ZIP-Archiv – diese Datei ist es nicht.'); return Promise.resolve(); }

    // Vorheriges Buch sauber schließen, ohne die Ansicht zu wechseln
    destroySession();
    var my = ++session;
    showReader();
    setLoading(true, 'Buch wird geöffnet …');

    var copy = opts.storeRecent && idbOk ? buf.slice(0) : null;
    var book;
    try { book = window.ePub(buf); } catch (e) {
      failOpen('Das EPUB konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt.');
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
      document.title = st.title + ' · EPUB-Leser · MOLITOR';
      st.marks = lsGet('marks:' + st.key, []) || [];

      if (opts.libUrl) {
        var map = lsGet('lib', {}); map[opts.libUrl] = st.key; lsSet('lib', map);
      }

      // Rendition aufbauen
      var rendition = book.renderTo('viewer', { width: '100%', height: '100%', flow: 'paginated', spread: 'auto' });
      st.rendition = rendition;
      setupRendition(st);

      var pos = lsGet('pos:' + st.key, null);
      setLoading(true, 'Seite wird aufgebaut …');
      var shown = pos && pos.cfi
        ? rendition.display(pos.cfi).catch(function () { return rendition.display(); })
        : rendition.display();
      return withTimeout(shown, 30000, 'Zeitüberschreitung').then(function () {
        if (my !== session) return;
        setLoading(false);
        if (pos && pos.cfi) toast('Weiter an deiner letzten Leseposition');

        // Inhaltsverzeichnis
        book.loaded.navigation.then(function (nav) {
          if (my !== session) return;
          buildToc(st, (nav && nav.toc) || []);
          if (st.location) markCurrentChapter(st, st.location);
        }).catch(function () { tocList.appendChild(el('li', { class: 'pane-note', text: 'Dieses Buch hat kein Inhaltsverzeichnis.' })); });

        renderMarks(st);
        updateBookmarkButton(st);

        // Zuletzt gelesen speichern
        if (opts.storeRecent && idbOk) {
          var meta = { id: st.key, title: st.title, author: st.author, name: opts.name || '', size: st.size, time: Date.now(), pct: pos ? pos.pct : 0 };
          getCoverBlob(book).then(function (blob) {
            if (blob) meta.cover = blob;
          }).catch(function () {}).then(function () {
            return idbSaveBook(meta, copy);
          }).catch(function () { /* still: kein Speicher */ });
        }

        // Positionen berechnen (für Prozent & Regler)
        generateLocations(st, my);
      });
    }).catch(function (e) {
      if (my !== session) return;
      var msg = e && e.message === 'Zeitüberschreitung'
        ? 'Das Öffnen hat zu lange gedauert. Die Datei ist möglicherweise beschädigt oder sehr groß.'
        : 'Das EPUB konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt oder kein gültiges E-Book.';
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
    progPage.textContent = 'Seiten werden berechnet …';
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
      rules[sc + 'a, ' + sc + 'a:link, ' + sc + 'a:visited'] = { color: t.link + ' !important' };
      if (name !== 'hell') rules[txt.map(function (x) { return sc + x; }).join(', ')] = { color: t.fg + ' !important' };
    });
    return rules;
  }
  function applyThemeToContents(contents) {
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
    r.on('displayError', function () { toast('Diese Stelle konnte nicht angezeigt werden.'); });

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

  /* ===================== Navigation ===================== */
  function goForward() { if (S && S.rendition) S.rendition.next(); }
  function goBack() { if (S && S.rendition) S.rendition.prev(); }
  function goLeft() { if (S && S.rtl) goForward(); else goBack(); }
  function goRight() { if (S && S.rtl) goBack(); else goForward(); }

  function onKey(e) {
    if (!S || reader.hidden) return;
    if (e.key === 'Escape') { if (closeOverlays()) e.preventDefault && e.preventDefault(); return; }
    if (!drawer.hidden || isTyping(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
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
    if (!loc || !loc.start) return;
    st.location = loc;
    var cfi = loc.start.cfi;
    var pct = null;
    if (st.locationsReady) {
      try { pct = st.book.locations.percentageFromCfi(cfi); } catch (e) { pct = null; }
      if (typeof pct !== 'number' || !isFinite(pct)) pct = typeof loc.start.percentage === 'number' ? loc.start.percentage : null;
      if (loc.atEnd) pct = 1;
    }
    // Anzeige
    if (pct != null) {
      progPct.textContent = fmtPct(pct);
      if (!st.dragging) range.value = String(Math.round(pct * 1000));
      range.setAttribute('aria-valuetext', fmtPct(pct) + ' gelesen');
    } else if (!st.locationsReady) {
      progPct.textContent = '–';
    }
    var disp = loc.start.displayed;
    if (st.locationsReady) {
      var pageTxt = '';
      if (disp && disp.total) pageTxt = 'Kapitelseite ' + disp.page + ' von ' + disp.total;
      try {
        var li = st.book.locations.locationFromCfi(cfi);
        var tot = st.book.locations.total;
        if (typeof li === 'number' && li >= 0 && tot > 0) pageTxt = 'Position ' + (li + 1) + ' von ' + (tot + 1) + (pageTxt ? ' · ' + pageTxt : '');
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
        var label = String(item.label || '').trim() || 'Ohne Titel';
        var a = el('a', { href: '#', text: label });
        var entry = { label: label, href: item.href, index: spineIndexOf(st.book, item.href), a: a, depth: depth };
        st.tocLinks.push(entry);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          closeDrawer();
          st.rendition.display(item.href).catch(function () {
            if (entry.index >= 0) return st.rendition.display(entry.index);
            throw new Error('x');
          }).catch(function () { toast('Dieses Kapitel konnte nicht geöffnet werden.'); });
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
    return e ? e.label : (typeof index === 'number' ? 'Abschnitt ' + (index + 1) : '');
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
    if (cfi) S.rendition.display(cfi).catch(function () { toast('Diese Stelle konnte nicht angezeigt werden.'); });
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
      toast('Lesezeichen entfernt');
    } else {
      var loc = st.location;
      var pct = null;
      if (st.locationsReady) { try { pct = st.book.locations.percentageFromCfi(loc.start.cfi); } catch (e) { pct = null; } }
      st.marks.push({ cfi: loc.start.cfi, index: loc.start.index, chapter: chapterLabel(st, loc.start.index), pct: pct, text: currentExcerpt(st), time: Date.now() });
      st.marks.sort(function (a, b) { try { return cfiCompare(a.cfi, b.cfi); } catch (e) { return 0; } });
      toast('Lesezeichen gesetzt');
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
        st.rendition.display(m.cfi).catch(function () { toast('Diese Stelle konnte nicht angezeigt werden.'); });
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
    if (q.length < 2) { searchStatus.textContent = 'Bitte gib mindestens 2 Zeichen ein.'; return; }
    var items = (st.book.spine && st.book.spine.spineItems) || [];
    var total = 0, LIMIT = 300, i = 0;
    searchStatus.textContent = 'Suche läuft …';

    function step() {
      if (token !== st.searchToken || S !== st) return;
      if (i >= items.length || total >= LIMIT) {
        searchStatus.textContent = total === 0
          ? 'Keine Treffer für „' + q + '“.'
          : (total >= LIMIT ? 'Mehr als ' + LIMIT + ' Treffer – die ersten ' + LIMIT + ' werden angezeigt.' : total + (total === 1 ? ' Treffer' : ' Treffer') + ' für „' + q + '“.');
        return;
      }
      var item = items[i++];
      searchStatus.textContent = 'Suche läuft … (' + i + ' von ' + items.length + ')';
      Promise.resolve().then(function () {
        return item.load(st.book.load.bind(st.book));
      }).then(function () {
        var found = [];
        try { found = item.find(q) || []; } catch (e) { found = []; }
        try { item.unload(); } catch (e) { /* egal */ }
        if (token !== st.searchToken) return;
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
    }).catch(function () { toast('Diese Stelle konnte nicht angezeigt werden.'); });
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
        if (p && p.catch) p.catch(function () { toast('Vollbild ist hier nicht möglich.'); });
      }
    } catch (e) { toast('Vollbild ist hier nicht möglich.'); }
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
    rTitle.textContent = 'Buch'; rChapter.textContent = '';
    range.value = '0'; range.disabled = true; range.removeAttribute('aria-valuetext');
    progPct.textContent = '–'; progPage.textContent = '';
    btnBookmark.setAttribute('aria-pressed', 'false');
    [btnPrev, btnNext, btnPrevSide, btnNextSide].forEach(function (b) { b.disabled = false; });
    closeSettings();
    drawer.hidden = true; backdrop.hidden = true;
    selectTab('toc');
  }
  function destroySession() {
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
    idbClear().then(function () {
      renderRecent();
      homeMessage('Die Liste „Zuletzt gelesen“ wurde geleert.');
    }).catch(function () { homeMessage('Die Liste konnte nicht geleert werden.', true); });
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

  $('shelf-search').addEventListener('input',function(){var q=this.value.toLowerCase();Array.from(recentList.children).forEach(function(n){n.hidden=!n.textContent.toLowerCase().includes(q);});});
  var nd=$('note-dialog'), nt=$('note-text'), nl=$('note-list'), ns=$('note-status'), speak=$('btn-speak');
  function notes(){var a=S&&S.key?lsGet('notes:'+S.key,[]):[];return Array.isArray(a)?a:[];}
  function showNotes(){clear(nl);notes().forEach(function(n,i){var jump=el('button',{type:'button',text:n.text});jump.addEventListener('click',function(){if(S&&S.rendition){nd.close();S.rendition.display(n.cfi).catch(function(){toast('Stelle nicht verfügbar');});}});var del=el('button',{type:'button',text:'Löschen'});del.addEventListener('click',function(){var a=notes();a.splice(i,1);if(lsSet('notes:'+S.key,a))showNotes();else ns.textContent='Speichern fehlgeschlagen';});nl.appendChild(el('li',null,[jump,del]));});}
  $('btn-note').addEventListener('click',function(){if(!S||!S.key||!S.location||!S.location.start)return;nt.value='';ns.textContent='';showNotes();nd.showModal();});
  $('note-close').addEventListener('click',function(){nd.close();});
  $('note-save').addEventListener('click',function(){if(!S||!S.location||!nt.value.trim())return;var a=notes();a.push({cfi:S.location.start.cfi,text:nt.value.trim()});if(lsSet('notes:'+S.key,a)){nt.value='';ns.textContent='Gespeichert';showNotes();}else ns.textContent='Speicher nicht verfügbar';});
  function stopSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speak.setAttribute('aria-pressed','false');}
  if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))speak.hidden=true;
  speak.addEventListener('click',function(){if(speak.getAttribute('aria-pressed')==='true'){stopSpeech();return;}if(!S||!S.rendition)return;var voices=window.speechSynthesis.getVoices().filter(function(v){return v.localService;});if(!voices.length){toast('Keine lokale Vorlesestimme verfügbar.');return;}var contents=S.rendition.getContents()[0];if(!contents||!contents.document.body)return;var lang=contents.document.documentElement.lang||'de';var voice=voices.find(function(v){return v.lang.split('-')[0]===lang.split('-')[0];});if(!voice){toast('Keine passende lokale Stimme verfügbar.');return;}var text=contents.document.body.innerText.trim().slice(0,12000);if(!text)return;var u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.onend=u.onerror=stopSpeech;speak.setAttribute('aria-pressed','true');window.speechSynthesis.speak(u);});
  btnClose.addEventListener('click',stopSpeech);window.addEventListener('pagehide',stopSpeech);
  function paintHighlight(st,h){try{st.rendition.annotations.highlight(h.cfi,{},null,'molitor-highlight',{fill:h.color,'fill-opacity':'0.35','mix-blend-mode':'multiply'});}catch(e){toast('Markierung konnte nicht angezeigt werden.');}}
  function renderHighlights(){var list=$('highlight-list');clear(list);if(!S)return;$('highlight-status').textContent=S.pendingHighlight?'Farbe für ausgewählten Text wählen.':'Text im Buch auswählen, um eine Markierung hinzuzufügen.';document.querySelectorAll('[data-highlight]').forEach(function(b){b.disabled=!S.pendingHighlight;});(S.highlights||[]).forEach(function(h,i){var jump=el('button',{type:'button',text:h.text||'Markierte Stelle'});jump.addEventListener('click',function(){$('highlight-dialog').close();S.rendition.display(h.cfi).catch(function(){toast('Stelle nicht verfügbar');});});var del=el('button',{type:'button',text:'Löschen'});del.addEventListener('click',function(){var next=S.highlights.filter(function(_,j){return j!==i;});if(!lsSet('highlights:'+S.key,next)){toast('Speicher nicht verfügbar');return;}S.rendition.annotations.remove(h.cfi,'highlight');S.highlights=next;renderHighlights();});list.appendChild(el('li',null,[jump,del]));});}
  $('btn-highlight').addEventListener('click',function(){if(!S||!S.key)return;renderHighlights();$('highlight-dialog').showModal();});
  $('highlight-close').addEventListener('click',function(){$('highlight-dialog').close();});
  $('highlight-dialog').addEventListener('close',function(){if(S)S.pendingHighlight=null;});
  document.querySelectorAll('[data-highlight]').forEach(function(b){b.addEventListener('click',function(){if(!S||!S.pendingHighlight)return;var h=Object.assign({},S.pendingHighlight,{color:b.dataset.highlight});var next=(S.highlights||[]).filter(function(x){return x.cfi!==h.cfi;}).concat(h);if(!lsSet('highlights:'+S.key,next)){toast('Speicher nicht verfügbar');return;}S.rendition.annotations.remove(h.cfi,'highlight');S.highlights=next;paintHighlight(S,h);S.pendingHighlight=null;renderHighlights();$('highlight-dialog').close();});});
  /* ===================== Start ===================== */
  applySettingsToRendition();
  renderLibrary();
  openDB().then(renderRecent).catch(function () { recentSection.hidden = true; });

  var param = null;
  try { param = new URL(location.href).searchParams.get('book'); } catch (e) { param = null; }
  if (param) openFromUrl(param);
})();
