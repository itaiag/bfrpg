# Basic Fantasy SRD Translator

This folder contains scripts and assets for translating the Basic Fantasy SRD Quarto project to Hebrew using OpenAI's GPT-4o.

## Files
- `translate.ts`: Main translation script (TypeScript)
- `glossary.json`: Glossary of terms for consistent translation
- `.env`: Store your OpenAI API key here (not committed)

## Usage
- Run translation for a single file or all files.
- Skips files already translated.

## Setup
1. Install dependencies:
   ```
   npm install
   ```
2. Add your OpenAI API key to `.env`:
   ```
   OPENAI_API_KEY=your-key-here
   ```
3. Run translation:
   ```
   npx ts-node translator/translate.ts --file index.qmd
   npx ts-node translator/translate.ts --all
   ```

## Notes
- Glossary and gender/unit rules are enforced in the script.
- Output files are written to the `he/` subfolder, mirroring the source structure.
