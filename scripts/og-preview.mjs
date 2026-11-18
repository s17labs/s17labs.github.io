#!/usr/bin/env node
/**
 * Renders the social preview cards in `public/og/` — one 1200×630 image per
 * tool, drawn from a single template so every card shares the same grid.
 *
 * Usage:
 *   node scripts/og-preview.mjs               # rewrite public/og/*.png
 *   node scripts/og-preview.mjs --sheet       # also write a contact sheet
 *   node scripts/og-preview.mjs --only <slug> # render a single card
 *
 * Tuning: change a value in LAYOUT and re-run. Everything is positioned from
 * measured baselines (canvas font metrics), so sizes and gaps stay on the
 * grid instead of needing hand-nudged offsets.
 *
 * Needs a local Chrome/Chromium; set CHROME=/path/to/chrome to point at one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'og');
const SITE_URL = 's17labs.github.io';

/** Card grid, in px on the 1200×630 canvas. */
const LAYOUT = {
  width: 1200,
  height: 630,
  /** Left edge shared by the lockup, rule, title, and url. */
  pad: 90,
  /** Width of the rule and the title's maximum measure. */
  measure: 1020,
  /** Accent square beside the wordmark. */
  mark: { size: 64, top: 64 },
  /** Gap between the square and "s17 Labs", before the glyph's side bearing. */
  markGap: 22,
  /** Wordmark size; its cap height is centered on the square. */
  brandSize: 62,
  /** Accent hairline closing the lockup. */
  rule: { top: 188, height: 2 },
  /** Tool title: largest size that fits the measure, all sharing one ink top. */
  title: { size: 112, minSize: 48, inkTop: 268 },
  /** Site url at the foot of the card. */
  url: { size: 24, baseline: 562 },
  colors: {
    surface: '#0e0e10',
    accent: '#ff4136',
    ink: '#f1f1f1',
    muted: '#8b8b93',
  },
};

function chromeBinary() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      // try the next candidate
    }
  }
  throw new Error('No Chrome/Chromium found — set CHROME=/path/to/chrome');
}

/** Tool names and slugs, in registry order. */
function tools() {
  const source = readFileSync(join(ROOT, 'src', 'data', 'tools.ts'), 'utf8');
  const entries = [...source.matchAll(/name: '([^']+)',\s*\n\s*slug: '([^']+)'/g)];
  if (!entries.length) throw new Error('No tools found in src/data/tools.ts');
  return entries.map(([, name, slug]) => ({ name, slug }));
}

/** The display font is inlined so the card renders identically anywhere. */
function aldrichFont() {
  const file = join(ROOT, 'public', 'fonts', 'aldrich-latin.woff2');
  return `data:font/woff2;base64,${readFileSync(file).toString('base64')}`;
}

