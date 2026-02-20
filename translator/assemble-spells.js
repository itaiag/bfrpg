#!/usr/bin/env node
/**
 * translator/assemble-spells.js
 *
 * Generates he/spells.qmd by:
 *   - Transplanting Hebrew spell content verbatim from he/allSpells.qmd
 *   - Translating only the structural prose (intro paragraphs, level headers) via OpenAI
 *
 * Usage: node translator/assemble-spells.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { translateBatch } from './openai-client.js';
import { buildSystemPrompt } from './config.js';
import { applyUnitConversions } from './unit-converter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Name normalization for fuzzy spell matching ───────────────────────────────

// data-tag="Mind Control" in allSpells.qmd is a mislabel; the spell is Mind Reading
const ALIASES = {
  'mind reading': 'mind control',
};

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\*/g, '')            // strip reversible asterisk
    .replace(/\bdisc\b/g, 'disk') // "Floating Disc" vs "Floating Disk"
    .trim();
}

// ── 1. Parse he/allSpells.qmd → spellMap ─────────────────────────────────────

function parseAllSpells(filepath) {
  const text = readFileSync(filepath, 'utf8');
  const map = new Map(); // normalized name → Hebrew content (trimmed)

  const divRegex = /<div class="spell"[^>]*data-tag="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = divRegex.exec(text)) !== null) {
    map.set(normalizeName(match[1]), match[2].trim());
  }
  return map;
}

function lookupSpell(spellMap, englishName) {
  const key = normalizeName(englishName);
  return spellMap.get(ALIASES[key] ?? key) ?? null;
}

// ── 2. Parse spells.qmd into items ───────────────────────────────────────────
//
// Item types:
//   { type: 'prose',      text }          — structural text outside callout blocks
//   { type: 'tip-open' }                  — ::: {.callout-tip ...}
//   { type: 'tip-header', text }          — the level heading inside a callout-tip
//   { type: 'spell',      name }          — a spell callout-note (English name for lookup)
//   { type: 'tip-close' }                 — closing ::: for callout-tip

function parseSpells(filepath) {
  const lines = readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const items = [];

  let depth = 0;           // 0 = outside, 1 = in callout-tip, 2 = in callout-note
  let tipHeaderLines = []; // lines accumulated at depth=1 (before first callout-note)
  let tipHeaderEmitted = false;
  let currentSpellName = null;
  let proseLines = [];

  function flushProse() {
    const text = proseLines.join('\n').trimEnd();
    if (text.trim()) items.push({ type: 'prose', text });
    proseLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (depth === 0) {
      if (/^:::\s*\{\.callout-tip/.test(trimmed)) {
        flushProse();
        items.push({ type: 'tip-open' });
        tipHeaderLines = [];
        tipHeaderEmitted = false;
        depth = 1;
      } else {
        proseLines.push(line);
      }

    } else if (depth === 1) {
      if (/^:::\s*\{\.callout-note/.test(trimmed)) {
        // Emit level header on first callout-note in this tip
        if (!tipHeaderEmitted) {
          const headerLine = tipHeaderLines.find(l => /^#{1,3}\s+/.test(l.trim()));
          if (headerLine) items.push({ type: 'tip-header', text: headerLine.trim() });
          tipHeaderEmitted = true;
        }
        depth = 2;
        currentSpellName = null;
      } else if (trimmed === ':::') {
        items.push({ type: 'tip-close' });
        tipHeaderLines = [];
        tipHeaderEmitted = false;
        depth = 0;
      } else {
        if (!tipHeaderEmitted) tipHeaderLines.push(line);
      }

    } else if (depth === 2) {
      if (trimmed === ':::') {
        if (currentSpellName) {
          items.push({ type: 'spell', name: currentSpellName });
          currentSpellName = null;
        }
        depth = 1;
      } else if (!currentSpellName) {
        const m = line.match(/^##\s+(.+)$/);
        if (m) currentSpellName = m[1].trim();
      }
    }
  }

  flushProse();
  return items;
}

// ── 3. Translate structural text ──────────────────────────────────────────────

async function translateStructural(items, systemPrompt) {
  const toTranslate = [];
  const indices = [];

  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'prose' || items[i].type === 'tip-header') {
      toTranslate.push(items[i].text);
      indices.push(i);
    }
  }

  if (toTranslate.length === 0) return;

  console.log(`Translating ${toTranslate.length} structural segment(s)...`);
  const translated = await translateBatch(toTranslate, systemPrompt);

  for (let k = 0; k < indices.length; k++) {
    items[indices[k]].translated = applyUnitConversions(translated[k]);
  }
}

// ── 4. Assemble he/spells.qmd ────────────────────────────────────────────────

function assemble(items, spellMap) {
  const out = [];

  for (const item of items) {
    switch (item.type) {
      case 'prose':
        out.push(item.translated ?? item.text);
        out.push('');
        break;

      case 'tip-open':
        out.push('::: {.callout-tip icon=false collapse=true}');
        break;

      case 'tip-header':
        out.push('');
        out.push(item.translated ?? item.text);
        break;

      case 'spell': {
        const heContent = lookupSpell(spellMap, item.name);
        out.push('');
        out.push('::: {.callout-note icon=false collapse=true}');
        out.push('');
        if (heContent) {
          out.push(heContent);
        } else {
          console.warn(`⚠  No Hebrew content for: "${item.name}"`);
          out.push(`<!-- MISSING TRANSLATION: ${item.name} -->`);
        }
        out.push('');
        out.push(':::');
        break;
      }

      case 'tip-close':
        out.push('');
        out.push(':::');
        out.push('');
        break;
    }
  }

  return out.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const spellMap = parseAllSpells(join(ROOT, 'he', 'allSpells.qmd'));
console.log(`Loaded ${spellMap.size} spells from he/allSpells.qmd`);

const items = parseSpells(join(ROOT, 'spells.qmd'));
const spellCount = items.filter(i => i.type === 'spell').length;
const proseCount = items.filter(i => i.type === 'prose').length;
const headerCount = items.filter(i => i.type === 'tip-header').length;
console.log(`Parsed: ${spellCount} spells, ${proseCount} prose blocks, ${headerCount} level headers`);

// Dry-run check — report mismatches before making API calls
const missing = items
  .filter(i => i.type === 'spell')
  .filter(i => !lookupSpell(spellMap, i.name));
if (missing.length > 0) {
  console.warn(`⚠  Unmatched spells (will be flagged in output):`);
  missing.forEach(i => console.warn(`   - "${i.name}"`));
}

const systemPrompt = buildSystemPrompt('spells.qmd');
await translateStructural(items, systemPrompt);

const result = assemble(items, spellMap);
mkdirSync(join(ROOT, 'he'), { recursive: true });
writeFileSync(join(ROOT, 'he', 'spells.qmd'), result, 'utf8');
console.log('✓ Written to he/spells.qmd');

if (missing.length === 0) {
  console.log('✓ All spells matched successfully');
}
