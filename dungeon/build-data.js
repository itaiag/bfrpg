#!/usr/bin/env node
/**
 * Dungeon generator data extraction.
 *
 * Reads the Hebrew chapters (he/*.qmd) and he/monsters.json and writes
 * he/dungeon-data.json: monsters, dungeon encounter tables, room stocking,
 * traps, treasure types and magic item tables, each with a link into the book.
 *
 * Usage:  node dungeon/build-data.js
 *
 * The chapters stay the single source of truth. Re-run this after editing any
 * of the tables it reads. It exits with code 1 if something it needs is missing
 * and prints warnings for anything suspicious (unmatched names, gaps in roll
 * tables, anchors that differ from the rendered site).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HE = path.join(ROOT, 'he');
const RENDERED = path.join(ROOT, 'docs', 'he');
const OUT = path.join(HE, 'dungeon-data.json');

const warnings = [];
const errors = [];
const warn = (msg) => warnings.push(msg);
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------
// Markdown reading
// ---------------------------------------------------------------------------

const readChapter = (name) => fs.readFileSync(path.join(HE, name), 'utf8').replace(/\r\n/g, '\n');

/** Strip inline markdown so a cell or heading can be compared as plain text. */
function plain(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([*_])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name used for matching: no footnote stars, single spaces. */
const norm = (name) => plain(name).replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * Pandoc's auto-identifier algorithm, which Quarto uses for section anchors:
 * keep letters, digits, "_", "-" and "."; spaces become hyphens; lowercase;
 * drop everything before the first letter.
 */
function slug(headingText) {
  const s = plain(headingText)
    .replace(/[^\p{L}\p{N}\p{M}_\-. ]/gu, '')
    .replace(/ /g, '-')
    .toLowerCase()
    .replace(/^[^\p{L}]+/u, '');
  return s || 'section';
}

/**
 * Parse a chapter into headings (with their anchors) and tables.
 * Every table remembers the heading it sits under and the id of the
 * enclosing `::: {#id}` div, if any.
 */
function parseChapter(name) {
  const lines = readChapter(name).split('\n');
  const headings = [];
  const tables = [];
  const used = new Map();
  let inFence = false;
  let divId = null;
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (h) {
      let text = h[2];
      let id = null;
      const attr = /\s*\{([^}]*)\}\s*$/.exec(text);
      if (attr) {
        text = text.slice(0, attr.index);
        const explicit = /#([^\s}]+)/.exec(attr[1]);
        if (explicit) id = explicit[1];
      }
      if (!id) {
        const base = slug(text);
        const n = used.get(base) || 0;
        used.set(base, n + 1);
        id = n === 0 ? base : `${base}-${n}`;
      }
      current = { level: h[1].length, text: plain(text), id, line: i + 1 };
      headings.push(current);
      continue;
    }

    const div = /^:::+\s*\{[^}]*#([\w-]+)[^}]*\}/.exec(line);
    if (div) { divId = div[1]; continue; }

    if (/^\s*\|/.test(line)) {
      const rows = [];
      const start = i;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(plain);
        rows.push(cells);
        i++;
      }
      i--;
      const isRule = (r) => r.every((c) => /^:?-+:?$/.test(c));
      const ruleAt = rows.findIndex(isRule);
      tables.push({
        chapter: name,
        heading: current ? current.text : null,
        headingId: current ? current.id : null,
        divId,
        line: start + 1,
        header: ruleAt > 0 ? rows[ruleAt - 1] : [],
        rows: rows.slice(ruleAt + 1),
      });
      divId = null;
    }
  }
  return { name, headings, tables };
}

const chapters = new Map();
function chapter(name) {
  if (!chapters.has(name)) chapters.set(name, parseChapter(name));
  return chapters.get(name);
}

const htmlName = (qmd) => qmd.replace(/\.qmd$/, '.html');

/** Link to the n-th heading with this text (n counts from 0) in a chapter. */
function linkTo(qmd, headingText, occurrence = 0) {
  const matches = chapter(qmd).headings.filter((h) => norm(h.text) === norm(headingText));
  if (!matches[occurrence]) {
    fail(`${qmd}: heading "${headingText}" (occurrence ${occurrence + 1}) not found`);
    return null;
  }
  // A chapter title (level 1) has no anchor in a Quarto book: link to the page.
  if (matches[occurrence].level === 1) return htmlName(qmd);
  return `${htmlName(qmd)}#${matches[occurrence].id}`;
}

