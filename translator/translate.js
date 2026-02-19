#!/usr/bin/env node
/**
 * BFRPG Hebrew Translator — Main CLI
 *
 * Usage:
 *   node translator/translate.js <file.qmd>       # Translate one file
 *   node translator/translate.js --all            # Translate all content files
 *   node translator/translate.js --dry-run <file> # Preview segments, no API calls
 *
 * Output: he/<filename>.qmd
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  parseQmd,
  SEG_PRESERVE,
  SEG_TRANSLATE,
  SEG_OJS,
  extractOjsLabels,
  reconstructOjsBlock,
  fixRelativePaths,
} from './parser.js';

import { translateSegments } from './openai-client.js';
import { applyUnitConversions } from './unit-converter.js';
import { buildSystemPrompt, EXCLUDED_FILES, ALL_FILES, BOOK_STRUCTURE } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const HE_DIR = join(PROJECT_ROOT, 'he');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readQmd(filePath) {
  return readFileSync(filePath, 'utf8');
}

function writeHe(filename, content) {
  mkdirSync(HE_DIR, { recursive: true });
  const outPath = join(HE_DIR, filename);
  writeFileSync(outPath, content, 'utf8');
  return outPath;
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

// ── Dry-run: show segment breakdown ─────────────────────────────────────────

function dryRun(filePath) {
  const source = readQmd(filePath);
  const segments = parseQmd(source);

  log(`\nDry run: ${basename(filePath)}`);
  log(`${'─'.repeat(60)}`);
  log(`Total segments: ${segments.length}`);

  const preserveCount = segments.filter(s => s.type === SEG_PRESERVE).length;
  const translateCount = segments.filter(s => s.type === SEG_TRANSLATE).length;
  const ojsCount = segments.filter(s => s.type === SEG_OJS).length;

  log(`  PRESERVE: ${preserveCount}`);
  log(`  TRANSLATE: ${translateCount}`);
  log(`  OJS: ${ojsCount}`);
  log('');

  segments.forEach((seg, i) => {
    const preview = seg.content.slice(0, 80).replace(/\n/g, '↵');
    log(`[${i + 1}] ${seg.type.padEnd(9)} ${preview}${seg.content.length > 80 ? '…' : ''}`);

    if (seg.type === SEG_OJS) {
      const { labels } = extractOjsLabels(seg.content);
      if (labels.length > 0) {
        log(`     OJS labels to translate:`);
        for (const { original } of labels) {
          log(`       • "${original}"`);
        }
      }
    }
  });
  log('');
}

// ── Translate a single file ──────────────────────────────────────────────────

async function translateFile(filename) {
  const filePath = join(PROJECT_ROOT, filename);

  if (!existsSync(filePath)) {
    log(`✗ File not found: ${filePath}`);
    return;
  }

  if (EXCLUDED_FILES.includes(filename)) {
    log(`⊘ Skipping excluded file: ${filename}`);
    return;
  }

  log(`\n▶ Translating: ${filename}`);
  const source = readQmd(filePath);
  const segments = parseQmd(source);

  const translateCount = segments.filter(s => s.type === SEG_TRANSLATE).length;
  const ojsCount = segments.filter(s => s.type === SEG_OJS).length;
  log(`  Segments: ${segments.length} total (${translateCount} to translate, ${ojsCount} OJS)`);

  // ── Collect all text to translate ──────────────────────────────────
  const translateIndices = [];   // index into segments[]
  const translateTexts = [];     // the text to send to AI

  // For OJS blocks, extract labels separately
  const ojsData = new Map(); // segIndex → { labels, processedContent }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.type === SEG_TRANSLATE) {
      translateIndices.push({ segIndex: i, type: 'text' });
      translateTexts.push(seg.content);
    } else if (seg.type === SEG_OJS) {
      const { labels, processedContent } = extractOjsLabels(seg.content);
      if (labels.length > 0) {
        ojsData.set(i, { labels, processedContent });
        for (const label of labels) {
          translateIndices.push({ segIndex: i, type: 'ojs', placeholder: label.placeholder });
          translateTexts.push(label.original);
        }
      } else {
        // No translatable strings, just fix paths
        ojsData.set(i, { labels: [], processedContent: seg.content });
      }
    }
  }

  // ── Translate all texts in one pass ─────────────────────────────────
  let translatedTexts = [];
  if (translateTexts.length > 0) {
    translatedTexts = await translateSegments(translateTexts, buildSystemPrompt(filename));
  }

  // ── Apply translations back to segments ─────────────────────────────
  const resultSegments = segments.map((seg, i) => ({ ...seg }));

  const textIdx = new Map(); // segIndex → translated string (for SEG_TRANSLATE)
  const ojsLabelMap = new Map(); // segIndex → Map<placeholder, translated>

  for (let k = 0; k < translateIndices.length; k++) {
    const { segIndex, type, placeholder } = translateIndices[k];
    const translated = translatedTexts[k] ?? '';

    if (type === 'text') {
      textIdx.set(segIndex, translated);
    } else if (type === 'ojs') {
      if (!ojsLabelMap.has(segIndex)) ojsLabelMap.set(segIndex, new Map());
      ojsLabelMap.get(segIndex).set(placeholder, translated);
    }
  }

  for (let i = 0; i < resultSegments.length; i++) {
    const seg = resultSegments[i];

    if (seg.type === SEG_TRANSLATE) {
      let translated = textIdx.get(i) ?? seg.content;
      translated = applyUnitConversions(translated);
      translated = fixRelativePaths(translated);
      resultSegments[i] = { ...seg, content: translated };

    } else if (seg.type === SEG_OJS) {
      const data = ojsData.get(i);
      if (!data) continue;

      let content;
      if (data.labels.length > 0) {
        const labelTranslations = ojsLabelMap.get(i) ?? new Map();
        content = reconstructOjsBlock(data.processedContent, data.labels, labelTranslations);
      } else {
        content = seg.content;
      }

      // Fix relative paths for he/ subdirectory
      content = fixRelativePaths(content);
      resultSegments[i] = { ...seg, type: SEG_PRESERVE, content };

    } else if (seg.type === SEG_PRESERVE) {
      // Fix relative paths in preserved blocks too (imports etc.)
      resultSegments[i] = { ...seg, content: fixRelativePaths(seg.content) };
    }
  }

  // ── Reconstruct and write ────────────────────────────────────────────
  const output = resultSegments.map(s => s.content).join('\n');
  const outPath = writeHe(filename, output);
  log(`  ✓ Written to: ${outPath}`);
}

// ── Patch existing he/ files ─────────────────────────────────────────────────

function patchExisting() {
  const files = readdirSync(HE_DIR).filter(f => f.endsWith('.qmd') && f !== '_quarto.yml');
  if (files.length === 0) {
    log('No translated files found in he/.');
    return;
  }
  log(`Patching ${files.length} file(s) in he/…`);
  let changed = 0;
  for (const f of files) {
    const filePath = join(HE_DIR, f);
    const before = readFileSync(filePath, 'utf8');
    let after = applyUnitConversions(before);
    after = fixRelativePaths(after);
    if (before !== after) {
      writeFileSync(filePath, after, 'utf8');
      log(`  ✓ ${f}`);
      changed++;
    }
  }
  log(`\nDone — ${changed} file(s) updated, ${files.length - changed} unchanged.`);
}

// ── Build Hebrew site ────────────────────────────────────────────────────────

function buildHe() {
  // Find all .qmd files that have been translated
  const translated = new Set(
    readdirSync(HE_DIR).filter(f => f.endsWith('.qmd'))
  );

  if (translated.size === 0) {
    log('No translated files found in he/. Run translations first.');
    process.exit(1);
  }

  log(`Found ${translated.size} translated file(s): ${[...translated].join(', ')}`);

  // Place _quarto.yml inside he/ itself — chapters are co-located so Quarto
  // finds index.qmd without any ../ prefix, satisfying the home-page requirement.
  // All paths in the YAML are relative to he/:
  //   output-dir: ../docs/he
  //   css: ../custom.css, ../custom-rtl.css
  //   lang: he-IL  (avoids collision with the he/ directory name)

  // Build chapters list — just bare filenames, relative to he/
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

  const yml = `project:
  type: book
  output-dir: ../docs/he

book:
  title: "מערכת פנטזיה בסיסית לשחקני תפקידים, מהדורה 4"
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Frank+Ruhl+Libre">
      <script src="../../translator/lang-switch.js"></script>
    mainfont: "Frank Ruhl Libre"
`;

  const ymlPath = join(HE_DIR, '_quarto.yml');
  writeFileSync(ymlPath, yml, 'utf8');
  log(`\n✓ Updated he/_quarto.yml with ${translated.size} chapter(s)`);

  log('\n▶ Running: quarto render he/\n');
  execSync('quarto render he/', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  log('\n✓ Hebrew site built → docs/he/');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    log('Usage:');
    log('  node translator/translate.js <file.qmd> [file2.qmd ...]  # Translate one or more files');
    log('  node translator/translate.js --all                        # Translate all content files');
    log('  node translator/translate.js --dry-run <file>             # Preview segments (no API)');
    log('  node translator/translate.js --build                      # Sync _quarto-he.yml and render');
    log('  node translator/translate.js --patch                      # Re-apply post-processors to all he/ files');
    process.exit(0);
  }

  if (args[0] === '--dry-run') {
    const file = args[1];
    if (!file) {
      log('Error: --dry-run requires a filename');
      process.exit(1);
    }
    const filePath = join(PROJECT_ROOT, file);
    dryRun(filePath);
    return;
  }

  if (args[0] === '--build') {
    buildHe();
    return;
  }

  if (args[0] === '--patch') {
    patchExisting();
    return;
  }

  if (args[0] === '--all') {
    const toTranslate = ALL_FILES.filter(f => !EXCLUDED_FILES.includes(f));
    log(`Translating ${toTranslate.length} files (${EXCLUDED_FILES.length} excluded)…`);
    for (const file of toTranslate) {
      await translateFile(file);
    }
    log('\n✓ All files translated.');
    return;
  }

  // One or more files
  for (const arg of args) {
    await translateFile(basename(arg));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
