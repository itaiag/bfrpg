/**
 * QMD Segment Parser
 * Splits a .qmd file into PRESERVE and TRANSLATE segments.
 * TRANSLATE segments are sent to the AI; PRESERVE segments are kept verbatim.
 */

// Segment types
export const SEG_PRESERVE = 'PRESERVE';
export const SEG_TRANSLATE = 'TRANSLATE';
export const SEG_OJS = 'OJS'; // Special: code block that may contain translatable UI strings

/**
 * Parse a QMD file string into an array of segments.
 * Each segment: { type, content, ojsLabels? }
 *
 * ojsLabels (only on SEG_OJS segments) is an array of { original, placeholder }
 * where placeholder is a unique marker to re-inject the translation.
 */
export function parseQmd(source) {
  const segments = [];
  let pos = 0;
  const lines = source.split('\n');
  let i = 0;

  // State
  let inYaml = false;
  let yamlDone = false;

  while (i < lines.length) {
    const line = lines[i];

    // ── YAML front matter ──────────────────────────────────────────────
    if (i === 0 && line.trim() === '---') {
      inYaml = true;
      const start = i;
      i++;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++; // consume closing ---
      segments.push({ type: SEG_PRESERVE, content: lines.slice(start, i).join('\n') });
      yamlDone = true;
      continue;
    }

    // ── Fenced code blocks ─────────────────────────────────────────────
    const fenceMatch = line.match(/^(`{3,}|~{3,})\{?(\w*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].toLowerCase();
      const start = i;
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) i++;
      i++; // consume closing fence
      const blockContent = lines.slice(start, i).join('\n');

      if (lang === 'ojs') {
        segments.push({ type: SEG_OJS, content: blockContent });
      } else {
        // All other code blocks (r, python, html, etc.) → preserve
        segments.push({ type: SEG_PRESERVE, content: blockContent });
      }
      continue;
    }

    // ── Quarto shortcodes on their own line ────────────────────────────
    if (line.trim().startsWith('{{<') && line.trim().endsWith('>}}')) {
      segments.push({ type: SEG_PRESERVE, content: line });
      i++;
      continue;
    }

    // ── Quarto div markers ::: ─────────────────────────────────────────
    // ::: {.class} and ::: lines delimit divs — preserve the markers, translate content inside
    if (line.trim().startsWith(':::')) {
      segments.push({ type: SEG_PRESERVE, content: line });
      i++;
      continue;
    }

    // ── Blank lines ────────────────────────────────────────────────────
    if (line.trim() === '') {
      segments.push({ type: SEG_PRESERVE, content: line });
      i++;
      continue;
    }

    // ── HTML comments ──────────────────────────────────────────────────
    if (line.trim().startsWith('<!--')) {
      // Collect until -->
      const start = i;
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      segments.push({ type: SEG_PRESERVE, content: lines.slice(start, i).join('\n') });
      continue;
    }

    // ── Raw HTML blocks ────────────────────────────────────────────────
    if (line.trim().startsWith('<') && !line.trim().startsWith('<br') &&
        !line.trim().startsWith('<span') && !line.trim().startsWith('<a ')) {
      // Multi-line HTML blocks — preserve them
      const start = i;
      // Consume until blank line or next markdown construct
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^#{1,6}\s/)) {
        i++;
      }
      segments.push({ type: SEG_PRESERVE, content: lines.slice(start, i).join('\n') });
      continue;
    }

    // ── Everything else → translatable text ───────────────────────────
    // Collect consecutive translatable lines (headings, paragraphs, lists, tables)
    const start = i;
    while (i < lines.length) {
      const l = lines[i];
      // Stop at blank line
      if (l.trim() === '') break;
      // Stop at code fence
      if (l.match(/^(`{3,}|~{3,})/)) break;
      // Stop at shortcode line
      if (l.trim().startsWith('{{<') && l.trim().endsWith('>}}')) break;
      // Stop at div markers
      if (l.trim().startsWith(':::')) break;
      // Stop at raw HTML block start (block-level elements)
      if (l.trim().match(/^<(div|section|article|aside|header|footer|main|nav|p)\b/i)) break;
      i++;
    }

    if (i > start) {
      const text = lines.slice(start, i).join('\n');
      segments.push({ type: SEG_TRANSLATE, content: text });
    }
  }

  return segments;
}