function tableByDiv(qmd, divId) {
  const t = chapter(qmd).tables.find((x) => x.divId === divId);
  if (!t) fail(`${qmd}: table in div #${divId} not found`);
  return t;
}

function tableByHeading(qmd, headingText, index = 0) {
  const t = chapter(qmd).tables.filter((x) => x.heading && norm(x.heading) === norm(headingText))[index];
  if (!t) fail(`${qmd}: table under heading "${headingText}" not found`);
  return t;
}

// ---------------------------------------------------------------------------
// Small parsers
// ---------------------------------------------------------------------------

const DICE = /\d+d\d+(?:\s*[+-]\s*\d+)?/;

/** "01-25" → {min:1,max:25}; "95" → {min:95,max:95}; "00" means 100. */
function parseRange(cell) {
  const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(cell.trim());
  if (!m) return null;
  const val = (s) => (s === '00' || s === '0' ? 100 : parseInt(s, 10));
  const min = val(m[1]);
  const max = m[2] === undefined ? min : val(m[2]);
  return { min, max };
}

/**
 * Build a roll table from rows. `rangeCol` holds the die range, `pick` turns a
 * row into the entry's payload. Rows with an empty range cell are skipped.
 */
function rollTable(label, table, rangeCol, pick, size, first = 1) {
  const entries = [];
  for (const row of table.rows) {
    const cell = (row[rangeCol] || '').trim();
    if (!cell) continue;
    const range = parseRange(cell);
    if (!range) { warn(`${label}: cannot read range "${cell}"`); continue; }
    if (range.max < range.min) {
      warn(`${label}: range "${cell}" is empty (same in the English source); entry "${plain(row.join(' / '))}" can never be rolled here`);
      continue;
    }
    entries.push({ ...range, ...pick(row) });
  }
  if (size !== null) checkCoverage(label, entries, size, first);
  return entries;
}

/** Warn unless the entries cover first..size exactly once. */
function checkCoverage(label, entries, size, first = 1) {
  const sorted = [...entries].sort((a, b) => a.min - b.min);
  let next = first;
  for (const e of sorted) {
    if (e.min > next) warn(`${label}: nothing covers ${next}-${e.min - 1}`);
    if (e.min < next) warn(`${label}: ${e.min}-${e.max} overlaps the previous row`);
    next = Math.max(next, e.max + 1);
  }
  if (size && next - 1 !== size) warn(`${label}: table ends at ${next - 1}, expected ${size}`);
}

/** "50% 5d6" → {pct:50,dice:"5d6",mult:1}; "4d6x10" → mult 10; "אין" → null. */
function parseChance(cell, baseMult = 1) {
  const text = cell.trim();
  if (!text || text === 'אין') return null;
  const pct = /(\d+)\s*%/.exec(text);
  const dice = DICE.exec(text.replace(/\d+\s*%/, ''));
  if (!dice) { warn(`treasure: cannot read "${cell}"`); return null; }
  const mult = /[x×]\s*(\d+)/.exec(text);
  return {
    pct: pct ? parseInt(pct[1], 10) : 100,
    dice: dice[0].replace(/\s+/g, ''),
    mult: baseMult * (mult ? parseInt(mult[1], 10) : 1),
  };
}

