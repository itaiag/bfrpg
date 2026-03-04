#!/usr/bin/env node
/**
 * translator/sort-monsters.js
 *
 * Sorts the 213 monster blocks in he/monstersAll.qmd alphabetically
 * by their Hebrew heading names (א-ב-ג order).
 *
 * Usage: node translator/sort-monsters.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FILE_PATH = join(ROOT, 'he', 'monstersAll.qmd');

// ── 1. Read and normalize ────────────────────────────────────────────────────

const raw = readFileSync(FILE_PATH, 'utf8');
const text = raw.replace(/\r\n/g, '\n');   // normalize to LF for processing

// ── 2. Split into header / body / footer ────────────────────────────────────

// The footer boundary is the HTML comment that closes the conceptual container.
// It is the only reliable marker that separates the last </div> (monster) from
// the JavaScript search block that follows.
const FOOTER_MARKER = '<!-- </div> -->';

const firstMonsterIdx = text.indexOf('<div class="monster"');
if (firstMonsterIdx === -1) {
  console.error('ERROR: No monster divs found in file.');
  process.exit(1);
}

const footerIdx = text.indexOf(FOOTER_MARKER);
if (footerIdx === -1) {
  console.error('ERROR: Footer marker "<!-- </div> -->" not found.');
  process.exit(1);
}

const header = text.slice(0, firstMonsterIdx);
const body   = text.slice(firstMonsterIdx, footerIdx);
const footer = text.slice(footerIdx);

// ── 3. Split body into individual monster blocks ─────────────────────────────

// Split on every '<div class="monster"' opening, keeping the delimiter.
// Each rawBlock starts with the opening div and contains everything up to
// (but not including) the next monster's opening div.
const rawBlocks = body.split(/(?=<div class="monster")/);

console.log(`Found ${rawBlocks.length} monster blocks.`);

// ── 4. Parse each block ──────────────────────────────────────────────────────

// Extract sort key and content boundary from each block.
//
// Edge cases handled:
//   - Block 139 (Mammoth/Mastodon): has data-tag2 x2, no data-tag → fallback to data-tag2
//   - Block 149 (Owlbear stub): opening div followed immediately by next monster's div,
//     so there is no </div> within this rawBlock → monsterText = entire rawBlock
//   - Block 151 (Owl): contains Owl content + </div> + embedded Owlbear content + </div>
//     → use FIRST indexOf('</div>') to avoid capturing the embedded Owlbear content

function extractHebrewName(rawBlock) {
  // Extract the Hebrew heading (## or ###) from the block
  const headingMatch = rawBlock.match(/^#{2,3}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  return '';
}

function extractEnglishTag(openingLine) {
  const primary = openingLine.match(/(?<![23])data-tag="([^"]+)"/);
  if (primary) return primary[1];
  const fallback = openingLine.match(/data-tag[23]?="([^"]+)"/);
  if (fallback) return fallback[1];
  return '';
}

const blocks = rawBlocks.map((rawBlock, idx) => {
  const openingLine = rawBlock.split('\n')[0];
  const sortKey = extractHebrewName(rawBlock);
  const englishTag = extractEnglishTag(openingLine);

  const closeIdx = rawBlock.indexOf('</div>');  // FIRST occurrence

  let monsterText;
  if (closeIdx === -1) {
    // Owlbear stub: no closing div in this segment
    monsterText = rawBlock;
  } else {
    monsterText = rawBlock.slice(0, closeIdx + 6);   // up to and including </div>
  }

  return { idx, sortKey, englishTag, monsterText };
});

// ── 5. Verification: before-sort order ───────────────────────────────────────

const beforeTags = blocks.map(b => b.sortKey);
console.log('\nBefore sorting:');
console.log('  First 5:', beforeTags.slice(0, 5).join(', '));
console.log('  Last 5: ', beforeTags.slice(-5).join(', '));

// ── 6. Sort ──────────────────────────────────────────────────────────────────

const sorted = [...blocks].sort((a, b) => {
  // Blocks with no sort key go to the end
  if (!a.sortKey && !b.sortKey) return 0;
  if (!a.sortKey) return 1;
  if (!b.sortKey) return -1;
  return a.sortKey.localeCompare(b.sortKey, 'he', { sensitivity: 'base' });
});

// ── 7. Verification: after-sort order ────────────────────────────────────────

const afterTags = sorted.map(b => b.sortKey);
console.log('\nAfter sorting:');
console.log('  First 5:', afterTags.slice(0, 5).join(', '));
console.log('  Last 5: ', afterTags.slice(-5).join(', '));

// ── 8. Detect changes ────────────────────────────────────────────────────────

const changed = sorted.filter((b, i) => b.idx !== i).length;
console.log(`\n${changed} blocks moved from their original position.`);

if (changed === 0) {
  console.log('File is already sorted — no changes written.');
  process.exit(0);
}

// ── 9. Reassemble ────────────────────────────────────────────────────────────

// Each monsterText ends with '</div>'. Append a single '\n' between blocks.
// This normalizes all inter-block gaps (1-4 newlines) to a uniform 1 newline.
// The Owl block's monsterText ends after its *first* </div>, so the embedded
// Owlbear content (ינשודוב) and its closing </div> are preserved as part of
// the Owl block — the bug in the source is faithfully preserved.
const bodyOut = sorted.map(b => b.monsterText + '\n').join('');

const result = header + bodyOut + footer;

// ── 10. Write back (restoring CRLF) ─────────────────────────────────────────

const resultCrlf = result.replace(/\n/g, '\r\n');
writeFileSync(FILE_PATH, resultCrlf, 'utf8');

// ── 11. Final verification ───────────────────────────────────────────────────

const written = readFileSync(FILE_PATH, 'utf8').replace(/\r\n/g, '\n');
const countIn  = (text.match(/<div class="monster"/g) ?? []).length;
const countOut = (written.match(/<div class="monster"/g) ?? []).length;

console.log(`\nVerification:`);
console.log(`  Monsters before: ${countIn}`);
console.log(`  Monsters after:  ${countOut}`);
if (countIn !== countOut) {
  console.error('ERROR: Monster count mismatch! Check the output file.');
  process.exit(1);
}
console.log('Done. he/monstersAll.qmd has been sorted alphabetically.');