/**
 * Extract translatable label strings from an OJS code block.
 * Returns { labels: [{original, placeholder}], processedContent }
 * where processedContent has placeholders substituted in place of label strings.
 */
export function extractOjsLabels(ojsContent) {
  const labels = [];
  let counter = 0;

  // Patterns for extractable strings (UI labels only — not variable names or expressions)
  const patterns = [
    // Inputs.button("text", ...) — keep "Inputs.button(" prefix
    { re: /(Inputs\.button\()("(?:[^"\\]|\\.)*")/g, keepPrefix: true, quote: '"' },
    { re: /(Inputs\.button\()('(?:[^'\\]|\\.)*')/g, keepPrefix: true, quote: "'" },
    // label: "text" or label: 'text' in object literals
    { re: /(\blabel:\s*)("(?:[^"\\]|\\.)*")/g, keepPrefix: true, quote: '"' },
    { re: /(\blabel:\s*)('(?:[^'\\]|\\.)*')/g, keepPrefix: true, quote: "'" },
    // placeholder: "text"
    { re: /(\bplaceholder:\s*)("(?:[^"\\]|\\.)*")/g, keepPrefix: true, quote: '"' },
    { re: /(\bplaceholder:\s*)('(?:[^'\\]|\\.)*')/g, keepPrefix: true, quote: "'" },
  ];

  let processed = ojsContent;

  for (const pat of patterns) {
    pat.re.lastIndex = 0;
    processed = processed.replace(pat.re, (match, ...args) => {
      if (pat.keepPrefix) {
        const prefix = args[0];
        const quoted = args[1];
        const inner = quoted.slice(1, -1); // strip quotes
        const ph = `__OJS_LABEL_${counter++}__`;
        const q = pat.quote;
        labels.push({ original: inner, placeholder: ph, quote: q });
        return `${prefix}${q}${ph}${q}`;
      } else {
        const quoted = args[0];
        const inner = quoted.slice(1, -1);
        const ph = `__OJS_LABEL_${counter++}__`;
        const q = pat.quote;
        labels.push({ original: inner, placeholder: ph, quote: q });
        return `${q}${ph}${q}`;
      }
    });
  }

  return { labels, processedContent: processed };
}

/**
 * Reconstruct an OJS block after translating its labels.
 * translatedLabels: Map of placeholder → translated string
 */
export function reconstructOjsBlock(processedContent, labels, translatedLabels) {
  let result = processedContent;
  for (const { placeholder, quote } of labels) {
    const translated = translatedLabels.get(placeholder) ?? placeholder;
    result = result.replace(`${quote}${placeholder}${quote}`, `${quote}${translated}${quote}`);
  }
  return result;
}

/**
 * Fix relative paths for files moved into he/ subdirectory.
 * Covers OJS imports, FileAttachment, markdown images/links, and HTML attributes.
 */
export function fixRelativePaths(content) {
  let result = content;

  // OJS: import from "./file" → "../file"
  result = result.replace(/from\s+"\.\/([^"]+)"/g, 'from "../$1"');
  result = result.replace(/from\s+'\.\/([^']+)'/g, "from '../$1'");

  // OJS: FileAttachment("file.json") → FileAttachment("../file.json")
  result = result.replace(/FileAttachment\("([^/"][^"]+)"\)/g, 'FileAttachment("../$1")');
  result = result.replace(/FileAttachment\('([^/'][^']+)'\)/g, "FileAttachment('../$1')");

  // Markdown image/link syntax: (./foo) → (../foo)
  result = result.replace(/\(\.\//g, '(../');

  // HTML attributes: src="./foo" and href="./foo"
  result = result.replace(/(src|href)="\.\/([^"]+)"/g, '$1="../$2"');
  result = result.replace(/(src|href)='\.\/([^']+)'/g, "$1='../$2'");

  return result;
}

/**
 * Reconstruct a QMD file from translated segments.
 */
export function reconstructQmd(segments) {
  return segments.map(s => s.content).join('\n');
}