/** Magic item cell, e.g. "35% 1d4 כלשהם מלבד כלי נשק + 1 שיקוי + 1 מגילה". */
function parseMagic(cell) {
  const text = cell.trim();
  if (!text || text === 'אין') return null;
  const pct = /(\d+)\s*%/.exec(text);
  const items = text.replace(/\d+\s*%/, '').split('+').map((part) => {
    const p = part.trim();
    const count = (DICE.exec(p) || /\d+/.exec(p) || ['1'])[0];
    let kind;
    if (/מלבד/.test(p)) kind = 'nonWeapon';
    else if (/נשק או שריון/.test(p)) kind = 'weaponOrArmor';
    else if (/שיקוי/.test(p)) kind = 'potion';
    else if (/מגיל/.test(p)) kind = 'scroll';
    else if (/כלשה/.test(p)) kind = 'any';
    else { warn(`treasure: unknown magic item kind in "${cell}"`); kind = 'any'; }
    return { count, kind };
  });
  return { pct: pct ? parseInt(pct[1], 10) : 100, items, text };
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

const FIELD = {
  ac: 'דירוג שריון:',
  hd: 'קוביות פגיעה:',
  attacks: 'מספר התקפות:',
  damage: 'נזק:',
  move: 'תנועה:',
  appearing: 'מספר מופיעים:',
  save: 'גלגול הצלה:',
  morale: 'מורל:',
  treasure: 'סוג אוצר:',
  xp: 'נק"נ:',
};

/** Hit dice text → numbers the generator can compare and roll. */
function parseHitDice(text) {
  const t = text.trim();
  const stars = (t.split(/ עד | -- /)[0].match(/\*/g) || []).length;
  const fixed = /^(\d+d\d+|\d+) נקוד/.exec(t);
  if (fixed) return { hd: 0.5, hdMax: 0.5, hpDice: fixed[1], stars };
  if (/^(1\/2|½)/.test(t)) return { hd: 0.5, hdMax: 0.5, hpDice: '1d4', stars };
  const one = (s) => {
    const m = /^(\d+)\s*([+-]\s*\d+)?/.exec(s.trim());
    return m ? { n: parseInt(m[1], 10), mod: m[2] ? parseInt(m[2].replace(/\s/g, ''), 10) : 0 } : null;
  };
  const parts = t.split(/ עד | -- /).map(one);
  if (!parts[0]) { warn(`monster hit dice unreadable: "${text}"`); return { hd: 1, hdMax: 1, hpDice: '1d8', stars }; }
  const lo = parts[0];
  const hi = parts[1] || lo;
  const mod = lo.mod ? (lo.mod > 0 ? `+${lo.mod}` : `${lo.mod}`) : '';
  return { hd: lo.n, hdMax: hi.n, hpDice: `${lo.n}d8${mod}`, stars };
}

/** "2d4, פרא 3d6, מאורה 10d6" → {dungeon:"2d4", wild:"3d6", lair:"10d6"}. */
function parseAppearing(text) {
  const out = { dungeon: null, wild: null, lair: null, special: /מיוחד|מבוית/.test(text) };
  for (const part of text.split(',')) {
    const p = part.trim();
    const amount = (DICE.exec(p) || /\d+/.exec(p) || [null])[0];
    if (!amount) continue;
    if (p.startsWith('פרא')) out.wild = amount;
    else if (p.startsWith('מאורה')) out.lair = amount;
    else out.dungeon = amount;
  }
  return out;
}

/** Treasure letters: P-V are carried by each monster, A-O are lair hoards. */
function parseTreasureType(text) {
  const letters = text.replace(/\([^)]*\)/g, '').match(/(?<![A-Za-z\d])[A-V](?![A-Za-z\d])/g) || [];
  const bonus = /(\d+d\d+)\s*[×x]\s*([\d,]+)\s*מ"ז/.exec(text);
  return {
    individual: letters.filter((l) => l >= 'P'),
    lair: letters.filter((l) => l <= 'O'),
    bonusGp: bonus ? { dice: bonus[1], mult: parseInt(bonus[2].replace(/,/g, ''), 10) } : null,
    special: /מיוחד|מחושב/.test(text),
  };
}

function buildMonsters() {
  const raw = JSON.parse(fs.readFileSync(path.join(HE, 'monsters.json'), 'utf8'));
  const all = chapter('monstersAll.qmd');

  // Every stat block's header row names the variants it covers, so it maps
  // each monsters.json name to the heading (and anchor) of its description.
  const anchorOf = new Map();
  const statsOf = new Map();
  for (const t of all.tables) {
    if (!t.rows.some((r) => norm(r[0]) === norm(FIELD.ac))) continue;
    t.header.slice(1).forEach((variant, col) => {
      const key = norm(variant);
      if (!key) return;
      anchorOf.set(key, t.headingId);
      statsOf.set(key, Object.fromEntries(t.rows.map((r) => [norm(r[0]), plain(r[col + 1] || '')])));
    });
  }

  const monsters = raw.map((m) => {
    const name = plain(m['שם']);
    const key = norm(name);
    const anchor = anchorOf.get(key);
    if (!anchor) warn(`monster "${name}": no stat block found in monstersAll.qmd, so no link`);

    // The chapter is canonical; report where monsters.json disagrees with it.
    const inChapter = statsOf.get(key);
    if (inChapter) {
      for (const label of Object.values(FIELD)) {
        const a = plain(m[label] || '');
        // Cells spanning several variants are written once as "-- value --" and left blank after.
        const b = (inChapter[norm(label)] || '').replace(/^[-–\s]+|[-–\s]+$/g, '');
        if (b && a.replace(/\s/g, '') !== b.replace(/\s/g, '')) {
          warn(`monster "${name}", ${label} monsters.json has "${a}" but monstersAll.qmd has "${b}"`);
        }
      }
    }

    const get = (f) => plain(m[FIELD[f]] || '');
    // "לוחם: 2", "אדם רגיל" (normal man, no level), "קוסם: לפי קוביות הפגיעה".
    const save = /^([^:]+?)(?::\s*(.*))?$/.exec(get('save'));
    const saveLevel = save && /^\d+/.test(save[2] || '') ? parseInt(save[2], 10) : null;
    return {
      name,
      link: anchor ? `monstersAll.html#${anchor}` : null,
      ac: get('ac'),
      acValue: parseInt(get('ac'), 10) || null,
      hdText: get('hd'),
      ...parseHitDice(get('hd')),
      attacks: get('attacks'),
      damage: get('damage'),
      move: get('move'),
      appearingText: get('appearing'),
      appearing: parseAppearing(get('appearing')),
      saveText: get('save'),
      save: save && !/לא רלוונטי/.test(save[1])
        ? { as: save[1].trim(), level: saveLevel, byHitDice: /קוביות הפגיעה/.test(save[2] || '') }
        : null,
      moraleText: get('morale'),
      morale: parseInt(get('morale'), 10) || null,
      treasureText: get('treasure'),
      treasure: parseTreasureType(get('treasure')),
      xpText: get('xp'),
      xp: parseInt(get('xp').replace(/,/g, ''), 10) || null,
    };
  });

  return monsters;
}

