// The table and the chart receive the same values, including gaps in T62.
function drawYearChart(points, series, metric, breaks, basis, requestedYear, onYearChange) {
  const svg = document.getElementById('year-chart');
  const legend = document.getElementById('chart-legend');
  svg.replaceChildren();
  legend.replaceChildren();
  function add(tag, attributes, label) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (label !== undefined) node.textContent = label;
    svg.append(node);
    return node;
  }
  const floor = Math.max(0, ...points.flatMap(p => p.values).filter(Number.isFinite));
  const rawStep = floor / 4 || 1;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  let step = [1, 2, 2.5, 5, 10].find(n => n * power >= rawStep) * power;
  if (metric !== 'share') step = Math.max(1, Math.ceil(step));
  const topValue = Math.max(step, Math.ceil(floor / step) * step);
  const width = Math.max(320, Math.min(900, Math.floor(svg.clientWidth || 360)));
  svg.setAttribute('viewBox', '0 0 ' + width + ' 208');
  const left = 64, right = width - 22;
  const x = i => left + (right - left) * i / (points.length - 1);
  const y = value => 170 - 143 * value / topValue;
  const axisNumber = new Intl.NumberFormat('de-DE', {maximumFractionDigits:5});
  for (let tick = 0; tick <= Math.round(topValue / step); tick++) {
    const value = tick * step;
    add('line', {x1:left, x2:right, y1:y(value), y2:y(value), class:'chart-grid'});
    add('text', {x:left-5, y:y(value)+4, 'text-anchor':'end'}, axisNumber.format(value) + (metric === 'share' ? ' %' : ''));
  }
  points.forEach((p, i) => add('text', {x:x(i),y:193,'text-anchor':'middle'}, p.year));
  for (const [year, labels] of breaks) {
    const i = points.findIndex(p => p.year === year);
    if (i < 0) continue;
    add('line', {x1:x(i),x2:x(i),y1:18,y2:170,class:'chart-break'});
    add('text', {x:x(i),y:13,'text-anchor':'middle'}, '†');
  }
  series.forEach((label, index) => {
    const key = document.createElement('span');
    key.className = 'chart-series series-' + index;
    key.textContent = label;
    legend.append(key);
    let path = '', connected = false;
    for (const [i, p] of points.entries()) {
      const v = p.values[index];
      if (v === null) { connected = false; continue; }
      path += (connected ? ' L' : ' M') + x(i) + ' ' + y(v);
      connected = true;
    }
    add('path', {d:path,class:'curve series-' + index});
    points.forEach((p,i) => {
      if (p.values[index] !== null) add('circle',{cx:x(i),cy:y(p.values[index]),r:3.5,class:'dot series-' + index});
    });
  });
  const detail = document.getElementById('year-detail');
  const half = (right - left) / (points.length - 1) / 2;
  const hits = points.map((p, i) => {
    const start = Math.max(0, x(i) - half);
    const end = Math.min(width, x(i) + half);
    const hit = add('rect', {x: start, y: 17, width: end - start, height: 187,
      class: 'year-hit', tabindex: 0, role: 'button', 'aria-label': 'Jahreswert ' + p.year});
    function activate() {
      select(i);
      onYearChange(p.year);
    }
    hit.addEventListener('click', activate);
    hit.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    return hit;
  });
  function select(index) {
    const point = points[index];
    hits.forEach((hit, i) => hit.setAttribute('aria-pressed', String(i === index)));
    detail.textContent = point.year + ' · ' + point.details.join(' · ') + '. ' + basis;
  }
  const previous = points.findIndex(p => p.year === requestedYear);
  select(previous < 0 ? points.length - 1 : previous);
  document.getElementById('chart-events').textContent = Array.from(breaks, ([year, labels]) => '† ' + year + ' · ' + labels.join(' und ')).join('  /  ');
}
