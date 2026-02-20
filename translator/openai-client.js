/**
 * OpenAI GPT-4o client for translation.
 * Batches segments into calls of ~3000 tokens each.
 * Handles rate limiting with exponential backoff.
 */

import OpenAI from 'openai';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
function loadDotEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

const SEGMENT_SEPARATOR = '---SEGMENT---';
const MAX_TOKENS_PER_BATCH = 3000; // rough token budget for input text
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

let client = null;

function getClient() {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OPENAI_API_KEY not set. Copy .env.example to .env and add your key.'
      );
    }
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

/**
 * Rough token estimator: ~4 chars per token for mixed Hebrew/English.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 3.5);
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a batch of text segments to GPT-4o for translation.
 * @param {string[]} texts - Array of source strings (English)
 * @param {string} systemPrompt - System prompt from config
 * @param {object} [options] - Additional options
 * @param {string[]} [options.contextBefore] - Previously translated segments for context
 * @param {number} [options.retries] - Number of retries remaining
 * @returns {Promise<string[]>} - Translated strings in same order
 */
export async function translateBatch(texts, systemPrompt, { contextBefore = [], retries = 4 } = {}) {
  const oai = getClient();
  const joined = texts.join(`\n${SEGMENT_SEPARATOR}\n`);

  let contextBlock = '';
  if (contextBefore.length > 0) {
    contextBlock = `Here are the most recently translated segments for context (do NOT re-translate these, they are for reference only):\n\n${contextBefore.join('\n\n')}\n\n---\n\nNow translate the following:\n\n`;
  }

  const userMessage = texts.length === 1
    ? `${contextBlock}Translate the following text to Hebrew:\n\n${joined}`
    : `${contextBlock}Translate each of the following ${texts.length} segments to Hebrew. ` +
      `Keep them separated by "${SEGMENT_SEPARATOR}".\n\n${joined}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await oai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
      });

      const raw = response.choices[0]?.message?.content ?? '';
      const parts = raw.split(SEGMENT_SEPARATOR).map(p => p.trim());

      if (parts.length !== texts.length) {
        console.warn(
          `  ⚠ Segment count mismatch: sent ${texts.length}, got ${parts.length}. ` +
          `Retrying individually…`
        );
        // Fall back to individual calls
        const results = [];
        for (let j = 0; j < texts.length; j++) {
          const ctx = [...contextBefore, ...results].slice(-2);
          const [r] = await translateBatch([texts[j]], systemPrompt, { contextBefore: ctx, retries: retries - 1 });
          results.push(r);
        }
        return results;
      }

      return parts;
    } catch (err) {
      const isRateLimit =
        err?.status === 429 || err?.message?.includes('rate limit');
      const isRetryable = isRateLimit || err?.status >= 500;

      if (isRetryable && attempt < retries) {
        const wait = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
        console.warn(`  ⚠ API error (${err.status ?? err.message}). Retrying in ${Math.round(wait / 1000)}s…`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Number of previously translated segments to include as context for each batch.
 */
const CONTEXT_WINDOW_SIZE = 2;

/**
 * Translate an array of segment texts, batching to stay under token limits.
 * Includes a sliding window of previously translated segments as context.
 * @param {string[]} texts - All TRANSLATE segment contents
 * @param {string} systemPrompt
 * @returns {Promise<string[]>} - Translated texts, same length and order
 */
export async function translateSegments(texts, systemPrompt) {
  if (texts.length === 0) return [];

  const results = new Array(texts.length);
  // Track all translated text results in order for sliding context
  const translatedSoFar = [];
  let batch = [];
  let batchIndices = [];
  let batchTokens = 0;

  function getContext() {
    return translatedSoFar.slice(-CONTEXT_WINDOW_SIZE);
  }

  async function flushBatch() {
    if (batch.length === 0) return;
    console.log(`  → Translating batch of ${batch.length} segment(s) (~${batchTokens} tokens)`);
    const translated = await translateBatch(batch, systemPrompt, { contextBefore: getContext() });
    for (let k = 0; k < batchIndices.length; k++) {
      results[batchIndices[k]] = translated[k];
      translatedSoFar.push(translated[k]);
    }
    batch = [];
    batchIndices = [];
    batchTokens = 0;
  }

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const tok = estimateTokens(t);

    // If single segment exceeds budget, flush and send alone
    if (tok > MAX_TOKENS_PER_BATCH) {
      await flushBatch();
      console.log(`  → Translating large segment (~${tok} tokens) individually`);
      const [translated] = await translateBatch([t], systemPrompt, { contextBefore: getContext() });
      results[i] = translated;
      translatedSoFar.push(translated);
      continue;
    }

    // If adding this segment would exceed budget, flush first
    if (batchTokens + tok > MAX_TOKENS_PER_BATCH && batch.length > 0) {
      await flushBatch();
    }

    batch.push(t);
    batchIndices.push(i);
    batchTokens += tok;
  }

  await flushBatch();
  return results;
}
