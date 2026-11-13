/**
 * Dungeon generator — solo play. Browser only.
 *
 * The solo view plays the game master's part: it hides what the party has not
 * found, makes the rolls a GM would make (surprise, reaction, morale,
 * wandering monsters, traps, searches, stuck doors) and keeps time.
 * Combat itself stays at the table; the player reports how it ended.
 *
 * State lives in memory for as long as the page shows this dungeon.
 */

import { makeRng, randomSeed } from './generator.js';
import { wanderingEncounter } from './stock.js';
import { css } from './style.js';
import { esc, fill, linked, num, treasureHtml, monsterStatsHtml, factionChip, renderLevelSvg } from './render.js';
import { dungeonParams } from './export.js';

const CORRIDOR = -1;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Corridor networks of a level, and which one each door opens onto. */
function analyse(level) {
  const comp = new Map();
  let next = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (level.cells[y][x] !== CORRIDOR || comp.has(`${x},${y}`)) continue;
      const id = next++;
      const queue = [[x, y]];
      comp.set(`${x},${y}`, id);
      while (queue.length) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of STEPS) {
          const k = `${cx + dx},${cy + dy}`;
          if ((level.cells[cy + dy] || [])[cx + dx] !== CORRIDOR || comp.has(k)) continue;
          comp.set(k, id);
          queue.push([cx + dx, cy + dy]);
        }
      }
    }
  }
  return { comp, doorComp: level.doors.map((d) => comp.get(`${d.ox},${d.oy}`)) };
}

