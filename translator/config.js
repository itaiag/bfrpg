import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadGlossary() {
  const raw = readFileSync(join(__dirname, 'glossary.json'), 'utf8');
  return JSON.parse(raw);
}

function loadSpellsGlossary() {
  const raw = readFileSync(join(__dirname, 'glossary-spells.json'), 'utf8');
  return JSON.parse(raw);
}

const SPELL_FILES = ['spells.qmd', 'allSpells.qmd'];

function formatTerms(terms) {
  return terms.map(t => {
    const abbr = t.abbr ? ` (${t.abbr})` : '';
    const notes = t.notes ? ` — ${t.notes}` : '';
    const plural = t.plural ? `; plural: "${t.plural}" → "${t.plural_he}"` : '';
    return `  • "${t.en}"${abbr} → "${t.he}"${plural}${notes}`;
  }).join('\n');
}

function buildGlossaryText(filename) {
  const { terms } = loadGlossary();
  let lines = formatTerms(terms);
  if (filename && SPELL_FILES.includes(filename)) {
    const { terms: spellTerms } = loadSpellsGlossary();
    lines += '\n\n## Spell Names\n' + formatTerms(spellTerms);
  }
  return lines;
}

function getFileContext(filename) {
  if (!filename) return '';
  for (const entry of BOOK_STRUCTURE) {
    if (entry.file === filename) {
      return `\n## File Context\nYou are translating: **${filename}** (top-level book file)\n`;
    }
    if (entry.chapters && entry.chapters.includes(filename)) {
      return `\n## File Context\nYou are translating: **${filename}**, part of the book section "${entry.part}"\n`;
    }
  }
  return `\n## File Context\nYou are translating: **${filename}**\n`;
}

export function buildSystemPrompt(filename) {
  return `You are a professional translator specializing in tabletop RPG content. Translate English text to Hebrew for a Basic Fantasy RPG rulebook. Follow these rules strictly:
${getFileContext(filename)}

## Language Rules
- Translate naturally into Hebrew; use formal/literary register appropriate for a rulebook
- The Game Master (GM) is ALWAYS referred to in the feminine gender in Hebrew (מנהלת המשחק, היא, שלה)
- Player characters may be male or female; use gender-neutral phrasing or mention both forms where natural
- Keep proper nouns (character names, place names) untranslated unless a Hebrew equivalent exists in the glossary

## Dice Notation (NEVER translate or modify)
- Keep all dice notation exactly as-is: 1d6, 2d8, 3d6+1, d20, etc.
- Do not translate "d" in dice context — Hebrew RPG convention keeps English d notation

## RPG Glossary (use these translations consistently)
${buildGlossaryText(filename)}

## Measurement Units
- Keep all imperial measurements exactly as written: feet, foot, ft, ', miles, pounds, lbs
- Do NOT convert or add metric equivalents — a post-processor will replace them automatically
- Just translate the surrounding Hebrew text naturally around the untouched unit

## Formatting Rules
- Preserve all Markdown formatting: **bold**, *italic*, headers (#, ##, ###), lists, tables
- Preserve all cross-reference links: [text](file.qmd#anchor) — translate only the visible text, keep the link target unchanged
- Preserve all inline code: \`code\`
- Preserve all HTML tags
- Preserve all Quarto shortcodes: {{< ... >}}
- Keep table structure intact; translate cell text only
- Do NOT add or remove blank lines

## Context
You may receive previously translated segments for reference. Use them to maintain consistency in terminology, pronouns, and tone, but do NOT re-translate or include them in your output.

## Output Format
When given multiple segments separated by "---SEGMENT---", return the same number of translated segments separated by "---SEGMENT---". Preserve the exact segment count and order. Do not add explanations or comments.`;
}

