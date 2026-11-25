const el = id => document.getElementById(id);
const number = new Intl.NumberFormat('de-DE');
const percent = new Intl.NumberFormat('de-DE', {style:'percent', minimumFractionDigits:1, maximumFractionDigits:1});
const categories = dataset.rows.slice(2);
const rates = new Map([
  ['111000', [11, 37]],
  ['131000', [15, 20]],
  ['210000', [21, 98]],
  ['222000', [128, 510]],
  ['224000', [322, 985]],
  ['230000', [238, 588]],
  ['232200', [61, 101]],
  ['232300', [157, 445]],
  ['232400', [23, 41]],
  ['510000', [250, 760]],
  ['511000', [87, 140]],
  ['515000', [51, 280]],
  ['621000', [34, 84]],
  ['650000', [6, 4]],
  ['673000', [231, 371]],
  ['716400', [3, 12]],
  ['725000', [2, 435]],
  ['726200', [33, 58]],
  ['730000', [113, 270]],
  ['890000', [1813, 4788]],
  ['892000', [158, 628]],
  ['892500', [2, 10]],
  ['893000', [28, 58]],
  ['897000', [28, 72]],
  ['897100', [21, 55]],
  ['898000', [24, 51]],
  ['899000', [160, 499]],
  ['------', [1814, 5131]],
  ['****00', [292, 1097]],
  ['***100', [6, 18]],
  ['***300', [12, 43]],
  ['*26*00', [174, 748]],
  ['435*00', [7, 20]],
  ['*90*00', [1, 19]]
]);
let limit = 8;

const sexModes = ['sex', 'sex-de', 'sex-nd'];
function sexPair(key, year, group = 'sex') {
  const [dm, dw, nm, nw] = sexCounts[key][year];
  if (group === 'sex-de') return [dm, dw];
  if (group === 'sex-nd') return [nm, nw];
  return [dm + nm, dw + nw];
}
function sexText(key, group) {
  const [m, w] = sexPair(key, 2025, group);
  return [m, w].map((n, i) => number.format(n) + ' ' + ['männlich', 'weiblich'][i] +
    ' (' + percent.format(n / (m + w)) + ')').join(' · ');
}
function summary() {
  const [key, , total, foreign] = dataset.rows[el('basis').value === 'alle' ? 0 : 1];
  const german = total - foreign;
  el('head-sex').textContent = sexText(key);
  el('headline').textContent = number.format(total);
  el('headbar').style.width = (100 * german / total) + '%';
  for (const [id, label, value] of [['headd', 'Deutsch', german], ['headn', 'Nichtdeutsch', foreign]]) {
    el(id).innerHTML = '<b>' + percent.format(value / total) + ' ' + label + '</b><br>' + number.format(value);
  }
}

const countrySelects = [el('compare-country'), el('year-country')];
const countryOptions = countryYears.names.map((name, index) => [name, index])
  .sort(([a], [b]) => a.localeCompare(b, 'de'));
