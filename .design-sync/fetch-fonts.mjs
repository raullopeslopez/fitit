// Self-host the three Google Fonts families Fitit's index.html loads, so the
// synced design system ships real @font-face rules instead of falling back to
// system fonts. Keeps latin + latin-ext only (Spanish UI).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap';
// woff2 is only served to UAs that advertise support.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

mkdirSync(OUT, { recursive: true });
const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

// Google emits `/* subset */` before each @font-face block.
const blocks = [...css.matchAll(/\/\*\s*([\w\[\]-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
if (!blocks.length) throw new Error('no @font-face blocks parsed from Google Fonts CSS');

const KEEP = new Set(['latin', 'latin-ext']);
const rules = [];
let files = 0;

for (const [, subset, block] of blocks) {
  if (!KEEP.has(subset)) continue;
  const family = /font-family:\s*'([^']+)'/.exec(block)[1];
  const weight = /font-weight:\s*(\d+)/.exec(block)[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(block)[1];
  const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}-${subset}.woff2`;

  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(OUT, file), buf);
  files++;

  rules.push(block.replace(/url\(https:[^)]+\.woff2\)/, `url('./${file}')`).trim());
}

writeFileSync(
  join(OUT, 'fonts.css'),
  `/* Self-hosted brand faces for /design-sync. Sourced from Google Fonts\n` +
    `   (Space Grotesk, Geist, Geist Mono — all SIL OFL 1.1); subsets latin +\n` +
    `   latin-ext. Mirrors the weights frontend/index.html loads. Regenerate\n` +
    `   with the script noted in .design-sync/NOTES.md. */\n\n` +
    rules.join('\n\n') +
    '\n',
);
console.log(`wrote ${files} woff2 + fonts.css (${rules.length} @font-face rules) to ${OUT}`);
