/**
 * Dungeon generator — pure logic, no DOM. Runs in the browser (imported by
 * dungeonGenerator.qmd) and in Node (for testing).
 *
 * The same seed and options always produce the same dungeon.
 *
 * Map model: each level is a grid of squares, one square = 3 m (10').
 *   cells[y][x]  0 = rock, -1 = corridor, n > 0 = room number n
 */

export const SQUARE_METERS = 3;

export const SIZES = {
  small: { rooms: 8, width: 30, height: 22 },
  medium: { rooms: 15, width: 42, height: 30 },
  large: { rooms: 25, width: 56, height: 40 },
};

export const DOOR_TYPES = ['door', 'stuck', 'locked', 'secret', 'arch'];

const ROCK = 0;
const CORRIDOR = -1;

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function hashSeed(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Random source with the helpers the generator needs. */
export function makeRng(seed) {
  let a = hashSeed(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (list) => list[int(0, list.length - 1)],
    /** Pick by weight from [[value, weight], ...]. */
    weighted(pairs) {
      let roll = next() * pairs.reduce((sum, p) => sum + p[1], 0);
      for (const [value, weight] of pairs) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
    /** Roll dice notation such as "2d6", "1d8+1" or a plain number. */
    roll(notation) {
      const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(notation).replace(/\s/g, ''));
      if (!m) return parseInt(notation, 10) || 0;
      let total = m[3] ? parseInt(m[3], 10) : 0;
      for (let i = 0; i < parseInt(m[1], 10); i++) total += int(1, parseInt(m[2], 10));
      return total;
    },
  };
}

/** A short readable seed for when the user does not supply one. */
export function randomSeed() {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const ROOM_SHAPES = [
  // [minW, maxW, minH, maxH], weight
  [[2, 3, 2, 3], 5], // small chamber
  [[3, 5, 3, 4], 6], // ordinary room
  [[4, 7, 2, 3], 2], // long hall
  [[2, 3, 4, 6], 2], // tall hall
  [[5, 8, 4, 6], 2], // great hall
];

function placeRooms(rng, size) {
  const { width, height, rooms: target } = size;
  const rooms = [];
  // Keep one square of rock around every room so walls never touch.
  const collides = (r) => rooms.some((o) =>
    r.x < o.x + o.w + 1 && o.x < r.x + r.w + 1 && r.y < o.y + o.h + 1 && o.y < r.y + r.h + 1);

  for (let attempt = 0; attempt < 4000 && rooms.length < target; attempt++) {
    const [minW, maxW, minH, maxH] = rng.weighted(ROOM_SHAPES);
    const w = rng.int(minW, maxW);
    const h = rng.int(minH, maxH);
    const room = { x: rng.int(1, width - w - 1), y: rng.int(1, height - h - 1), w, h };
    if (!collides(room)) rooms.push(room);
  }
  return rooms;
}

const center = (r) => ({ x: r.x + (r.w - 1) / 2, y: r.y + (r.h - 1) / 2 });
const distance = (a, b) => Math.abs(center(a).x - center(b).x) + Math.abs(center(a).y - center(b).y);

/**
 * Choose which rooms connect: a spanning tree (every room reachable) plus a
 * few short extra links, so the map has loops and more than one way around.
 */
function planConnections(rng, rooms) {
  const edges = [];
  const linked = new Set([0]);
  while (linked.size < rooms.length) {
    let best = null;
    for (const a of linked) {
      for (let b = 0; b < rooms.length; b++) {
        if (linked.has(b)) continue;
        const d = distance(rooms[a], rooms[b]);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    linked.add(best.b);
    edges.push({ a: best.a, b: best.b, loop: false });
  }

  const has = (a, b) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const candidates = [];
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      if (!has(a, b)) candidates.push({ a, b, d: distance(rooms[a], rooms[b]) });
    }
  }
  candidates.sort((p, q) => p.d - q.d);
  const extra = Math.max(1, Math.round(rooms.length * 0.25));
  const pool = candidates.slice(0, extra * 3);
  for (let i = 0; i < extra && pool.length; i++) {
    const [edge] = pool.splice(rng.int(0, pool.length - 1), 1);
    edges.push({ a: edge.a, b: edge.b, loop: true });
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Corridors
// ---------------------------------------------------------------------------

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Cheapest path of corridor squares from room `from` to room `to`.
 * Existing corridors are cheap (so passages merge), squares hugging a room
 * wall and changes of direction cost extra, other rooms are solid. Going
 * through a door the room already has is cheap; cutting a new one costs
 * extra, so a room does not collect several doors onto the same passage.
 * Returns the squares outside both rooms, in order, or null.
 */
function findPath(cells, from, to, rng, doors) {
  const height = cells.length;
  const width = cells[0].length;
  const fromId = from.id;
  const toId = to.id;
  const key = (x, y, dir) => (y * width + x) * 5 + dir;
  const best = new Map();
  const cameFrom = new Map();
  const open = [];

  const isDoor = (x, y, ox, oy) => doors.some((d) => d.x === x && d.y === y && d.ox === ox && d.oy === oy);
  const NEW_DOOR = 8;

  const touchesRoom = (x, y) => STEPS.some(([dx, dy]) => {
    const v = (cells[y + dy] || [])[x + dx];
    return v > 0 && v !== fromId && v !== toId;
  });

  for (let y = from.y; y < from.y + from.h; y++) {
    for (let x = from.x; x < from.x + from.w; x++) {
      best.set(key(x, y, 4), 0);
      open.push({ x, y, dir: 4, cost: 0 });
    }
  }

  let goal = null;
  while (open.length) {
    let at = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[at].cost) at = i;
    const cur = open.splice(at, 1)[0];
    if (cur.cost > best.get(key(cur.x, cur.y, cur.dir))) continue;
    if (cells[cur.y][cur.x] === toId) { goal = cur; break; }

    STEPS.forEach(([dx, dy], dir) => {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return;
      const v = cells[y][x];
      if (v > 0 && v !== fromId && v !== toId) return;
      // Leave and enter rooms straight through a wall, never along it.
      const here = cells[cur.y][cur.x];
      if (here === fromId && v === toId) return;

      let step;
      if (v === fromId) step = 0;
      else if (v === toId) step = 1 + (isDoor(x, y, cur.x, cur.y) ? 0 : NEW_DOOR);
      else if (v === CORRIDOR) step = 1;
      else step = 4 + (touchesRoom(x, y) ? 6 : 0) + rng.next();
      if (here === fromId && v !== fromId && !isDoor(cur.x, cur.y, x, y)) step += NEW_DOOR;
      if (cur.dir !== 4 && cur.dir !== dir && here <= 0) step += 3;

      const cost = cur.cost + step;
      const k = key(x, y, dir);
      if (best.has(k) && best.get(k) <= cost) return;
      best.set(k, cost);
      cameFrom.set(k, cur);
      open.push({ x, y, dir, cost });
    });
  }
  if (!goal) return null;

  const path = [];
  for (let cur = goal; cur; cur = cameFrom.get(key(cur.x, cur.y, cur.dir))) path.unshift(cur);
  return path;
}

const DOOR_WEIGHTS = [['door', 55], ['stuck', 20], ['locked', 12], ['arch', 13]];

/**
 * Carve one connection and record a door where it leaves each room.
 * Doors on loop connections may be secret: the spanning tree alone keeps
 * every room reachable, so a missed secret door never blocks the dungeon.
 */
function carveConnection(rng, level, edge) {
  const { cells, rooms, doors } = level;
  const from = rooms[edge.a];
  const to = rooms[edge.b];
  const path = findPath(cells, from, to, rng, doors);
  if (!path) return false;

  const addDoor = (inside, outside, room) => {
    const exists = doors.find((d) =>
      d.room === room.id && d.x === inside.x && d.y === inside.y && d.ox === outside.x && d.oy === outside.y);
    if (exists) return;
    const type = edge.loop && rng.chance(0.4) ? 'secret' : rng.weighted(DOOR_WEIGHTS);
    doors.push({ room: room.id, x: inside.x, y: inside.y, ox: outside.x, oy: outside.y, type, leadsTo: null });
  };

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i];
    const a = cells[prev.y][prev.x];
    const b = cells[cur.y][cur.x];
    if (b <= 0) cells[cur.y][cur.x] = CORRIDOR;
    if (a === from.id && b !== from.id) addDoor(prev, cur, from);
    if (b === to.id && a !== to.id) addDoor(cur, prev, to);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Level assembly
// ---------------------------------------------------------------------------

/** Room-to-room graph distance from `start`, following corridors and doors. */
function roomDepths(level, start) {
  const { cells, rooms, doors } = level;
  const height = cells.length;
  const width = cells[0].length;

  // Which rooms does each room reach by walking out of one of its doors?
  const reach = new Map(rooms.map((r) => [r.id, new Set()]));
  const doorReach = [];
  for (const door of doors) {
    const found = new Set();
    doorReach.push(found);
    const seen = new Set([door.oy * width + door.ox]);
    const queue = [[door.ox, door.oy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const v = cells[ny][nx];
        if (v > 0) {
          // Only count rooms actually entered through a door from this square.
          const through = doors.some((d) => d.room === v && d.x === nx && d.y === ny && d.ox === x && d.oy === y);
          if (through && v !== door.room) { reach.get(door.room).add(v); found.add(v); }
          continue;
        }
        if (v !== CORRIDOR || seen.has(ny * width + nx)) continue;
        seen.add(ny * width + nx);
        queue.push([nx, ny]);
      }
    }
  }

  const depth = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    for (const next of reach.get(id)) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id) + 1);
      queue.push(next);
    }
  }
  return { depth, reach, doorReach };
}