for (const select of countrySelects) {
  for (const [name, index] of countryOptions) select.add(new Option(name, index));
}
let country = null;
function syncCountry(name) {
  const index = countryYears.names.indexOf(name);
  country = index < 0 ? null : index;
  for (const select of countrySelects) select.value = country === null ? '' : String(country);
  const selected = country !== null;
  el('year-metric').querySelector('[value="rate"]').disabled = selected;
  for (const mode of sexModes) el('year-metric').querySelector('[value="' + mode + '"]').disabled = selected;
  if (selected && ['rate', ...sexModes].includes(el('year-metric').value)) el('year-metric').value = 'count';
  el('year-first').textContent = selected ? name : 'Deutsch';
  el('year-second').hidden = selected;
  el('country-sources').hidden = !selected;
  el('comparison-key').style.display = selected ? 'none' : '';
  el('comparison-note').hidden = !selected;
  el('order').querySelector('[value="share"]').textContent = selected ? 'Anteil am Delikt' : 'Anteil Nichtdeutsche';
}
function render() {
  const term = el('query').value.trim().toLocaleLowerCase('de');
  const matches = categories.filter(([key, name]) => (key + ' ' + name).toLocaleLowerCase('de').includes(term));
  const sort = el('order').value;
  matches.sort((a,b) => {
    if (sort === 'alpha') return a[1].localeCompare(b[1], 'de');
    if (country !== null) {
      const value = ([key, , total]) => {
        const n = countryYears.rows[key][5][country];
        return n === null ? -1 : sort === 'share' ? n / total : n;
      };
      return value(b) - value(a);
    }
    if (sort === 'share') return b[3]/b[2] - a[3]/a[2];
    return b[2] - a[2];
  });
  el('rows').replaceChildren();
  for (const [key, name, total, foreign] of matches.slice(0, limit)) {
    const german = total - foreign;
    const row = document.createElement('article');
    row.className = 'row';
    row.innerHTML = '<div><h3></h3><div class="small"></div></div><div><div class="line"><span><b></b> Deutsch</span><span><b></b> Nichtdeutsch</span></div><div class="bar" aria-hidden="true"><span></span></div><div class="line"><small></small><small></small></div></div>';
    row.querySelector('h3').textContent = name;
    row.querySelector('.small').textContent = 'PKS ' + key + ' · ' + number.format(total) + ' Tatverdächtige';
    const detail = document.createElement('a');
    detail.href = offenseUrl(key, 'bevoelkerung').href;
    detail.textContent = 'Im Bevölkerungsvergleich öffnen';
    row.querySelector('.small').after(detail);
    if (country !== null) {
      const count = countryYears.rows[key][5][country];
      detail.href = offenseUrl(key, 'jahresvergleich').href;
      detail.textContent = 'Im Jahresvergleich öffnen';
      row.lastElementChild.textContent = count === null ? 'Für 2025 nicht separat ausgewiesen' :
        countryYears.names[country] + ' · ' + number.format(count) + ' Tatverdächtige · ' + percent.format(count / total) + ' aller Tatverdächtigen dieses Delikts';
      el('rows').append(row);
      continue;
    }
    row.querySelector('.bar span').style.width = (100 * german / total) + '%';
    [german, foreign].forEach((n, i) => {
      row.querySelectorAll('b')[i].textContent = percent.format(n / total);
      row.querySelectorAll('small')[i].textContent = number.format(n);
    });
    const [deRate, ndRate] = rates.get(key);
    const rateLine = document.createElement('p');
    rateLine.className = 'small';
    rateLine.textContent = 'Je 100.000 Einwohner ab 8 Jahren: Deutsch ' + number.format(deRate) + ' · Nichtdeutsch ' + number.format(ndRate);
    const sexDetail = document.createElement('details');
    const toggle = document.createElement('summary');
    toggle.textContent = 'Männlich / weiblich';
    sexDetail.append(toggle);
    for (const [label, group] of [['Insgesamt','sex'], ['Deutsch','sex-de'], ['Nichtdeutsch','sex-nd']]) {
      const line = document.createElement('p');
      line.textContent = label + ' · ' + sexText(key, group);
      sexDetail.append(line);
    }
    row.lastElementChild.append(rateLine, sexDetail);
    el('rows').append(row);
  }
  el('more').hidden = limit >= matches.length;
  el('count').textContent = matches.length ? Math.min(limit, matches.length) + ' von ' + matches.length + ' Delikten und Deliktsgruppen angezeigt' : 'Kein Treffer. Versuche einen anderen Namen oder PKS-Schlüssel.';
}
el('source').href = dataset.source;
el('sourceNote').textContent = dataset.title + '. Die Anteile sind auf eine Nachkommastelle gerundet.';
el('basis').addEventListener('change', summary);
for (const [id, event] of [['query','input'], ['order','change']]) {
  el(id).addEventListener(event, () => { limit = 8; render(); });
}
el('more').addEventListener('click', () => {limit += 8; render();});
summary();
render();

const shareSelector = el('share-offense');
const choices = [dataset.rows[1], dataset.rows[0], ...categories.slice().sort((a,b) => a[1].localeCompare(b[1],'de'))];
for (const [key, name] of choices) shareSelector.add(new Option(name, key));
function showShares() {
  const [, , total, foreign] = choices.find(([key]) => key === shareSelector.value);
  for (const [id, count] of [['share-de', total - foreign], ['share-nd', foreign]]) {
    const absolute = document.createElement('small');
    absolute.textContent = number.format(count);
    const german = id === 'share-de';
    el(german ? 'share-sex-de' : 'share-sex-nd').textContent = (german ? 'Deutsch · ' : 'Nichtdeutsch · ') +
      sexText(shareSelector.value, german ? 'sex-de' : 'sex-nd');
    el(id).replaceChildren(percent.format(count / total), absolute);
  }
}



const rateSelector = el('rate-offense');
for (const [key, name] of choices) {
  rateSelector.add(new Option(name, key));
}
function showRates() {
  const pair = rates.get(rateSelector.value);
  el('rate-de').textContent = pair ? number.format(pair[0]) : 'Keine Angabe im Atlas';
  el('rate-nd').textContent = pair ? number.format(pair[1]) : 'Keine Angabe im Atlas';
}