// ---------------------------------------------------------------------------
// Dungeon encounters, stocking, traps
// ---------------------------------------------------------------------------

/**
 * Encounter table names that do not match a monster name exactly.
 * Left side: the name in the gm01.qmd tables. Right side: monsters.json name.
 */
const ENCOUNTER_ALIASES = {
  'נחש, קוברה': 'נחש, קוברה יורקת',
  'ג\'לי אדמדם': 'ג\'לי, אוכרי',
  'איש לטאה': 'איש לטאה רגיל',
};

const NPC_PARTY = 'חבורת דמויות מנחה:';
const NPC_PARTY_HEADINGS = { 'הרפתקן': 'הרפתקנים', 'שודד': 'שודדים, בריגנדים ושודדי דרכים' };

function parseLevelLabel(label) {
  const m = /(\d+)(?:\s*-\s*(\d+))?(\+)?/.exec(label);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  return { min, max: m[3] ? null : (m[2] ? parseInt(m[2], 10) : min) };
}

function buildEncounters(monsters) {
  const byName = new Map(monsters.map((m) => [norm(m.name), m]));
  const resolve = (cell) => {
    const key = norm(cell);
    if (key.startsWith(NPC_PARTY)) {
      const kind = key.slice(NPC_PARTY.length).trim();
      const heading = NPC_PARTY_HEADINGS[kind];
      if (!heading) warn(`encounters: unknown NPC party type "${kind}"`);
      return { name: plain(cell), type: 'npcParty', party: kind, link: heading ? linkTo('gm01.qmd', heading) : null };
    }
    const m = byName.get(key) || byName.get(norm(ENCOUNTER_ALIASES[key] || '')) || byName.get(`${key} רגיל`);
    if (!m) { warn(`encounters: "${plain(cell)}" does not match any monster`); return { name: plain(cell), type: 'monster', monster: null, link: null }; }
    return { name: plain(cell), type: 'monster', monster: m.name, link: m.link };
  };

  const levels = [];
  for (const divId of ['dungeon-encounters-1', 'dungeon-encounters-2']) {
    const t = tableByDiv('gm01.qmd', divId);
    if (!t) continue;
    t.header.slice(1).forEach((label, col) => {
      const level = parseLevelLabel(label);
      if (!level) { warn(`encounters: cannot read level "${label}"`); return; }
      const entries = rollTable(`encounters level ${label}`, t, 0, (row) => resolve(row[col + 1]), 12);
      levels.push({ label: plain(label), ...level, die: '1d12', entries });
    });
  }
  return {
    link: linkTo('gm01.qmd', 'מפגשים במבוך'),
    wandering: { chanceIn6: 1, everyTurns: 3, link: linkTo('gm01.qmd', 'מפלצות נודדות') },
    levels,
  };
}