export function mountSolo(dungeon, t, links, data) {
  const s = t.solo;
  const rng = makeRng(randomSeed());
  const d6 = () => rng.int(1, 6);
  const el = document.createElement('div');
  const maps = dungeon.levels.map(analyse);

  let restarting = false;
  const S = {
    level: 0,
    room: 1,
    previous: null,
    turn: 0,
    light: null,
    xp: 0,
    gp: 0,
    magic: [],
    log: [],
    rooms: new Map(),
    comps: new Set(),
    open: new Set(),
    found: new Set(),
    keys: new Set(),
    wander: null,
    prompt: null,
    oracle: null,
    settings: { str: 0, cha: 0, secret: 1, traps: '1' },
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  // The game is kept in the browser's storage under the dungeon's own settings,
  // so reopening the same dungeon resumes it.
  const params = dungeonParams(dungeon);
  const storageKey = `bfrpg-dungeon-solo:${params}`;
  const snapshot = () => ({ ...S, v: 1, confirmRestart: false, rooms: [...S.rooms], comps: [...S.comps], open: [...S.open], found: [...S.found], keys: [...S.keys], log: S.log.slice(0, 200) });
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); } catch (error) { /* storage full or blocked: play on unsaved */ }
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || saved.v !== 1) return false;
      Object.assign(S, saved, { rooms: new Map(saved.rooms), comps: new Set(saved.comps), open: new Set(saved.open), found: new Set(saved.found), keys: new Set(saved.keys) });
      delete S.v;
      return true;
    } catch (error) {
      return false;
    }
  }

  const key = (levelIndex, id) => `${levelIndex}-${id}`;
  const level = () => dungeon.levels[S.level];
  const room = () => level().rooms.find((r) => r.id === S.room);
  const stateOf = (levelIndex, id) => {
    const k = key(levelIndex, id);
    if (!S.rooms.has(k)) S.rooms.set(k, { visited: false, searched: 0, trap: 'armed', guardTrap: 'armed', treasure: 'hidden', taken: false, encounter: null, notesShown: false });
    return S.rooms.get(k);
  };
  const here = () => stateOf(S.level, S.room);
  const log = (text) => S.log.unshift({ turn: S.turn, text });
  const signed = (n) => (n > 0 ? `+${n}` : String(n));

  // ── Encounters ───────────────────────────────────────────────────────────

  function makeEncounter(monster, wandering) {
    const enc = { monster, wandering, state: 'present', hp: monster.hp ? [...monster.hp] : [], morale: [] };
    if (monster.npcParty || !monster.count) return enc;
    enc.surprise = { party: d6(), monsters: d6() };
    const faction = monster.faction !== null && monster.faction !== undefined ? dungeon.factions[monster.faction] : null;
    const roll = d6() + d6();
    const mod = (faction ? faction.reaction : 0) + S.settings.cha;
    const total = roll + mod;
    enc.reaction = { roll, mod, total, result: total <= 2 ? 'attack' : total <= 7 ? 'hostile' : total <= 11 ? 'friendly' : 'veryFriendly' };
    enc.faction = faction;
    return enc;
  }

  const activeEncounter = () => (S.wander && S.wander.state === 'present' ? S.wander
    : (here().encounter && here().encounter.state === 'present' ? here().encounter : null));

  // ── Time ─────────────────────────────────────────────────────────────────

  /** Pass game turns. Returns false if a wandering monster interrupted. */
  function passTurns(count, quiet = false) {
    for (let i = 0; i < count; i++) {
      S.turn += 1;
      if (S.light) {
        S.light.left -= 1;
        if (S.light.left === 1) log(s.log.lightLow);
        if (S.light.left <= 0) { log(s.log.lightOut); S.light = null; }
      }
      if (quiet || S.turn % data.encounters.wandering.everyTurns !== 0) continue;
      if (d6() > data.encounters.wandering.chanceIn6) continue;
      const monster = wanderingEncounter(dungeon, data, level(), rng);
      S.wander = makeEncounter(monster, true);
      log(fill(s.log.wandering, { name: monster.name }));
      return false;
    }
    return true;
  }

  // ── Entering rooms ───────────────────────────────────────────────────────

  function springTrap(trap) {
    log(fill(s.log.trapSprung, { name: trap.name }));
  }

  function enter(id, levelIndex = S.level) {
    S.previous = levelIndex === S.level ? S.room : null;
    S.level = levelIndex;
    S.room = id;
    S.prompt = null;
    const r = room();
    const st = here();
    const first = !st.visited;
    st.visited = true;
    // An open archway shows the passage beyond it at once.
    level().doors.forEach((d, i) => {
      if (d.room === id && d.type === 'arch') { S.open.add(key(S.level, i)); S.comps.add(key(S.level, maps[S.level].doorComp[i])); }
    });
    if (!first) return;
    log(fill(s.log.entered, { n: id }));
    const c = r.content || { type: 'empty' };
    if (c.type === 'trap' && d6() <= 2) { st.trap = 'sprung'; springTrap(c.trap); }
    if (c.type === 'monster') st.encounter = makeEncounter(c.monster, false);
    // A treasure in a trapped container stands in plain sight.
    if (c.type === 'treasure' && c.treasure.guard === 'trapped') st.treasure = 'container';
  }

  // ── Doors ────────────────────────────────────────────────────────────────

  const doorVisible = (i) => level().doors[i].type !== 'secret' || S.found.has(key(S.level, i));
  const doorOpen = (i) => S.open.has(key(S.level, i));
  const needsForce = (i) => !doorOpen(i) && ['stuck', 'locked'].includes(level().doors[i].type);

  function openDoor(i) {
    S.open.add(key(S.level, i));
    S.comps.add(key(S.level, maps[S.level].doorComp[i]));
  }

  /** Try to force a stuck or locked door. Returns true if it gave way. */
  function forceDoor(i) {
    const door = level().doors[i];
    const die = door.type === 'locked' ? 10 : 6;
    const roll = rng.int(1, die);
    const need = Math.max(1, 1 + S.settings.str);
    const ok = roll <= need;
    log(fill(ok ? s.log.forced : s.log.forceFailed, { door: t.doors[door.type], die: `1d${die}`, roll, need }));
    if (ok) openDoor(i);
    return ok;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const actions = {
    open(i) { openDoor(i); },
    force(i) { forceDoor(i); },
    unlock(i) { log(s.log.unlocked); openDoor(i); },
    bypass(i) { log(s.log.bypassed); openDoor(i); },
    go(i) {
      // i is the far door: the one on the room being entered.
      if (needsForce(i)) {
        const has = S.keys.has(key(S.level, i));
        if (has) openDoor(i);
        else if (!forceDoor(i)) { passTurns(1); return; }
      }
      openDoor(i);
      const target = level().doors[i].room;
      // Wandering monsters met on the way stop the party before it arrives.
      if (passTurns(1)) enter(target);
    },
    stairs(dir) {
      const next = S.level + (dir === 'down' ? 1 : -1);
      log(fill(dir === 'down' ? s.log.descended : s.log.ascended, { n: next + 1 }));
      passTurns(1, true);
      const target = dir === 'down' ? 1 : dungeon.levels[next].rooms.find((r) => r.features.some((f) => f.type === 'stairsDown')).id;
      enter(target, next);
    },
    leave() { log(fill(s.log.left, { turns: S.turn, xp: num(S.xp), gp: num(S.gp) })); },

    searchTraps() {
      if (!passTurns(1)) return;
      if (S.settings.traps === 'thief') { S.prompt = { kind: 'thief' }; return; }
      const roll = d6();
      actions.trapResult(roll <= Number(S.settings.traps), roll);
    },
    thiefYes() { S.prompt = null; actions.trapResult(true, null); },
    thiefNo() { S.prompt = null; actions.trapResult(false, null); },
    trapResult(success, roll) {
      const st = here();
      const c = room().content || {};
      const rolled = roll === null ? '' : fill(s.log.rolled, { die: '1d6', roll });
      let foundAny = false;
      if (success && c.type === 'trap' && st.trap === 'armed') { st.trap = 'found'; foundAny = true; log(fill(s.log.trapFound, { name: c.trap.name }) + rolled); }
      if (success && c.treasure && c.treasure.guardTrap && st.guardTrap === 'armed' && st.treasure !== 'hidden') {
        st.guardTrap = 'found'; foundAny = true; log(fill(s.log.trapFound, { name: c.treasure.guardTrap.name }) + rolled);
      }
      if (!foundAny) log(s.log.noTrap + rolled);
    },

    searchRoom() {
      if (!passTurns(1)) return;
      const st = here();
      const r = room();
      const c = r.content || {};
      st.searched += 1;
      let foundAny = false;
      // Rummaging through a room sets off a trap nobody has found.
      if (c.type === 'trap' && st.trap === 'armed') { st.trap = 'sprung'; springTrap(c.trap); foundAny = true; }
      if (c.type === 'treasure' && st.treasure === 'hidden') {
        const roll = d6();
        if (roll <= 2) { st.treasure = c.treasure.guardTrap ? 'container' : 'found'; foundAny = true; log(s.log.treasureFound + fill(s.log.rolled, { die: '1d6', roll })); }
      }
      level().doors.forEach((d, i) => {
        if (d.room !== r.id || d.type !== 'secret' || S.found.has(key(S.level, i))) return;
        const roll = d6();
        if (roll <= S.settings.secret) { S.found.add(key(S.level, i)); foundAny = true; log(s.log.secretFound + fill(s.log.rolled, { die: '1d6', roll })); }
      });
      if (r.keyFor && !st.keyTaken) {
        st.keyTaken = true; foundAny = true;
        level().doors.forEach((d, i) => { if (d.keyRoom === r.id) S.keys.add(key(S.level, i)); });
        log(fill(s.log.keyFound, { room: r.keyFor }));
      }
      if (!foundAny) log(s.log.nothingFound);
    },

    openContainer() {
      const st = here();
      const c = room().content;
      if (c.treasure.guardTrap && st.guardTrap === 'armed') { st.guardTrap = 'sprung'; springTrap(c.treasure.guardTrap); }
      st.treasure = 'found';
    },
    take() {
      const st = here();
      const c = room().content;
      const tr = c.treasure || (c.monster && c.monster.treasure);
      st.taken = true;
      S.gp += tr.totalGp;
      S.magic.push(...tr.magic);
      log(fill(s.log.took, { gp: num(tr.totalGp) }));
    },
    takeWander() {
      const tr = S.wander.monster.treasure;
      S.gp += tr.totalGp;
      S.magic.push(...tr.magic);
      log(fill(s.log.took, { gp: num(tr.totalGp) }));
      S.wander = null;
    },
    dismissWander() { S.wander = null; },

    rest() { if (passTurns(1, room().safe)) log(s.log.rested); },
    night() {
      const before = S.turn;
      if (passTurns(48, room().safe)) log(s.log.night);
      else log(fill(s.log.nightBroken, { turns: S.turn - before }));
    },
    turn() { passTurns(1); },
    torch() { S.light = { kind: 'torch', left: rng.roll('1d4+4') }; log(s.log.torch); },
    lantern() { S.light = { kind: 'lantern', left: 18 + d6() }; log(s.log.lantern); },

    morale() {
      const enc = activeEncounter();
      const value = parseInt(enc.monster.moraleText, 10) || 7;
      const roll = d6() + d6();
      const holds = value >= 12 || roll <= value;
      enc.morale.push({ roll, holds });
      log(fill(holds ? s.log.moraleHolds : s.log.moraleBreaks, { roll, value }));
    },
    defeated() {
      const enc = activeEncounter();
      enc.state = 'defeated';
      S.xp += enc.monster.xpTotal || 0;
      log(fill(s.log.defeated, { name: enc.monster.name, xp: num(enc.monster.xpTotal || 0) }));
    },
    fled() { const enc = activeEncounter(); enc.state = 'fled'; log(fill(s.log.fled, { name: enc.monster.name })); },
    peace() { const enc = activeEncounter(); enc.state = 'peace'; log(fill(s.log.peace, { name: enc.monster.name })); },
    retreat() {
      log(s.log.retreat);
      if (S.wander && S.wander.state === 'present') { S.wander = null; return; }
      if (S.previous !== null) { const back = S.previous; passTurns(1, true); enter(back); }
    },

    saveFile() {
      const file = { app: 'bfrpg-dungeon', v: 1, params, key: storageKey, state: snapshot() };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
      a.download = `dungeon-${dungeon.seed}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    restartAsk() { S.confirmRestart = true; },
    restartNo() { S.confirmRestart = false; },
    restartYes() {
      try { localStorage.removeItem(storageKey); } catch (error) { /* nothing was saved */ }
      restarting = true;
      el.replaceWith(mountSolo(dungeon, t, links, data));
    },

    oracle(odds) {
      const roll = d6() + d6();
      const total = roll + { likely: 2, even: 0, unlikely: -2 }[odds];
      const answer = total <= 3 ? 'noAnd' : total <= 5 ? 'no' : total === 6 ? 'noBut' : total <= 8 ? 'yesBut' : total <= 10 ? 'yes' : 'yesAnd';
      S.oracle = { odds, roll, answer };
      log(fill(s.log.oracle, { odds: s.oracle.odds[odds], answer: s.oracle.answers[answer] }));
    },
  };

  // ── View ─────────────────────────────────────────────────────────────────

  function mapView() {
    const L = level();
    const m = maps[S.level];
    const rooms = new Set(L.rooms.filter((r) => stateOf(S.level, r.id).visited).map((r) => r.id));
    const cells = new Set();
    for (const r of L.rooms) {
      if (!rooms.has(r.id)) continue;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.add(`${x},${y}`);
    }
    for (const [cell, id] of m.comp) if (S.comps.has(key(S.level, id))) cells.add(cell);
    const doors = new Set();
    L.doors.forEach((d, i) => {
      if (!doorVisible(i)) return;
      if (rooms.has(d.room) || S.comps.has(key(S.level, m.doorComp[i]))) doors.add(i);
    });
    return { rooms, cells, doors, current: S.room };
  }

  const btn = (act, label, arg = '', cls = '') =>
    `<button type="button" class="dg-btn ${cls}" data-act="${act}" data-arg="${esc(arg)}">${esc(label)}</button>`;

  function encounterHtml(enc) {
    const m = enc.monster;
    const title = enc.wandering ? s.encounter.wandering : s.encounter.here;
    let out = `<div class="dg-encounter"><p class="dg-content dg-content-monster"><span class="dg-badge">${esc(title)}</span> ${linked(m.name, m.link)}`;
    if (m.npcParty || !m.count) {
      out += `</p><p class="dg-note">${esc(t.monster.npcParty)}</p>`;
    } else {
      out += ` <span class="dg-count" dir="ltr">×${m.count}</span></p>`;
      if (enc.faction) out += `<p class="dg-room-faction">${factionChip(enc.faction)}</p>`;
      const sp = enc.surprise;
      out += `<p class="dg-roll">${linked(s.encounter.surprise, links.surprise)}: `
        + `${esc(fill(sp.party <= 2 ? s.encounter.partySurprised : s.encounter.partyReady, { roll: sp.party }))} `
        + `${esc(fill(sp.monsters <= 2 ? s.encounter.monstersSurprised : s.encounter.monstersReady, { roll: sp.monsters }))}</p>`;
      const re = enc.reaction;
      out += `<p class="dg-roll">${linked(s.encounter.reaction, links.reactions)}: <span dir="ltr">2d6 = ${re.roll}${re.mod ? ` ${signed(re.mod)} = ${re.total}` : ''}</span>, `
        + `<b>${esc(s.encounter.reactions[re.result])}</b>. ${esc(s.encounter.reactionHint)}</p>`;
      out += monsterStatsHtml(m, t);
      out += `<p class="dg-hp"><b>${esc(t.monster.hp)}</b> ${enc.hp.map((hp, i) => `<input class="dg-hp-input" type="number" data-hp="${i}" value="${hp}" aria-label="${esc(t.monster.hp)}">`).join(' ')}</p>`;
      for (const check of enc.morale) out += `<p class="dg-roll">${esc(fill(check.holds ? s.log.moraleHolds : s.log.moraleBreaks, { roll: check.roll, value: parseInt(m.moraleText, 10) || 7 }))}</p>`;
    }
    out += `<p class="dg-actions">${m.count ? btn('morale', s.encounter.morale) : ''}${btn('defeated', s.encounter.defeated, '', 'dg-btn-main')}${btn('fled', s.encounter.fled)}${btn('peace', s.encounter.peace)}${btn('retreat', s.encounter.retreat)}</p>`;
    return `${out}</div>`;
  }

  function exitsHtml() {
    const L = level();
    const m = maps[S.level];
    const r = room();
    const rows = [];
    L.doors.forEach((d, i) => {
      if (d.room !== r.id || !doorVisible(i)) return;
      const dir = t.directions[d.ox > d.x ? 'east' : d.ox < d.x ? 'west' : d.oy > d.y ? 'south' : 'north'];
      let row = `<li><b>${esc(dir)}</b>: ${esc(t.doors[d.type])}. `;
      if (!doorOpen(i)) {
        if (d.type === 'stuck') row += btn('force', s.doors.force, i) + btn('bypass', s.doors.bypass, i);
        else if (d.type === 'locked') {
          row += (S.keys.has(key(S.level, i)) ? btn('unlock', s.doors.unlock, i, 'dg-btn-main') : '') + btn('force', s.doors.breakDown, i) + btn('bypass', s.doors.bypass, i);
        } else row += btn('open', s.doors.open, i, 'dg-btn-main');
        rows.push(`${row}</li>`);
        return;
      }
      // Rooms on the same passage, each reached through its own door.
      const targets = new Map();
      L.doors.forEach((far, j) => {
        if (far.room === r.id || m.doorComp[j] !== m.doorComp[i] || !doorVisible(j)) return;
        const known = targets.get(far.room);
        if (known === undefined || (needsForce(known) && !needsForce(j))) targets.set(far.room, j);
      });
      if (!targets.size) row += esc(s.doors.deadEnd);
      for (const [target, j] of [...targets].sort((a, b) => a[0] - b[0])) {
        const visited = stateOf(S.level, target).visited;
        const label = fill(visited ? s.doors.goKnown : s.doors.goNew, { n: target });
        const far = L.doors[j];
        const blocked = needsForce(j) && !S.keys.has(key(S.level, j));
        row += btn('go', blocked ? `${label} (${t.doors[far.type]})` : label, j, visited ? '' : 'dg-btn-main');
        if (blocked) row += btn('bypass', s.doors.bypass, j);
      }
      rows.push(`${row}</li>`);
    });
    return `<p class="dg-card-label">${esc(t.card.exits)}</p><ul class="dg-exits">${rows.join('')}</ul>`;
  }

  function roomHtml() {
    const L = level();
    const r = room();
    const st = here();
    const c = r.content || { type: 'empty' };
    const m = dungeon.squareMeters;
    let out = `<h4>${esc(fill(t.card.room, { n: r.id }))}${r.purpose ? `: ${esc(r.purpose)}` : ''} <span class="dg-card-size">${esc(fill(t.card.size, { w: r.w * m, h: r.h * m }))}</span></h4>`;
    if (r.detail) out += `<p class="dg-detail">${esc(r.detail)}</p>`;

    if (S.wander) {
      if (S.wander.state === 'present') return out + encounterHtml(S.wander);
      const tr = S.wander.monster.treasure;
      const loot = S.wander.state === 'defeated' && tr && !tr.isEmpty;
      out += `<div class="dg-encounter">${loot ? treasureHtml(tr, t, t.treasure.carried) : `<p>${esc(s.encounter.over)}</p>`}`
        + `<p class="dg-actions">${loot ? btn('takeWander', s.room.take, '', 'dg-btn-main') : ''}${btn('dismissWander', s.encounter.carryOn)}</p></div>`;
      return out;
    }

    const enc = st.encounter;
    if (enc && enc.state === 'present') return out + encounterHtml(enc);

    if (S.prompt && S.prompt.kind === 'thief') {
      return `${out}<div class="dg-encounter"><p>${esc(s.room.thiefPrompt)}</p><p class="dg-actions">${btn('thiefYes', s.room.yes, '', 'dg-btn-main')}${btn('thiefNo', s.room.no)}</p></div>`;
    }

    if (enc) out += `<p class="dg-note">${esc(fill(s.encounter.states[enc.state], { name: enc.monster.name }))}</p>`;
    if (r.safe) out += `<p class="dg-safe"><span class="dg-badge">${esc(t.story.safe)}</span> ${esc(t.story.safeText)} ${esc(s.room.safeRule)}</p>`;
    if (c.type === 'special' && c.special) out += `<p class="dg-content dg-content-special"><span class="dg-badge">${esc(t.content.special)}</span> <span class="dg-special-title">${esc(c.special.title)}</span></p><p class="dg-note">${esc(c.special.text)}</p>`;

    if (c.type === 'trap' && st.trap !== 'armed') {
      out += `<p class="dg-content dg-content-trap"><span class="dg-badge">${esc(st.trap === 'sprung' ? s.room.trapSprung : s.room.trapFound)}</span> ${linked(c.trap.name, c.trap.link)}</p><p class="dg-note">${esc(c.trap.text)}</p>`;
    }
    const guardTrap = c.treasure && c.treasure.guardTrap;
    if (guardTrap && st.guardTrap !== 'armed') {
      out += `<p class="dg-content dg-content-trap"><span class="dg-badge">${esc(st.guardTrap === 'sprung' ? s.room.trapSprung : s.room.trapFound)}</span> ${linked(guardTrap.name, guardTrap.link)}</p><p class="dg-note">${esc(guardTrap.text)}</p>`;
    }

    // Treasure the party can see right now.
    let tr = null;
    let heading = t.treasure.heading;
    if (c.type === 'monster' && enc && c.monster.treasure && (enc.state === 'defeated' || (enc.state === 'fled' && c.monster.lair))) {
      tr = c.monster.treasure; heading = c.monster.lair ? t.treasure.lair : t.treasure.carried;
    }
    if (c.type === 'trap' && c.treasure && st.trap !== 'armed') { tr = c.treasure; heading = t.treasure.guarded; }
    if (c.type === 'treasure' && st.treasure === 'found') tr = c.treasure;
    if (c.type === 'treasure' && st.treasure === 'container') {
      out += `<p class="dg-content dg-content-treasure"><span class="dg-badge">${esc(s.room.container)}</span> ${esc(s.room.containerText)}</p><p class="dg-actions">${btn('openContainer', s.room.openContainer, '', 'dg-btn-main')}</p>`;
    }
    if (tr && !tr.isEmpty) {
      out += st.taken ? `<p class="dg-note">${esc(s.room.taken)}</p>` : `${treasureHtml({ ...tr, guard: null }, t, heading)}<p class="dg-actions">${btn('take', s.room.take, '', 'dg-btn-main')}</p>`;
    }

    // Notes show once nothing in the room stands in the way; a key needs a search.
    for (const note of r.notes || []) {
      if (note.kind === 'key' && !st.keyTaken) continue;
      if (note.kind === 'keyHint' || note.kind === 'hq') continue;
      out += `<p class="dg-hook">${esc(note.text)}</p>`;
    }

    const stairs = [];
    for (const f of r.features) {
      if (f.type === 'entrance') stairs.push(btn('leave', s.room.leave));
      if (f.type === 'stairsDown') stairs.push(btn('stairs', fill(s.room.down, { n: L.index + 2 }), 'down'));
      if (f.type === 'stairsUp') stairs.push(btn('stairs', fill(s.room.up, { n: L.index }), 'up'));
    }
    out += `<p class="dg-actions">${btn('searchTraps', s.room.searchTraps)}${btn('searchRoom', s.room.searchRoom)}${btn('rest', s.room.rest)}${btn('night', s.room.night)}${stairs.join('')}</p>`;
    return out + exitsHtml();
  }

  function statusHtml() {
    const hours = Math.floor((S.turn * 10) / 60);
    const minutes = (S.turn * 10) % 60;
    const light = S.light ? s.status.lights[S.light.kind] : s.status.noLight;
    const select = (name, options) => `<select data-setting="${name}">${options.map(([v, label]) => `<option value="${v}"${String(S.settings[name]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    return `<div class="dg-status">`
      + `<span><b>${esc(s.status.turn)}</b> ${S.turn} (${hours}:${String(minutes).padStart(2, '0')})</span>`
      + `<span class="${S.light ? '' : 'dg-warn'}"><b>${esc(s.status.light)}</b> ${esc(light)}</span>`
      + `<span><b>${esc(s.status.xp)}</b> ${num(S.xp)}</span>`
      + `<span><b>${esc(s.status.gp)}</b> ${num(S.gp)} ${esc(t.coins.gp)}</span>`
      + (S.magic.length ? `<span><b>${esc(s.status.magic)}</b> ${S.magic.length}</span>` : '')
      + `<span class="dg-actions">${btn('torch', s.status.torch)}${btn('lantern', s.status.lantern)}${btn('turn', s.status.passTurn)}</span>`
      + `</div>`
      + `<details class="dg-settings"><summary>${esc(s.settings.title)}</summary>`
      + `<label>${esc(s.settings.str)} ${select('str', [[0, '0'], [1, '+1'], [2, '+2'], [3, '+3']])}</label>`
      + `<label>${esc(s.settings.cha)} ${select('cha', [[-2, '-2'], [-1, '-1'], [0, '0'], [1, '+1'], [2, '+2']])}</label>`
      + `<label>${esc(s.settings.secret)} ${select('secret', [[1, s.settings.in6one], [2, s.settings.in6two], [3, s.settings.in6three]])}</label>`
      + `<label>${esc(s.settings.traps)} ${select('traps', [['1', s.settings.in6one], ['2', s.settings.in6two], ['thief', s.settings.thief]])}</label>`
      + `</details>`;
  }

  function render() {
    const L = level();
    const many = dungeon.levels.length > 1;
    const title = fill(many ? t.level.titleMany : t.level.titleOne, { n: L.index + 1, dl: L.dungeonLevel });
    const story = dungeon.story;
    const oracle = `<div class="dg-oracle"><b>${esc(s.oracle.title)}</b> ${esc(s.oracle.hint)} `
      + `${btn('oracle', s.oracle.odds.likely, 'likely')}${btn('oracle', s.oracle.odds.even, 'even')}${btn('oracle', s.oracle.odds.unlikely, 'unlikely')}`
      + (S.oracle ? ` <span class="dg-oracle-answer">${esc(s.oracle.answers[S.oracle.answer])}</span>` : '') + '</div>';
    const magic = S.magic.length ? `<details class="dg-settings"><summary>${esc(s.status.magicList)}</summary><ul>${S.magic.map((item) => `<li>${linked(fill(t.magic[item.category], { name: item.text, form: item.form || '' }), item.link)}</li>`).join('')}</ul></details>` : '';

    el.innerHTML = `<div class="dg-root dg-solo" dir="rtl"><style>${css}</style>`
      + (story ? `<section class="dg-story"><h3>${esc(story.name)}</h3><p>${esc(story.origin.join(' '))}</p><p><b>${esc(t.story.hook)}</b> ${esc(story.hook.text)}</p>`
        + `<details class="dg-rumors"><summary>${esc(t.story.rumors)}</summary><p>${esc(s.rumorsHint)}</p><ul>${story.rumors.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul></details></section>` : '')
      + statusHtml()
      + `<section class="dg-level"><h3>${esc(title)}</h3><div class="dg-map-wrap">${renderLevelSvg(L, title, mapView())}</div></section>`
      + `<section class="dg-card dg-solo-room">${roomHtml()}</section>`
      + oracle + magic
      + `<p class="dg-toolbar">${S.confirmRestart
        ? `${esc(s.save.confirm)} ${btn('restartYes', s.save.yes)}${btn('restartNo', s.save.no)}`
        : `${btn('saveFile', s.save.file)}<label class="dg-btn">${esc(s.save.load)}<input type="file" accept=".json,application/json" data-load hidden></label>${btn('restartAsk', s.save.restart)} <span class="dg-card-label">${esc(s.save.auto)}</span>`}</p>`
      + `<details class="dg-log" open><summary>${esc(s.log.title)}</summary><ol>${S.log.slice(0, 60).map((e) => `<li><span class="dg-log-turn">${esc(fill(s.log.turn, { n: e.turn }))}</span> ${esc(e.text)}</li>`).join('')}</ol></details>`
      + '</div>';
  }

  el.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act]');
    if (!button || !actions[button.dataset.act]) return;
    const arg = button.dataset.arg;
    actions[button.dataset.act](arg === '' ? undefined : (/^\d+$/.test(arg) ? Number(arg) : arg));
    if (restarting) return;
    render();
    save();
  });
  el.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.load !== undefined && target.files[0]) {
      // A saved game names its dungeon; store it, point the page at that dungeon and reload.
      target.files[0].text().then((text) => {
        const file = JSON.parse(text);
        if (file.app !== 'bfrpg-dungeon' || !file.key || !file.state) throw new Error('not a saved dungeon');
        localStorage.setItem(file.key, JSON.stringify(file.state));
        window.location.hash = `${file.params}&view=solo`;
        window.location.reload();
      }).catch(() => { log(s.save.badFile); render(); });
      return;
    }
    if (target.dataset.setting) {
      S.settings[target.dataset.setting] = target.dataset.setting === 'traps' ? target.value : Number(target.value);
    } else if (target.dataset.hp !== undefined) {
      const enc = activeEncounter();
      if (enc) enc.hp[Number(target.dataset.hp)] = Number(target.value);
    }
    save();
  });

  if (restore()) log(s.save.resumed);
  else { log(s.log.start); enter(1, 0); }
  render();
  return el;
}
