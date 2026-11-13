/**
 * Dungeon generator — story. Pure logic, no DOM.
 *
 * planStory runs before the rooms are stocked: it names the dungeon, gives it
 * a past, and settles factions into territories so that stocking can fill
 * those rooms with the faction's own monsters.
 *
 * finishStory runs after stocking: it gives each room its old purpose and a
 * detail, fills the "special" rooms, marks safe rooms, and adds the notes
 * that tie rooms together (keys, prisoners, the adventure hook, rumours).
 *
 * `content` is the language file (content-he.js). All text comes from it.
 */

import { makeRng } from './generator.js';

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ''));

/** Draws from a list without repeating until the list runs out. */
function bag(rng, list) {
  let left = [];
  return () => {
    if (!left.length) left = [...list];
    return left.splice(rng.int(0, left.length - 1), 1)[0];
  };
}

/** Steps between rooms, counting each door-to-door hop as one. */
function roomDistances(level, from) {
  const exits = new Map(level.rooms.map((r) => [r.id, r.exits]));
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const next of exits.get(id)) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(id) + 1);
      queue.push(next);
    }
  }
  return dist;
}

const FACTIONS_PER_LEVEL = { small: [1, 2], medium: [2, 3], large: [3, 4] };

// ---------------------------------------------------------------------------
// Before stocking
// ---------------------------------------------------------------------------

export function planStory(dungeon, data, content) {
  const rng = makeRng(`${dungeon.seed}:story`);
  const monsters = new Map(data.monsters.map((m) => [m.name, m]));

  const place = rng.pick(content.places);
  dungeon.story = {
    name: `${place.construct} ${rng.pick(content.placeEpithets)}`,
    place: place.id,
    origin: [rng.pick(place.built), rng.pick(content.fall)],
    hook: null,
    relations: [],
    rumors: [],
  };
  dungeon.factions = [];

  const nextEpithet = bag(rng, content.factionEpithets);
  const nextGoal = bag(rng, content.goals);
  const nextAttitude = bag(rng, content.attitudes);
  const nextTrait = bag(rng, content.leaderTraits);
  const nextName = { m: bag(rng, content.leaderNames.m), f: bag(rng, content.leaderNames.f) };
  const nextRelation = bag(rng, content.relations);

  for (const level of dungeon.levels) {
    const dl = level.dungeonLevel;
    const known = content.species.filter((s) => monsters.has(s.monster));
    let pool = known.filter((s) => dl >= s.min && dl <= s.max);
    if (!pool.length) pool = known.slice(-2);
    const nextSpecies = bag(rng, pool);

    const [lo, hi] = FACTIONS_PER_LEVEL[dungeon.size] || FACTIONS_PER_LEVEL.medium;
    const count = Math.min(rng.int(lo, hi), Math.floor((level.rooms.length - 1) / 3));

    // Seats of power: far from the entrance and far from each other.
    const fromEntrance = roomDistances(level, 1);
    const seats = [];
    const seatDistances = [];
    for (let i = 0; i < count; i++) {
      let best = null;
      for (const room of level.rooms) {
        if (room.id === 1 || seats.includes(room.id)) continue;
        const apart = Math.min(fromEntrance.get(room.id), ...seatDistances.map((d) => d.get(room.id)));
        const score = apart + rng.next() * 0.9;
        if (!best || score > best.score) best = { id: room.id, score, apart };
      }
      if (!best || best.apart < 1) break;
      seats.push(best.id);
      seatDistances.push(roomDistances(level, best.id));
    }

    const levelFactions = seats.map((seat, i) => {
      const species = nextSpecies();
      const monster = monsters.get(species.monster);
      const gender = rng.chance(0.4) ? 'f' : 'm';
      const attitude = nextAttitude();
      return {
        id: dungeon.factions.length + i,
        level: level.index,
        name: `${species.plural} של ${nextEpithet()}`,
        monster: monster.name,
        monsterLink: monster.link,
        // A weak species on a deep level turns up in larger numbers.
        strength: Math.max(1, Math.min(3, Math.round(dl / (monster.hd + 1)))),
        leader: { gender, title: content.leaderTitle[gender], name: nextName[gender](), trait: nextTrait()[gender] },
        goal: nextGoal(),
        attitude: attitude.text,
        reaction: attitude.reaction,
        hq: seat,
        rooms: [],
      };
    });

    // Rooms next to a seat join that faction, nearest rooms first and only up
    // to a share of the level, so that unclaimed ground is left between them.
    const reach = dungeon.size === 'large' ? 2 : 1;
    const share = Math.max(2, Math.floor((level.rooms.length * 0.55) / Math.max(1, seats.length)));
    for (const room of level.rooms) room.faction = null;
    const byNearness = [...level.rooms].sort((x, y) =>
      Math.min(...seatDistances.map((d) => d.get(x.id))) - Math.min(...seatDistances.map((d) => d.get(y.id))));
    for (const room of byNearness) {
      if (room.id === 1) continue;
      let nearest = null;
      seats.forEach((seat, i) => {
        const d = seatDistances[i].get(room.id);
        if (d <= reach && levelFactions[i].rooms.length < share && (!nearest || d < nearest.d)) nearest = { i, d };
      });
      if (!nearest) continue;
      room.faction = levelFactions[nearest.i].id;
      room.hq = room.id === seats[nearest.i];
      levelFactions[nearest.i].rooms.push(room.id);
    }
    dungeon.factions.push(...levelFactions);

    if (levelFactions.length === 1) {
      dungeon.story.relations.push({ level: level.index, id: 'alone', a: levelFactions[0].id, b: null });
    }
    for (let i = 0; i < levelFactions.length; i++) {
      for (let j = i + 1; j < levelFactions.length; j++) {
        const [a, b] = rng.chance(0.5) ? [i, j] : [j, i];
        dungeon.story.relations.push({ level: level.index, id: nextRelation().id, a: levelFactions[a].id, b: levelFactions[b].id });
      }
    }
  }

  const hooks = content.hooks.filter((h) => !h.needsFaction || dungeon.factions.length);
  const hook = rng.pick(hooks);
  const faction = hook.needsFaction ? rng.pick(dungeon.factions) : null;
  dungeon.story.hook = { id: hook.id, faction: faction ? faction.id : null, room: null };
  return dungeon;
}

