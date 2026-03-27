#!/usr/bin/env node
/**
 * Build / preview the Hebrew BFRPG site.
 *
 * Usage:
 *   node build-he.js            # generate he/_quarto.yml + quarto render he/
 *   node build-he.js --preview  # live preview with hot-reload
 */

import { writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HE_DIR = join(__dirname, 'he');

// Full book structure with Hebrew part names
const BOOK_STRUCTURE = [
  { file: 'index.qmd' },
  { part: 'מבוא', chapters: ['whatIsThis.qmd'] },
  { part: 'דמויות שחקן', chapters: ['char-creation.qmd', 'abilities.qmd', 'races.qmd', 'class.qmd', 'equipment.qmd', 'vehicles.qmd'] },
  { part: 'קסם', chapters: ['spells.qmd', 'allSpells.qmd'] },
  { part: 'הרפתקה', chapters: ['dungeonAdventures.qmd', 'wildAdventures.qmd', 'hirelings.qmd', 'advancement.qmd'] },
  { part: 'מפגשים', chapters: ['combat.qmd'] },
  { part: 'מפלצות', chapters: ['monsters.qmd', 'monstersAll.qmd', 'monstersTab.qmd'] },
  { part: 'אוצר', chapters: ['treasure.qmd', 'magicItems.qmd'] },
  { part: 'מידע למנחת המשחק', chapters: ['gm01.qmd', 'gm02.qmd'] },
  { part: 'נספחים', chapters: ['appendix_interactive.qmd', 'appendixMapmaker.qmd', 'char_sheet.qmd'] },
  { part: 'תוספות', chapters: ['extraClasses.qmd', 'extraRaces.qmd', 'extraRules.qmd'] },
];

function log(msg) {
  process.stdout.write(msg + '\n');
}

function buildChaptersList(translated) {
  const chapters = [];
  for (const entry of BOOK_STRUCTURE) {
    if (entry.file) {
      if (translated.has(entry.file)) chapters.push(`  - ${entry.file}`);
    } else {
      const existing = entry.chapters.filter(f => translated.has(f));
      if (existing.length > 0) {
        chapters.push(`  - part: "${entry.part}"`);
        chapters.push(`    chapters:`);
        for (const f of existing) chapters.push(`      - ${f}`);
      }
    }
  }
  return chapters;
}

function generateYml(chapters, outputDir) {
  // lang-switch.js path depends on how deep the output is relative to translator/
  const scriptSrc = outputDir === '_preview'
    ? '../../../translator/lang-switch.js'
    : '../../translator/lang-switch.js';

  return `project:
  type: book
  output-dir: ${outputDir}

book:
  title: "בייסיק פנטזי, מהדורה 4"
  author: "כריס גונרמן"
  date: "5/2/2023"
  chapters:
${chapters.join('\n')}

format:
  html:
    theme: cosmo
    lang: he-IL
    dir: rtl
    css: [../custom.css, ../custom-rtl.css]
    number-depth: 0
    toc-depth: 4
    execute:
      echo: false
    header-includes: |
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Rubik|Suez+One">
      <script src="${scriptSrc}"></script>
    mainfont: "Frank Ruhl Libre"
`;
}

function buildHe() {
  const translated = new Set(
    readdirSync(HE_DIR).filter(f => f.endsWith('.qmd'))
  );

  if (translated.size === 0) {
    log('No translated files found in he/. Nothing to build.');
    process.exit(1);
  }

  log(`Found ${translated.size} translated file(s): ${[...translated].join(', ')}`);

  const chapters = buildChaptersList(translated);
  const yml = generateYml(chapters, '../docs/he');

  const ymlPath = join(HE_DIR, '_quarto.yml');
  writeFileSync(ymlPath, yml, 'utf8');
  log(`\n✓ Updated he/_quarto.yml with ${translated.size} chapter(s)`);

  log('\n▶ Running: quarto render he/\n');
  execSync('quarto render he/', { cwd: __dirname, stdio: 'inherit' });
  log('\n✓ Hebrew site built → docs/he/');
}

function previewHe() {
  const translated = new Set(
    readdirSync(HE_DIR).filter(f => f.endsWith('.qmd'))
  );

  if (translated.size === 0) {
    log('No translated files found in he/. Nothing to preview.');
    process.exit(1);
  }

  const chapters = buildChaptersList(translated);
  const yml = generateYml(chapters, '_preview');

  const ymlPath = join(HE_DIR, '_quarto.yml');
  writeFileSync(ymlPath, yml, 'utf8');
  log('✓ he/_quarto.yml updated (output-dir: _preview for live reload)');
  log('▶ Running: quarto preview he/\n');
  log('  Press Ctrl+C to stop. Run "node build-he.js" afterwards to restore docs/he/.\n');

  const child = spawn('quarto', ['preview', 'he/'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', () => {
    buildHe();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === '--preview') {
  previewHe();
} else {
  buildHe();
}