function buildLevel(rng, size, index) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const placed = placeRooms(rng, size);
    if (placed.length < Math.min(4, size.rooms)) continue;

    const cells = Array.from({ length: size.height }, () => new Array(size.width).fill(ROCK));
    const rooms = placed.map((r, i) => ({ ...r, id: i + 1 }));
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y][x] = r.id;
    }

    const level = { index, width: size.width, height: size.height, cells, rooms, doors: [] };
    const edges = planConnections(rng, rooms);
    const ok = edges.every((edge) => carveConnection(rng, level, edge) || edge.loop);
    if (!ok) continue;

    // The entrance is the room nearest a map corner; number rooms outward from it.
    const corner = rng.pick([[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]]);
    const entrance = rooms.reduce((best, r) => {
      const d = Math.abs(center(r).x - corner[0]) + Math.abs(center(r).y - corner[1]);
      return !best || d < best.d ? { r, d } : best;
    }, null).r;

    const { depth } = roomDepths(level, entrance.id);
    if (depth.size !== rooms.length) continue; // a room ended up cut off; try again

    const order = [...rooms].sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.y - b.y || a.x - b.x);
    const renumber = new Map(order.map((r, i) => [r.id, i + 1]));
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) if (cells[y][x] > 0) cells[y][x] = renumber.get(cells[y][x]);
    }
    for (const door of level.doors) door.room = renumber.get(door.room);
    level.rooms = order.map((r) => ({
      id: renumber.get(r.id),
      x: r.x, y: r.y, w: r.w, h: r.h,
      depth: depth.get(r.id),
      // The square that carries the room number on the map; features avoid it.
      label: { x: r.x + Math.floor((r.w - 1) / 2), y: r.y + Math.floor((r.h - 1) / 2) },
      features: [],
      exits: [],
    }));

    const final = roomDepths(level, 1);
    for (const room of level.rooms) room.exits = [...final.reach.get(room.id)].sort((a, b) => a - b);
    level.doors.forEach((door, i) => { door.leadsTo = [...final.doorReach[i]].sort((a, b) => a - b); });
    return level;
  }
  throw new Error('Could not build a connected dungeon level');
}