const natOffense = el('nat-offense');
const natSearch = el('nat-query');
const natSort = el('nat-sort');
for (const [key, name] of choices) natOffense.add(new Option(name, key));
let natLimit = 12;
function filteredNationalities() {
  const values = nationalities.rows[natOffense.value];
  const term = natSearch.value.toLocaleLowerCase('de').trim();
  const matches = nationalities.names.map((name, i) => [name, values[i]])
    .filter(([name]) => name.toLocaleLowerCase('de').includes(term));
  matches.sort(([a,x],[b,y]) => (natSort.value === 'count' ? y-x : 0) || a.localeCompare(b,'de'));
  return matches;
}
function addDenominator(cell, label) {
  const note = document.createElement('small');
  note.className = 'denom';
  note.textContent = label;
  cell.append(note);
}
function renderNationalities() {
  const [, label, , denominator] = choices.find(([code]) => code === natOffense.value);
  const matches = filteredNationalities();
  el('nat-csv').disabled = matches.length === 0;
  el('nat-sex').textContent = 'Alle nichtdeutschen Tatverdächtigen · ' + label + ' · ' + sexText(natOffense.value, 'sex-nd');
  el('nat-caption').textContent = label + ' · ' + number.format(denominator) + ' nichtdeutsche Tatverdächtige';
  const body = el('nat-body');
  body.replaceChildren();
  for (const [name, count] of matches.slice(0, natLimit)) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    if (countryYears.names.includes(name)) {
      const link = document.createElement('a');
      const url = offenseUrl(natOffense.value, 'jahresvergleich');
      url.searchParams.set('staat', name);
      url.searchParams.set('kennzahl', el('year-metric').value === 'share' ? 'share' : 'count');
      link.href = url.href;
      link.textContent = name;
      link.setAttribute('aria-label', name + ' im Jahresvergleich öffnen');
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        history.replaceState({natReturn: {search: natSearch.value, sort: natSort.value,
          limit: natLimit, scroll: window.scrollY, name}}, '', location.href);
        history.pushState(null, '', url);
        restoreOffense();
        showActiveView();
        el('year-heading').focus({preventScroll: true});
        window.scrollTo({top: 0, behavior: 'instant'});
      });
      heading.append(link);
    } else {
      heading.textContent = name;
    }
    row.append(heading);
    row.insertCell().textContent = number.format(count);
    const shareCell = row.insertCell();
    shareCell.textContent = count && count / denominator < 0.001 ? '< 0,1 %' : percent.format(count / denominator);

  }
  el('nat-status').textContent = matches.length ? Math.min(natLimit,matches.length) + ' von ' + matches.length + ' Einträgen angezeigt' : 'Keine passende Staatsangehörigkeit gefunden.';
  el('nat-more').hidden = natLimit >= matches.length;
}
for (const [control,event] of [[natSort,'change'],[natSearch,'input']]) {
  control.addEventListener(event, () => { natLimit = 12; renderNationalities(); });
}
el('nat-more').addEventListener('click', () => { natLimit += 30; renderNationalities(); });

