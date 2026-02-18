import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import axios from 'axios';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const GLOSSARY_PATH = path.resolve(__dirname, 'glossary.json');
const SRC_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, '../he');

async function loadGlossary() {
  const data = await fs.readFile(GLOSSARY_PATH, 'utf-8');
  return JSON.parse(data);
}

function needsTranslation(srcFile: string, outFile: string): Promise<boolean> {
  return fs.access(outFile).then(() => false).catch(() => true);
}

function convertUnits(text: string): string {
  // Convert feet to meters, pounds to kg (simple regex, not perfect)
  return text
    .replace(/(\d+)\s*feet/g, (_: string, n: string) => `${(parseInt(n) * 0.3048).toFixed(1)} מטר`)
    .replace(/(\d+)\s*pounds/g, (_: string, n: string) => `${(parseInt(n) * 0.4536).toFixed(1)} ק"ג`);
}

function protectDiceNotation(text: string): string {
  // Replace dice notation with placeholders
  return text.replace(/(\d+d\d+)/g, 'DICE_$1');
}

function restoreDiceNotation(text: string): string {
  // Restore dice notation
  return text.replace(/DICE_(\d+d\d+)/g, '$1');
}

function applyGlossary(text: string, glossary: Record<string, string>): string {
  for (const [en, he] of Object.entries(glossary)) {
    const re = new RegExp(`\\b${en}\\b`, 'g');
    text = text.replace(re, he);
  }
  return text;
}

async function translateText(text: string, glossary: Record<string, string>): Promise<string> {
  // Preprocess
  let pre = protectDiceNotation(convertUnits(text));
  // Compose prompt
  const prompt = `Translate the following markdown from English to Hebrew. Use the glossary for terms. The GM is female, players are male. Keep dice notation (e.g., 2d6) in English.\n\nGlossary: ${JSON.stringify(glossary)}\n\nText:\n${pre}`;
  // Call OpenAI
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a professional RPG translator.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: Math.max(2048, Math.floor(pre.length * 1.5)),
    temperature: 0.2
  }, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  let out = res.data.choices[0].message.content;
  // Postprocess
  out = restoreDiceNotation(out);
  out = applyGlossary(out, glossary);
  return out;
}

async function translateFile(srcPath: string, outPath: string, glossary: Record<string, string>): Promise<void> {
  const text = await fs.readFile(srcPath, 'utf-8');
  const translated = await translateText(text, glossary);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, translated, 'utf-8');
  console.log(`Translated: ${srcPath} -> ${outPath}`);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('file', { type: 'string', describe: 'Translate a single file' })
    .option('all', { type: 'boolean', describe: 'Translate all files' })
    .conflicts('file', 'all')
    .check(argv => {
      if (!argv.file && !argv.all) throw new Error('Specify --file or --all');
      return true;
    })
    .help()
    .parse();

  const glossary = await loadGlossary();

  if (argv.file) {
    const srcFile = path.resolve(SRC_DIR, argv.file);
    const outFile = path.resolve(OUT_DIR, argv.file);
    if (await needsTranslation(srcFile, outFile)) {
      await translateFile(srcFile, outFile, glossary);
    } else {
      console.log(`Already translated: ${argv.file}`);
    }
  } else if (argv.all) {
    const files = (await fs.readdir(SRC_DIR)).filter(f => f.endsWith('.qmd'));
    for (const file of files) {
      const srcFile = path.resolve(SRC_DIR, file);
      const outFile = path.resolve(OUT_DIR, file);
      if (await needsTranslation(srcFile, outFile)) {
        await translateFile(srcFile, outFile, glossary);
      } else {
        console.log(`Already translated: ${file}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
