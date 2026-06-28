# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**This is primarily a translation project: translating the Basic Fantasy RPG (4th edition) rules into Hebrew.** The underlying repo is a [Quarto](https://quarto.org/) **book** site that builds two parallel sites from the same content — an **English** site (root) and a **Hebrew** site (`he/`, RTL). Source chapters are `.qmd` (Quarto Markdown, a mix of prose, embedded OJS/JavaScript, and `{{< include >}}` directives).

### Current focus: proofreading

All pages have already been translated. The work now is **proofreading** the existing Hebrew. The typical request:

> Compare the Hebrew and English versions of a single file and give suggestions and remarks.

When asked this, read both the English chapter (root, e.g. `combat.qmd`) and its Hebrew counterpart (`he/combat.qmd` — same filename) and review the translation. Focus on:
- **Accuracy** — meaning preserved, nothing dropped or mistranslated, rules/numbers correct.
- **Terminology consistency** — Hebrew terms match the canonical glossaries in `translator/` (`glossary.json`, `glossary-spells.json`, `glossary-monsters.json`), including the gender/plural/usage `notes` there. Flag any term that deviates.
- **Fluency** — natural Hebrew phrasing, correct RTL handling, grammar.
- **Structure parity** — headings, tables, cross-references (`@tbl-...`, `chapter.qmd#anchor`), OJS/code blocks, and `{{< include >}}` directives should line up between the two files.

Default to **giving suggestions and remarks** rather than editing, unless the user explicitly asks for edits. Present findings per location so they're easy to act on.

## Commands

```bash
quarto render            # build English site → docs/
quarto preview           # English live-reload dev server

node build-he.js           # build Hebrew site → docs/he/
node build-he.js --preview # Hebrew live-reload dev server
```

Requires Quarto v1.3+ and Node.js v18+ (Hebrew build only). There is no test suite, linter, or `npm` build — `package.json` only sets `"type": "module"` for `build-he.js`.

## Architecture

### Two sites, one set of sources
- English config is the hand-maintained `_quarto.yml` at the root; English chapters are the `.qmd` files at the root.
- Hebrew chapters are translated copies under `he/` with the **same filenames** as their English counterparts. The chapter list is the subset of `he/*.qmd` that actually exists.
- **`he/_quarto.yml` is generated, not edited.** `build-he.js` owns the book structure (`BOOK_STRUCTURE` array, with Hebrew part names) and writes `he/_quarto.yml` on every build/preview. It is gitignored. To add/reorder Hebrew chapters or change Hebrew formatting (fonts, RTL, theme), edit `build-he.js`, not the generated yml. When adding a chapter to the English `_quarto.yml`, also add it to `BOOK_STRUCTURE` so the Hebrew build can pick it up once translated.
- `build-he.js --preview` points `output-dir` at `_preview` for hot reload; on exit it automatically re-runs the production build to restore `docs/he/`. The `lang-switch.js` script src path differs by output depth — that logic lives in `generateYml()`.

### Language toggle
`translator/lang-switch.js` is injected into both builds (via `header-includes`). It maps a page to its counterpart by inserting/removing the `/he/` path segment (`/abilities.html` ↔ `/he/abilities.html`), so the English and Hebrew filenames must stay in sync.

### Translation glossaries
`translator/glossary.json`, `glossary-spells.json`, `glossary-monsters.json` are the canonical EN→HE term mappings (with `abbr`, `plural`/`plural_he`, and `notes` on gender/usage). Use these for consistent terminology when translating or editing `he/*.qmd`. They are reference data, not consumed by the build.

### Interactive content
- `custom.js` holds shared game logic (dice rollers, turn-undead tables, etc.) used by embedded OJS/JS blocks in chapters.
- The interactive **character sheet** is `char_sheet.qmd`, assembled from `char_sheet-*.qmd` partials via `{{< include >}}` (loadFile, dice, combat, spells, equip, notes, saveFile). Only `char_sheet.qmd` appears in the chapter list; the partials are includes, not standalone chapters.
- `monsters.json` and `equipment.json` (and Hebrew `he/monsters.json`, `he/equipment-he.json`) are data sources loaded by OJS blocks to render tables/lists. Large `*All.qmd` files (`monstersAll.qmd`, `allSpells.qmd`) are generated-feeling, content-heavy chapters.

### Output
`docs/` is the committed build output served by GitHub Pages (`.nojekyll` present); `docs/he/` is the Hebrew site. `build-he.js` also copies `images/` into `docs/he/images/` after rendering.

## Styling
- `custom.css` — shared styles for both sites.
- `custom-rtl.css` — Hebrew/RTL-only, applied via the generated Hebrew config alongside `custom.css`.
