/**
 * Dungeon generator — room contents. Pure logic, no DOM.
 *
 * Fills every room of a generated map by the rules: the room stocking table
 * (gm02), the dungeon encounter tables (gm01), the treasure types (treasure)
 * and the magic item tables (magicItems). `data` is he/dungeon-data.json.
 *
 * Stocking uses its own random stream derived from the dungeon's seed, so the
 * map for a seed stays the same when the stocking rules change.
 */

import { makeRng } from './generator.js';

/** Number of characters the "number appearing" dice are taken to be meant for. */
const REFERENCE_PARTY = 4;

const COIN_GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 5 };
const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'];

const MISSILE_WEAPON = /קשת|חץ|בריח|קליע/;

/** Average result of dice notation such as "2d6+1". */
function average(notation) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(notation || ''));
  if (!m) return parseInt(notation, 10) || 1;
  return (parseInt(m[1], 10) * (parseInt(m[2], 10) + 1)) / 2 + (m[3] ? parseInt(m[3], 10) : 0);
}

/** The row of a level-banded table that covers this dungeon level. */
function bandFor(bands, dungeonLevel) {
  return bands.find((b) => dungeonLevel >= b.min && (b.max === null || dungeonLevel <= b.max)) || bands[bands.length - 1];
}

function createRoller(rng) {
  /** Entry of a roll table for a roll of `die`; falls back to the nearest row. */
  const on = (entries, die = '1d100') => {
    const roll = rng.roll(die);
    return entries.find((e) => roll >= e.min && roll <= e.max)
      || entries.reduce((a, b) => (Math.abs(b.min - roll) < Math.abs(a.min - roll) ? b : a));
  };
  return { on, percent: (pct) => rng.int(1, 100) <= pct };
}

// ---------------------------------------------------------------------------
// Magic items
// ---------------------------------------------------------------------------

function createMagicItems(rng, roller, data) {
  const mi = data.magicItems;

  function weapon() {
    const type = roller.on(mi.weapon.type).name;
    const table = MISSILE_WEAPON.test(type) ? mi.weapon.missileBonus : mi.weapon.meleeBonus;
    let bonus = roller.on(table);
    let ability = null;
    if (bonus.reroll) {
      ability = roller.on(mi.weapon.specialAbility.entries, mi.weapon.specialAbility.die).name;
      // Further "roll again" results are ignored, as the rules say.
      for (let i = 0; i < 50 && bonus.reroll; i++) bonus = roller.on(table);
      if (bonus.reroll) bonus = table[0];
      if (bonus.cursed) ability = null;
    }
    // A cursed weapon shows only its penalty; the card marks it as cursed.
    let text = `${type} ${bonus.bonus > 0 ? '+' : ''}${bonus.bonus}`;
    if (bonus.specialEnemy) {
      const enemy = roller.on(mi.weapon.specialEnemy.entries, mi.weapon.specialEnemy.die).name;
      text = `${type} +${bonus.bonus}, +${bonus.bonusVsEnemy} נגד ${enemy}`;
    }
    if (ability) text += `; ${ability}`;
    return { category: 'weapon', text, cursed: !!bonus.cursed, link: mi.weapon.link };
  }

  function armor() {
    const type = roller.on(mi.armor.type).name;
    const bonus = roller.on(mi.armor.bonus);
    if (bonus.ac11) return { category: 'armor', text: `${type} +1`, cursed: true, cursedNote: 'ac11', link: mi.armor.link };
    if (bonus.rerollNegative) {
      let again = roller.on(mi.armor.bonus);
      for (let i = 0; i < 50 && again.bonus === undefined; i++) again = roller.on(mi.armor.bonus);
      return { category: 'armor', text: `${type} -${again.bonus || 1}`, cursed: true, link: mi.armor.link };
    }
    return { category: 'armor', text: `${type} +${bonus.bonus}`, cursed: false, link: mi.armor.link };
  }

  function scroll() {
    const entry = roller.on(mi.scroll.entries);
    const item = { category: 'scroll', text: entry.name, cursed: !!entry.cursed, link: mi.scroll.link };
    if (entry.spells) {
      item.spellLevels = Array.from({ length: entry.spells }, () => roller.on(mi.scroll.spellLevel).level).sort((a, b) => a - b);
    }
    return item;
  }

  function misc() {
    const effect = roller.on(mi.misc[roller.on(mi.misc.subtable).table]);
    const form = roller.on(mi.misc.forms[effect.form] || mi.misc.forms.A).name;
    return { category: 'misc', form, text: effect.name, cursed: false, link: mi.misc.effectsLink };
  }

  const simple = (category) => () => ({
    category, text: roller.on(mi[category].entries).name, cursed: false, link: mi[category].link,
  });

  const make = { weapon, armor, scroll, misc, potion: simple('potion'), ring: simple('ring'), wand: simple('wand') };

  /** One item of a treasure table kind: any, weaponOrArmor, nonWeapon, potion or scroll. */
  return function item(kind) {
    if (make[kind]) return make[kind]();
    return make[roller.on(mi.kind[kind] || mi.kind.any).category]();
  };
}

