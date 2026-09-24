import JSZip from 'jszip';
import { library, findIconDefinition } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { iconSvg } from '../../icons';
import { downloadBlob, downloadUrl, normalizeHex, svgTextToPngBlob } from './lib';

library.add(fas);
library.add(far);
library.add(fab);

// Bootstrap Icons (MIT, 2000+ fill-based glyphs) ship with the page via npm
// and load on demand — no CDN, fully offline. Each file is a 16x16 SVG with
// one or more <path> elements, which maps 1:1 onto the FA pipeline
// (fill color + Android VectorDrawable export).
const biModules = import.meta.glob(
  '../../../node_modules/bootstrap-icons/icons/*.svg',
  { query: '?raw', import: 'default', eager: false }
) as Record<string, () => Promise<string>>;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
interface VectorPath {
  d: string;
  fillRule?: string; // 'evenodd' — preserved from Bootstrap SVGs
  opacity?: string; // e.g. '0.4' — FA duotone secondary layer / BI fill-opacity
}

const S = {
  source: 'fa', // 'fa' | 'bi' | 'text' | 'noto' | 'twemoji'
  iconName: '', // FA/BI icon name, raw emoji character, or text value
  // Text specific
  textValue: '', // raw text for the 'text' source
  fontFamily: 'System Sans', // display name (built-in or Google Font)
  fontStack: `Verdana, Geneva, 'DejaVu Sans', 'Segoe UI', sans-serif`,
  fontWeight: 700,
  fontItalic: false,
  fontUnderline: false,
  textSpacing: 0, // letter-spacing in inner text-viewport units
  iconColor: '#ffffff',
  bgColor: '#ff4136',
  bgType: 'solid', // 'solid' | 'gradient' (linear, two stops)
  bgColor2: '#ffffff', // gradient end stop
  bgAngle: 90, // CSS gradient angle in degrees (0 = up, 90 = right)
  bgShape: 'circle',
  iconScale: 70,
  iconOffsetY: 0, // vertical icon offset in canvas units (− up · + down)
  // Vector specific (FA + Bootstrap)
  paths: null as VectorPath[] | null,
  viewBox: '0 0 512 512',
  // Emoji specific
  emojiSvg: null as string | null, // raw SVG string from CDN
  valid: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Source switching
// ─────────────────────────────────────────────────────────────────────────────
const INPUT_CONFIG = {
  fa: {
    label: 'Font Awesome Icon Name',
    placeholder: 'e.g. star, circle-check, bolt',
    cls: '',
    error:
      'Icon not found — check spelling at <a href="https://fontawesome.com/search?ic=free-collection" target="_blank" rel="noopener">fontawesome.com</a>',
  },
  bi: {
    label: 'Bootstrap Icon Name',
    placeholder: 'e.g. star, alarm, rocket',
    cls: '',
    error:
      'Icon not found — check spelling at <a href="https://icons.getbootstrap.com" target="_blank" rel="noopener">icons.getbootstrap.com</a>',
  },
  text: {
    label: 'Icon Text (letters, numbers, symbols)',
    placeholder: 'Type characters  e.g. A, 42, @, →',
    cls: 'text-input',
    error: 'Type 1–8 characters',
  },
  noto: {
    label: 'Noto Emoji',
    placeholder: 'Paste or type an emoji  e.g. 😀 🎉 🔥',
    cls: 'emoji-input',
    error: 'Emoji not found — try a different character',
  },
  twemoji: {
    label: 'Twemoji',
    placeholder: 'Paste or type an emoji  e.g. 😀 🎉 🔥',
    cls: 'emoji-input',
    error: 'Emoji not found — try a different character',
  },
} as const;

function setSource(src: keyof typeof INPUT_CONFIG): void {
  S.source = src;
  S.valid = false;
  S.paths = null;
  S.emojiSvg = null;
  S.iconName = '';
  S.textValue = '';
  biSeq++; // invalidate any in-flight Bootstrap lookup

  // Update source buttons
  document.querySelectorAll<HTMLElement>('.source-btn').forEach((b) => {
    const on = b.dataset.source === src;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  // Update input appearance
  const cfg = INPUT_CONFIG[src];
  const input = document.getElementById('icon-input') as HTMLInputElement;
  document.getElementById('input-label')!.textContent = cfg.label;
  input.placeholder = cfg.placeholder;
  input.value = '';
  input.className = cfg.cls;
  if (src === 'text') input.setAttribute('maxlength', '8');
  else input.removeAttribute('maxlength');

  // Error message text (contains a clickable link for FA / Bootstrap)
  const errorMsg = document.getElementById('error-msg')!;
  errorMsg.innerHTML = cfg.error;
  errorMsg.classList.remove('visible');

  // Icon color applies to vector sources (FA, Bootstrap) and text.
  // Emoji carry their own colors.
  const isEmoji = src === 'noto' || src === 'twemoji';
  document.getElementById('icon-color-field')!.classList.toggle('cp-disabled', isEmoji);
  document.getElementById('cp-fa-only-note')!.classList.toggle('visible', isEmoji);

  // Material You checkbox + VectorDrawable XMLs need real vector paths
  // (FA, Bootstrap). Text and emoji export as PNG-only.
  const isVector = src === 'fa' || src === 'bi';
  const row = document.getElementById('material-row')!;
  row.classList.toggle('cb-disabled', !isVector);
  document.getElementById('material-sub')!.textContent = isVector
    ? 'Adds <monochrome> layer for Android 13+'
    : src === 'text'
      ? 'Text icons export as PNG only — no vector XMLs'
      : 'Vector sources only — not supported for emoji';

  // Text style panel is only relevant for the text source
  document.getElementById('text-style-panel')!.classList.toggle('visible', src === 'text');

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Emoji codepoint helpers
// ─────────────────────────────────────────────────────────────────────────────

// Extract codepoints from an emoji string as an array of hex strings
function emojiCodepoints(emoji: string): string[] {
  return [...emoji].map((c) => c.codePointAt(0)!.toString(16).toLowerCase());
}

// Twemoji: keep ZWJ sequences intact, strip VS16 (fe0f) only if no ZWJ
function toTwemojiCP(emoji: string): string {
  const pts = emojiCodepoints(emoji);
  if (!pts.includes('200d')) {
    return pts.filter((p) => p !== 'fe0f').join('-');
  }
  return pts.join('-');
}

// Noto: strip ZWJ and VS16 (they organise differently)
function toNotoCP(emoji: string): string {
  return emojiCodepoints(emoji)
    .filter((p) => p !== 'fe0f' && p !== '200d')
    .join('_');
}

// Build CDN URL for the emoji SVG
function emojiUrl(emoji: string, src: string): string {
  if (src === 'twemoji') {
    const cp = toTwemojiCP(emoji);
    return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cp}.svg`;
  }
  // noto
  const cp = toNotoCP(emoji);
  return `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji/svg/emoji_u${cp}.svg`;
}

// Fetch emoji SVG from CDN
async function fetchEmojiSvg(emoji: string): Promise<string> {
  const url = emojiUrl(emoji, S.source);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes('<svg')) throw new Error('Invalid SVG');
  return text;
}

// Encode SVG string as a data URI (handles Unicode safely)
function svgDataUri(svgText: string): string {
  try {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
  } catch {
    return 'data:image/svg+xml,' + encodeURIComponent(svgText);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FA API lookup
// ─────────────────────────────────────────────────────────────────────────────
function findFAIcon(name: string): { paths: VectorPath[]; viewBox: string } | null {
  for (const prefix of ['fas', 'far', 'fab'] as const) {
    try {
      const def = findIconDefinition({ prefix, iconName: name } as Parameters<typeof findIconDefinition>[0]);
      if (def?.icon) {
        const [w, h, , , pd] = def.icon;
        const ds = Array.isArray(pd) ? pd : [pd];
        // Preserve the duotone treatment: FA multi-path definitions
        // dim their first (secondary) layer.
        const paths = ds.map((d, i) => (ds.length > 1 && i === 0 ? { d, opacity: '0.4' } : { d }));
        return { paths, viewBox: `0 0 ${w} ${h}` };
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap Icons lookup (local .svg files, loaded on demand)
// ─────────────────────────────────────────────────────────────────────────────
function svgAttr(attrs: string, name: string): string | undefined {
  // (^|\s) guard so 'x' doesn't match inside 'rx', etc.
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
}

// Apply an SVG matrix(a b c d e f) transform to an absolute-coordinate path
// using only M/L/Q/Z commands (what the rect converter below emits).
function applySvgMatrix(d: string, matrix: string): string {
  const m = /matrix\(\s*([^)]+)\)/.exec(matrix);
  if (!m) return d;
  const [a, b, c, dd, e, f] = m[1].trim().split(/[\s,]+/).map(Number);
  if ([a, b, c, dd, e, f].some((n) => Number.isNaN(n))) return d;
  const pt = (x: number, y: number): string =>
    `${+(a * x + c * y + e).toFixed(3)} ${+(b * x + dd * y + f).toFixed(3)}`;
  return d.replace(/([MLQ])([^MLQZ]*)/g, (_m: string, cmd: string, coords: string) => {
    const nums = coords.trim().split(/[\s,]+/).map(Number);
    const pts: string[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push(pt(nums[i], nums[i + 1]));
    return cmd + pts.join(' ');
  });
}

// Convert a <rect> to absolute-coordinate path data (supports rx + matrix).
function rectToPath(x: number, y: number, w: number, h: number, rx: number, transform?: string): string {
  const rr = Math.min(rx, w / 2, h / 2);
  const r = (n: number): number => Math.round(n * 1000) / 1000;
  let d: string;
  if (!rr) {
    d = `M${r(x)} ${r(y)}L${r(x + w)} ${r(y)}L${r(x + w)} ${r(y + h)}L${r(x)} ${r(y + h)}Z`;
  } else {
    d =
      `M${r(x + rr)} ${r(y)}` +
      `L${r(x + w - rr)} ${r(y)}Q${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + rr)}` +
      `L${r(x + w)} ${r(y + h - rr)}Q${r(x + w)} ${r(y + h)} ${r(x + w - rr)} ${r(y + h)}` +
      `L${r(x + rr)} ${r(y + h)}Q${r(x)} ${r(y + h)} ${r(x)} ${r(y + h - rr)}` +
      `L${r(x)} ${r(y + rr)}Q${r(x)} ${r(y)} ${r(x + rr)} ${r(y)}Z`;
  }
  return transform ? applySvgMatrix(d, transform) : d;
}

function parseBiSvg(raw: string): { paths: VectorPath[]; viewBox: string } | null {
  const inner = raw.slice(raw.indexOf('>') + 1, raw.lastIndexOf('<'));
  const paths: VectorPath[] = [];
  const elRe = /<(path|circle|rect)\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = elRe.exec(inner))) {
    const [, tag, attrs] = m;
    if (tag === 'path') {
      const d = svgAttr(attrs, 'd');
      if (!d) continue;
      const p: VectorPath = { d };
      if (svgAttr(attrs, 'fill-rule') === 'evenodd') p.fillRule = 'evenodd';
      const fo = svgAttr(attrs, 'fill-opacity');
      if (fo) p.opacity = fo;
      paths.push(p);
    } else if (tag === 'circle') {
      const cx = Number(svgAttr(attrs, 'cx') ?? 0);
      const cy = Number(svgAttr(attrs, 'cy') ?? 0);
      const cr = Number(svgAttr(attrs, 'r') ?? 0);
      if (!cr) continue;
      paths.push({ d: `M${cx - cr} ${cy}a${cr} ${cr} 0 1 0 ${2 * cr} 0a${cr} ${cr} 0 1 0 ${-2 * cr} 0z` });
    } else {
      const w = Number(svgAttr(attrs, 'width') ?? 0);
      const h = Number(svgAttr(attrs, 'height') ?? 0);
      if (!w || !h) continue;
      paths.push({
        d: rectToPath(
          Number(svgAttr(attrs, 'x') ?? 0),
          Number(svgAttr(attrs, 'y') ?? 0),
          w,
          h,
          Number(svgAttr(attrs, 'rx') ?? 0),
          svgAttr(attrs, 'transform')
        ),
      });
    }
  }
  if (!paths.length) return null;
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 16 16';
  return { paths, viewBox };
}

async function findBootstrapIcon(name: string): Promise<{ paths: VectorPath[]; viewBox: string } | null> {
  const loader = biModules[`../../../node_modules/bootstrap-icons/icons/${name}.svg`];
  if (!loader) return null;
  try {
    return parseBiSvg(await loader());
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text icon helpers
// ─────────────────────────────────────────────────────────────────────────────
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Auto-shrink the type so 1–8 characters always fill the icon nicely.
// The inner text viewport is 100x100 units; sized so type fills the icon
// the way FA glyphs fill their viewBox (Verdana cap-height is ~0.73em,
// so single glyphs render at 76 units).
function textFontSize(len: number): number {
  if (len <= 1) return 76;
  return Math.min(64, 150 / len);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text fonts: self-hosted bundle (public/fonts/icon-maker/, all SIL OFL).
// No network, no name-spelling issues — the <select> only offers families
// declared in icon-maker-fonts.css. Variable faces cover whole weight ranges.
// ─────────────────────────────────────────────────────────────────────────────
const TEXT_FONTS: { name: string; stack: string }[] = [
  { name: 'System Sans', stack: `Verdana, Geneva, 'DejaVu Sans', 'Segoe UI', sans-serif` },
  { name: 'System Serif', stack: `Georgia, 'Times New Roman', 'DejaVu Serif', serif` },
  { name: 'System Mono', stack: `'Courier New', 'DejaVu Sans Mono', monospace` },
  { name: 'Alien Block', stack: `'Alien Block', Verdana, Geneva, sans-serif` },
  { name: 'Anton', stack: `'Anton', Verdana, Geneva, sans-serif` },
  { name: 'Archivo Black', stack: `'Archivo Black', Verdana, Geneva, sans-serif` },
  { name: 'Bebas Neue', stack: `'Bebas Neue', Verdana, Geneva, sans-serif` },
  { name: 'Lobster', stack: `'Lobster', Georgia, serif` },
  { name: 'Montserrat', stack: `'Montserrat', Verdana, Geneva, sans-serif` },
  { name: 'Oswald', stack: `'Oswald', Verdana, Geneva, sans-serif` },
  { name: 'Playfair Display', stack: `'Playfair Display', Georgia, serif` },
  { name: 'Roboto', stack: `'Roboto', Verdana, Geneva, sans-serif` },
  { name: 'JetBrains Mono', stack: `'JetBrains Mono', 'Courier New', monospace` },
];

function setTextFont(name: string): void {
  const f = TEXT_FONTS.find((x) => x.name === name) ?? TEXT_FONTS[0];
  Object.assign(S, { fontFamily: f.name, fontStack: f.stack });
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Font embedding for exports.
//
// An SVG rasterized through <img> (all PNG exports + Android thumbnails) is
// isolated: it cannot see the page's webfonts, so custom families would fall
// back to system fonts. Embedding the bundled woff2 as a data URI makes
// exports render exactly like the preview (and self-contained SVG files).
// Mirrors icon-maker-fonts.css — variable faces cover a range with one file.
// ─────────────────────────────────────────────────────────────────────────────
interface FontFile {
  style: string; // 'normal' | 'italic'
  min: number;
  max: number;
  file: string;
}

const FONT_FILES: Record<string, FontFile[]> = {
  'Alien Block': [{ style: 'normal', min: 400, max: 400, file: 'alienblock-400-latin.woff2' }],
  Anton: [{ style: 'normal', min: 400, max: 400, file: 'anton-400-latin.woff2' }],
  'Archivo Black': [{ style: 'normal', min: 400, max: 400, file: 'archivoblack-400-latin.woff2' }],
  'Bebas Neue': [{ style: 'normal', min: 400, max: 400, file: 'bebasneue-400-latin.woff2' }],
  Lobster: [{ style: 'normal', min: 400, max: 400, file: 'lobster-400-latin.woff2' }],
  Montserrat: [
    { style: 'normal', min: 100, max: 900, file: 'montserrat-100900-latin.woff2' },
    { style: 'italic', min: 100, max: 900, file: 'montserrat-100900i-latin.woff2' },
  ],
  Oswald: [{ style: 'normal', min: 200, max: 700, file: 'oswald-200700-latin.woff2' }],
  'Playfair Display': [
    { style: 'normal', min: 400, max: 900, file: 'playfairdisplay-400900-latin.woff2' },
    { style: 'italic', min: 400, max: 900, file: 'playfairdisplay-400900i-latin.woff2' },
  ],
  Roboto: [
    { style: 'normal', min: 400, max: 400, file: 'roboto-400-latin.woff2' },
    { style: 'normal', min: 700, max: 700, file: 'roboto-700-latin.woff2' },
    { style: 'italic', min: 400, max: 400, file: 'roboto-400i-latin.woff2' },
    { style: 'italic', min: 700, max: 700, file: 'roboto-700i-latin.woff2' },
  ],
  'JetBrains Mono': [
    { style: 'normal', min: 100, max: 800, file: 'jetbrainsmono-100800-latin.woff2' },
    { style: 'italic', min: 100, max: 800, file: 'jetbrainsmono-100800i-latin.woff2' },
  ],
};

function pickFontFile(family: string, weight: number, italic: boolean): FontFile | null {
  const opts = FONT_FILES[family];
  if (!opts) return null; // system stacks need no embedding
  for (const st of italic ? ['italic', 'normal'] : ['normal', 'italic']) {
    const cands = opts.filter((o) => o.style === st);
    if (!cands.length) continue;
    const inRange = cands.find((o) => weight >= o.min && weight <= o.max);
    if (inRange) return inRange;
    let best = cands[0];
    let bestD = Infinity;
    for (const o of cands) {
      const d = weight < o.min ? o.min - weight : weight - o.max;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
  return null;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

const fontEmbedCache = new Map<string, string>(); // key → <style> ('' = none/failed)

async function textFontEmbedCSS(): Promise<string> {
  if (S.source !== 'text') return '';
  // Underline only decorates the rendered text — it never changes the font
  // file, so it stays out of the cache key.
  const key = `${S.fontFamily}|${S.fontWeight}|${S.fontItalic}`;
  const hit = fontEmbedCache.get(key);
  if (hit !== undefined) return hit;
  let css = '';
  try {
    const pick = pickFontFile(S.fontFamily, S.fontWeight, S.fontItalic);
    if (pick) {
      const res = await fetch(`/fonts/icon-maker/${pick.file}`);
      if (res.ok) {
        const b64 = arrayBufferToBase64(await res.arrayBuffer());
        // Declare the requested weight/style so this face always matches —
        // variable ranges stay truthful, statics pin the closest file.
        const weightDesc = pick.min === pick.max ? String(S.fontWeight) : `${pick.min} ${pick.max}`;
        const styleDesc = S.fontItalic ? 'italic' : 'normal';
        css =
          `<style>@font-face{font-family:"${S.fontFamily}";` +
          `font-style:${styleDesc};font-weight:${weightDesc};font-display:swap;` +
          `src:url(data:font/woff2;base64,${b64}) format('woff2');}</style>`;
      }
    }
  } catch {
    /* fall back to system rendering */
  }
  fontEmbedCache.set(key, css);
  return css;
}

// buildSVG plus the embedded typeface (when the text source needs one).
// Used by every export path; the live preview uses document fonts instead.
async function buildExportSVG(shapeOverride?: string): Promise<string> {
  const svg = buildSVG(shapeOverride);
  const css = await textFontEmbedCSS();
  if (!css) return svg;
  return svg.replace(/<svg[^>]*>/, (m) => m + css);
}

// ─────────────────────────────────────────────────────────────────────────────
// Background gradient helpers
//
// CSS gradient angle → SVG objectBoundingBox vector. CSS 0° points up with
// angles growing clockwise; SVG y grows downward, so the direction is
// (sin θ, −cos θ) around the 0.5 center.
// ─────────────────────────────────────────────────────────────────────────────
function bgGradientVector(): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (S.bgAngle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const c = (n: number): number => Math.round((0.5 + n) * 10000) / 10000;
  return { x1: c(-dx), y1: c(-dy), x2: c(dx), y2: c(dy) };
}

// Each background stop well shows its own solid stop color.
function syncBgSwatches(): void {
  (document.getElementById('cp-fill-bg') as HTMLElement).style.background = S.bgColor;
  (document.getElementById('cp-fill-bg2') as HTMLElement).style.background = S.bgColor2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build composite SVG
// ─────────────────────────────────────────────────────────────────────────────
function buildSVG(shapeOverride?: string): string {
  const shape = shapeOverride ?? S.bgShape;
  const { iconColor, bgColor, iconScale } = S;
  const pad = (100 - iconScale) / 2;
  const iy = pad + S.iconOffsetY;
  const rx = shape === 'circle' ? 50 : shape === 'rounded' ? 14 : 0;
  let bgEl = '';
  if (shape !== 'none') {
    if (S.bgType === 'gradient') {
      const v = bgGradientVector();
      bgEl =
        `<defs><linearGradient id="s17-im-bg-grad" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">` +
        `<stop offset="0" stop-color="${bgColor}"/><stop offset="1" stop-color="${S.bgColor2}"/>` +
        `</linearGradient></defs><rect width="100" height="100" fill="url(#s17-im-bg-grad)" rx="${rx}"/>`;
    } else {
      bgEl = `<rect width="100" height="100" fill="${bgColor}" rx="${rx}"/>`;
    }
  }

  let iconEl = '';

  if ((S.source === 'fa' || S.source === 'bi') && S.paths) {
    const pathEls = S.paths.map(
      (p) =>
        `<path d="${p.d}" fill="${iconColor}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}${p.opacity ? ` opacity="${p.opacity}"` : ''}/>`
    ).join('');
    iconEl = `<svg x="${pad}" y="${iy}" width="${iconScale}" height="${iconScale}" viewBox="${S.viewBox}">${pathEls}</svg>`;
  } else if (S.source === 'text' && S.textValue) {
    // Custom text/characters rendered as centered type in the chosen font.
    // Built-ins use system stacks; Google Fonts fall back to Verdana so the
    // SVG still renders anywhere (PNG exports are always fully rasterized).
    const len = [...S.textValue].length || 1;
    const fs = String(Math.round(textFontSize(len) * 10) / 10);
    const fStyle = S.fontItalic ? ' font-style="italic"' : '';
    const fDeco = S.fontUnderline ? ' text-decoration="underline"' : '';
    // letter-spacing adds advance after every glyph (incl. the last), which
    // would off-center anchored text — compensate with x = 50 + ls/2.
    const ls = S.textSpacing;
    const tx = Math.round((50 + ls / 2) * 10) / 10;
    iconEl = `<svg x="${pad}" y="${iy}" width="${iconScale}" height="${iconScale}" viewBox="0 0 100 100"><text x="${tx}" y="52" text-anchor="middle" dominant-baseline="central" font-family="${S.fontStack}" font-size="${fs}" font-weight="${S.fontWeight}" letter-spacing="${ls}"${fStyle}${fDeco} fill="${iconColor}">${escapeXml(S.textValue)}</text></svg>`;
  } else if ((S.source === 'noto' || S.source === 'twemoji') && S.emojiSvg) {
    // Embed emoji as image using data URI — preserves all colors and gradients
    const uri = svgDataUri(S.emojiSvg);
    iconEl = `<image x="${pad}" y="${iy}" width="${iconScale}" height="${iconScale}" href="${uri}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">${bgEl}${iconEl}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render preview
// ─────────────────────────────────────────────────────────────────────────────
function render(): void {
  const container = document.getElementById('preview-container')!;
  const placeholder = document.getElementById('placeholder')!;
  const loading = document.getElementById('preview-loading')!;
  const meta = document.getElementById('preview-meta')!;
  const old = container.querySelector('svg.live');

  if (!S.valid) {
    placeholder.style.display = '';
    loading.classList.remove('visible');
    meta.style.display = 'none';
    old?.remove();
    return;
  }

  placeholder.style.display = 'none';
  loading.classList.remove('visible');
  meta.style.display = '';
  exportError(false);

  const svgDoc = new DOMParser().parseFromString(buildSVG(), 'image/svg+xml');
  if (svgDoc.documentElement.tagName === 'parsererror' || svgDoc.getElementsByTagName('parsererror').length) {
    // Never swap a broken parse into the preview — keep the last good icon.
    err(true);
    return;
  }
  const svg = svgDoc.documentElement;
  svg.classList.add('live');
  svg.style.cssText = 'width:180px;height:180px;display:block;';
  if (old) old.replaceWith(svg);
  else container.appendChild(svg);

  const sourceLabels: Record<string, string> = { fa: 'Font Awesome', bi: 'Bootstrap', text: 'Text', noto: 'Noto', twemoji: 'Twemoji' };
  document.getElementById('meta-source')!.textContent = sourceLabels[S.source];
  document.getElementById('meta-icon')!.textContent = S.iconName;
  document.getElementById('meta-bg')!.textContent =
    S.bgShape === 'none'
      ? 'transparent'
      : S.bgType === 'gradient'
        ? `${S.bgColor} → ${S.bgColor2} ${S.bgAngle}°`
        : S.bgColor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon input handler (FA + Bootstrap + text + emoji, shared input element)
// ─────────────────────────────────────────────────────────────────────────────
let iconTimer: ReturnType<typeof setTimeout>;
let biSeq = 0; // guards against out-of-order Bootstrap async lookups

const elIconInput = document.getElementById('icon-input') as HTMLInputElement;

function handleIconInput(): void {
  clearTimeout(iconTimer);
  const raw = elIconInput.value;
  const val = raw.trim();

  if (!val) {
    S.valid = false;
    S.textValue = '';
    err(false);
    render();
    return;
  }

  if (S.source === 'text') {
    // Text: render immediately, no lookup or fetch. Keep only code points
    // valid in XML 1.0 so a stray control character can't corrupt the preview.
    const chars = [...val].filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return (
        cp === 0x9 ||
        cp === 0xa ||
        cp === 0xd ||
        (cp >= 0x20 && cp <= 0xd7ff) ||
        (cp >= 0xe000 && cp <= 0xfffd) ||
        cp >= 0x10000
      );
    });
    if (!chars.length) {
      // Non-blank input with nothing usable in it (e.g. an in-progress mobile
      // keystroke that hasn't produced characters yet) — leave the current
      // icon and error state untouched and wait for the next input event.
      return;
    }
    S.textValue = chars.slice(0, 8).join('');
    S.iconName = S.textValue;
    S.valid = true;
    err(false);
    render();
    return;
  }

  if (S.source === 'fa') {
    // FA: debounce lookup
    const name = val.toLowerCase().replace(/^fa[srbl]?-/, '');
    iconTimer = setTimeout(() => {
      const r = findFAIcon(name);
      if (r) {
        Object.assign(S, { iconName: name, paths: r.paths, viewBox: r.viewBox, valid: true });
        err(false);
      } else {
        S.valid = false;
        err(true);
      }
      render();
    }, 300);
  } else if (S.source === 'bi') {
    // Bootstrap: debounce local async lookup (no network involved)
    const name = val.toLowerCase().replace(/^bi-/, '');
    const seq = ++biSeq;
    iconTimer = setTimeout(async () => {
      const r = await findBootstrapIcon(name);
      if (seq !== biSeq) return; // stale — user kept typing or switched source
      if (r) {
        Object.assign(S, { iconName: name, paths: r.paths, viewBox: r.viewBox, valid: true });
        err(false);
      } else {
        S.valid = false;
        err(true);
      }
      render();
    }, 300);
  } else {
    // Emoji: debounce fetch
    iconTimer = setTimeout(async () => {
      // Show loading state
      const container = document.getElementById('preview-container')!;
      const placeholder = document.getElementById('placeholder')!;
      const loading = document.getElementById('preview-loading')!;
      const old = container.querySelector('svg.live');
      placeholder.style.display = 'none';
      old?.remove();
      loading.classList.add('visible');
      err(false);

      try {
        const svgText = await fetchEmojiSvg(val);
        S.iconName = val;
        S.emojiSvg = svgText;
        S.valid = true;
        err(false);
      } catch {
        S.valid = false;
        S.emojiSvg = null;
        err(true);
      }
      render();
    }, 450);
  }
}

elIconInput.addEventListener('input', (e) => {
  // Skip IME composition updates (mobile keyboards emit intermediate values
  // that can look empty/invalid) — the final value is handled below.
  if ((e as InputEvent).isComposing) return;
  handleIconInput();
});
elIconInput.addEventListener('compositionend', handleIconInput);

function err(show: boolean): void {
  document.getElementById('error-msg')!.classList.toggle('visible', show);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text style controls (font family, weight, italic, underline)
// ─────────────────────────────────────────────────────────────────────────────
const elFontSelect = document.getElementById('font-select') as HTMLSelectElement;
const elFontWeight = document.getElementById('font-weight') as HTMLSelectElement;
const elStyleBold = document.getElementById('style-bold')!;
const elStyleItalic = document.getElementById('style-italic')!;
const elStyleUnderline = document.getElementById('style-underline')!;

function syncStyleUI(): void {
  elStyleBold.classList.toggle('active', S.fontWeight === 700);
  elStyleBold.setAttribute('aria-pressed', String(S.fontWeight === 700));
  elStyleItalic.classList.toggle('active', S.fontItalic);
  elStyleItalic.setAttribute('aria-pressed', String(S.fontItalic));
  elStyleUnderline.classList.toggle('active', S.fontUnderline);
  elStyleUnderline.setAttribute('aria-pressed', String(S.fontUnderline));
  if (elFontWeight.value !== String(S.fontWeight)) elFontWeight.value = String(S.fontWeight);
  if (elFontSelect.value !== S.fontFamily) elFontSelect.value = S.fontFamily;
}

elFontSelect.addEventListener('change', () => setTextFont(elFontSelect.value));

elStyleBold.addEventListener('click', () => {
  // Bold toggles between Regular 400 and Bold 700
  S.fontWeight = S.fontWeight === 700 ? 400 : 700;
  syncStyleUI();
  render();
});

elStyleItalic.addEventListener('click', () => {
  S.fontItalic = !S.fontItalic;
  syncStyleUI();
  render();
});

elStyleUnderline.addEventListener('click', () => {
  S.fontUnderline = !S.fontUnderline;
  syncStyleUI();
  render();
});

elFontWeight.addEventListener('change', () => {
  S.fontWeight = Number(elFontWeight.value) || 700;
  syncStyleUI();
  render();
});

const elTextSpacing = document.getElementById('text-spacing') as HTMLInputElement;

elTextSpacing.addEventListener('input', () => {
  S.textSpacing = Number(elTextSpacing.value) || 0;
  const n = S.textSpacing;
  document.getElementById('spacing-label')!.textContent = (n > 0 ? '+' : '') + String(n);
  render();
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape + scale
// ─────────────────────────────────────────────────────────────────────────────
function setShape(s: string): void {
  S.bgShape = s;
  document.querySelectorAll<HTMLElement>('.shape-btn').forEach((b) => {
    const on = b.dataset.shape === s;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-square background dialog.
//
// Adaptive-icon launchers apply their own mask (circle, squircle, …) to both
// layers, so a baked-in circle/rounded background clashes with it. The export
// button and the Material You checkbox open this gate instead of proceeding
// silently — switching to square continues, dismissing cancels the export or
// leaves the checkbox as-is.
// ─────────────────────────────────────────────────────────────────────────────
let shapeDialogMode: 'export' | 'material' | null = null;

function nonSquareBg(): boolean {
  return S.bgShape === 'circle' || S.bgShape === 'rounded';
}

function openShapeDialog(mode: 'export' | 'material'): void {
  shapeDialogMode = mode;
  const primary = document.getElementById('shape-dialog-primary')!;
  const secondary = document.getElementById('shape-dialog-secondary')!;
  primary.textContent = mode === 'export' ? 'Switch to Square & Export' : 'Switch to Square';
  secondary.textContent = mode === 'export' ? 'Export Anyway' : 'Keep Current Shape';
  document.getElementById('shape-dialog')!.classList.add('visible');
  document.body.style.overflow = 'hidden';
  primary.focus();
}

function closeShapeDialog(): void {
  document.getElementById('shape-dialog')!.classList.remove('visible');
  document.body.style.overflow = '';
  shapeDialogMode = null;
}

// Run the Android export the dialog interrupted.
// Takes mode as an arg because closeShapeDialog clears the global.
function continuePendingExport(mode: 'export' | 'material' | null): void {
  if (mode !== 'export') return;
  void exportAndroid();
}

document.getElementById('shape-dialog-primary')!.addEventListener('click', () => {
  const mode = shapeDialogMode;
  setShape('square');
  closeShapeDialog();
  continuePendingExport(mode);
});

document.getElementById('shape-dialog-secondary')!.addEventListener('click', () => {
  const mode = shapeDialogMode;
  closeShapeDialog();
  continuePendingExport(mode);
});

document.getElementById('shape-dialog')!.addEventListener('click', (e) => {
  if (e.target === document.getElementById('shape-dialog')) closeShapeDialog();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shapeDialogMode) closeShapeDialog();
});

document.getElementById('material-toggle')!.addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).checked && nonSquareBg()) openShapeDialog('material');
});

for (const b of document.querySelectorAll<HTMLElement>('.shape-btn')) {
  b.addEventListener('click', () => setShape(b.dataset.shape!));
}

for (const b of document.querySelectorAll<HTMLElement>('.source-btn')) {
  b.addEventListener('click', () => setSource(b.dataset.source as keyof typeof INPUT_CONFIG));
}

const elIconScale = document.getElementById('icon-scale') as HTMLInputElement;

elIconScale.addEventListener('input', () => {
  S.iconScale = Number(elIconScale.value);
  document.getElementById('size-label')!.textContent = elIconScale.value + '%';
  render();
});

const elIconOffset = document.getElementById('icon-offset') as HTMLInputElement;

elIconOffset.addEventListener('input', () => {
  S.iconOffsetY = Number(elIconOffset.value);
  const n = S.iconOffsetY;
  document.getElementById('offset-label')!.textContent = (n > 0 ? '+' : '') + n + '%';
  render();
});

// ─────────────────────────────────────────────────────────────────────────────
// Background fill: solid vs gradient + gradient angle
// ─────────────────────────────────────────────────────────────────────────────
function setBgType(t: string): void {
  S.bgType = t;
  document.querySelectorAll<HTMLElement>('.bgtype-btn').forEach((b) => {
    const on = b.dataset.bgtype === t;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.getElementById('bg-gradient-panel')!.classList.toggle('visible', t === 'gradient');
  syncBgSwatches();
  render();
}

for (const b of document.querySelectorAll<HTMLElement>('.bgtype-btn')) {
  b.addEventListener('click', () => setBgType(b.dataset.bgtype!));
}

const elBgAngle = document.getElementById('bg-angle') as HTMLInputElement;

function setBgAngle(a: number): void {
  // Normalize to 0–359 so 360° and 0° compare equal for preset highlighting.
  S.bgAngle = ((Math.round(a) % 360) + 360) % 360;
  elBgAngle.value = String(S.bgAngle);
  document.getElementById('angle-label')!.textContent = S.bgAngle + '°';
  document.querySelectorAll<HTMLElement>('.angle-btn').forEach((b) => {
    const on = Number(b.dataset.angle) === S.bgAngle;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  syncBgSwatches();
  render();
}

elBgAngle.addEventListener('input', () => setBgAngle(Number(elBgAngle.value)));

for (const b of document.querySelectorAll<HTMLElement>('.angle-btn')) {
  b.addEventListener('click', () => setBgAngle(Number(b.dataset.angle)));
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Resolution presets
// ─────────────────────────────────────────────────────────────────────────────
function setPreset(px: number): void {
  if (!Number.isFinite(px) || px <= 0) return;
  (document.getElementById('custom-w') as HTMLInputElement).value = String(px);
  (document.getElementById('custom-h') as HTMLInputElement).value = String(px);
  document.querySelectorAll<HTMLElement>('.preset-btn').forEach((b) => {
    const on = b.textContent === px + 'px';
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

for (const b of document.querySelectorAll<HTMLElement>('.preset-btn')) {
  // Button labels read like "128px" — parseInt stops at the unit suffix
  // (Number("128px") would be NaN).
  b.addEventListener('click', () => setPreset(parseInt(b.textContent ?? '', 10)));
}

for (const id of ['custom-w', 'custom-h']) {
  document.getElementById(id)!.addEventListener('input', () =>
    document.querySelectorAll<HTMLElement>('.preset-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard export
// ─────────────────────────────────────────────────────────────────────────────
async function fontsReady(): Promise<void> {
  // Don't rasterize mid-swap when a bundled font is still arriving.
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    /* rasterize with whatever is loaded */
  }
}

function exportError(show: boolean): void {
  document.getElementById('export-error')?.classList.toggle('visible', show);
}

function clampExportSize(v: number): number {
  return Number.isFinite(v) ? Math.min(4096, Math.max(16, Math.round(v))) : 128;
}

// Export base name: <provider>_<name>_<fill>
// e.g. fontawesome_star_gradient, bootstrap_alarm_solid,
// text_hi_solid, emoji_1f600_gradient
function exportBaseName(): string {
  const provider =
    S.source === 'fa' ? 'fontawesome' : S.source === 'bi' ? 'bootstrap' : S.source === 'text' ? 'text' : 'emoji';
  let name: string;
  if (S.source === 'fa' || S.source === 'bi') name = S.iconName;
  else if (S.source === 'text') name = S.textValue.replace(/[^\w-]+/g, '').toLowerCase() || 'text';
  else name = emojiCodepoints(S.iconName).join('-') || 'emoji';
  return `${provider}_${name}_${S.bgType === 'gradient' ? 'gradient' : 'solid'}`;
}

async function exportAs(fmt: string): Promise<void> {
  if (!S.valid) {
    exportError(true);
    return;
  }
  exportError(false);
  const wEl = document.getElementById('custom-w') as HTMLInputElement;
  const hEl = document.getElementById('custom-h') as HTMLInputElement;
  const w = clampExportSize(Number(wEl.value));
  const h = clampExportSize(Number(hEl.value));
  wEl.value = String(w);
  hEl.value = String(h);
  const fname = exportBaseName();

  if (fmt === 'svg') {
    downloadBlob(new Blob([await buildExportSVG()], { type: 'image/svg+xml' }), fname + '.svg');
    return;
  }
  await fontsReady();
  svgTextToPngBlob(await buildExportSVG(), w, h).then((b) => downloadBlob(b, `${fname}-${w}x${h}.png`));
}

for (const b of document.querySelectorAll<HTMLElement>('.export-btn')) {
  b.addEventListener('click', () => void exportAs(b.dataset.fmt!));
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom color picker
// ─────────────────────────────────────────────────────────────────────────────
const CP = { target: null as 'icon' | 'bg' | 'bg2' | null, h: 0, s: 1, v: 1 };

type Rgb = { r: number; g: number; b: number };

function hsvToRgb(h: number, s: number, v: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const i = Math.floor(h / 60),
    f = h / 60 - i;
  const p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i];
  return { r: r * 255, g: g * 255, b: b * 255 };
}

function rgbToHsv(rIn: number, gIn: number, bIn: number): { h: number; s: number; v: number } {
  const r = rIn / 255,
    g = gIn / 255,
    b = bIn / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max,
    v = max;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, v };
}

function hexToRgb(hex: string): Rgb | null {
  const n = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  const v = parseInt(n, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' +
    [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function cpHex(): string {
  const { r, g, b } = hsvToRgb(CP.h, CP.s, CP.v);
  return rgbToHex(r, g, b);
}

function cpDraw(): void {
  const canvas = document.getElementById('cp-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width,
    H = canvas.height;
  const { r, g, b } = hsvToRgb(CP.h, 1, 1);
  const hueHex = rgbToHex(r, g, b);
  const gH = ctx.createLinearGradient(0, 0, W, 0);
  gH.addColorStop(0, '#fff');
  gH.addColorStop(1, hueHex);
  ctx.fillStyle = gH;
  ctx.fillRect(0, 0, W, H);
  const gV = ctx.createLinearGradient(0, 0, 0, H);
  gV.addColorStop(0, 'transparent');
  gV.addColorStop(1, '#000');
  ctx.fillStyle = gV;
  ctx.fillRect(0, 0, W, H);
}

function cpMoveCursor(): void {
  const wrap = document.getElementById('cp-canvas-wrap')!;
  const cur = document.getElementById('cp-cursor')!;
  cur.style.left = CP.s * wrap.offsetWidth + 'px';
  cur.style.top = (1 - CP.v) * wrap.offsetHeight + 'px';
}

function cpSync(): void {
  const hex = cpHex();
  // The popup preview shows the single color being edited; each background
  // stop well keeps its own solid stop color via syncBgSwatches.
  (document.getElementById('cp-preview-fill') as HTMLElement).style.background = hex;
  (document.getElementById('cp-hex-popup') as HTMLInputElement).value = hex;
  (document.getElementById('cp-hue') as HTMLInputElement).value = String(CP.h);
  cpMoveCursor();
  if (CP.target) {
    (document.getElementById(`cp-fill-${CP.target}`) as HTMLElement).style.background = hex;
    (document.getElementById(`cp-hex-${CP.target}`) as HTMLInputElement).value = hex;
  }
}

function cpCommit(): void {
  const hex = cpHex();
  if (CP.target === 'icon') S.iconColor = hex;
  if (CP.target === 'bg') S.bgColor = hex;
  if (CP.target === 'bg2') S.bgColor2 = hex;
  cpSync();
  render();
}

function cpFromHex(hex: string, updateHue: boolean): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (updateHue) CP.h = hsv.h;
  CP.s = hsv.s;
  CP.v = hsv.v;
  return true;
}

function cpPosition(anchor: HTMLElement): void {
  const popup = document.getElementById('cp-popup')!;
  const r = anchor.getBoundingClientRect();
  const pw = 220,
    ph = 230;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  let top = r.bottom + 6,
    left = r.left;
  if (top + ph > vh - 8) top = r.top - ph - 6;
  if (left + pw > vw - 8) left = vw - pw - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}

function cpOpen(target: 'icon' | 'bg' | 'bg2'): void {
  CP.target = target;
  cpFromHex(target === 'icon' ? S.iconColor : target === 'bg' ? S.bgColor : S.bgColor2, true);
  // Show first: cpSync measures the canvas box to place the cursor dot,
  // which reads 0×0 while the popup is display:none.
  document.getElementById('cp-popup')!.classList.add('visible');
  document.getElementById(`cp-row-${target}`)!.classList.add('open');
  cpDraw();
  cpSync();
  cpPosition(document.getElementById(`cp-row-${target}`)!);
}

function cpClose(): void {
  document.getElementById('cp-popup')!.classList.remove('visible');
  document.querySelectorAll<HTMLElement>('.cp-row').forEach((r) => r.classList.remove('open'));
  CP.target = null;
}

document.querySelectorAll<HTMLElement>('.cp-swatch').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = btn.dataset.target as 'icon' | 'bg' | 'bg2';
    // Don't open icon color picker when in emoji mode (emoji use own colors)
    if (t === 'icon' && (S.source === 'noto' || S.source === 'twemoji')) return;
    CP.target === t ? cpClose() : cpOpen(t);
  });
});

const canvasWrap = document.getElementById('cp-canvas-wrap')!;

function cpCanvasPick(e: MouseEvent | TouchEvent): void {
  const r = canvasWrap.getBoundingClientRect();
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX;
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY;
  const x = (clientX ?? 0) - r.left;
  const y = (clientY ?? 0) - r.top;
  CP.s = Math.max(0, Math.min(1, x / r.width));
  CP.v = Math.max(0, Math.min(1, 1 - y / r.height));
  cpCommit();
}

canvasWrap.addEventListener('mousedown', (e) => {
  e.preventDefault();
  cpCanvasPick(e);
  const move = (ev: MouseEvent) => cpCanvasPick(ev);
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

canvasWrap.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    cpCanvasPick(e);
    const move = (ev: TouchEvent) => {
      ev.preventDefault();
      cpCanvasPick(ev);
    };
    const end = () => {
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  },
  { passive: false }
);

const elCpHue = document.getElementById('cp-hue') as HTMLInputElement;

elCpHue.addEventListener('input', () => {
  CP.h = Number(elCpHue.value);
  cpDraw();
  cpCommit();
});

const elCpHexPopup = document.getElementById('cp-hex-popup') as HTMLInputElement;

elCpHexPopup.addEventListener('input', () => {
  const hex = normalizeHex(elCpHexPopup.value);
  if (hex) {
    cpFromHex(hex, true);
    cpDraw();
    cpCommit();
  }
});

(['icon', 'bg', 'bg2'] as const).forEach((target) => {
  const hexEl = document.getElementById(`cp-hex-${target}`) as HTMLInputElement;

  hexEl.addEventListener('input', function () {
    const hex = normalizeHex(this.value);
    if (hex) {
      if (target === 'icon') S.iconColor = hex;
      if (target === 'bg') S.bgColor = hex;
      if (target === 'bg2') S.bgColor2 = hex;
      if (target === 'bg' || target === 'bg2') syncBgSwatches();
      else (document.getElementById(`cp-fill-${target}`) as HTMLElement).style.background = hex;
      if (CP.target === target) {
        cpFromHex(hex, true);
        cpDraw();
        cpSync();
      }
      render();
    }
  });
  // NOTE: intentionally no focus/click-to-open here — the picker opens
  // only from the color swatch (.cp-swatch) so typing a hex stays undisturbed.
});

document.addEventListener('click', (e) => {
  if (!CP.target) return;
  const popup = document.getElementById('cp-popup')!;
  const inside =
    popup.contains(e.target as Node) ||
    (['icon', 'bg', 'bg2'] as const).some((t) => document.getElementById(`cp-row-${t}`)!.contains(e.target as Node));
  if (!inside) cpClose();
});

window.addEventListener('resize', () => {
  if (CP.target) cpPosition(document.getElementById(`cp-row-${CP.target}`)!);
});

// ─────────────────────────────────────────────────────────────────────────────
// Android XML builders (vector sources: FA + Bootstrap)
// ─────────────────────────────────────────────────────────────────────────────
function buildForegroundXML(): string {
  const [, , vbW, vbH] = S.viewBox.split(' ').map(Number);
  const safeDp = 72 * (S.iconScale / 100);
  const scale = safeDp / Math.max(vbW, vbH);
  const scaledW = vbW * scale,
    scaledH = vbH * scale;
  const tx = ((108 - scaledW) / 2).toFixed(4);
  // Vertical offset: composite canvas units map 100 → 108dp
  const ty = ((108 - scaledH) / 2 + (S.iconOffsetY * 108) / 100).toFixed(4);
  const sc = scale.toFixed(6);

  const pathEls = S.paths!
    .map((p) => {
      const alpha = p.opacity ? `\n        android:fillAlpha="${p.opacity}"` : '';
      const fillType = p.fillRule === 'evenodd' ? `\n        android:fillType="evenOdd"` : '';
      return `    <path\n        android:fillColor="${S.iconColor}"${alpha}${fillType}\n        android:pathData="${p.d}"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon foreground — generated by s17 Labs Icon Maker -->
<!-- https://s17labs.github.io/tools/icon-maker/ -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <!--
        Safe zone: center 72×72dp (18dp inset from each edge).
        Icon scale: ${S.iconScale}% — occupies ${safeDp.toFixed(1)}dp within the safe zone.
        Icon offset: ${S.iconOffsetY}% vertical.
        Original viewBox: ${S.viewBox}
    -->
    <group
        android:translateX="${tx}"
        android:translateY="${ty}"
        android:scaleX="${sc}"
        android:scaleY="${sc}">
${pathEls}
    </group>
</vector>`;
}

// Android gradients only accept multiples of 45° (0 = left→right,
// 90 = bottom→top). CSS 0° points up, so android = (90 − css) mod 360.
// PNG/SVG exports always keep the exact angle; only the XML rounds.
function bgAndroidAngle(): { css: number; android: number } {
  const css = (Math.round(S.bgAngle / 45) * 45) % 360;
  return { css, android: (90 - css + 360) % 360 };
}

function buildBackgroundXML(): string {
  if (S.bgType === 'gradient') {
    const { android } = bgAndroidAngle();
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon background — generated by s17 Labs Icon Maker -->
<!-- https://s17labs.github.io/tools/icon-maker/ -->
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <gradient
        android:angle="${android}"
        android:startColor="${S.bgColor}"
        android:endColor="${S.bgColor2}"
        android:type="linear"/>
</shape>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon background — generated by s17 Labs Icon Maker -->
<!-- https://s17labs.github.io/tools/icon-maker/ -->
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="${S.bgColor}"/>
</shape>`;
}

function buildAdaptiveIconXML(monochrome: boolean): string {
  const mono = monochrome
    ? `\n    <!-- Monochrome layer: Android 13+ (API 33) themed icons -->\n    <monochrome android:drawable="@drawable/ic_launcher_foreground"/>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Adaptive icon — generated by s17 Labs Icon Maker -->
<!-- https://s17labs.github.io/tools/icon-maker/ -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>${mono}
</adaptive-icon>`;
}

function buildColorsXML(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by s17 Labs Icon Maker — https://s17labs.github.io/tools/icon-maker/ -->
<resources>
    <color name="ic_launcher_background">${S.bgColor}</color>
</resources>`;
}

function buildReadme(withMonochrome: boolean): string {
  const isVector = S.source === 'fa' || S.source === 'bi';
  const isEmoji = S.source === 'noto' || S.source === 'twemoji';
  const srcLabel = {
    fa: 'Font Awesome',
    bi: 'Bootstrap Icons',
    text: 'Custom Text',
    noto: 'Noto Emoji',
    twemoji: 'Twemoji',
  }[S.source];

  const monoSection = !isVector
    ? `N/A — ${isEmoji ? 'emoji' : 'text'} sources do not produce VectorDrawable XML files.`
    : withMonochrome
      ? `YES — <monochrome> element included in ic_launcher.xml and ic_launcher_round.xml.
   Android 13+ (API 33) will use this layer for Material You themed icons,
   tinting it automatically to match the device wallpaper color scheme.`
      : `NO  — not included. Re-export with "Include Material You / Themed Icons"
   checked to add the <monochrome> layer for Android 13+ support.`;

  const xmlNote = isVector
    ? `├── mipmap-anydpi-v26/
  │   ├── ic_launcher.xml           Adaptive icon${withMonochrome ? ' + monochrome (API 33+)' : ' (API 26+)'}
  │   └── ic_launcher_round.xml     Adaptive icon${withMonochrome ? ' + monochrome (API 33+)' : ' (API 26+)'}
  ├── drawable/
  │   ├── ic_launcher_background.xml   ${S.bgType === 'gradient' ? 'Gradient background layer' : 'Solid color background layer'}
  │   └── ic_launcher_foreground.xml   Vector foreground (scale: ${S.iconScale}%)
  ├── drawable-v24/
  │   └── ic_launcher_foreground.xml   Foreground — explicit API 24+ copy
  └── values/
      └── colors.xml                   ic_launcher_background color resource`
    : `  (No XML files — VectorDrawable adaptive icons require a vector source
    (Font Awesome or Bootstrap). PNG mipmaps are sufficient for all
    Android versions.)`;

  const rasterNote = !isVector
    ? `
NOTE FOR ${isEmoji ? 'EMOJI' : 'TEXT'} ICONS
  ${isEmoji ? 'Emoji sources (Noto, Twemoji)' : 'Text icons'} export PNG mipmaps only. Android's
  VectorDrawable format does not support the ${isEmoji ? 'gradients and raster\n  references used in emoji SVGs' : 'text elements used in text icons'}. For full adaptive icon XML support
  (API 26+ shape masking, Material You theming), use a vector
  source (Font Awesome or Bootstrap) instead.
${isEmoji ? '' : `  Standalone SVG exports embed the "${S.fontFamily}" typeface, so they\n  render identically anywhere. PNG exports are fully rasterized.\n`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    : '';

  const fontLine =
    S.source === 'text'
      ? `  Font:              ${S.fontFamily} ${S.fontWeight}${S.fontItalic ? ' italic' : ''}${S.fontUnderline ? ' + underline' : ''}${S.textSpacing ? `, spacing ${S.textSpacing}` : ''}\n`
      : '';

  const shapeNote = nonSquareBg()
    ? `\n  NOTE:              Background shape is '${S.bgShape}' — switch to square so launchers can mask freely.`
    : '';

  return `╔══════════════════════════════════════════════════════════════╗
║           ANDROID ICON PACKAGE — s17 Labs Icon Maker         ║
║           https://s17labs.github.io/tools/icon-maker/        ║
╚══════════════════════════════════════════════════════════════╝

ICON DETAILS
  Source:            ${srcLabel}
  Name / Text / Emoji: ${S.iconName}
  Icon color:        ${isVector || S.source === 'text' ? S.iconColor : '(emoji own colors)'}
${fontLine}  Icon offset:       ${S.iconOffsetY}% vertical
  Background:        ${S.bgType === 'gradient' ? `gradient ${S.bgColor} → ${S.bgColor2} @ ${S.bgAngle}°` : S.bgColor}${shapeNote}
  Icon scale:        ${S.iconScale}% of adaptive safe zone
  Material You:      ${monoSection}
  Generated:         ${new Date().toUTCString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP-IN INSTRUCTIONS
  1. Copy the entire res/ folder into your Android project's
     app/src/main/ directory (merge, do not replace).
  2. In AndroidManifest.xml, set:
       android:icon="@mipmap/ic_launcher"
       android:roundIcon="@mipmap/ic_launcher_round"
  3. Copy play_store_icon.png to your Play Store listing assets.
  4. Clean and rebuild the project (Build → Clean Project).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PACKAGE STRUCTURE

  res/
  ├── mipmap-mdpi/
  │   ├── ic_launcher.png            48 × 48 px
  │   └── ic_launcher_round.png      48 × 48 px
  ├── mipmap-hdpi/
  │   ├── ic_launcher.png            72 × 72 px
  │   └── ic_launcher_round.png      72 × 72 px
  ├── mipmap-xhdpi/
  │   ├── ic_launcher.png            96 × 96 px
  │   └── ic_launcher_round.png      96 × 96 px
  ├── mipmap-xxhdpi/
  │   ├── ic_launcher.png           144 × 144 px
  │   └── ic_launcher_round.png     144 × 144 px
  ├── mipmap-xxxhdpi/
  │   ├── ic_launcher.png           192 × 192 px
  │   └── ic_launcher_round.png     192 × 192 px
  ${xmlNote}

  play_store_icon.png                  512 × 512 px  (Play Store listing)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${rasterNote}${isVector ? `
ABOUT ADAPTIVE ICONS  (Android 8.0 / API 26+)

  Adaptive icons use two separate layers that the launcher composites:

    Background (ic_launcher_background.xml)
${S.bgType === 'gradient'
  ? `      A linear gradient (${S.bgColor} → ${S.bgColor2} at ${S.bgAngle}°).
      Android gradients only support multiples of 45°, so the XML rounds
      to ${bgAndroidAngle().css}° — PNG/SVG exports keep the exact angle.`
  : `      A solid-color shape using the chosen background color (${S.bgColor}).`}

    Foreground (ic_launcher_foreground.xml)
      A VectorDrawable on a 108 × 108dp canvas. The icon is scaled to
      ${S.iconScale}% of the 72dp safe zone (18dp inset from each edge)
      and centered. The launcher clips both layers with its own mask
      (circle, squircle, rounded rect, etc.) at runtime.

  The PNG mipmaps serve as fallbacks on Android 7.1 and below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${withMonochrome ? `
MATERIAL YOU / THEMED ICONS  (Android 13 / API 33+)

  The <monochrome> element in mipmap-anydpi-v26/ic_launcher.xml
  points to the same foreground drawable. Android strips color
  and applies a tint derived from the device's wallpaper palette
  (Material You dynamic color) automatically — no code change needed.

  Supported launchers: Pixel Launcher, One UI 5+, and most AOSP
  launchers on Android 13+.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}` : ''}
Generated by s17 Labs Icon Maker — https://s17labs.github.io/tools/icon-maker/
Part of s17 Labs Tools  — https://s17labs.github.io/tools/
Source Code              — https://github.com/s17labs/tools`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Android export
// ─────────────────────────────────────────────────────────────────────────────
const ANDROID_BTN_HTML = `<span style="font-size:1.05rem;display:inline-flex;">${iconSvg('android')}</span><span><span class="android-label">Export Android Package</span><span class="android-sub"> · .zip</span></span>`;

async function exportAndroid(): Promise<void> {
  if (!S.valid) {
    exportError(true);
    return;
  }
  exportError(false);
  // Baked-in circle/rounded backgrounds fight the launcher mask — stop and
  // ask before building the package.
  if (nonSquareBg()) {
    openShapeDialog('export');
    return;
  }

  const isVector = S.source === 'fa' || S.source === 'bi';
  const withMonochrome = isVector && (document.getElementById('material-toggle') as HTMLInputElement).checked;
  const btn = document.getElementById('android-btn') as HTMLButtonElement;
  const progressWrap = document.getElementById('progress-wrap')!;
  const progressFill = document.getElementById('progress-fill')!;
  const progressLabel = document.getElementById('progress-label')!;

  btn.disabled = true;
  btn.innerHTML = `${iconSvg('circle-notch', 'spin')} <span><span class="android-label">Building package…</span></span>`;
  progressWrap.classList.add('visible');

  await fontsReady();

  function setProgress(pct: number, label: string): void {
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  }

  try {
    const zip = new JSZip();
    const res = zip.folder('res')!;
    const safeName = exportBaseName();

    const densities: [string, number][] = [
      ['mdpi', 48],
      ['hdpi', 72],
      ['xhdpi', 96],
      ['xxhdpi', 144],
      ['xxxhdpi', 192],
    ];

    let step = 0;
    const totalSteps = densities.length * 2 + 1;

    function nextStep(label: string): void {
      step++;
      setProgress(Math.round((step / totalSteps) * 80), label);
    }

    for (const [density, size] of densities) {
      const squareBlob = await svgTextToPngBlob(await buildExportSVG(), size, size);
      res.folder(`mipmap-${density}`)!.file('ic_launcher.png', squareBlob);
      nextStep(`mipmap-${density}/ic_launcher.png  ${size}px`);

      const roundBlob = await svgTextToPngBlob(await buildExportSVG('circle'), size, size);
      res.folder(`mipmap-${density}`)!.file('ic_launcher_round.png', roundBlob);
      nextStep(`mipmap-${density}/ic_launcher_round.png  ${size}px`);
    }

    setProgress(82, 'play_store_icon.png  512px…');
    const playBlob = await svgTextToPngBlob(await buildExportSVG(), 512, 512);
    zip.file('play_store_icon.png', playBlob);

    // XML files: vector sources (FA, Bootstrap) only
    if (isVector) {
      setProgress(86, 'Building adaptive icon XMLs…');
      const adaptiveXML = buildAdaptiveIconXML(withMonochrome);
      res.folder('mipmap-anydpi-v26')!.file('ic_launcher.xml', adaptiveXML);
      res.folder('mipmap-anydpi-v26')!.file('ic_launcher_round.xml', adaptiveXML);

      setProgress(89, 'Building vector drawables…');
      const fgXML = buildForegroundXML();
      res.folder('drawable')!.file('ic_launcher_background.xml', buildBackgroundXML());
      res.folder('drawable')!.file('ic_launcher_foreground.xml', fgXML);
      res.folder('drawable-v24')!.file('ic_launcher_foreground.xml', fgXML);

      setProgress(92, 'Building values/colors.xml…');
      res.folder('values')!.file('colors.xml', buildColorsXML());
    }

    zip.file('README.txt', buildReadme(withMonochrome));

    setProgress(96, 'Compressing…');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const suffix = isVector ? ` + XMLs${withMonochrome ? ' + Material You' : ''}` : ' (PNG only)';
    setProgress(100, `Done — ${densities.length * 2 + 1} images${suffix}`);

    showAndroidPreview(densities);
    downloadBlob(zipBlob, `${safeName}-android-icons.zip`);

    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = ANDROID_BTN_HTML;
      progressWrap.classList.remove('visible');
    }, 2800);
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    btn.innerHTML = ANDROID_BTN_HTML;
    progressWrap.classList.remove('visible');
    alert('Export failed: ' + (e as Error).message);
  }
}

document.getElementById('android-btn')!.addEventListener('click', exportAndroid);

// ─────────────────────────────────────────────────────────────────────────────
// Android preview thumbnails
// ─────────────────────────────────────────────────────────────────────────────
async function showAndroidPreview(densities: [string, number][]): Promise<void> {
  const container = document.getElementById('android-sizes-row')!;
  const panel = document.getElementById('android-preview')!;
  container.innerHTML = '';

  for (const [label, size] of densities.filter(([d]) => ['mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].includes(d))) {
    const url = URL.createObjectURL(new Blob([await buildExportSVG('circle')], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dispSize = Math.min(size, 52);
        const c = document.createElement('canvas');
        c.width = dispSize;
        c.height = dispSize;
        c.getContext('2d')!.drawImage(img, 0, 0, dispSize, dispSize);
        URL.revokeObjectURL(url);
        const item = document.createElement('div');
        item.className = 'android-size-item';
        const sp = document.createElement('span');
        sp.textContent = label;
        item.appendChild(c);
        item.appendChild(sp);
        container.appendChild(item);
        resolve();
      };
      img.src = url;
    });
  }

  panel.classList.add('visible');
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
setPreset(128);
