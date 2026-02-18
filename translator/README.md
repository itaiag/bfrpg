# BFRPG Hebrew Translator

AI-powered translation system that produces a Hebrew version of the BFRPG Quarto site.

## Setup

```bash
# 1. Copy the env template
cp .env.example .env

# 2. Edit .env and add your OpenAI API key
#    OPENAI_API_KEY=sk-...

# 3. Dependencies are already installed (openai, dotenv)
```

## Usage

```bash
# Preview how a file will be segmented (no API calls)
node translator/translate.js --dry-run races.qmd

# Translate a single file → he/races.qmd
node translator/translate.js races.qmd

# Translate all content files
node translator/translate.js --all
```

## Build

```bash
# English site (existing)
quarto render

# Hebrew site
quarto render --profile he

# Sites:
#   English: docs/
#   Hebrew:  docs/he/
```

## Architecture

| File | Purpose |
|------|---------|
| `translate.js` | Main CLI entry point |
| `parser.js` | Splits QMD into PRESERVE / TRANSLATE / OJS segments |
| `openai-client.js` | GPT-4o wrapper with batching and retry |
| `unit-converter.js` | Appends metric equivalents to imperial measurements |
| `config.js` | System prompt, glossary injection, file lists |
| `glossary.json` | Editable RPG term translations |
| `lang-switch.js` | Client-side language toggle button |

## Customizing Translations

Edit `translator/glossary.json` to add or change RPG term translations.
Then re-run `node translator/translate.js --all` to regenerate.

## Excluded Files

These files are too JS-heavy and are excluded from translation:
- `char_sheet-*.qmd` sub-files (character sheet panels)
- `monstersTab.qmd` (pure OJS table)
- `appendixMapmaker.qmd` (interactive tool)

## Verification Checklist

- [ ] `node translator/translate.js --dry-run races.qmd` prints segment breakdown
- [ ] `node translator/translate.js races.qmd` creates `he/races.qmd`
- [ ] `quarto render --profile he` produces `docs/he/`
- [ ] Hebrew text, RTL layout visible in `docs/he/races.html`
- [ ] Dice notation (`2d6`, `1d8`) unchanged in Hebrew text
- [ ] GM referred to in feminine form (מנהלת המשחק)
- [ ] Feet/pounds show metric conversions in parentheses
- [ ] Language toggle button navigates between builds