/** Put a feature on a free square of the room, away from its doors if possible. */
function placeFeature(rng, level, room, type) {
  const taken = (x, y) => (room.label.x === x && room.label.y === y) || room.features.some((f) => f.x === x && f.y === y);
  const atDoor = (x, y) => level.doors.some((d) => d.room === room.id && d.x === x && d.y === y);
  const squares = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) if (!taken(x, y)) squares.push({ x, y });
  }
  const quiet = squares.filter((s) => !atDoor(s.x, s.y));
  const spot = rng.pick(quiet.length ? quiet : squares);
  room.features.push({ type, x: spot.x, y: spot.y });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {string} [options.seed]            same seed, same dungeon
 * @param {'small'|'medium'|'large'} [options.size]
 * @param {number} [options.levels]          1 to 3 floors
 * @param {{count:number, level:number, classes:string[]}} [options.party]
 */
export function generateDungeon(options = {}) {
  const seed = options.seed ? String(options.seed) : randomSeed();
  const sizeName = SIZES[options.size] ? options.size : 'medium';
  const levelCount = Math.max(1, Math.min(3, Math.round(options.levels || 1)));
  const party = {
    count: Math.max(1, Math.round((options.party && options.party.count) || 4)),
    level: Math.max(1, Math.round((options.party && options.party.level) || 1)),
    classes: (options.party && options.party.classes) || [],
  };

  const rng = makeRng(seed);
  const levels = [];
  for (let i = 0; i < levelCount; i++) {
    const level = buildLevel(rng, SIZES[sizeName], i);
    // The first floor matches the party's level; each floor below is one harder.
    level.dungeonLevel = party.level + i;

    const entrance = level.rooms[0];
    entrance.entrance = true;
    placeFeature(rng, level, entrance, i === 0 ? 'entrance' : 'stairsUp');
    if (i < levelCount - 1) {
      const deepest = level.rooms.reduce((a, b) => (b.depth >= a.depth ? b : a));
      placeFeature(rng, level, deepest, 'stairsDown');
    }
    levels.push(level);
  }

  return { version: 1, seed, size: sizeName, party, squareMeters: SQUARE_METERS, levels };
}
