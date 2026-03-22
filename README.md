# Basic Fantasy RPG — 4th Edition (Web Book)

A [Quarto](https://quarto.org/) book site for the Basic Fantasy Role-Playing Game rules, available in English and Hebrew. The built site is published via GitHub Pages.

Created by John Atom (jmhimara).

## License

Copyright © 2006-2023 Chris Gonnerman

CC-BY-SA 4.0

Any content (HTML, JavaScript, etc.) that is not part of the BFRPG IP is also distributed under CC-BY-SA 4.0.

## Prerequisites

- [Quarto](https://quarto.org/docs/get-started/) (v1.3+)
- [Node.js](https://nodejs.org/) (v18+) — only needed for building the Hebrew site

## Building

### English site

```bash
quarto render
```

Output: `docs/`

To start a local dev server with live preview:

```bash
quarto preview
```

### Hebrew site

```bash
node build-he.js
```

This generates `he/_quarto.yml` from the translated `.qmd` files in `he/` and then runs `quarto render he/`.

Output: `docs/he/`

### Hebrew live preview

```bash
node build-he.js --preview
```

Starts a Quarto dev server with hot-reload. Press Ctrl+C to stop; the production `he/_quarto.yml` is restored automatically on exit.

## Project Structure

```
├── *.qmd                  # English source chapters
├── _quarto.yml            # English Quarto config
├── he/                    # Hebrew translated .qmd files
├── build-he.js            # Generates he/_quarto.yml and builds Hebrew site
├── translator/
│   ├── lang-switch.js     # Client-side EN↔HE language toggle
│   ├── glossary.json      # RPG term translations
│   ├── glossary-spells.json
│   └── glossary-monsters.json
├── custom.css             # Shared styles
├── custom-rtl.css         # RTL / Hebrew-specific styles
└── docs/                  # Built output (GitHub Pages)
    ├── *.html             # English site
    └── he/                # Hebrew site
```

## Contributing

Feel free to create a new issue if you notice any problems or submit a pull request.
