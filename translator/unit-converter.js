/**
 * Unit Converter
 * Replaces imperial measurements with metric equivalents in translated Hebrew text.
 * Imperial units are removed entirely — only the metric value is kept.
 *
 * Rounding uses game-friendly factors:
 *   feet  × 0.3  → nearest 0.5 m  (5'=1.5m, 10'=3m, 30'=9m, 60'=18m, 100'=30m)
 *   miles × 1.5  → nearest 0.5 km (1 mile=1.5km, 6 miles=9km)
 *   pounds× 0.45 → nearest 1 kg   (10lb=5kg, 50lb=23kg, 100lb=45kg)
 */

import { SEG_TRANSLATE } from './parser.js';

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function fmt(value) {
  if (value === Math.floor(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

function feetToMeters(feet) {
  const m = roundTo(feet * 0.3, 0.5);
  return `${fmt(m)} מטר`;
}

function milesToKm(miles) {
  const km = roundTo(miles * 1.5, 0.5);
  return `${fmt(km)} ק"מ`;
}

function poundsToKg(pounds) {
  const kg = roundTo(pounds * 0.45, 1);
  return `${fmt(kg)} ק"ג`;
}

/**
 * Replace imperial measurements with metric in a block of translated Hebrew text.
 * Also cleans up any parenthetical metric that was added by a previous run
 * (e.g. "30' (9 מטר)" → "9 מטר").
 */
export function applyUnitConversions(text) {
  let result = text;

  // ── Feet ──────────────────────────────────────────────────────────────
  // Apostrophe: 30'  or  30' (9 מטר)  — replace entirely with metric
  result = result.replace(
    /(\d+(?:\.\d+)?)'(?:\s*\([^)]*\))?/g,
    (_, num) => feetToMeters(parseFloat(num))
  );

  // English words: "30 feet", "30 foot", "30 ft" (with optional old parenthetical)
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft\.?)\b(?:\s*\([^)]*\))?/gi,
    (_, num) => feetToMeters(parseFloat(num))
  );

  // Hebrew transliterations: רגל / פיט
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*(?:פיט|רגל)(?:\s*\([^)]*\))?/g,
    (_, num) => feetToMeters(parseFloat(num))
  );

  // ── Miles ──────────────────────────────────────────────────────────────
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*(?:miles?|Mls?|מייל|מיילים)(?:\s*\([^)]*\))?/gi,
    (_, num) => milesToKm(parseFloat(num))
  );

  // ── Pounds ─────────────────────────────────────────────────────────────
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?\.?|פאונד|פאונדים)(?:\s*\([^)]*\))?/gi,
    (_, num) => poundsToKg(parseFloat(num))
  );

  return result;
}

/**
 * (Kept for optional use — not active by default)
 * Convert English dice notation to Hebrew ק notation.
 * Not used because ק is RTL and causes bidi reordering issues in Hebrew text.
 */
export function applyDiceNotation(text) {
  return text.replace(
    /(?<![/\w])(\d*)d(\d+)([+-]\d+)?(?!\w)/g,
    (_, pre, die, mod = '') => `<span dir="ltr">${pre}ק${die}${mod}</span>`
  );
}

export function applyConversionsToSegments(segments) {
  return segments.map(seg => {
    if (seg.type === SEG_TRANSLATE) {
      return { ...seg, content: applyUnitConversions(seg.content) };
    }
    return seg;
  });
}