// Patterns to find translatable strings inside OJS code blocks
export const OJS_LABEL_PATTERNS = [
  // Inputs.button("label text", ...)
  { regex: /Inputs\.button\("([^"]+)"/g, group: 1 },
  // Inputs.button('label text', ...)
  { regex: /Inputs\.button\('([^']+)'/g, group: 1 },
  // {label: "text"}
  { regex: /\blabel:\s*"([^"]+)"/g, group: 1 },
  // {label: 'text'}
  { regex: /\blabel:\s*'([^']+)'/g, group: 1 },
  // md`...` template literals (simple ones without complex interpolation)
  { regex: /\bmd`([^`]+)`/g, group: 1, type: 'md' },
  // Inputs.file({label: "text"})
  { regex: /Inputs\.file\(\{[^}]*label:\s*"([^"]+)"/g, group: 1 },
  // Plain string arguments to common Inputs (search, select placeholders)
  { regex: /\bplaceholder:\s*"([^"]+)"/g, group: 1 },
  { regex: /\bplaceholder:\s*'([^']+)'/g, group: 1 },
];

export const UNIT_CONVERSION_RULES = {
  feet: {
    patterns: [
      /(\d+(?:\.\d+)?)'(?!\w)/g,           // 30' (apostrophe notation)
      /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft\.?)\b/gi,
    ],
    factor: 0.3048,
    unit: 'מטר',
    round: 0.5,
  },
  miles: {
    patterns: [
      /(\d+(?:\.\d+)?)\s*(?:miles?|Mls?)\b/gi,
    ],
    factor: 1.60934,
    unit: 'ק"מ',
    round: 0.5,
  },
  pounds: {
    patterns: [
      /(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?\.?)\b/gi,
    ],
    factor: 0.453592,
    unit: 'ק"ג',
    round: 1,
  },
};

// QMD files excluded from translation (too JS-heavy or purely interactive)
export const EXCLUDED_FILES = [
  'char_sheet-combat.qmd',
  'char_sheet-dice.qmd',
  'char_sheet-equip.qmd',
  'char_sheet-loadFile.qmd',
  'char_sheet-notes.qmd',
  'char_sheet-saveFile.qmd',
  'char_sheet-spells.qmd',
  'monstersTab.qmd',
  'appendixMapmaker.qmd',
];

// Full book structure with Hebrew part names, used to generate _quarto-he.yml
export const BOOK_STRUCTURE = [
  { file: 'index.qmd' },
  { part: 'מבוא', chapters: ['whatIsThis.qmd'] },
  { part: 'דמויות שחקן', chapters: ['char-creation.qmd', 'abilities.qmd', 'races.qmd', 'class.qmd', 'equipment.qmd', 'vehicles.qmd'] },
  { part: 'קסם', chapters: ['spells.qmd', 'allSpells.qmd'] },
  { part: 'הרפתקה', chapters: ['dungeonAdventures.qmd', 'wildAdventures.qmd', 'hirelings.qmd', 'advancement.qmd'] },
  { part: 'מפגשים', chapters: ['combat.qmd'] },
  { part: 'מפלצות', chapters: ['monsters.qmd', 'monstersAll.qmd', 'monstersTab.qmd'] },
  { part: 'אוצר', chapters: ['treasure.qmd', 'magicItems.qmd'] },
  { part: 'מידע למנהלת המשחק', chapters: ['gm01.qmd', 'gm02.qmd'] },
  { part: 'נספחים', chapters: ['appendix_interactive.qmd', 'char_sheet.qmd'] },
  { part: 'תוספות', chapters: ['extraClasses.qmd', 'extraRaces.qmd', 'extraRules.qmd'] },
];

// All content QMD files in order (matches _quarto.yml chapters)
export const ALL_FILES = [
  'index.qmd',
  'whatIsThis.qmd',
  'char-creation.qmd',
  'abilities.qmd',
  'races.qmd',
  'class.qmd',
  'equipment.qmd',
  'vehicles.qmd',
  'spells.qmd',
  'allSpells.qmd',
  'dungeonAdventures.qmd',
  'wildAdventures.qmd',
  'hirelings.qmd',
  'advancement.qmd',
  'combat.qmd',
  'monsters.qmd',
  'monstersAll.qmd',
  'treasure.qmd',
  'magicItems.qmd',
  'gm01.qmd',
  'gm02.qmd',
  'appendix_interactive.qmd',
  'char_sheet.qmd',
  'extraClasses.qmd',
  'extraRaces.qmd',
  'extraRules.qmd',
];