const STOCKING_TYPES = {
  'ריק': { type: 'empty' },
  'אוצר ללא שמירה': { type: 'treasure' },
  'מפלצת': { type: 'monster' },
  'מפלצת עם אוצר': { type: 'monster', treasure: true },
  'מיוחד': { type: 'special' },
  'מלכודת': { type: 'trap' },
  'מלכודת עם אוצר': { type: 'trap', treasure: true },
};

function buildStocking() {
  const t = tableByHeading('gm02.qmd', '5. אכלסי את המבוך');
  if (!t) return null;
  const entries = rollTable('room stocking', t, 0, (row) => {
    const kind = STOCKING_TYPES[norm(row[1])];
    if (!kind) fail(`room stocking: unknown content "${row[1]}"`);
    return { treasure: false, ...kind, name: plain(row[1]) };
  }, 100);
  return { die: '1d100', link: linkTo('gm02.qmd', '5. אכלסי את המבוך'), entries };
}

/** The five saving throw categories, by the words the trap texts use. */
const SAVE_CATEGORIES = [
  ['deathRayOrPoison', /^(קרן מוות|רעל)/],
  ['magicWands', /^שרביט/],
  ['paralysisOrPetrify', /^(שיתוק|התאבנות)/],
  ['dragonBreath', /^נשיפת דרקון/],
  ['spells', /^לחשים/],
];

function buildTraps() {
  const text = readChapter('gm02.qmd');
  const start = text.indexOf('\n### מלכודות');
  const end = text.indexOf('\n## ', start + 1);
  if (start < 0) { fail('gm02.qmd: traps section not found'); return []; }
  const link = linkTo('gm02.qmd', 'מלכודות');
  const traps = [];
  for (const para of text.slice(start, end < 0 ? undefined : end).split(/\n\s*\n/)) {
    const m = /^\*\*(.+?):\*\*\s*([\s\S]+)$/.exec(para.trim());
    if (!m) continue;
    const body = plain(m[2]);
    const saveAt = body.indexOf('גלגול הצלה נגד ');
    const saveEntry = saveAt < 0 ? null : SAVE_CATEGORIES.find(([, re]) => re.test(body.slice(saveAt + 15, saveAt + 40)));
    if (saveAt >= 0 && !saveEntry) warn(`trap "${plain(m[1])}": saving throw category not recognised`);
    const attack = /תוסף התקפה \+(\d+)/.exec(body);
    const damage = new RegExp(`(${DICE.source}) נקודות פגיעה`).exec(body);
    traps.push({
      name: plain(m[1]),
      text: body,
      link,
      save: saveEntry ? saveEntry[0] : null,
      dexBonus: /בתוספת תוסף זריזות/.test(body),
      attackBonus: attack ? parseInt(attack[1], 10) : null,
      damage: damage ? damage[1].replace(/\s/g, '') : null,
      deadly: /או למות/.test(body),
    });
  }
  if (traps.length === 0) fail('gm02.qmd: no traps parsed');
  return traps;
}

// ---------------------------------------------------------------------------
// Treasure
// ---------------------------------------------------------------------------

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];

function treasureRow(row, coinMult) {
  const coins = {};
  COINS.forEach((c, i) => { coins[c] = parseChance(row[i + 1] || '', coinMult); });
  const [gems, jewelry] = (row[6] || '').split(',').map((s) => parseChance(s));
  return { coins, gems: gems || null, jewelry: jewelry || null, magic: parseMagic(row[7] || '') };
}

