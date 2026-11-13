/**
 * Dungeon generator — drawing. Turns a generated dungeon into HTML/SVG text.
 * Everything here returns strings, so it can be tested in Node; only `mount`
 * touches the DOM.
 */

const CELL = 24;

const COLOR = {
  rock: '#cfc8b8',
  floor: '#fffdf8',
  grid: '#ddd6c6',
  wall: '#2a2622',
  ink: '#2a2622',
  stuck: '#b9b2a3',
  accent: '#2c7a7b',
};

const esc = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fill "{name}" placeholders in a string. */
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ''));

// ---------------------------------------------------------------------------
// Map symbols
// ---------------------------------------------------------------------------

/**
 * A door drawn across the wall between two squares.
 * (cx, cy) is the middle of that wall; `vertical` is true for a wall that
 * runs up-down (a door between left and right neighbours).
 */
function doorSymbol(type, cx, cy, vertical) {
  const long = CELL * 0.62;
  const thick = CELL * 0.3;
  const w = vertical ? thick : long;
  const h = vertical ? long : thick;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const box = (fillColor) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillColor}" stroke="${COLOR.wall}" stroke-width="1.5"/>`;

  if (type === 'arch') {
    // An open archway: a gap in the wall.
    const gw = vertical ? 4 : long;
    const gh = vertical ? long : 4;
    return `<rect x="${cx - gw / 2}" y="${cy - gh / 2}" width="${gw}" height="${gh}" fill="${COLOR.floor}"/>`;
  }
  if (type === 'secret') {
    return `<circle cx="${cx}" cy="${cy}" r="${CELL * 0.27}" fill="${COLOR.floor}" stroke="${COLOR.wall}" stroke-width="1"/>`
      + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${CELL * 0.42}" font-weight="700" font-family="sans-serif" fill="${COLOR.ink}">S</text>`;
  }
  if (type === 'locked') return box(COLOR.wall);
  if (type === 'stuck') {
    const line = vertical
      ? `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${COLOR.wall}" stroke-width="1.2"/>`
      : `<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y}" stroke="${COLOR.wall}" stroke-width="1.2"/>`;
    return box(COLOR.stuck) + line;
  }
  return box(COLOR.floor);
}

/** Stairs in one square: steps that narrow towards the far end, plus an arrow. */
function stairsSymbol(type, px, py) {
  const down = type === 'stairsDown';
  let out = '';
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const half = (CELL * 0.4) * (down ? 1 - t * 0.6 : 0.4 + t * 0.6);
    const y = py + CELL * 0.14 + t * CELL * 0.5;
    out += `<line x1="${px + CELL / 2 - half}" y1="${y}" x2="${px + CELL / 2 + half}" y2="${y}" stroke="${COLOR.ink}" stroke-width="1.3"/>`;
  }
  const ax = px + CELL / 2;
  const ay = py + CELL * 0.84;
  const tip = down ? 3 : -3;
  out += `<path d="M ${ax - 4} ${ay - tip} L ${ax} ${ay + tip} L ${ax + 4} ${ay - tip} Z" fill="${type === 'entrance' ? COLOR.accent : COLOR.ink}"/>`;
  return out;
}

// ---------------------------------------------------------------------------
// One level as SVG
// ---------------------------------------------------------------------------

export function renderLevelSvg(level, title = '') {
  const { cells, rooms, doors } = level;

  // Draw only the part of the grid that is in use, with one square of margin.
  let minX = level.width, minY = level.height, maxX = 0, maxY = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (cells[y][x] === 0) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  minX -= 1; minY -= 1; maxX += 1; maxY += 1;
  const W = (maxX - minX + 1) * CELL;
  const H = (maxY - minY + 1) * CELL;
  const px = (x) => (x - minX) * CELL;
  const py = (y) => (y - minY) * CELL;
  const at = (x, y) => (cells[y] && cells[y][x] !== undefined ? cells[y][x] : 0);

  const doorAt = new Set(doors.map((d) => `${d.x},${d.y}>${d.ox},${d.oy}`));
  const hasDoor = (x, y, nx, ny) => doorAt.has(`${x},${y}>${nx},${ny}`) || doorAt.has(`${nx},${ny}>${x},${y}`);

  let floor = '';
  const walls = new Set();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const v = at(x, y);
      if (v === 0) continue;
      floor += `M${px(x)} ${py(y)}h${CELL}v${CELL}h${-CELL}z`;
      // A wall stands wherever two neighbouring squares are not the same space.
      if (at(x + 1, y) !== v) walls.add(`M${px(x + 1)} ${py(y)}v${CELL}`);
      if (at(x - 1, y) !== v) walls.add(`M${px(x)} ${py(y)}v${CELL}`);
      if (at(x, y + 1) !== v) walls.add(`M${px(x)} ${py(y + 1)}h${CELL}`);
      if (at(x, y - 1) !== v) walls.add(`M${px(x)} ${py(y)}h${CELL}`);
    }
  }

  let symbols = '';
  for (const d of doors) {
    const vertical = d.ox !== d.x;
    const cx = vertical ? px(Math.max(d.x, d.ox)) : px(d.x) + CELL / 2;
    const cy = vertical ? py(d.y) + CELL / 2 : py(Math.max(d.y, d.oy));
    symbols += doorSymbol(d.type, cx, cy, vertical);
  }

  let labels = '';
  let hit = '';
  for (const r of rooms) {
    for (const f of r.features) symbols += stairsSymbol(f.type, px(f.x), py(f.y));
    labels += `<text x="${px(r.label.x) + CELL / 2}" y="${py(r.label.y) + CELL / 2}" text-anchor="middle" dominant-baseline="central" `
      + `font-size="${CELL * 0.58}" font-weight="700" font-family="sans-serif" fill="${COLOR.ink}">${r.id}</text>`;
    hit += `<rect class="dg-room-hit" data-room="${level.index + 1}-${r.id}" x="${px(r.x)}" y="${py(r.y)}" `
      + `width="${r.w * CELL}" height="${r.h * CELL}" fill="transparent"><title>${r.id}</title></rect>`;
  }

  return `<svg class="dg-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">`
    + `<rect width="${W}" height="${H}" fill="${COLOR.rock}"/>`
    + `<path d="${floor}" fill="${COLOR.floor}" stroke="${COLOR.grid}" stroke-width="0.6"/>`
    + `<path d="${[...walls].join('')}" fill="none" stroke="${COLOR.wall}" stroke-width="2.4" stroke-linecap="square"/>`
    + symbols + labels + hit
    + '</svg>';
}