function cardHtml(title) {
  const { colors, title: t } = LAYOUT;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @font-face {
    font-family: 'Aldrich';
    src: url('${aldrichFont()}') format('woff2');
    font-weight: 400;
    font-display: block;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${LAYOUT.width}px; height: ${LAYOUT.height}px; overflow: hidden; }
  body {
    position: relative;
    background: ${colors.surface};
    color: ${colors.ink};
    font-family: Aldrich, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* Absolute placement only: the layout script sets each element's top from
     its baseline, so no line-box leading can shift the grid. */
  .mark {
    position: absolute;
    left: ${LAYOUT.pad}px;
    top: ${LAYOUT.mark.top}px;
    width: ${LAYOUT.mark.size}px;
    height: ${LAYOUT.mark.size}px;
    background: ${colors.accent};
  }
  .brand {
    position: absolute;
    left: ${LAYOUT.pad + LAYOUT.mark.size + LAYOUT.markGap}px;
    top: 0;
    font-size: ${LAYOUT.brandSize}px;
    line-height: 1;
    white-space: nowrap;
  }
  .rule {
    position: absolute;
    left: ${LAYOUT.pad}px;
    top: ${LAYOUT.rule.top}px;
    width: ${LAYOUT.measure}px;
    height: ${LAYOUT.rule.height}px;
    background: ${colors.accent};
  }
  .title {
    position: absolute;
    left: ${LAYOUT.pad}px;
    top: 0;
    font-size: ${t.size}px;
    line-height: 1;
    white-space: nowrap;
  }
  .url {
    position: absolute;
    left: ${LAYOUT.pad}px;
    top: 0;
    font-size: ${LAYOUT.url.size}px;
    line-height: 1;
    color: ${colors.muted};
  }
</style>
</head>
<body>
  <div class="mark"></div>
  <div class="brand" id="brand">s17 Labs</div>
  <div class="rule"></div>
  <div class="title" id="title">${title}</div>
  <div class="url" id="url">${SITE_URL}</div>
<script>
(async () => {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const metrics = (text, size) => {
    ctx.font = size + 'px Aldrich';
    return ctx.measureText(text);
  };
  /** Distance from the baseline up to the top of the ink (cap/ascender). */
  const inkAscent = (text, size) => metrics(text, size).actualBoundingBoxAscent;
  /** How far the baseline sits below the top of a line-height:1 box. */
  const baselineOffset = (text, size) => {
    const m = metrics(text, size);
    return (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  };
  const placeByBaseline = (el, text, size, baseline) => {
    el.style.fontSize = size + 'px';
    el.style.top = (baseline - baselineOffset(text, size)).toFixed(2) + 'px';
  };

  // Wordmark: cap height centered on the accent square.
  const brand = document.getElementById('brand');
  const brandText = brand.textContent;
  const markCenter = ${LAYOUT.mark.top} + ${LAYOUT.mark.size} / 2;
  placeByBaseline(brand, brandText, ${LAYOUT.brandSize}, markCenter + inkAscent(brandText, ${LAYOUT.brandSize}) / 2);

  // Title: shrink from the design size until it fits the measure.
  const title = document.getElementById('title');
  const titleText = title.textContent;
  const inkWidth = (size) => {
    const m = metrics(titleText, size);
    return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  };
  let size = ${t.size};
  while (size > ${t.minSize} && inkWidth(size) > ${LAYOUT.measure}) size -= 2;
  const m = metrics(titleText, size);
  placeByBaseline(title, titleText, size, ${t.inkTop} + m.actualBoundingBoxAscent);
  // Cancel the glyph's left side bearing so the ink starts on the grid.
  title.style.left = (${LAYOUT.pad} + m.actualBoundingBoxLeft) + 'px';

  placeByBaseline(document.getElementById('url'), '${SITE_URL}', ${LAYOUT.url.size}, ${LAYOUT.url.baseline});
})();
</script>
</body>
</html>`;
}

function capture(htmlPath, pngPath, width, height) {
  mkdirSync(dirname(pngPath), { recursive: true });
  execFileSync(chromeBinary(), [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--virtual-time-budget=3000',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'ignore' });
  if (!existsSync(pngPath)) throw new Error(`Chrome did not write ${pngPath}`);
}

function shoot(html, pngPath, width, height) {
  const htmlPath = join(tmpdir(), `og-preview-${process.pid}-${Date.now()}.html`);
  writeFileSync(htmlPath, html);
  try {
    capture(htmlPath, pngPath, width, height);
  } finally {
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
  }
}

function renderCard(tool) {
  const out = join(OUT_DIR, `${tool.slug}.png`);
  shoot(cardHtml(tool.name), out, LAYOUT.width, LAYOUT.height);
  return out;
}

/** Contact sheet: every card at half size, for eyeballing the set at once. */
function renderSheet(list, path) {
  const figures = list
    .map((t) => `<figure><img src="public/og/${t.slug}.png" alt=""><figcaption>${t.slug}</figcaption></figure>`)
    .join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 20px; background: #1b1b1f; display: grid;
           grid-template-columns: repeat(2, 600px); gap: 20px; align-content: start;
           font: 12px/1.4 Verdana, sans-serif; color: #8b8b93; }
    figure { margin: 0; }
    img { width: 600px; height: 315px; display: block; border: 1px solid #333; }
    figcaption { padding-top: 4px; }
  </style></head><body>${figures}</body></html>`;
  // The sheet is written into the repo root so the image src paths resolve.
  const htmlPath = join(ROOT, '.og-sheet.html');
  writeFileSync(htmlPath, html);
  try {
    capture(htmlPath, path, 1260, 20 + Math.ceil(list.length / 2) * 355 + 20);
  } finally {
    if (existsSync(htmlPath)) unlinkSync(htmlPath);
  }
  return path;
}

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const list = tools().filter((t) => !only || t.slug === only);
if (!list.length) throw new Error(`No tool matches "${only}"`);

for (const tool of list) {
  console.log(`✓ ${renderCard(tool).replace(ROOT + '/', '')}`);
}

if (args.includes('--sheet')) {
  console.log(`✓ ${renderSheet(list, process.env.SHEET ?? join(tmpdir(), 's17-og-sheet.png'))}`);
}
