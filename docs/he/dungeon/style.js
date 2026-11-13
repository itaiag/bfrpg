/**
 * Dungeon generator — styles. They travel with the generator's output (see
 * renderDungeon) instead of living in the site stylesheet, so the page never
 * depends on a visitor's cached copy of custom-rtl.css.
 *
 * The output sits inside Quarto's .observablehq container, which the Hebrew
 * site forces to left-to-right; .dg-root turns it back.
 */
export const css = `
.dg-root {
  direction: rtl;
  text-align: right;
}

.dg-seed {
  margin: 0.5rem 0;
}

.dg-map-wrap {
  direction: ltr;
  margin: 0.5rem 0 1rem;
}

.dg-map {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid #b7ae9b;
}

.dg-room-hit {
  cursor: pointer;
}

.dg-room-hit:hover {
  fill: rgba(44, 122, 123, 0.14);
}

.dg-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 1rem;
  font-size: 0.9rem;
}

.dg-legend li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dg-legend-icon {
  border: 1px solid #ddd6c6;
  flex: none;
}

.dg-legend-scale {
  flex-basis: 100%;
  color: #555;
}

.dg-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 0.75rem;
}

.dg-card {
  border: 1px solid #d5cfc0;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  background: #fffdf8;
  scroll-margin-top: 5rem;
}

.dg-card-active {
  border-color: #2c7a7b;
  box-shadow: 0 0 0 2px rgba(44, 122, 123, 0.35);
}

.dg-card h4 {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
}

.dg-card-size {
  font-weight: normal;
  font-size: 0.85rem;
  color: #666;
  margin-inline-start: 0.4rem;
}

.dg-card ul {
  margin: 0 0 0.4rem;
  padding-inline-start: 1.1rem;
}

.dg-card-label {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.dg-content {
  margin: 0 0 0.3rem;
}

.dg-badge {
  display: inline-block;
  padding: 0 0.45rem;
  border-radius: 3px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  background: #7a7466;
}

.dg-content-monster .dg-badge { background: #9b2c2c; }
.dg-content-trap .dg-badge { background: #b7791f; }
.dg-content-treasure .dg-badge { background: #2f855a; }
.dg-content-special .dg-badge { background: #553c9a; }

.dg-count {
  font-weight: 700;
}

.dg-stats,
.dg-hp,
.dg-xp,
.dg-note {
  margin: 0 0 0.3rem;
  font-size: 0.85rem;
}

.dg-stats span {
  display: inline-block;
  margin-inline-end: 0.5rem;
}

.dg-cursed {
  color: #9b2c2c;
}

.dg-total {
  list-style: none;
  color: #555;
  font-size: 0.85rem;
}

.dg-wandering {
  margin: 0 0 1rem;
}

.dg-wandering summary {
  cursor: pointer;
  font-weight: 600;
}

.dg-wandering ol {
  columns: 2;
}

.dg-story {
  border: 1px solid #d5cfc0;
  border-radius: 6px;
  padding: 0.8rem 1rem;
  margin: 0.5rem 0 1rem;
  background: #fffdf8;
}

.dg-story h3 {
  margin-top: 0;
}

.dg-story h4 {
  margin: 0.8rem 0 0.3rem;
  font-size: 1.05rem;
}

.dg-factions {
  list-style: none;
  padding: 0;
}

.dg-faction {
  margin-bottom: 0.6rem;
}

.dg-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.5rem;
  border: 1px solid;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: #fff;
}

.dg-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  flex: none;
}

.dg-room-faction,
.dg-detail,
.dg-safe,
.dg-hook {
  margin: 0 0 0.3rem;
  font-size: 0.9rem;
}

.dg-detail {
  font-style: italic;
  color: #555;
}

.dg-safe .dg-badge {
  background: #2c7a7b;
}

.dg-hook {
  border-inline-start: 3px solid #b7791f;
  padding-inline-start: 0.5rem;
}

.dg-truth {
  font-size: 0.8rem;
  font-weight: 600;
}

.dg-truth-true { color: #2f855a; }
.dg-truth-false { color: #9b2c2c; }

.dg-rumors summary {
  cursor: pointer;
  font-weight: 600;
}

.dg-special-title {
  font-weight: 700;
}

.dg-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 1.2rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid #d5cfc0;
  border-radius: 6px;
  background: #fffdf8;
  position: sticky;
  top: 0;
  z-index: 5;
}

.dg-warn {
  color: #9b2c2c;
  font-weight: 600;
}

.dg-btn {
  margin: 0.15rem 0 0.15rem 0.35rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid #a89f8b;
  border-radius: 4px;
  background: #fff;
  color: #2a2622;
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.dg-btn:hover {
  background: #f1ece0;
}

.dg-btn-main {
  border-color: #2c7a7b;
  background: #2c7a7b;
  color: #fff;
}

.dg-btn-main:hover {
  background: #285e61;
}

.dg-actions {
  margin: 0.4rem 0;
}

.dg-solo-room {
  margin: 0 0 1rem;
  border-color: #2c7a7b;
}

.dg-solo-room h4 {
  font-size: 1.2rem;
}

.dg-encounter {
  border: 1px solid #c9a3a3;
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  margin: 0.4rem 0;
  background: #fff8f6;
}

.dg-roll {
  margin: 0 0 0.3rem;
  font-size: 0.9rem;
}

.dg-hp-input {
  width: 3.4rem;
  padding: 0 0.2rem;
  direction: ltr;
  text-align: center;
}

.dg-exits {
  list-style: none;
  padding: 0;
}

.dg-exits li {
  margin-bottom: 0.25rem;
}

.dg-settings,
.dg-log,
.dg-oracle {
  margin: 0.5rem 0;
}

.dg-settings summary,
.dg-log summary {
  cursor: pointer;
  font-weight: 600;
}

.dg-settings label {
  display: block;
  margin: 0.25rem 0;
}

.dg-root select {
  direction: rtl;
}

.dg-oracle-answer {
  font-weight: 700;
  color: #553c9a;
}

.dg-log ol {
  list-style: none;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
  font-size: 0.9rem;
}

.dg-log-turn {
  color: #777;
}

.dg-feature {
  font-weight: 600;
}

.dg-toolbar {
  margin: 0.4rem 0;
}

@media print {
  /* Only the dungeon goes on paper: no site chrome, form or buttons. */
  #quarto-header,
  #quarto-sidebar,
  #quarto-margin-sidebar,
  .quarto-title-breadcrumbs,
  .page-navigation,
  .nav-footer,
  .lang-toggle-btn,
  main form,
  main > p,
  .dg-toolbar,
  .dg-btn,
  .dg-legend-scale {
    display: none !important;
  }

  #quarto-content,
  main.content {
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
  }

  .dg-level {
    break-before: page;
  }

  .dg-map {
    max-height: 17cm;
    width: auto;
  }

  .dg-cards {
    grid-template-columns: 1fr 1fr;
  }

  .dg-root a {
    color: inherit;
    text-decoration: none;
  }

  .dg-status {
    position: static;
  }

  .dg-card {
    break-inside: avoid;
  }
}
`;