function buildTreasure() {
  const types = {};
  const lair = tableByHeading('treasure.qmd', 'אוצרות מאורה');
  const personal = tableByHeading('treasure.qmd', 'אוצרות אישיים');
  for (const row of lair ? lair.rows : []) types[row[0]] = { kind: 'lair', ...treasureRow(row, 100) };
  for (const row of personal ? personal.rows : []) types[row[0]] = { kind: 'individual', ...treasureRow(row, 1) };
  const expected = 'ABCDEFGHIJKLMNOPQRSTUV'.split('');
  for (const l of expected) if (!types[l]) fail(`treasure.qmd: treasure type ${l} missing`);

  const unguardedTable = tableByDiv('treasure.qmd', 'unguarded-treasure');
  const unguarded = (unguardedTable ? unguardedTable.rows : []).map((row) => ({
    label: row[0], ...parseLevelLabel(row[0]), ...treasureRow(row, 100),
  }));

  const gemValue = rollTable('gem value', tableByDiv('treasure.qmd', 'gem-jewelry'), 0, (row) => ({
    name: row[1], baseValue: parseInt(row[2], 10), count: row[3],
  }), 100);
  const jewelryRow = tableByDiv('treasure.qmd', 'gem-jewelry').rows.find((r) => !r[0].trim());

  const adjust = rollTable('gem value adjustment', tableByDiv('treasure.qmd', 'gem-jewelry-2'), 0, (row) => {
    const text = row[1];
    let effect;
    if (/נמוך/.test(text)) effect = { shift: -1 };
    else if (/גבוה/.test(text)) effect = { shift: 1 };
    else if (/רגיל/.test(text)) effect = { factor: 1 };
    else if (/פי ([\d.]+)/.test(text)) effect = { factor: parseFloat(/פי ([\d.]+)/.exec(text)[1]) };
    else if (/(\d+)\/(\d+)/.test(text)) { const f = /(\d+)\/(\d+)/.exec(text); effect = { factor: f[1] / f[2] }; }
    else { warn(`gem adjustment: cannot read "${text}"`); effect = { factor: 1 }; }
    return { text, ...effect };
  }, 12, 2);

  const gemKind = rollTable('gem kind', tableByDiv('treasure.qmd', 'gem-jewelry-3'), 0, (row) => ({ name: row[1] }), 100);

  const jt = tableByDiv('treasure.qmd', 'gem-jewelry-4');
  const jewelryKind = [
    ...rollTable('jewelry kind', { rows: jt.rows.map((r) => [r[0], r[1]]) }, 0, (row) => ({ name: row[1] }), null),
    ...rollTable('jewelry kind', { rows: jt.rows.map((r) => [r[2], r[3]]) }, 0, (row) => ({ name: row[1] }), null),
  ].sort((a, b) => a.min - b.min);
  checkCoverage('jewelry kind (both halves)', jewelryKind, 100);

  return {
    link: linkTo('treasure.qmd', 'סוגי אוצר:'),
    types,
    unguarded: { link: linkTo('treasure.qmd', 'אוצרות ללא שמירה'), levels: unguarded },
    gems: {
      link: linkTo('treasure.qmd', 'אבנים יקרות ותכשיטים'),
      value: gemValue,
      valueAdjustment: { die: '2d6', entries: adjust },
      kind: gemKind,
      jewelryStep: jewelryRow ? { name: jewelryRow[1], baseValue: parseInt(jewelryRow[2], 10), count: jewelryRow[3] } : null,
    },
    jewelry: { value: { dice: '2d8', mult: 100 }, kind: jewelryKind },
  };
}

// ---------------------------------------------------------------------------
// Magic items
// ---------------------------------------------------------------------------

const ITEM_CATEGORY = {
  'נשק': 'weapon',
  'שריון': 'armor',
  'שיקוי': 'potion',
  'מגילה': 'scroll',
  'טבעת': 'ring',
  'שרביט, מטה או מקל': 'wand',
  'חפצי קסם שונים': 'misc',
};