// ---------------------------------------------------------------------------
// Treasure
// ---------------------------------------------------------------------------

function createTreasure(rng, roller, data, magicItem) {
  const gems = data.treasure.gems;
  const valueRows = [...gems.value, gems.jewelryStep].filter(Boolean);

  function gem() {
    let row = valueRows.indexOf(roller.on(gems.value));
    const adjust = roller.on(gems.valueAdjustment.entries, gems.valueAdjustment.die);
    if (adjust.shift) row = Math.max(0, Math.min(valueRows.length - 1, row + adjust.shift));
    return {
      name: roller.on(gems.kind).name,
      quality: valueRows[row].name,
      value: Math.round(valueRows[row].baseValue * (adjust.factor || 1)),
      countDice: valueRows[row].count,
    };
  }

  function addGems(treasure, count) {
    // A large number is rolled in batches, as the rules allow.
    const batches = count >= 10;
    for (let left = count; left > 0;) {
      const g = gem();
      const qty = batches ? Math.min(left, rng.roll(g.countDice)) : 1;
      left -= qty;
      const same = treasure.gems.find((x) => x.name === g.name && x.value === g.value);
      if (same) same.qty += qty;
      else treasure.gems.push({ name: g.name, quality: g.quality, value: g.value, qty });
    }
  }

  function addJewelry(treasure, count) {
    const { dice, mult } = data.treasure.jewelry.value;
    for (let i = 0; i < count; i++) {
      treasure.jewelry.push({ name: roller.on(data.treasure.jewelry.kind).name, value: rng.roll(dice) * mult });
    }
  }

  const empty = () => ({ coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, gems: [], jewelry: [], magic: [], notes: [] });

  /** Roll one row of a treasure table into `treasure`. `scale` shrinks a lair hoard. */
  function addRow(treasure, row, scale = 1) {
    for (const coin of Object.keys(treasure.coins)) {
      const c = row.coins[coin];
      if (c && roller.percent(c.pct)) treasure.coins[coin] += Math.round(rng.roll(c.dice) * c.mult * scale);
    }
    if (row.gems && roller.percent(row.gems.pct)) addGems(treasure, Math.round(rng.roll(row.gems.dice) * scale));
    if (row.jewelry && roller.percent(row.jewelry.pct)) addJewelry(treasure, Math.round(rng.roll(row.jewelry.dice) * scale));
    if (row.magic && roller.percent(row.magic.pct)) {
      for (const spec of row.magic.items) {
        const n = rng.roll(spec.count);
        for (let i = 0; i < n; i++) treasure.magic.push(magicItem(spec.kind));
      }
    }
  }

  function finish(treasure) {
    const coins = COINS.reduce((sum, c) => sum + treasure.coins[c] * COIN_GP[c], 0);
    const gemsValue = treasure.gems.reduce((sum, g) => sum + g.value * g.qty, 0);
    const jewelry = treasure.jewelry.reduce((sum, j) => sum + j.value, 0);
    treasure.totalGp = Math.round(coins + gemsValue + jewelry);
    treasure.isEmpty = treasure.totalGp === 0 && treasure.magic.length === 0 && treasure.notes.length === 0;
    return treasure;
  }

  return { empty, addRow, finish };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/**
 * Fill the rooms of `dungeon` (as returned by generateDungeon) in place and
 * return it. Each room gets `content`:
 *   { type: 'empty' | 'monster' | 'trap' | 'treasure' | 'special',
 *     monster?, trap?, treasure? }
 */
export function stockDungeon(dungeon, data) {
  const rng = makeRng(`${dungeon.seed}:stock`);
  const roller = createRoller(rng);
  const magicItem = createMagicItems(rng, roller, data);
  const treasure = createTreasure(rng, roller, data, magicItem);
  const monsters = new Map(data.monsters.map((m) => [m.name, m]));
  const types = data.treasure.types;
  const partyScale = dungeon.party.count / REFERENCE_PARTY;

  function monsterFor(level, lair) {
    const entry = roller.on(bandFor(data.encounters.levels, level.dungeonLevel).entries, '1d12');
    if (entry.type === 'npcParty' || !monsters.has(entry.monster)) {
      return { npcParty: entry.type === 'npcParty', name: entry.name, link: entry.link };
    }
    const m = monsters.get(entry.monster);
    const rolled = rng.roll(m.appearing.dungeon || m.appearing.wild || '1');
    const count = Math.max(1, Math.round(rolled * partyScale));
    const hd = m.hdMax > m.hd ? rng.int(m.hd, m.hdMax) : m.hd;
    const hpDice = m.hdMax > m.hd ? `${hd}d8` : m.hpDice;
    const hp = Array.from({ length: count }, () => Math.max(1, rng.roll(hpDice)));

    // Every monster carries its individual treasure; a lair also holds the hoard,
    // cut down when fewer monsters are home than an average lair would have.
    const loot = treasure.empty();
    for (const letter of m.treasure.individual) {
      for (let i = 0; i < count; i++) treasure.addRow(loot, types[letter]);
    }
    if (lair) {
      const scale = m.appearing.lair ? Math.min(1, count / average(m.appearing.lair)) : 1;
      for (const letter of m.treasure.lair) treasure.addRow(loot, types[letter], scale);
      if (m.treasure.bonusGp) loot.coins.gp += Math.round(rng.roll(m.treasure.bonusGp.dice) * m.treasure.bonusGp.mult * scale);
      if (m.treasure.special) loot.notes.push('special');
    }

    return {
      name: m.name, link: m.link, tableName: entry.name, count, hp, lair,
      ac: m.ac, hdText: hd === m.hd ? m.hdText : String(hd), attacks: m.attacks, damage: m.damage, move: m.move,
      saveText: m.saveText, moraleText: m.moraleText, xpEach: m.xp, xpTotal: m.xp ? m.xp * count : null,
      treasure: treasure.finish(loot),
    };
  }

  function unguarded(level, guarded) {
    const row = bandFor(data.treasure.unguarded.levels, level.dungeonLevel);
    let loot = treasure.empty();
    // The stocking table promised a treasure, so roll until something turns up.
    for (let i = 0; i < 25; i++) {
      loot = treasure.empty();
      treasure.addRow(loot, row);
      if (!treasure.finish(loot).isEmpty) break;
    }
    if (!guarded) {
      // Left alone, a treasure is hidden, trapped, or both.
      loot.guard = rng.weighted([['hidden', 50], ['trapped', 30], ['both', 20]]);
      if (loot.guard !== 'hidden') {
        const small = data.traps.filter((t) => /מחט|גז/.test(t.name));
        loot.guardTrap = rng.pick(small.length ? small : data.traps);
      }
    }
    return treasure.finish(loot);
  }

  for (const level of dungeon.levels) {
    for (const room of level.rooms) {
      // The way in is always quiet, so the party can get its bearings.
      const kind = room.entrance && level.index === 0
        ? { type: 'empty', treasure: false }
        : roller.on(data.stocking.entries, data.stocking.die);

      const content = { type: kind.type };
      if (kind.type === 'monster') content.monster = monsterFor(level, kind.treasure);
      if (kind.type === 'trap') {
        content.trap = rng.pick(data.traps);
        if (kind.treasure) content.treasure = unguarded(level, true);
      }
      if (kind.type === 'treasure') content.treasure = unguarded(level, false);
      room.content = content;
    }

    const band = bandFor(data.encounters.levels, level.dungeonLevel);
    level.wandering = {
      chanceIn6: data.encounters.wandering.chanceIn6,
      everyTurns: data.encounters.wandering.everyTurns,
      die: band.die,
      link: data.encounters.wandering.link,
      entries: band.entries.map((e) => ({ roll: e.min, name: e.name, link: e.link })),
    };
  }

  dungeon.stocked = true;
  return dungeon;
}