el('nat-csv').addEventListener('click', () => {
  const [key, offense, , denominator] = choices.find(([code]) => code === natOffense.value);
  const source = el('nat-source').href;
  const rows = [['Berichtsjahr', 'PKS-Schlüssel', 'Delikt', 'Staatsangehörigkeit', 'Tatverdächtige',
    'Nichtdeutsche Tatverdächtige beim gewählten Delikt insgesamt', 'Anteil in Prozent', 'Quelle (BKA T62)']];
  for (const [name, count] of filteredNationalities()) {
    const share = (100 * count / denominator).toFixed(4).replace('.', ',');
    rows.push([2025, key, offense, name, count, denominator, share, source]);
  }
  const csv = rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv, '\r\n'], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'PKS-2025-' + key.replaceAll('*', 'x') + '-Staatsangehoerigkeiten.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

function offenseUrl(key, section) {
  const url = new URL(window.location.href);
  url.searchParams.set('delikt', key);
  url.searchParams.set('kennzahl', el('year-metric').value);
  url.hash = section;
  return url;
}
const yearSelector = el('year-offense');
for (const [key, name] of choices) yearSelector.add(new Option(name, key));
function showYears() {
  const key = yearSelector.value;
  const mode = el('year-metric').value;
  const bySex = sexModes.includes(mode);
  const labels = bySex ? ['Männlich', 'Weiblich'] : country === null ? ['Deutsch', 'Nichtdeutsch'] : [countryYears.names[country]];
  el('year-first').textContent = labels[0];
  el('year-second').hidden = labels.length < 2;
  el('year-second').textContent = labels[1] || '';
  const body = el('year-body');
  body.replaceChildren();
  el('year-caption').textContent = yearSelector.selectedOptions[0].text + ' · ' + el('year-metric').selectedOptions[0].text;
  const group = country !== null ? countryYears.names[country] : ({
    sex: 'Alle Staatsangehörigkeiten', 'sex-de': 'Deutsch', 'sex-nd': 'Nichtdeutsch'
  })[mode] || 'Deutsch und nichtdeutsch';
  el('year-context').textContent = yearSelector.selectedOptions[0].text + ' · ' + group;
  const basis = mode === 'rate' ? 'Ansässige Tatverdächtige je 100.000 Einwohner der jeweiligen Gruppe, jeweils ab acht Jahren.' :
    mode === 'share' ? 'Anteil an allen Tatverdächtigen dieses Delikts im Berichtsjahr.' :
    bySex ? 'Anzahl und Anteil innerhalb der gewählten Gruppe.' : 'Polizeilich erfasste Tatverdächtige dieses Delikts im Berichtsjahr.';
  const points = [];
  for (const [year, [de, nd, deRate, ndRate]] of Object.entries(jahresdaten[key])) {
    const row = body.insertRow();
    const header = document.createElement('th');
    header.scope = 'row';
    header.textContent = year;
    row.append(header);
    const counts = country === null ? [de, nd] : [countryYears.rows[key][Number(year) - 2020][country]];
    const split = bySex ? sexPair(key, year, mode) : null;
    const values = bySex ? split.map(n => 100 * n / (split[0] + split[1])) : mode === 'rate' ? [deRate, ndRate] : counts.map(n =>
      mode === 'share' && n !== null ? 100 * n / (de + nd) : n);
    const details = [];
    points.push({year, values, details});
    for (const [i, value] of values.entries()) {
      const cell = row.insertCell();
      cell.textContent = value === null ? 'Nicht separat ausgewiesen' :
        bySex ? number.format(split[i]) + ' (' + percent.format(value / 100) + ')' : mode === 'share' ? percent.format(value / 100) : number.format(value);
      details.push(labels[i] + ' ' + cell.textContent);
      if (mode === 'share' && value !== null) addDenominator(cell, 'aller Tatverdächtigen dieses Delikts');
    }
  }
  const notes = {
    count: 'Anzahl der erfassten Personen je Berichtsjahr. Dieselbe Person kann in mehreren Jahren vorkommen.',
    share: 'Bezugsgröße ist die Summe der deutschen und nichtdeutschen Tatverdächtigen dieses Delikts im jeweiligen Jahr.',
    rate: 'Ansässige Tatverdächtige je 100.000 Einwohner derselben Staatsangehörigkeitsgruppe, jeweils ab acht Jahren. Ab 2024 beruhen die Bevölkerungszahlen auf dem Zensus 2022, zuvor auf dem Zensus 2011. Raten vor und nach diesem Wechsel sind nur eingeschränkt vergleichbar.'
  };
  el('year-note').textContent = (bySex ? 'Das Diagramm zeigt die Anteile innerhalb der gewählten Gruppe. Die Tabelle nennt auch die Personenzahlen.' : notes[mode]) + (country === null ? '' : ' T62 enthält für einzelne Staatsangehörigkeiten keine Aufschlüsselung nach Geschlecht und umfasst auch Personen ohne Wohnsitz in Deutschland. Daraus lässt sich keine vergleichbare Rate je 100.000 für einzelne Staatsangehörigkeiten ableiten.');
  const breaks = {
    '131000': 'Ab 2022 umfasst der PKS-Schlüssel die neu gegliederten §§ 176–176e StGB.',
    '897000': '2020 wurde der Schlüssel als Computerkriminalität geführt. Seit 2021 verwendet das BKA die geänderte Kategorie Cybercrime.',
    '232300': '2021 wurde der Straftatbestand Bedrohung erweitert. Der Jahreswert umfasst damit unterschiedliche Rechtslagen.',
    '230000': 'Die Erweiterung des Straftatbestands Bedrohung 2021 betrifft auch diese Deliktsgruppe.'
  };
  const cannabis = ['------', '890000', '730000'].includes(key);
  el('year-break').textContent = cannabis ? 'Die Teillegalisierung von Cannabis im April 2024 änderte, welche Handlungen strafbar waren. Das betrifft Rauschgiftdelikte und die Gesamtzahlen, besonders beim Vergleich 2023–2025.' : (breaks[key] || '');
  const markers = new Map();
  function mark(year, label) {
    if (!markers.has(year)) markers.set(year, []);
    markers.get(year).push(label);
  }
  if (mode === 'rate') mark('2024', 'neue Zensusbasis');
  if (cannabis) mark('2024', 'Cannabis-Teillegalisierung');
  if (breaks[key]) mark(key === '131000' ? '2022' : '2021', 'geänderte Deliktsdefinition');
  el('chart-title').textContent = el('year-metric').selectedOptions[0].text;
  drawYearChart(points, labels, bySex ? 'share' : mode, markers, basis);
}
el('year-metric').addEventListener('change', () => chooseOffense(yearSelector.value, 'jahresvergleich'));

function displayOffense(key) {
  if (!choices.some(([code]) => code === key)) key = dataset.rows[1][0];
  for (const select of [shareSelector, natOffense, rateSelector, yearSelector]) select.value = key;
  if (key === dataset.rows[0][0] || key === dataset.rows[1][0]) {
    el('basis').value = key === dataset.rows[0][0] ? 'alle' : 'ohne';
    summary();
  }
  natLimit = 12;
  showShares();
  showRates();
  showYears();
  renderNationalities();
  for (const link of document.querySelectorAll('[data-direct]')) {
    link.href = offenseUrl(key, link.dataset.direct).href;
    link.parentElement.querySelector('[role=status]').textContent = '';
  }
}
function chooseOffense(key, section) {
  const url = offenseUrl(key, section);
  if (url.href !== location.href) history.pushState(null, '', url);
  displayOffense(key);
  render();
}
for (const select of [shareSelector, natOffense, rateSelector, yearSelector]) {
  select.addEventListener('change', () => chooseOffense(select.value, select.closest('section').id));
}
el('basis').addEventListener('change', () => chooseOffense(dataset.rows[el('basis').value === 'alle' ? 0 : 1][0], 'start'));
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const status = button.parentElement.querySelector('[role=status]');
    try {
      await navigator.clipboard.writeText(offenseUrl(shareSelector.value, button.dataset.copy).href);
      status.textContent = 'Link kopiert.';
    } catch {
      status.textContent = 'Zum Kopieren das Linkmenü am Direktlink öffnen.';
    }
  });
}
function restoreOffense() {
  const params = new URL(location.href).searchParams;
  const metric = params.get('kennzahl');
  el('year-metric').value = ['count', 'share', 'rate', ...sexModes].includes(metric) ? metric : 'count';
  syncCountry(params.get('staat'));
  render();
  displayOffense(params.get('delikt'));
}
for (const select of countrySelects) {
  select.addEventListener('change', () => {
    const name = select.value === '' ? null : countryYears.names[Number(select.value)];
    const url = offenseUrl(yearSelector.value, select.closest('section').id);
    if (name !== null && ['rate', ...sexModes].includes(el('year-metric').value)) url.searchParams.set('kennzahl', 'count');
    if (name === null) url.searchParams.delete('staat');
    else url.searchParams.set('staat', name);
    history.pushState(null, '', url);
    limit = 8;
    restoreOffense();
  });
}
window.addEventListener('popstate', () => {
  restoreOffense();
  const saved = history.state?.natReturn;
  if (!saved || location.hash !== '#nationalitaeten') return;
  natSearch.value = saved.search;
  natSort.value = saved.sort;
  natLimit = saved.limit;
  renderNationalities();
  showActiveView();
  requestAnimationFrame(() => {
    if (location.hash !== '#nationalitaeten') return;
    Array.from(el('nat-body').querySelectorAll('a')).find(a => a.textContent === saved.name)?.focus({preventScroll: true});
    window.scrollTo({top: saved.scroll, behavior: 'instant'});
  });
});
restoreOffense();

// Hashes also serve existing shared links to individual analyses.
function showActiveView() {
  const sections = Array.from(document.querySelectorAll('main > section'));
  const target = sections.find(section => section.id && '#' + section.id === location.hash);
  const overview = !target || target.id === 'atlas-auswahl';
  for (const section of sections) {
    const onHome = section.classList.contains('hero') || section.id === 'atlas-auswahl';
    section.hidden = overview ? !onHome : section !== target;
  }
  const menu = document.querySelector('.view-menu');
  menu.open = false;
  for (const link of menu.querySelectorAll('a')) {
    if (link.hash === (overview ? '#start' : location.hash)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (target?.id === 'jahresvergleich') showYears();
}
window.addEventListener('hashchange', showActiveView);
document.querySelector('.view-menu nav').addEventListener('click', () => {
  document.querySelector('.view-menu').open = false;
});
showActiveView();