function buildMagicItems() {
  const Q = 'magicItems.qmd';
  const simple = (label, table, valueCol = 1, size = 100) =>
    rollTable(label, table, 0, (row) => ({ name: row[valueCol] }), size);

  // Which kind of item: three roll columns share one result column.
  const kindTable = tableByDiv(Q, 'armor-weapon-table');
  const category = (row) => {
    const c = ITEM_CATEGORY[norm(row[3])];
    if (!c) fail(`magic items: unknown item type "${row[3]}"`);
    return { category: c, name: row[3] };
  };
  const kind = {
    any: rollTable('magic item kind (any)', kindTable, 0, category, 100),
    weaponOrArmor: rollTable('magic item kind (weapon or armor)', kindTable, 1, category, 100),
    nonWeapon: rollTable('magic item kind (non-weapon)', kindTable, 2, category, 100),
  };

  const bonusTable = tableByDiv(Q, 'melee-missile-weapon');
  const weaponBonus = (row) => {
    const text = row[2];
    const nums = (text.match(/[+-]\d+/g) || []).map(Number);
    if (/גלגלי שוב/.test(text)) return { text, reroll: true, specialAbility: true };
    if (/מקולל/.test(text)) return { text, bonus: nums[0], cursed: true };
    if (/אויב מיוחד/.test(text)) return { text, bonus: nums[0], bonusVsEnemy: nums[1], specialEnemy: true };
    return { text, bonus: nums[0] };
  };

  const armorTable = tableByDiv(Q, 'magic-armor-table');
  const armorBonus = (row) => {
    const text = row[3].replace(/\s*\*+\s*$/, '').trim();
    if (/דירוג שריון 11/.test(text)) return { text, cursed: true, ac11: true };
    if (/מקולל/.test(text)) return { text, cursed: true, rerollNegative: true };
    return { text, bonus: parseInt(text, 10) };
  };

  const formTable = tableByHeading(Q, 'צורת הפריט');
  const forms = {};
  (formTable ? formTable.header.slice(1) : []).forEach((letter, col) => {
    forms[letter] = rollTable(`misc item form ${letter}`, formTable, col + 1, (row) => ({ name: row[0] }), 100);
  });

  const effects = (heading) => rollTable(heading, tableByHeading(Q, heading), 0, (row) => ({ name: row[1], form: row[2] }), 100);
  const effects1 = effects('תת-טבלת אפקטים 1');
  const effects2 = effects('תת-טבלת אפקטים 2');
  for (const e of [...effects1, ...effects2]) if (!forms[e.form]) warn(`misc magic item "${e.name}": form column "${e.form}" not in the form table`);

  return {
    link: linkTo(Q, 'חפצי קסם'),
    kind,
    weapon: {
      link: linkTo(Q, 'נשקים קסומים'),
      type: simple('magic weapon type', tableByDiv(Q, 'weapon-type-table')),
      meleeBonus: rollTable('melee weapon bonus', bonusTable, 0, weaponBonus, 100),
      missileBonus: rollTable('missile weapon bonus', bonusTable, 1, weaponBonus, 100),
      specialEnemy: { die: '1d6', entries: simple('special enemy', tableByDiv(Q, 'special-enemy-table'), 1, 6) },
      specialAbility: { die: '1d20', entries: simple('special ability', tableByDiv(Q, 'special-ability-table'), 1, 20) },
    },
    armor: {
      link: linkTo(Q, 'שריון קסום', 1),
      type: rollTable('magic armor type', armorTable, 0, (row) => ({ name: row[1] }), 100),
      bonus: rollTable('magic armor bonus', armorTable, 2, armorBonus, 100),
    },
    potion: { link: linkTo(Q, 'שיקויים', 1), entries: simple('potions', tableByDiv(Q, 'potions-random-table')) },
    scroll: {
      link: linkTo(Q, 'מגילות', 1),
      entries: rollTable('scrolls', tableByDiv(Q, 'scrolls-table'), 0, (row) => {
        const name = row[1];
        const spells = /\((?:לחש (\d+)|(\d+) לחשים)\)/.exec(name);
        const map = /מפה לאוצר מסוג ([A-V])/.exec(name);
        const out = { name };
        if (spells) { out.spells = parseInt(spells[1] || spells[2], 10); out.caster = /כוהן/.test(name) ? 'cleric' : 'magicUser'; }
        if (/מקוללת/.test(name)) out.cursed = true;
        if (map) out.treasureMap = map[1];
        if (/מפה ל.?1d4 חפצי קסם/.test(name)) out.treasureMap = 'magic';
        return out;
      }, 100),
      spellLevel: rollTable('scroll spell level', tableByHeading(Q, 'מגילות לחשים: עוצמת לחש'), 0, (row) => ({ level: parseInt(row[1], 10) }), 100),
    },
    ring: { link: linkTo(Q, 'טבעות', 1), entries: simple('rings', tableByDiv(Q, 'rings-table')) },
    wand: { link: linkTo(Q, 'שרביטים, מטות ומקלות', 1), entries: simple('wands, staves and rods', tableByDiv(Q, 'wands-table')) },
    misc: {
      link: linkTo(Q, 'חפצי קסם שונים', 1),
      effectsLink: linkTo(Q, 'אפקטים של חפצי קסם שונים'),
      subtable: rollTable('misc item subtable', tableByHeading(Q, 'תתי-טבלאות אפקטים'), 0, (row) => ({ table: /1\s*$/.test(row[1]) ? 'effects1' : 'effects2' }), 100),
      effects1,
      effects2,
      forms,
    },
    rare: {
      link: linkTo(Q, 'פריטים נדירים', 1),
      entries: rollTable('rare items', tableByHeading(Q, 'פריטים נדירים'), 0, (row) => ({
        name: row[1].replace(/\s*\(ראו למטה\)/, ''), elementalDevice: /יסודנים/.test(row[1]),
      }), 100),
    },
    elementalDevice: {
      link: linkTo(Q, 'מכשירים לזימון יסודנים', 1),
      die: '1d8',
      entries: simple('elemental summoning devices', tableByHeading(Q, 'מכשירים לזימון יסודנים'), 1, 8),
    },
  };
}

