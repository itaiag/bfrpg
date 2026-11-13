/**
 * Dungeon generator — plain-text export. Pure logic, no DOM.
 *
 * dungeonToPrompt writes the whole dungeon as text, headed by a request to
 * expand it into read-aloud prose. Pasted into any AI chat, it gives the
 * narrative depth the generator's tables cannot, without the site itself
 * depending on an AI service.
 */

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ''));
const num = (n) => Number(n).toLocaleString('en-US');

function treasureText(tr, t) {
  if (!tr || tr.isEmpty) return '';
  const parts = [];
  const coins = ['pp', 'gp', 'ep', 'sp', 'cp'].filter((c) => tr.coins[c] > 0).map((c) => `${num(tr.coins[c])} ${t.coins[c]}`);
  if (coins.length) parts.push(coins.join(', '));
  for (const g of tr.gems) parts.push(`${g.qty > 1 ? `${g.qty} × ` : ''}${g.name} (${num(g.value)} ${t.coins.gp})`);
  for (const j of tr.jewelry) parts.push(`${j.name} (${num(j.value)} ${t.coins.gp})`);
  for (const item of tr.magic) {
    parts.push(`${t.treasure.magic}: ${fill(t.magic[item.category], { name: item.text, form: item.form || '' })}${item.cursed ? ` ${t.magic.cursed}` : ''}`);
  }
  if (tr.guard) parts.push(fill(t.treasure.guard[tr.guard], { trap: tr.guardTrap ? tr.guardTrap.name : '' }));
  return parts.join('; ');
}

function roomText(dungeon, level, room, t) {
  const m = dungeon.squareMeters;
  const lines = [`${fill(t.card.room, { n: room.id })}${room.purpose ? `: ${room.purpose}` : ''} (${fill(t.card.size, { w: room.w * m, h: room.h * m })})`];
  if (room.detail) lines.push(`  ${room.detail}`);
  if (room.faction !== null && room.faction !== undefined) lines.push(`  ${t.export.territory} ${dungeon.factions[room.faction].name}`);
  if (room.safe) lines.push(`  ${t.story.safe}. ${t.story.safeText}`);
  for (const f of room.features) {
    lines.push(`  ${{ entrance: t.features.entrance, stairsUp: fill(t.features.stairsUp, { level: level.index }), stairsDown: fill(t.features.stairsDown, { level: level.index + 2 }) }[f.type]}`);
  }

  const c = room.content || { type: 'empty' };
  if (c.type === 'empty') lines.push(`  ${t.content.empty}.`);
  if (c.type === 'special') lines.push(`  ${t.content.special}: ${c.special ? `${c.special.title}. ${c.special.text}` : t.content.specialText}`);
  if (c.type === 'monster') {
    const mo = c.monster;
    if (mo.npcParty || !mo.count) lines.push(`  ${t.content.monster}: ${mo.name}`);
    else {
      lines.push(`  ${t.content.monster}: ${mo.name} ×${mo.count} (${t.monster.hp} ${mo.hp.join(', ')}; ${t.monster.ac} ${mo.ac}; ${t.monster.morale} ${mo.moraleText})`);
      const loot = treasureText(mo.treasure, t);
      if (loot) lines.push(`  ${mo.lair ? t.treasure.lair : t.treasure.carried}: ${loot}`);
    }
  }
  if (c.type === 'trap') {
    lines.push(`  ${t.content.trap}: ${c.trap.name}. ${c.trap.text}`);
    const loot = treasureText(c.treasure, t);
    if (loot) lines.push(`  ${t.treasure.guarded}: ${loot}`);
  }
  if (c.type === 'treasure') lines.push(`  ${t.content.treasure}: ${treasureText(c.treasure, t)}`);
  for (const note of room.notes || []) lines.push(`  ${note.text}`);

  const exits = level.doors.filter((d) => d.room === room.id).map((d) => {
    const dir = t.directions[d.ox > d.x ? 'east' : d.ox < d.x ? 'west' : d.oy > d.y ? 'south' : 'north'];
    return `${dir}: ${t.doors[d.type]} ${fill(d.leadsTo.length === 1 ? t.card.leadsToOne : t.card.leadsToMany, { rooms: d.leadsTo.join(', ') })}`;
  });
  lines.push(`  ${t.card.exits}: ${exits.join('; ')}`);
  return lines.join('\n');
}

/** The settings that reproduce this dungeon, as URL parameters ("seed=...&size=..."). */
export function dungeonParams(dungeon) {
  return new URLSearchParams({
    seed: dungeon.seed, size: dungeon.size, levels: dungeon.levels.length, count: dungeon.party.count, level: dungeon.party.level,
  }).toString();
}

/** The dungeon as plain text: story, factions, then every room. */
export function dungeonToText(dungeon, t) {
  const out = [];
  const s = dungeon.story;
  const many = dungeon.levels.length > 1;
  if (s) {
    out.push(s.name, s.origin.join(' '), `${t.story.hook} ${s.hook.text}`, '');
    if (dungeon.factions.length) {
      out.push(`${t.story.factions}:`);
      for (const f of dungeon.factions) {
        out.push(`- ${f.name} (${f.monster}${many ? `, ${fill(t.story.level, { n: f.level + 1 })}` : ''}). `
          + `${fill(t.story.leader, { title: f.leader.title, name: f.leader.name, trait: f.leader.trait })} `
          + `${fill(t.story.goal, { goal: f.goal })} ${fill(t.story.attitude, { text: f.attitude })} `
          + `${t.story.hq} ${f.hq}.`);
      }
      out.push('', `${t.story.relations}:`, ...s.relations.map((r) => `- ${r.text}`), '');
    }
    out.push(`${t.story.rumors}:`, ...s.rumors.map((r) => `- ${r.text} ${r.true ? t.story.trueMark : t.story.falseMark}`), '');
  }
  for (const level of dungeon.levels) {
    out.push(`== ${fill(many ? t.level.titleMany : t.level.titleOne, { n: level.index + 1, dl: level.dungeonLevel })} ==`, '');
    for (const room of level.rooms) out.push(roomText(dungeon, level, room, t), '');
  }
  return out.join('\n');
}

/** The text above, headed by the request to an AI assistant. */
export function dungeonToPrompt(dungeon, t) {
  return `${t.export.prompt}\n\n${dungeonToText(dungeon, t)}`;
}