// ---------------------------------------------------------------------------
// After stocking
// ---------------------------------------------------------------------------

const treasureOf = (room) => (room.content && (room.content.treasure || (room.content.monster && room.content.monster.treasure))) || null;

export function finishStory(dungeon, data, content) {
  const rng = makeRng(`${dungeon.seed}:dressing`);
  const place = content.places.find((p) => p.id === dungeon.story.place) || content.places[0];
  const factionById = new Map(dungeon.factions.map((f) => [f.id, f]));
  const roomOf = (levelIndex, id) => dungeon.levels[levelIndex].rooms.find((r) => r.id === id);

  const nextPurpose = bag(rng, place.rooms);
  const nextDetail = bag(rng, content.details);
  const nextSpecial = bag(rng, content.specials);

  for (const level of dungeon.levels) {
    for (const room of level.rooms) {
      room.purpose = nextPurpose();
      room.detail = rng.chance(0.75) ? nextDetail() : null;
      room.notes = [];
      room.safe = false;
      if (room.content && room.content.type === 'special') room.content.special = nextSpecial();
      if (room.hq) {
        const f = factionById.get(room.faction);
        room.notes.push(fill(f.leader.gender === 'f' ? content.notes.hqF : content.notes.hq, { title: f.leader.title, name: f.leader.name }));
      }
    }

    // Safe rooms: empty, off anyone's territory, and with a single way in.
    const doorsOf = (room) => level.doors.filter((d) => d.room === room.id);
    const quiet = level.rooms.filter((r) => r.content && r.content.type === 'empty' && !r.entrance
      && r.faction === null && doorsOf(r).length === 1);
    const barrable = quiet.filter((r) => doorsOf(r)[0].type !== 'arch');
    let candidates = barrable.length ? barrable : quiet;
    if (!candidates.length) {
      // No empty dead end: clear out an unclaimed one, so every level has a refuge.
      candidates = level.rooms.filter((r) => !r.entrance && r.faction === null && doorsOf(r).length === 1 && r.notes.length === 0);
      if (!candidates.length) candidates = level.rooms.filter((r) => !r.entrance && r.faction === null && r.notes.length === 0).slice(-1);
      for (const r of candidates) r.clearIfSafe = true;
    }
    const wanted = Math.max(1, Math.round(level.rooms.length / 10));
    for (let i = 0; i < wanted && candidates.length; i++) {
      const room = candidates.splice(rng.int(0, candidates.length - 1), 1)[0];
      room.safe = true;
      if (room.clearIfSafe) room.content = { type: 'empty' };
    }

    // One locked door per level has a key lying somewhere on the way to it.
    const locked = level.doors.filter((d) => d.type === 'locked');
    if (locked.length) {
      const door = rng.pick(locked);
      const doorRoom = level.rooms.find((r) => r.id === door.room);
      const others = level.rooms.filter((r) => r.id !== doorRoom.id && !door.leadsTo.includes(r.id));
      const before = others.filter((r) => r.depth <= doorRoom.depth);
      const lively = (before.length ? before : others).filter((r) => r.content && r.content.type !== 'empty');
      const pool = lively.length ? lively : (before.length ? before : others);
      if (pool.length) {
        const keyRoom = rng.pick(pool);
        keyRoom.notes.push(fill(content.notes.keyHere, { room: doorRoom.id }));
        doorRoom.notes.push(fill(content.notes.keyElsewhere, { room: keyRoom.id }));
      }
    }
  }

  // Relations between factions, and the prisoner one of them may hold.
  for (const room of dungeon.levels.flatMap((l) => l.rooms)) delete room.clearIfSafe;
  for (const rel of dungeon.story.relations) {
    const a = factionById.get(rel.a);
    const b = rel.b === null ? null : factionById.get(rel.b);
    const template = rel.id === 'alone' ? content.alone : content.relations.find((r) => r.id === rel.id).text;
    rel.text = fill(template, { a: a.name, b: b ? b.name : '' });
    if (rel.id === 'prisoner') {
      rel.room = a.hq;
      roomOf(a.level, a.hq).notes.push(fill(content.notes.prisonerHere, { faction: b.name }));
    }
  }

  // The adventure hook, and the room it points at.
  const hook = dungeon.story.hook;
  const hookFaction = hook.faction === null ? null : factionById.get(hook.faction);
  hook.text = fill(content.hooks.find((h) => h.id === hook.id).text, { faction: hookFaction ? hookFaction.name : '', dungeon: dungeon.story.name });
  if (hook.id === 'rescue') {
    hook.room = { level: hookFaction.level, id: hookFaction.hq };
    roomOf(hookFaction.level, hookFaction.hq).notes.push(content.notes.captiveHere);
  }
  if (hook.id === 'quest') {
    const last = dungeon.levels[dungeon.levels.length - 1];
    const deep = [...last.rooms].sort((x, y) => y.depth - x.depth);
    const guarded = deep.slice(0, 4).find((r) => r.content && r.content.type !== 'empty') || deep[0];
    hook.room = { level: last.index, id: guarded.id };
    guarded.notes.push(content.notes.relicHere);
  }

  // Rumours: true ones drawn from what is really in the dungeon, plus some false.
  const rumors = [];
  for (const level of dungeon.levels) {
    const rich = level.rooms.reduce((best, r) => {
      const t = treasureOf(r);
      return t && t.totalGp > (best ? treasureOf(best).totalGp : 0) ? r : best;
    }, null);
    if (rich) {
      const xs = level.rooms.flatMap((r) => [r.x, r.x + r.w]);
      const ys = level.rooms.flatMap((r) => [r.y, r.y + r.h]);
      const dx = (rich.x + rich.w / 2 - (Math.min(...xs) + Math.max(...xs)) / 2) / (Math.max(...xs) - Math.min(...xs));
      const dy = (rich.y + rich.h / 2 - (Math.min(...ys) + Math.max(...ys)) / 2) / (Math.max(...ys) - Math.min(...ys));
      const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
      rumors.push({ text: fill(content.rumors.richest, { level: level.index + 1, side: content.rumors.sides[side] }), true: true });
    }
  }
  const rooms = dungeon.levels.flatMap((l) => l.rooms);
  const trapped = rooms.filter((r) => r.content && r.content.type === 'trap');
  if (trapped.length) rumors.push({ text: fill(content.rumors.trap, { trap: rng.pick(trapped).content.trap.name }), true: true });
  if (rooms.some((r) => r.safe)) rumors.push({ text: content.rumors.safe, true: true });
  if (dungeon.levels.some((l) => l.doors.some((d) => d.type === 'secret'))) rumors.push({ text: content.rumors.secret, true: true });
  const told = dungeon.story.relations.filter((r) => r.id !== 'alone');
  if (told.length) rumors.push({ text: rng.pick(told).text, true: true });

  const nextFalse = bag(rng, content.rumors.false);
  const lies = Math.max(2, Math.round(rumors.length / 2));
  for (let i = 0; i < lies; i++) rumors.push({ text: nextFalse(), true: false });
  dungeon.story.rumors = rumors
    .map((r) => ({ r, order: rng.next() }))
    .sort((x, y) => x.order - y.order)
    .map((x) => x.r);

  return dungeon;
}