// ---------------------------------------------------------------------------
// Legend and room cards
// ---------------------------------------------------------------------------

function legendIcon(inner) {
  return `<svg class="dg-legend-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CELL} ${CELL}" width="${CELL}" height="${CELL}">`
    + `<rect width="${CELL}" height="${CELL}" fill="${COLOR.floor}"/>${inner}</svg>`;
}

export function renderLegend(t) {
  const wall = `<line x1="0" y1="${CELL / 2}" x2="${CELL}" y2="${CELL / 2}" stroke="${COLOR.wall}" stroke-width="2.4"/>`;
  const door = (type) => legendIcon(wall + doorSymbol(type, CELL / 2, CELL / 2, false));
  const items = [
    [door('door'), t.doors.door],
    [door('stuck'), t.doors.stuck],
    [door('locked'), t.doors.locked],
    [door('secret'), t.doors.secret],
    [door('arch'), t.doors.arch],
    [legendIcon(stairsSymbol('entrance', 0, 0)), t.legend.stairsUp],
    [legendIcon(stairsSymbol('stairsDown', 0, 0)), t.legend.stairsDown],
  ];
  return `<ul class="dg-legend">${items.map(([icon, text]) => `<li>${icon}<span>${esc(text)}</span></li>`).join('')}`
    + `<li class="dg-legend-scale">${esc(t.legend.scale)}</li></ul>`;
}

function roomCard(dungeon, level, room, t, links) {
  const m = dungeon.squareMeters;
  const lines = [];

  for (const f of room.features) {
    const text = {
      entrance: t.features.entrance,
      stairsUp: fill(t.features.stairsUp, { level: level.index }),
      stairsDown: fill(t.features.stairsDown, { level: level.index + 2 }),
    }[f.type];
    lines.push(`<li class="dg-feature">${esc(text)}</li>`);
  }

  const doors = level.doors.filter((d) => d.room === room.id);
  const exits = doors.map((d) => {
    const link = d.type === 'secret' ? links.secretDoors : (d.type === 'arch' ? null : links.doors);
    const name = link ? `<a href="${esc(link)}">${esc(t.doors[d.type])}</a>` : esc(t.doors[d.type]);
    const dir = t.directions[d.ox > d.x ? 'east' : d.ox < d.x ? 'west' : d.oy > d.y ? 'south' : 'north'];
    const to = d.leadsTo.map((id) => `<a href="#dg-room-${level.index + 1}-${id}">${id}</a>`).join(', ');
    const target = fill(d.leadsTo.length === 1 ? t.card.leadsToOne : t.card.leadsToMany, { rooms: to });
    return `<li>${esc(dir)}: ${name} ${target}</li>`;
  });

  return `<section class="dg-card" id="dg-room-${level.index + 1}-${room.id}">`
    + `<h4>${esc(fill(t.card.room, { n: room.id }))} <span class="dg-card-size">${esc(fill(t.card.size, { w: room.w * m, h: room.h * m }))}</span></h4>`
    + (lines.length ? `<ul class="dg-card-features">${lines.join('')}</ul>` : '')
    + `<p class="dg-card-label">${esc(t.card.exits)}</p><ul class="dg-card-exits">${exits.join('')}</ul>`
    + '</section>';
}

/**
 * The whole dungeon: per level a heading, the map and one card per room.
 * `links` is the `rules` object from dungeon-data.json.
 */
export function renderDungeon(dungeon, t, links = {}) {
  const many = dungeon.levels.length > 1;
  const levels = dungeon.levels.map((level) => {
    const title = fill(many ? t.level.titleMany : t.level.titleOne, { n: level.index + 1, dl: level.dungeonLevel });
    return `<section class="dg-level"><h3>${esc(title)}</h3>`
      + `<div class="dg-map-wrap">${renderLevelSvg(level, title)}</div>`
      + `<div class="dg-cards">${level.rooms.map((r) => roomCard(dungeon, level, r, t, links)).join('')}</div>`
      + '</section>';
  });
  return `<div class="dg-root" dir="rtl">`
    + `<p class="dg-seed">${esc(t.seedUsed)} <code>${esc(dungeon.seed)}</code></p>`
    + renderLegend(t)
    + levels.join('')
    + '</div>';
}

// ---------------------------------------------------------------------------
// Browser only
// ---------------------------------------------------------------------------

/** Build the DOM node for a dungeon; clicking a room on the map jumps to its card. */
export function mount(dungeon, t, links = {}) {
  const el = document.createElement('div');
  el.innerHTML = renderDungeon(dungeon, t, links);
  el.addEventListener('click', (event) => {
    const hit = event.target.closest('.dg-room-hit');
    if (!hit) return;
    const card = el.querySelector(`#dg-room-${hit.dataset.room}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelectorAll('.dg-card-active').forEach((c) => c.classList.remove('dg-card-active'));
    card.classList.add('dg-card-active');
  });
  return el;
}
