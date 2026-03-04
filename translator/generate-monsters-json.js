#!/usr/bin/env node
/**
 * Generates he/monsters.json from he/monstersAll.qmd
 * Parses the Hebrew monster stat tables and outputs a JSON array
 * with one entry per monster variant (multi-column tables produce multiple entries).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputFile = path.join(__dirname, '..', 'he', 'monstersAll.qmd');
const outputFile = path.join(__dirname, '..', 'he', 'monsters.json');

const ROW_KEYS = [
  'דירוג שריון:',
  'קוביות פגיעה:',
  'מספר התקפות:',
  'נזק:',
  'תנועה:',
  'מספר מופיעים:',
  'גלגול הצלה:',
  'מורל:',
  'סוג אוצר:',
  'נק"נ:',
];

const content = fs.readFileSync(inputFile, 'utf-8');
const lines = content.split('\n');

const monsters = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // Detect the start of a stat table: first row has | <empty or label> | name1 | name2? | ...
  // We look for a line starting with | that is followed by a separator line |---|---|
  if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s-|]+$/.test(lines[i + 1])) {
    // Parse header row to get variant names
    const headerCells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - (arr[arr.length - 1] === '' ? 1 : 0));
    // First cell is the row-label column (empty or label), rest are variant names
    const variantNames = headerCells.slice(1).filter(n => n.length > 0);

    if (variantNames.length === 0) {
      i++;
      continue;
    }

    // Initialize entries for each variant (strip markdown bold markers)
    const entries = variantNames.map(name => ({ 'שם': name.replace(/\*\*/g, '') }));

    // Skip separator line
    i += 2;

    // Parse stat rows
    while (i < lines.length && /^\|/.test(lines[i])) {
      const cells = lines[i].split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - (arr[arr.length - 1] === '' ? 1 : 0));
      const rowLabel = cells[0];
      // Find matching key
      const key = ROW_KEYS.find(k => rowLabel.startsWith(k.replace(':', '').replace('"', '"')));

      if (key || ROW_KEYS.some(k => rowLabel.includes(k.slice(0, 5)))) {
        const actualKey = key || rowLabel;
        const values = cells.slice(1);
        for (let v = 0; v < entries.length; v++) {
          entries[v][actualKey] = (values[v] || '').trim();
        }
      }
      i++;
    }

    // Only add entries that have at least some stats
    for (const entry of entries) {
      if (Object.keys(entry).length > 1) {
        monsters.push(entry);
      }
    }
    continue;
  }

  i++;
}

// Normalize: ensure all entries have all keys
const allKeys = ['שם', ...ROW_KEYS];
for (const m of monsters) {
  for (const k of allKeys) {
    if (!(k in m)) m[k] = '';
  }
}

fs.writeFileSync(outputFile, JSON.stringify(monsters, null, 4), 'utf-8');
console.log(`Generated ${monsters.length} monster entries → ${outputFile}`);