// ---------------------------------------------------------------------------
// Rule links the generator's room cards and solo tools point at
// ---------------------------------------------------------------------------

const RULE_LINKS = {
  timeAndScale: ['dungeonAdventures.qmd', 'זמן וקנה מידה'],
  light: ['dungeonAdventures.qmd', 'אור'],
  doors: ['dungeonAdventures.qmd', 'דלתות'],
  traps: ['dungeonAdventures.qmd', 'מלכודות'],
  secretDoors: ['dungeonAdventures.qmd', 'דלתות סודיות'],
  survival: ['dungeonAdventures.qmd', 'הישרדות במבוך'],
  surprise: ['combat.qmd', 'הפתעה'],
  reactions: ['combat.qmd', 'תגובות מפלצות'],
  initiative: ['combat.qmd', 'יוזמה'],
  evasion: ['combat.qmd', 'התחמקות ומרדף'],
  morale: ['combat.qmd', 'מורל'],
  turnUndead: ['combat.qmd', 'גירוש אל־מתים'],
  fallingDamage: ['combat.qmd', 'נזק מנפילה'],
  savingThrows: ['combat.qmd', 'גלגולי הצלה'],
  restAndHealing: ['combat.qmd', 'ריפוי ומנוחה'],
  wanderingMonsters: ['gm01.qmd', 'מפלצות נודדות'],
  dungeonDesign: ['gm02.qmd', 'תכנון הרפתקת מבוך'],
  monsterTerms: ['monsters.qmd', 'מונחים'],
};

// ---------------------------------------------------------------------------
// Checks against the rendered site
// ---------------------------------------------------------------------------

/** Compare computed anchors with docs/he/*.html, when that build exists. */
function checkAnchors() {
  let checked = 0;
  for (const [name, ch] of chapters) {
    const file = path.join(RENDERED, htmlName(name));
    if (!fs.existsSync(file)) { warn(`anchors of ${name} not verified: ${path.relative(ROOT, file)} does not exist`); continue; }
    const rendered = new Set([...fs.readFileSync(file, 'utf8').matchAll(/<(?:section|h[1-6])\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
    const sections = ch.headings.filter((h) => h.level > 1);
    const missing = sections.filter((h) => !rendered.has(h.id));
    checked += sections.length;
    for (const h of missing.slice(0, 5)) warn(`${name}:${h.line} computed anchor "#${h.id}" is not in the rendered page`);
    if (missing.length > 5) warn(`${name}: ${missing.length - 5} more anchors not in the rendered page`);
  }
  return checked;
}

function checkLinks(data) {
  const known = new Map();
  for (const [name, ch] of chapters) known.set(htmlName(name), new Set(ch.headings.map((h) => h.id)));
  let count = 0;
  const visit = (node, where) => {
    if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${where}[${i}]`));
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (/link$/i.test(k) && typeof v === 'string') {
        count++;
        const [file, id] = v.split('#');
        if (!known.get(file) || (id !== undefined && !known.get(file).has(id))) fail(`${where}.${k}: "${v}" does not point at a known heading`);
      } else visit(v, `${where}.${k}`);
    }
  };
  visit(data, 'data');
  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const monsters = buildMonsters();
const data = {
  generatedBy: 'dungeon/build-data.js',
  monsters,
  encounters: buildEncounters(monsters),
  stocking: buildStocking(),
  traps: buildTraps(),
  treasure: buildTreasure(),
  magicItems: buildMagicItems(),
  rules: Object.fromEntries(Object.entries(RULE_LINKS).map(([key, [file, heading]]) => [key, linkTo(file, heading)])),
};

const anchorsChecked = checkAnchors();
const linksChecked = checkLinks(data);

const log = (s) => process.stdout.write(s + '\n');
if (warnings.length) { log(`\nWarnings (${warnings.length}):`); warnings.forEach((w) => log(`  - ${w}`)); }
if (errors.length) {
  log(`\nErrors (${errors.length}):`);
  errors.forEach((e) => log(`  - ${e}`));
  log('\nNothing written.');
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
log(`\nWrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
log(`  monsters: ${monsters.length} (${monsters.filter((m) => m.link).length} linked)`);
log(`  encounter levels: ${data.encounters.levels.length}, traps: ${data.traps.length}, treasure types: ${Object.keys(data.treasure.types).length}`);
log(`  links: ${linksChecked} checked against ${anchorsChecked} headings`);
