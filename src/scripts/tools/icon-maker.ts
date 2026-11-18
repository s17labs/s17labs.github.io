import JSZip from 'jszip';
import { library, findIconDefinition } from '@fortawesome/fontawesome-svg-core';
import { iconSvg } from '../../icons';
import { announce, downloadBlob, svgTextToPngBlob } from './lib';
import { initColorPickers, setColorPickerValue } from './color-picker';
import { paintRangeFill } from '../range-fill';
import { LOCAL_EMOJI } from './emoji-assets';

// Font Awesome packs are ~2MB — load each style only when a lookup needs it.
// Most icons are solid, so a normal search never downloads regular + brands.
type FAPrefix = 'fas' | 'far' | 'fab';
const faPromises: Partial<Record<FAPrefix, Promise<void>>> = {};

function ensureFAPrefix(prefix: FAPrefix): Promise<void> {
  if (!faPromises[prefix]) {
    faPromises[prefix] = (async () => {
      if (prefix === 'fas') {
        const { fas } = await import('@fortawesome/free-solid-svg-icons');
        library.add(fas);
      } else if (prefix === 'far') {
        const { far } = await import('@fortawesome/free-regular-svg-icons');
        library.add(far);
      } else {
        const { fab } = await import('@fortawesome/free-brands-svg-icons');
        library.add(fab);
      }
    })();
    // A failed load must not poison future lookups — forget it and retry.
    faPromises[prefix]!.catch(() => {
      delete faPromises[prefix];
    });
  }
  return faPromises[prefix]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap Icons lookup: one sprite, fetched once on first use.
//
// The package ships bootstrap-icons.svg (all 2078 glyphs as <symbol>s).
// Importing it with ?url emits a single hashed asset instead of 2000+
// per-icon chunks, and lookups after the first are instant (in-memory).
// Fully offline — same origin, no CDN.
// ─────────────────────────────────────────────────────────────────────────────
import biSpriteUrl from '../../../node_modules/bootstrap-icons/bootstrap-icons.svg?url';

let biDocPromise: Promise<Document | null> | null = null;

function ensureBiDoc(): Promise<Document | null> {
  if (!biDocPromise) {
    biDocPromise = (async () => {
      try {
        const res = await fetch(biSpriteUrl);
        if (!res.ok) return null;
        const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
        if (doc.getElementsByTagName('parsererror').length) return null;
        return doc;
      } catch {
        return null;
      }
    })();
  }
  return biDocPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
interface VectorPath {
  d: string;
  fillRule?: string; // 'evenodd' — preserved from Bootstrap and uploaded SVGs
  opacity?: string; // e.g. '0.4' — FA duotone secondary layer / BI fill-opacity
  color?: string; // uploaded SVG path override; undefined follows Icon Color
  label?: string; // uploaded SVG path or merged-region label
}

const S = {
  source: 'fa', // 'fa' | 'bi' | 'text' | 'noto' | 'twemoji' | 'svg'
  iconName: '', // FA/BI icon name, raw emoji character, text value, or SVG filename
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
  emojiUri: null as string | null, // data URI for the resolved emoji artwork
  valid: false,
};

const elIconColorField = document.getElementById('cp-icon')!;
const elIconColorHex = document.getElementById('cp-icon-hex') as HTMLInputElement;
const elIconColorSwatch = elIconColorField.querySelector<HTMLButtonElement>('[data-cp-swatch]')!;

function iconColorHasRegionOverrides(): boolean {
  return S.source === 'svg' && !!S.paths?.some((path) => path.color);
}

function isIconColorDisabled(): boolean {
  const isEmoji = S.source === 'noto' || S.source === 'twemoji';
  return isEmoji || iconColorHasRegionOverrides();
}

function updateIconColorAvailability(): void {
  const disabled = isIconColorDisabled();
  elIconColorField.classList.toggle('cp-disabled', disabled);
  elIconColorField.inert = disabled;
  elIconColorField.setAttribute('aria-disabled', String(disabled));
  elIconColorHex.disabled = disabled;
  elIconColorSwatch.disabled = disabled;
  if (disabled) setColorPickerValue(elIconColorField, S.iconColor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Source switching
// ─────────────────────────────────────────────────────────────────────────────
const INPUT_CONFIG = {
  fa: {
    label: 'Font Awesome Icon Name',
    placeholder: 'e.g. star, circle-check, bolt',
    cls: '',
    error:
      'Icon not found — check spelling at <a href="https://fontawesome.com/search?ic=free-collection" target="_blank" rel="noopener noreferrer" aria-label="Check spelling on fontawesome.com">fontawesome.com</a>',
  },
  bi: {
    label: 'Bootstrap Icon Name',
    placeholder: 'e.g. star, alarm, rocket',
    cls: '',
    error:
      'Icon not found — check spelling at <a href="https://icons.getbootstrap.com" target="_blank" rel="noopener noreferrer" aria-label="Check spelling on icons.getbootstrap.com">icons.getbootstrap.com</a>',
  },
  text: {
    label: 'Icon Text',
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
  svg: {
    label: 'Foreground SVG',
    placeholder: 'Upload an SVG file',
    cls: '',
    error: 'Upload a valid path-based SVG file.',
  },
} as const;

function isVectorSource(source: string): boolean {
  return source === 'fa' || source === 'bi' || source === 'svg';
}

function setSource(src: keyof typeof INPUT_CONFIG): void {
  S.source = src;
  S.valid = false;
  S.paths = null;
  S.emojiUri = null;
  S.iconName = '';
  S.textValue = '';
  clearTimeout(iconTimer); // drop any pending lookup for the old source
  biSeq++; // invalidate any in-flight Bootstrap lookup
  faSeq++; // invalidate any in-flight Font Awesome lookup
  emojiSeq++; // invalidate any in-flight emoji fetch
  clearSvgUploadState();

  // Update source buttons
  document.querySelectorAll<HTMLElement>('.source-btn').forEach((b) => {
    const on = b.dataset.source === src;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });

  // Update input appearance. The SVG source has its own file picker.
  const cfg = INPUT_CONFIG[src];
  const input = document.getElementById('icon-input') as HTMLInputElement;
  const isSvg = src === 'svg';
  document.getElementById('input-label')!.textContent = cfg.label;
  input.placeholder = cfg.placeholder;
  input.value = '';
  input.className = cfg.cls;
  input.disabled = isSvg;
  document.getElementById('icon-input-field')!.hidden = isSvg;
  document.getElementById('svg-upload-panel')!.hidden = !isSvg;
  document.getElementById('placeholder-copy')!.textContent = isSvg
    ? 'Upload a foreground SVG to begin'
    : 'Enter an icon name, text, or emoji to begin';
  if (src === 'text') input.setAttribute('maxlength', '8');
  else input.removeAttribute('maxlength');

  // Error message text (contains a clickable link for FA / Bootstrap)
  const errorMsg = document.getElementById('error-msg')!;
  errorMsg.innerHTML = cfg.error;
  errorMsg.classList.remove('visible');

  // Icon color applies to vector sources (FA, Bootstrap, uploaded SVG) and text.
  // Emoji carry their own colors.
  const isEmoji = src === 'noto' || src === 'twemoji';
  updateIconColorAvailability();
  document.getElementById('cp-fa-only-note')!.classList.toggle('visible', isEmoji);

  // Material You checkbox + VectorDrawable XMLs need real vector paths
  // (FA, Bootstrap, uploaded SVG). Text and emoji export as PNG-only.
  const isVector = isVectorSource(src);
  const row = document.getElementById('material-row')!;
  const materialToggle = document.getElementById('material-toggle') as HTMLInputElement;
  row.classList.toggle('cb-disabled', !isVector);
  row.setAttribute('aria-disabled', String(!isVector));
  materialToggle.disabled = !isVector;
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

// Filename of the bundled SVG. Mirrors the upstream asset names so the
// codepoint functions above stay the single source of naming truth.
function emojiFilename(emoji: string, src: string): string {
  return src === 'twemoji' ? `${toTwemojiCP(emoji)}.svg` : `emoji_u${toNotoCP(emoji)}.svg`;
}

// Bundled assets live under public/emoji/ and ship with the site. Looking one
// up is a same-origin read — no third-party origin is ever contacted.
function emojiUrl(emoji: string, src: string): string {
  const dir = src === 'twemoji' ? 'twemoji' : 'noto';
  return `${import.meta.env.BASE_URL}emoji/${dir}/${emojiFilename(emoji, src)}`;
}

function hasLocalEmoji(emoji: string, src: string): boolean {
  return src === 'twemoji'
    ? LOCAL_EMOJI.twemoji.has(emojiFilename(emoji, src))
    : LOCAL_EMOJI.noto.has(emojiFilename(emoji, src));
}

// Everything outside the bundled set is pulled from the matching upstream
// artwork instead of being redrawn with the device font — otherwise Noto and
// Twemoji render the exact same system glyph and the two sources are
// indistinguishable. Twemoji is pinned to a release tag; jsDelivr can't
// resolve noto-emoji's tags, so that one is pinned to the commit its 2D SVGs
// were generated from.
const EMOJI_CDN = {
  twemoji: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/',
  noto: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@99701e07d3d1fe1bdbcdb14964547f0fd592966f/2D/svg/',
} as const;

function emojiCdnUrl(emoji: string, src: string): string {
  const base = src === 'twemoji' ? EMOJI_CDN.twemoji : EMOJI_CDN.noto;
  return base + emojiFilename(emoji, src);
}

// Bundled glyphs load same-origin; the rest come from the upstream set that
// matches the selected source.
async function loadEmojiSvg(emoji: string): Promise<string> {
  const url = hasLocalEmoji(emoji, S.source)
    ? emojiUrl(emoji, S.source)
    : emojiCdnUrl(emoji, S.source);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes('<svg')) throw new Error('Invalid SVG');
  return sanitizeEmojiSvg(text);
}

// Last-resort fallback when the upstream artwork can't be reached (offline,
// blocked CDN): paint the glyph with the device's own emoji font. The result
// is a PNG data URI, so it flows through the same preview and export pipeline
// as the vector artwork.
function renderEmojiToCanvasUri(emoji: string): string | null {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.82)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL('image/png');
}

// Strip active content from bundled SVGs: the bytes ship inside our
// exported .svg files, which users open in browsers. Static art only.
function sanitizeEmojiSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
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
async function findFAIcon(name: string): Promise<{ paths: VectorPath[]; viewBox: string } | null> {
  for (const prefix of ['fas', 'far', 'fab'] as const) {
    try {
      await ensureFAPrefix(prefix);
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

function parseBiInner(inner: string, viewBox: string): { paths: VectorPath[]; viewBox: string } | null {
  // Only 1 of 2078 icons uses transforms/groups (align-top) — refuse those
  // rather than exporting silently wrong geometry.
  if (/transform=|<g[\s>]/.test(inner)) return null;
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
  return { paths, viewBox };
}

async function findBootstrapIcon(name: string): Promise<{ paths: VectorPath[]; viewBox: string } | null> {
  try {
    const doc = await ensureBiDoc();
    const symbol = doc?.getElementById(name);
    if (!symbol) return null;
    return parseBiInner(symbol.innerHTML, symbol.getAttribute('viewBox') ?? '0 0 16 16');
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploaded SVG source
//
// Uploaded artwork is parsed as data and reduced to filled paths. The original
// markup is never inserted into the page, so scripts, external references, and
// other active content cannot run. Path-only input also maps cleanly to the
// existing SVG, PNG, and Android VectorDrawable export pipelines.
// ─────────────────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_SVG_PATHS = 512;
const MAX_SVG_PATH_CHARS = 1_000_000;
const MAX_SVG_COORDINATE = 1_000_000;

interface SvgPresentation {
  fill?: string;
  fillRule?: string;
  fillOpacity?: number;
  hidden?: boolean;
}

function parseInlineStyle(style: string | null): Record<string, string> {
  const values: Record<string, string> = {};
  if (!style) return values;
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (property && value) values[property] = value;
  }
  return values;
}

function svgPresentation(el: Element): SvgPresentation & { opacity?: number } {
  const style = parseInlineStyle(el.getAttribute('style'));
  const fill = style.fill ?? el.getAttribute('fill') ?? undefined;
  const fillRule = style['fill-rule'] ?? el.getAttribute('fill-rule') ?? undefined;
  const fillOpacityValue = style['fill-opacity'] ?? el.getAttribute('fill-opacity') ?? undefined;
  const opacityValue = style.opacity ?? el.getAttribute('opacity') ?? undefined;
  const display = style.display ?? el.getAttribute('display') ?? undefined;
  const visibility = style.visibility ?? el.getAttribute('visibility') ?? undefined;
  return {
    fill,
    fillRule,
    fillOpacity: fillOpacityValue === undefined ? undefined : parseSvgOpacity(fillOpacityValue, 'fill opacity'),
    opacity: opacityValue === undefined ? undefined : parseSvgOpacity(opacityValue, 'opacity'),
    hidden: display === 'none' || visibility === 'hidden' || visibility === 'collapse',
  };
}

function parseSvgOpacity(value: string, label: string): number {
  const trimmed = value.trim();
  let n: number;
  if (trimmed.endsWith('%')) n = Number.parseFloat(trimmed.slice(0, -1)) / 100;
  else n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`The SVG ${label} must be between 0 and 1.`);
  }
  return n;
}

function assertSafeSvgElement(el: Element): void {
  const style = parseInlineStyle(el.getAttribute('style'));
  const allowedStyleProps = new Set(['fill', 'fill-rule', 'fill-opacity', 'opacity', 'display', 'visibility']);
  for (const property of Object.keys(style)) {
    if (!allowedStyleProps.has(property)) {
      throw new Error('SVG CSS styles are not supported. Use presentation attributes instead.');
    }
  }

  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      throw new Error('This SVG contains active content and cannot be used.');
    }
    if (name === 'href' || name.endsWith(':href')) {
      throw new Error('SVG references are not supported. Flatten the artwork before uploading.');
    }
    if (name === 'transform') {
      throw new Error('SVG transforms are not supported. Flatten the artwork before uploading.');
    }
    if (
      name === 'stroke' ||
      name.startsWith('stroke-') ||
      name === 'filter' ||
      name === 'mask' ||
      name === 'clip-path'
    ) {
      throw new Error('Strokes, filters, masks, and clipping are not supported. Use filled paths only.');
    }
  }
}

function parseSvgLength(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(px)?\s*$/i.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n <= MAX_SVG_COORDINATE ? n : null;
}

function parseSvgViewBox(
  root: Element
): { viewBox: string; x: number; y: number; width: number; height: number } {
  const raw = root.getAttribute('viewBox');
  if (raw) {
    const parts = raw.trim().split(/[,\s]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [x, y, width, height] = parts;
      if (
        width > 0 &&
        height > 0 &&
        width <= MAX_SVG_COORDINATE &&
        height <= MAX_SVG_COORDINATE &&
        Math.abs(x) <= MAX_SVG_COORDINATE &&
        Math.abs(y) <= MAX_SVG_COORDINATE
      ) {
        return { viewBox: `${x} ${y} ${width} ${height}`, x, y, width, height };
      }
    }
  }

  const width = parseSvgLength(root.getAttribute('width'));
  const height = parseSvgLength(root.getAttribute('height'));
  if (width && height) {
    return { viewBox: `0 0 ${width} ${height}`, x: 0, y: 0, width, height };
  }
  throw new Error('The SVG needs a valid viewBox or numeric width and height.');
}

const PATH_COMMAND_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
};

function isPathCommand(char: string): boolean {
  return 'MmLlHhVvCcSsQqTtAaZz'.includes(char);
}

interface RawPathCommand {
  command: string;
  args: number[];
}

interface AbsolutePathCommand {
  command: 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z';
  args: number[];
  implicitControl?: { x: number; y: number };
}

/** Parse path data into numeric command groups, validating as we go. */
function parsePathCommands(d: string): RawPathCommand[] {
  const trimmed = d.trim();
  if (!trimmed) throw new Error('The SVG contains an empty path.');

  let index = 0;
  const skipSeparators = (): void => {
    while (index < trimmed.length && (trimmed[index] === ',' || /\s/.test(trimmed[index]))) index++;
  };
  const readNumber = (): number => {
    skipSeparators();
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(trimmed.slice(index));
    if (!match) throw new Error('The SVG contains invalid path data.');
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_SVG_COORDINATE) {
      throw new Error('The SVG contains invalid path coordinates.');
    }
    return value;
  };
  const readFlag = (): number => {
    skipSeparators();
    const flag = trimmed[index];
    if (flag !== '0' && flag !== '1') throw new Error('The SVG contains invalid arc data.');
    index++;
    return Number(flag);
  };

  const commands: RawPathCommand[] = [];
  while (index < trimmed.length) {
    skipSeparators();
    if (index >= trimmed.length) break;
    const command = trimmed[index];
    if (!isPathCommand(command)) throw new Error('The SVG contains invalid path commands.');
    index++;
    const upper = command.toUpperCase();
    if (upper === 'Z') {
      commands.push({ command: 'Z', args: [] });
      continue;
    }

    let groups = 0;
    while (true) {
      skipSeparators();
      if (index >= trimmed.length || isPathCommand(trimmed[index])) break;

      let args: number[];
      if (upper === 'A') {
        args = [
          readNumber(), // rx
          readNumber(), // ry
          readNumber(), // x-axis rotation
          readFlag(), // large-arc flag
          readFlag(), // sweep flag
          readNumber(), // x
          readNumber(), // y
        ];
      } else {
        const arity = PATH_COMMAND_ARITY[upper];
        args = [];
        for (let n = 0; n < arity; n++) args.push(readNumber());
      }

      // Extra coordinate pairs after a moveto are implicit linetos.
      const normalizedCommand =
        upper === 'M' && groups > 0 ? (command === 'm' ? 'l' : 'L') : command;
      commands.push({ command: normalizedCommand, args });
      groups++;
    }
    if (!groups) throw new Error('The SVG contains incomplete path data.');
  }

  return commands;
}

function validatePathData(d: string): void {
  const commands = parsePathCommands(d);
  const absoluteCommands = absolutePathCommands(commands);
  if (absoluteCommands.some(absoluteCommandHasLargeCoordinate)) {
    throw new Error('The SVG contains invalid path coordinates.');
  }

  // Path2D catches parser edge cases that a hand-written validator misses.
  if (typeof Path2D !== 'undefined') {
    try {
      new Path2D(d.trim());
    } catch {
      throw new Error('The SVG contains invalid path data.');
    }
  }
}

/** Convert every command to absolute coordinates so each subpath stands alone. */
function absolutePathCommands(raw: RawPathCommand[]): AbsolutePathCommand[] {
  const commands: AbsolutePathCommand[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let afterClose = false;
  let cubicControl: { x: number; y: number } | null = null;
  let quadraticControl: { x: number; y: number } | null = null;

  for (const rawCommand of raw) {
    const command = rawCommand.command.toUpperCase();
    const relative = rawCommand.command !== command;
    const args = rawCommand.args;

    // A command after closepath starts a new subpath at the closed path's
    // initial point. Make that implicit move explicit so each subpath can be
    // rendered independently.
    if (afterClose && command !== 'M') {
      commands.push({ command: 'M', args: [currentX, currentY] });
      startX = currentX;
      startY = currentY;
      afterClose = false;
    }

    switch (command) {
      case 'M': {
        const x = relative ? currentX + args[0] : args[0];
        const y = relative ? currentY + args[1] : args[1];
        commands.push({ command: 'M', args: [x, y] });
        currentX = x;
        currentY = y;
        startX = x;
        startY = y;
        cubicControl = null;
        quadraticControl = null;

        afterClose = false;
        break;
      }
      case 'L': {
        const x = relative ? currentX + args[0] : args[0];
        const y = relative ? currentY + args[1] : args[1];
        commands.push({ command: 'L', args: [x, y] });
        currentX = x;
        currentY = y;
        cubicControl = null;
        quadraticControl = null;

        break;
      }
      case 'H': {
        const x = relative ? currentX + args[0] : args[0];
        commands.push({ command: 'H', args: [x] });
        currentX = x;
        cubicControl = null;
        quadraticControl = null;

        break;
      }
      case 'V': {
        const y = relative ? currentY + args[0] : args[0];
        commands.push({ command: 'V', args: [y] });
        currentY = y;
        cubicControl = null;
        quadraticControl = null;

        break;
      }
      case 'C': {
        const c1x = relative ? currentX + args[0] : args[0];
        const c1y = relative ? currentY + args[1] : args[1];
        const c2x = relative ? currentX + args[2] : args[2];
        const c2y = relative ? currentY + args[3] : args[3];
        const x = relative ? currentX + args[4] : args[4];
        const y = relative ? currentY + args[5] : args[5];
        commands.push({ command: 'C', args: [c1x, c1y, c2x, c2y, x, y] });
        currentX = x;
        currentY = y;
        cubicControl = { x: c2x, y: c2y };
        quadraticControl = null;
        break;
      }
      case 'S': {
        const reflected: { x: number; y: number } = cubicControl
          ? { x: currentX * 2 - cubicControl.x, y: currentY * 2 - cubicControl.y }
          : { x: currentX, y: currentY };
        const c2x = relative ? currentX + args[0] : args[0];
        const c2y = relative ? currentY + args[1] : args[1];
        const x = relative ? currentX + args[2] : args[2];
        const y = relative ? currentY + args[3] : args[3];
        commands.push({
          command: 'S',
          args: [c2x, c2y, x, y],
          implicitControl: reflected,
        });
        currentX = x;
        currentY = y;
        cubicControl = { x: c2x, y: c2y };
        quadraticControl = null;
        break;
      }
      case 'Q': {
        const qx = relative ? currentX + args[0] : args[0];
        const qy = relative ? currentY + args[1] : args[1];
        const x = relative ? currentX + args[2] : args[2];
        const y = relative ? currentY + args[3] : args[3];
        commands.push({ command: 'Q', args: [qx, qy, x, y] });
        currentX = x;
        currentY = y;
        quadraticControl = { x: qx, y: qy };
        cubicControl = null;
        break;
      }
      case 'T': {
        const reflected: { x: number; y: number } = quadraticControl
          ? { x: currentX * 2 - quadraticControl.x, y: currentY * 2 - quadraticControl.y }
          : { x: currentX, y: currentY };
        const x = relative ? currentX + args[0] : args[0];
        const y = relative ? currentY + args[1] : args[1];
        commands.push({ command: 'T', args: [x, y], implicitControl: reflected });
        currentX = x;
        currentY = y;
        quadraticControl = reflected;
        cubicControl = null;
        break;
      }
      case 'A': {
        const x = relative ? currentX + args[5] : args[5];
        const y = relative ? currentY + args[6] : args[6];
        commands.push({ command: 'A', args: [args[0], args[1], args[2], args[3], args[4], x, y] });
        currentX = x;
        currentY = y;
        cubicControl = null;
        quadraticControl = null;

        break;
      }
      case 'Z': {
        commands.push({ command: 'Z', args: [] });
        currentX = startX;
        currentY = startY;
        cubicControl = null;
        quadraticControl = null;

        afterClose = true;
        break;
      }
    }
  }

  return commands;
}

function absoluteCommandHasLargeCoordinate(command: AbsolutePathCommand): boolean {
  const coordinateIndexes: Record<AbsolutePathCommand['command'], number[]> = {
    M: [0, 1],
    L: [0, 1],
    H: [0],
    V: [0],
    C: [0, 1, 2, 3, 4, 5],
    S: [0, 1, 2, 3],
    Q: [0, 1, 2, 3],
    T: [0, 1],
    A: [5, 6],
    Z: [],
  };
  if (
    command.implicitControl &&
    (Math.abs(command.implicitControl.x) > MAX_SVG_COORDINATE ||
      Math.abs(command.implicitControl.y) > MAX_SVG_COORDINATE)
  ) {
    return true;
  }
  return coordinateIndexes[command.command].some(
    (index) => Math.abs(command.args[index]) > MAX_SVG_COORDINATE
  );
}

interface SvgPathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SvgSubpath {
  d: string;
  bounds: SvgPathBounds;
}

function formatPathNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

function serializePathCommands(commands: AbsolutePathCommand[]): string {
  return commands
    .map((command) =>
      command.command === 'Z'
        ? 'Z'
        : `${command.command} ${command.args.map(formatPathNumber).join(' ')}`
    )
    .join(' ');
}

function extendPathBounds(bounds: SvgPathBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function absoluteCommandBounds(command: AbsolutePathCommand, bounds: SvgPathBounds): void {
  const args = command.args;
  switch (command.command) {
    case 'M':
    case 'L':
      extendPathBounds(bounds, args[0], args[1]);
      break;
    case 'H':
      extendPathBounds(bounds, args[0], bounds.minY);
      extendPathBounds(bounds, args[0], bounds.maxY);
      break;
    case 'V':
      extendPathBounds(bounds, bounds.minX, args[0]);
      extendPathBounds(bounds, bounds.maxX, args[0]);
      break;
    case 'C':
      extendPathBounds(bounds, args[0], args[1]);
      extendPathBounds(bounds, args[2], args[3]);
      extendPathBounds(bounds, args[4], args[5]);
      break;
    case 'S':
      extendPathBounds(bounds, args[0], args[1]);
      extendPathBounds(bounds, args[2], args[3]);
      if (command.implicitControl) {
        extendPathBounds(bounds, command.implicitControl.x, command.implicitControl.y);
      }
      break;
    case 'Q':
      extendPathBounds(bounds, args[0], args[1]);
      extendPathBounds(bounds, args[2], args[3]);
      break;
    case 'T':
      extendPathBounds(bounds, args[0], args[1]);
      if (command.implicitControl) {
        extendPathBounds(bounds, command.implicitControl.x, command.implicitControl.y);
      }
      break;
    case 'A': {
      // A rotated arc can extend past both endpoints. The radius is a safe
      // upper bound for that extra reach in either axis.
      const radius = Math.max(args[0], args[1]);
      extendPathBounds(bounds, args[5] - radius, args[6] - radius);
      extendPathBounds(bounds, args[5] + radius, args[6] + radius);
      break;
    }
  }
}

function splitAbsolutePathCommands(commands: AbsolutePathCommand[]): SvgSubpath[] {
  const subpaths: SvgSubpath[] = [];
  let current: AbsolutePathCommand[] = [];

  const pushCurrent = (): void => {
    if (!current.length) return;
    const bounds: SvgPathBounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };
    for (const command of current) absoluteCommandBounds(command, bounds);
    subpaths.push({ d: serializePathCommands(current), bounds });
    current = [];
  };

  for (const command of commands) {
    if (command.command === 'M' && current.length) pushCurrent();
    current.push(command);
  }
  pushCurrent();
  return subpaths;
}

type SvgContourKind = 'visible' | 'hole' | 'internal' | 'empty';

interface SvgSubpathInfo {
  subpath: SvgSubpath;
  path: Path2D;
  inside: { x: number; y: number };
  outside: { x: number; y: number };
  kind: SvgContourKind;
}

interface SvgPathRegion {
  d: string;
  path: Path2D;
  bounds: SvgPathBounds;
}

function pathBoundsArea(bounds: SvgPathBounds): number {
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}

/** Check whether two candidate regions overlap anywhere in their shared bounds. */
function sampledPathsOverlap(
  context: CanvasRenderingContext2D,
  first: SvgPathRegion,
  second: SvgPathRegion,
  fillRule: CanvasFillRule
): boolean {
  const minX = Math.max(first.bounds.minX, second.bounds.minX);
  const minY = Math.max(first.bounds.minY, second.bounds.minY);
  const maxX = Math.min(first.bounds.maxX, second.bounds.maxX);
  const maxY = Math.min(first.bounds.maxY, second.bounds.maxY);
  if (minX >= maxX || minY >= maxY) return false;

  const width = maxX - minX;
  const height = maxY - minY;
  const gridSize = 32;
  for (let row = 0; row < gridSize; row++) {
    const y = minY + ((row + 0.5) / gridSize) * height;
    for (let column = 0; column < gridSize; column++) {
      const x = minX + ((column + 0.5) / gridSize) * width;
      if (
        context.isPointInPath(first.path, x, y, fillRule) &&
        context.isPointInPath(second.path, x, y, fillRule)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Count disconnected filled areas in the contour sample grid. */
function countInsideCellComponents(cells: Uint8Array, gridSize: number): number {
  const visited = new Uint8Array(cells.length);
  const queue = new Int32Array(cells.length);
  let components = 0;

  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || visited[start]) continue;
    components++;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const row = Math.floor(index / gridSize);
      const column = index % gridSize;
      const neighbors = [
        row > 0 ? index - gridSize : -1,
        row < gridSize - 1 ? index + gridSize : -1,
        column > 0 ? index - 1 : -1,
        column < gridSize - 1 ? index + 1 : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || !cells[neighbor]) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }

  return components;
}

/** Find one point inside a contour and one immediately outside it. */
function findPathBoundarySamples(
  context: CanvasRenderingContext2D,
  path: Path2D,
  bounds: SvgPathBounds,
  fillRule: CanvasFillRule
): {
  inside: { x: number; y: number };
  outside: { x: number; y: number };
  components: number;
} | null {
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) return null;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) return null;

  const gridSize = 64;
  const insideCells = new Uint8Array(gridSize * gridSize);
  const pointAt = (row: number, column: number): { x: number; y: number } => ({
    x: bounds.minX + ((column + 0.5) / gridSize) * width,
    y: bounds.minY + ((row + 0.5) / gridSize) * height,
  });

  let firstInside = -1;
  for (let row = 0; row < gridSize; row++) {
    for (let column = 0; column < gridSize; column++) {
      const point = pointAt(row, column);
      if (context.isPointInPath(path, point.x, point.y, fillRule)) {
        insideCells[row * gridSize + column] = 1;
        if (firstInside < 0) firstInside = row * gridSize + column;
      }
    }
  }
  if (firstInside < 0) return null;
  const components = countInsideCellComponents(insideCells, gridSize);

  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let index = 0; index < insideCells.length; index++) {
    if (!insideCells[index]) continue;
    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    for (const [rowOffset, columnOffset] of neighbors) {
      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (
        neighborRow < 0 ||
        neighborRow >= gridSize ||
        neighborColumn < 0 ||
        neighborColumn >= gridSize ||
        insideCells[neighborRow * gridSize + neighborColumn]
      ) {
        continue;
      }
      return {
        inside: pointAt(row, column),
        outside: pointAt(neighborRow, neighborColumn),
        components,
      };
    }
  }
  return null;
}

/**
 * Split one merged path into separately colorable visible regions.
 *
 * A compound path can contain both visible artwork and holes. Splitting every
 * `M` section literally would fill those holes, so each section is classified
 * against the original compound fill. Hole sections stay attached to the
 * visible region that contains them. The candidate result is compared with
 * the original fill before it is accepted; unusual nested winding falls back
 * to the untouched merged path instead of changing the artwork.
 */
function splitMergedPathRegions(
  d: string,
  fillRule: CanvasFillRule,
  searchBounds: SvgPathBounds
): string[] | null {
  if (typeof Path2D === 'undefined') return null;

  const rawCommands = parsePathCommands(d);
  const absoluteCommands = absolutePathCommands(rawCommands);
  if (absoluteCommands.some(absoluteCommandHasLargeCoordinate)) return null;
  const subpaths = splitAbsolutePathCommands(absoluteCommands);
  if (subpaths.length < 2 || subpaths.length > 64) return null;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  let originalPath: Path2D;
  try {
    originalPath = new Path2D(d);
  } catch {
    return null;
  }

  const overallBounds: SvgPathBounds = { ...searchBounds };
  for (const subpath of subpaths) {
    extendPathBounds(overallBounds, subpath.bounds.minX, subpath.bounds.minY);
    extendPathBounds(overallBounds, subpath.bounds.maxX, subpath.bounds.maxY);
  }
  const boundsMargin = Math.max(
    overallBounds.maxX - overallBounds.minX,
    overallBounds.maxY - overallBounds.minY
  ) * 0.01;
  if (boundsMargin > 0) {
    overallBounds.minX -= boundsMargin;
    overallBounds.minY -= boundsMargin;
    overallBounds.maxX += boundsMargin;
    overallBounds.maxY += boundsMargin;
  }

  const subpathInfos: SvgSubpathInfo[] = [];
  for (const subpath of subpaths) {
    let path: Path2D;
    try {
      path = new Path2D(subpath.d);
    } catch {
      return null;
    }
    const samples = findPathBoundarySamples(context, path, overallBounds, fillRule);
    if (!samples || samples.components !== 1) {
      return null; // zero-area, too-thin, or multi-part contour
    }
    const insideFilled = context.isPointInPath(
      originalPath,
      samples.inside.x,
      samples.inside.y,
      fillRule
    );
    const outsideFilled = context.isPointInPath(
      originalPath,
      samples.outside.x,
      samples.outside.y,
      fillRule
    );
    const kind: SvgContourKind = insideFilled
      ? outsideFilled
        ? 'internal'
        : 'visible'
      : outsideFilled
        ? 'hole'
        : 'empty';
    subpathInfos.push({ subpath, path, inside: samples.inside, outside: samples.outside, kind });
  }

  const visible = subpathInfos.filter((info) => info.kind === 'visible');
  if (visible.length < 2) return null;

  const groups = visible.map((info) => ({
    base: info,
    attached: [] as SvgSubpathInfo[],
  }));

  for (const contour of subpathInfos.filter((info) => info.kind !== 'visible')) {
    if (contour.kind === 'empty') return null;
    const containing = visible
      .filter((candidate) =>
        context.isPointInPath(candidate.path, contour.outside.x, contour.outside.y)
      )
      .sort((a, b) => pathBoundsArea(a.subpath.bounds) - pathBoundsArea(b.subpath.bounds));
    if (!containing.length) return null;

    const parent = containing[0];
    const group = groups.find((candidate) => candidate.base === parent);
    if (!group) return null;
    group.attached.push(contour);
  }

  const regions: SvgPathRegion[] = [];
  for (const group of groups) {
    const d = [group.base.subpath.d, ...group.attached.map((contour) => contour.subpath.d)].join(' ');
    const bounds = { ...group.base.subpath.bounds };
    for (const contour of group.attached) {
      extendPathBounds(bounds, contour.subpath.bounds.minX, contour.subpath.bounds.minY);
      extendPathBounds(bounds, contour.subpath.bounds.maxX, contour.subpath.bounds.maxY);
    }
    try {
      regions.push({ d, path: new Path2D(d), bounds });
    } catch {
      return null;
    }
  }

  // Only disconnected visible regions can be colored independently. If two
  // candidate regions overlap, keep the original merged path so recoloring
  // cannot change which shape appears on top.
  for (let first = 0; first < regions.length; first++) {
    for (let second = first + 1; second < regions.length; second++) {
      if (sampledPathsOverlap(context, regions[first], regions[second], fillRule)) return null;
    }
  }

  // Confirm that the split regions have the same visible geometry as the
  // original compound path. This catches non-zero winding combinations that
  // cannot be represented as independent filled paths without losing holes.
  const samplePoints = subpathInfos.flatMap((info) => [info.inside, info.outside]);
  const gridSize = 32;
  const width = overallBounds.maxX - overallBounds.minX;
  const height = overallBounds.maxY - overallBounds.minY;
  for (let row = 0; row <= gridSize; row++) {
    const y = overallBounds.minY + ((row + 0.5) / (gridSize + 1)) * height;
    for (let column = 0; column <= gridSize; column++) {
      const x = overallBounds.minX + ((column + 0.5) / (gridSize + 1)) * width;
      samplePoints.push({ x, y });
    }
  }

  for (const point of samplePoints) {
    const originalFilled = context.isPointInPath(originalPath, point.x, point.y, fillRule);
    const splitMatches = regions.filter((region) =>
      context.isPointInPath(region.path, point.x, point.y, fillRule)
    );
    if (originalFilled !== (splitMatches.length > 0)) return null;
    if (splitMatches.length > 1) return null;
  }

  return regions.map((region) => region.d);
}

interface UploadedSvgPaths {
  paths: VectorPath[];
  pathCount: number;
}

function collectUploadedSvgPaths(root: Element, viewBounds: SvgPathBounds): UploadedSvgPaths {
  const paths: VectorPath[] = [];
  let pathElementCount = 0;
  let totalPathChars = 0;

  function visit(parent: Element, inherited: SvgPresentation): void {
    for (const child of Array.from(parent.children)) {
      const tag = child.localName.toLowerCase();
      assertSafeSvgElement(child);

      if (tag === 'title' || tag === 'desc' || tag === 'metadata') continue;
      if (tag === 'defs') {
        for (const definition of Array.from(child.querySelectorAll('*'))) {
          const definitionTag = definition.localName.toLowerCase();
          if (
            definitionTag === 'script' ||
            definitionTag === 'style' ||
            definitionTag === 'foreignobject' ||
            definitionTag === 'animate' ||
            definitionTag === 'animatemotion' ||
            definitionTag === 'set' ||
            definitionTag === 'use' ||
            definitionTag === 'image' ||
            definitionTag === 'text'
          ) {
            throw new Error('This SVG contains active or styled content and cannot be used.');
          }
        }
        continue;
      }
      if (tag === 'style') {
        throw new Error('SVG CSS styles are not supported. Use presentation attributes instead.');
      }

      const own = svgPresentation(child);
      if (own.opacity !== undefined && tag !== 'path') {
        throw new Error('Group opacity is not supported. Apply opacity to individual paths instead.');
      }

      if (tag === 'g') {
        if (own.hidden) continue;
        visit(child, {
          fill: own.fill ?? inherited.fill,
          fillRule: own.fillRule ?? inherited.fillRule,
          fillOpacity: own.fillOpacity ?? inherited.fillOpacity,
          hidden: false,
        });
        continue;
      }

      if (tag !== 'path') {
        throw new Error('This SVG must use filled <path> elements only.');
      }
      if (own.hidden) continue;

      const d = child.getAttribute('d')?.trim();
      if (!d) continue;
      totalPathChars += d.length;
      if (totalPathChars > MAX_SVG_PATH_CHARS) {
        throw new Error('This SVG has too much path data. Simplify the artwork before uploading.');
      }
      validatePathData(d);

      const fill = own.fill ?? inherited.fill;
      const normalizedFill = fill?.trim().toLowerCase();
      if (normalizedFill === 'none') continue;
      if (normalizedFill?.includes('url(')) {
        throw new Error('Gradients and pattern fills are not supported. Use a solid fill.');
      }

      const fillRule = own.fillRule ?? inherited.fillRule;
      if (fillRule && fillRule !== 'evenodd' && fillRule !== 'nonzero') {
        throw new Error('The SVG uses an unsupported fill rule.');
      }

      const fillOpacity = own.fillOpacity ?? inherited.fillOpacity;
      const opacity = fillOpacity === undefined ? 1 : fillOpacity;
      const finalOpacity = own.opacity === undefined ? opacity : opacity * own.opacity;
      if (finalOpacity <= 0) continue;

      pathElementCount++;
      const pathId = child.getAttribute('id')?.trim();
      const pathLabel = `Path ${pathElementCount}`;
      const idLabel = pathId ? ` · ${pathId.slice(0, 80)}` : '';

      let regionData: string[] = [d];
      if (finalOpacity === 1) {
        try {
          regionData =
            splitMergedPathRegions(
              d,
              fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
              viewBounds
            ) ?? [d];
        } catch {
          regionData = [d];
        }
      }

      if (paths.length + regionData.length > MAX_SVG_PATHS) {
        throw new Error('This SVG has too many color regions. Simplify the artwork before uploading.');
      }

      regionData.forEach((regionD, regionIndex) => {
        paths.push({
          d: regionD,
          ...(fillRule === 'evenodd' ? { fillRule } : {}),
          ...(finalOpacity < 1 ? { opacity: String(Math.round(finalOpacity * 10000) / 10000) } : {}),
          label:
            regionData.length > 1
              ? `${pathLabel} · Region ${regionIndex + 1}/${regionData.length}${idLabel}`
              : `${pathLabel}${idLabel}`,
        });
      });
    }
  }

  const rootPresentation = svgPresentation(root);
  if (rootPresentation.opacity !== undefined) {
    throw new Error('Root opacity is not supported. Apply opacity to individual paths instead.');
  }
  visit(root, {
    fill: rootPresentation.fill,
    fillRule: rootPresentation.fillRule,
    fillOpacity: rootPresentation.fillOpacity,
    hidden: false,
  });

  if (!paths.length) throw new Error('This SVG has no visible filled paths.');
  return { paths, pathCount: pathElementCount };
}

function parseUploadedSvg(
  svgText: string
): { paths: VectorPath[]; viewBox: string; pathCount: number } {
  // Reject document types before XML parsing. A doctype can declare entities,
  // and rejecting it only after DOMParser has already expanded them would
  // leave an avoidable resource-exhaustion path.
  if (/<!doctype/i.test(svgText)) {
    throw new Error('SVG document types are not supported.');
  }

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('This file is not valid SVG.');
  }
  if (doc.doctype) {
    throw new Error('SVG document types are not supported.');
  }

  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'svg') {
    throw new Error('Choose a file whose root element is <svg>.');
  }
  if (root.namespaceURI && root.namespaceURI !== SVG_NS) {
    throw new Error('This file is not a standard SVG document.');
  }

  assertSafeSvgElement(root);
  const view = parseSvgViewBox(root);
  const { paths, pathCount } = collectUploadedSvgPaths(root, {
    minX: view.x,
    minY: view.y,
    maxX: view.x + view.width,
    maxY: view.y + view.height,
  });
  return { paths, viewBox: view.viewBox, pathCount };
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

  if (isVectorSource(S.source) && S.paths) {
    const pathEls = S.paths.map(
      (p) =>
        `<path d="${escapeXml(p.d)}" fill="${p.color ?? iconColor}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}${p.opacity ? ` opacity="${p.opacity}"` : ''}/>`
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
  } else if ((S.source === 'noto' || S.source === 'twemoji') && S.emojiUri) {
    // Embed the resolved emoji (bundled SVG or canvas-rendered PNG) as an
    // image — preserves all colors and gradients through every export path.
    iconEl = `<image x="${pad}" y="${iy}" width="${iconScale}" height="${iconScale}" href="${S.emojiUri}" preserveAspectRatio="xMidYMid meet"/>`;
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
    if (S.source === 'svg') setSvgError(true, 'The SVG could not be rendered. Check its path data.');
    else err(true);
    return;
  }
  const svg = svgDoc.documentElement;
  svg.classList.add('live');
  svg.style.cssText = 'width:180px;height:180px;display:block;';
  if (old) old.replaceWith(svg);
  else container.appendChild(svg);

  const sourceLabels: Record<string, string> = {
    fa: 'Font Awesome',
    bi: 'Bootstrap',
    text: 'Text',
    noto: 'Noto',
    twemoji: 'Twemoji',
    svg: 'Custom SVG',
  };
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
let faSeq = 0; // guards against out-of-order Font Awesome chunk loads
let emojiSeq = 0; // guards against out-of-order emoji lookups

const elIconInput = document.getElementById('icon-input') as HTMLInputElement;

function handleIconInput(): void {
  clearTimeout(iconTimer);
  if (S.source === 'svg') return;
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
    const seq = ++faSeq;
    iconTimer = setTimeout(async () => {
      if (seq !== faSeq) return; // stale — user kept typing
      const r = await findFAIcon(name);
      if (seq !== faSeq) return; // stale — user kept typing or switched source
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
    // Emoji: debounce lookup. Bundled glyphs come from a same-origin file,
    // the rest from the upstream Noto/Twemoji artwork for the active source.
    const seq = ++emojiSeq;
    iconTimer = setTimeout(async () => {
      if (seq !== emojiSeq) return; // stale — user kept typing or switched source
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
        const svgText = await loadEmojiSvg(val);
        if (seq !== emojiSeq) return; // lost the race while loading
        Object.assign(S, { iconName: val, emojiUri: svgDataUri(svgText), valid: true });
        err(false);
      } catch {
        if (seq !== emojiSeq) return;
        // Offline or no upstream glyph: draw it with the system font so the
        // tool still produces something usable.
        const uri = renderEmojiToCanvasUri(val);
        if (uri) {
          Object.assign(S, { iconName: val, emojiUri: uri, valid: true });
          err(false);
          announce('Emoji artwork unavailable — using your device font.');
        } else {
          S.valid = false;
          S.emojiUri = null;
          err(true);
        }
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
  const el = document.getElementById('error-msg')!;
  const wasVisible = el.classList.contains('visible');
  el.classList.toggle('visible', show);
  // role="alert" only fires when content changes while it is rendered —
  // re-insert the same message so repeated invalid lookups still announce.
  if (show && !wasVisible) {
    const html = el.innerHTML;
    el.innerHTML = '';
    el.innerHTML = html;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploaded SVG controls
// ─────────────────────────────────────────────────────────────────────────────
let svgSeq = 0; // guards against a late file read replacing another source
let selectedSvgRegion = -1;
const elSvgFileInput = document.getElementById('svg-file-input') as HTMLInputElement;
const elSvgUploadError = document.getElementById('svg-upload-error')!;
const elSvgPathColorsPanel = document.getElementById('svg-path-colors-panel')!;
const elSvgPathList = document.getElementById('svg-path-list')!;
const elSvgPathColorField = document.getElementById('cp-svg-path')!;
let svgErrorRevision = 0;

function setSvgError(show: boolean, message = ''): void {
  const revision = ++svgErrorRevision;
  const wasVisible = elSvgUploadError.classList.contains('visible');
  elSvgUploadError.classList.toggle('visible', show);
  if (!show) {
    elSvgUploadError.textContent = '';
    return;
  }
  // Re-insert the message so repeated failures are announced even when the
  // alert was already visible. The revision prevents an older queued frame
  // from restoring a stale error after a newer upload or source change.
  if (wasVisible) elSvgUploadError.textContent = '';
  requestAnimationFrame(() => {
    if (revision !== svgErrorRevision) return;
    elSvgUploadError.textContent = message;
  });
}

function svgRegionColor(index: number): string {
  return S.paths?.[index]?.color ?? S.iconColor;
}

function updateSvgRegionControls(rebuild = false): void {
  const hasPaths = S.source === 'svg' && S.valid && !!S.paths?.length;
  updateIconColorAvailability();
  elSvgPathColorsPanel.hidden = !hasPaths;
  if (!hasPaths) {
    selectedSvgRegion = -1;
    elSvgPathList.replaceChildren();
    return;
  }

  if (selectedSvgRegion < 0 || selectedSvgRegion >= S.paths!.length) selectedSvgRegion = 0;

  if (rebuild) {
    elSvgPathList.replaceChildren();
    S.paths!.forEach((path, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'svg-path-item';
      button.dataset.pathIndex = String(index);
      button.setAttribute('aria-pressed', String(index === selectedSvgRegion));

      const swatch = document.createElement('span');
      swatch.className = 'svg-path-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'svg-path-label';
      const defaultLabel = `Path ${index + 1}`;
      label.textContent = path.label ?? defaultLabel;
      button.title = label.textContent;

      const state = document.createElement('span');
      state.className = 'svg-path-state';
      state.textContent = path.color ? 'Custom' : 'Icon';

      button.append(swatch, label, state);
      elSvgPathList.appendChild(button);
    });
  }

  elSvgPathList.querySelectorAll<HTMLButtonElement>('.svg-path-item').forEach((button) => {
    const index = Number(button.dataset.pathIndex);
    const selected = index === selectedSvgRegion;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    const swatch = button.querySelector<HTMLElement>('.svg-path-swatch');
    if (swatch) swatch.style.background = svgRegionColor(index);
    const state = button.querySelector<HTMLElement>('.svg-path-state');
    if (state) state.textContent = S.paths![index].color ? 'Custom' : 'Icon';
  });

  setColorPickerValue(elSvgPathColorField, svgRegionColor(selectedSvgRegion));
}

function resetSvgRegionControls(): void {
  selectedSvgRegion = -1;
  elSvgPathColorsPanel.hidden = true;
  elSvgPathList.replaceChildren();
  setColorPickerValue(elSvgPathColorField, S.iconColor);
  updateIconColorAvailability();
}

function clearSvgUploadState(): void {
  svgSeq++;
  S.paths = null;
  elSvgFileInput.value = '';
  document.getElementById('svg-file-card')!.hidden = true;
  document.getElementById('svg-file-name')!.textContent = '';
  document.getElementById('svg-file-meta')!.textContent = '';
  document.getElementById('svg-upload-title')!.textContent = 'Upload SVG';
  document.getElementById('svg-upload-subtitle')!.textContent = 'Choose an SVG with filled paths';
  resetSvgRegionControls();
  setSvgError(false);
}

async function handleSvgFile(file: File): Promise<void> {
  const seq = ++svgSeq;
  setSvgError(false);

  // Clear the native value so choosing the same file again still fires change.
  elSvgFileInput.value = '';
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
    setSvgError(true, 'Choose an SVG file.');
    return;
  }
  if (file.size > MAX_SVG_BYTES) {
    setSvgError(true, 'This SVG is too large. Choose a file no larger than 2 MB.');
    return;
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    setSvgError(true, 'The SVG file could not be read.');
    return;
  }
  if (seq !== svgSeq || S.source !== 'svg') return;

  try {
    const parsed = parseUploadedSvg(text);
    if (seq !== svgSeq || S.source !== 'svg') return;
    Object.assign(S, {
      iconName: file.name,
      paths: parsed.paths,
      viewBox: parsed.viewBox,
      valid: true,
    });
    err(false);
    setSvgError(false);

    const [, , viewWidth, viewHeight] = parsed.viewBox.split(' ').map(Number);
    const pathLabel = parsed.pathCount === 1 ? '1 path' : `${parsed.pathCount} paths`;
    const regionLabel = ` · ${parsed.paths.length} color ${
      parsed.paths.length === 1 ? 'region' : 'regions'
    }`;
    document.getElementById('svg-file-name')!.textContent = file.name;
    document.getElementById('svg-file-meta')!.textContent = `${pathLabel}${regionLabel} · ${viewWidth} × ${viewHeight}`;
    document.getElementById('svg-file-card')!.hidden = false;
    document.getElementById('svg-upload-title')!.textContent = 'Replace SVG';
    document.getElementById('svg-upload-subtitle')!.textContent = 'Choose a different SVG file';
    updateSvgRegionControls(true);
    render();
  } catch (e) {
    if (seq !== svgSeq || S.source !== 'svg') return;
    setSvgError(true, e instanceof Error ? e.message : 'This SVG could not be used.');
  }
}

document.getElementById('svg-upload-btn')!.addEventListener('click', () => elSvgFileInput.click());
elSvgFileInput.addEventListener('change', () => {
  const file = elSvgFileInput.files?.[0];
  if (file) void handleSvgFile(file);
});
elSvgPathList.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('.svg-path-item');
  if (!button) return;
  const index = Number(button.dataset.pathIndex);
  if (!Number.isInteger(index) || !S.paths?.[index]) return;
  selectedSvgRegion = index;
  updateSvgRegionControls();
});
elSvgPathColorField.addEventListener('colorchange', (event) => {
  if (selectedSvgRegion < 0 || !S.paths?.[selectedSvgRegion]) return;
  S.paths[selectedSvgRegion].color = (event as CustomEvent<string>).detail;
  updateSvgRegionControls();
  render();
});
document.getElementById('svg-path-reset')!.addEventListener('click', () => {
  if (!S.paths) return;
  for (const path of S.paths) path.color = undefined;
  selectedSvgRegion = S.paths.length ? 0 : -1;
  updateSvgRegionControls();
  render();
});
document.getElementById('svg-file-remove')!.addEventListener('click', () => {
  clearSvgUploadState();
  S.paths = null;
  S.iconName = '';
  S.valid = false;
  render();
});

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
let dialogReturnFocus: HTMLElement | null = null;

function nonSquareBg(): boolean {
  return S.bgShape === 'circle' || S.bgShape === 'rounded';
}

/** Keep the page behind the dialog out of the tab order and a11y tree. */
function setBackgroundInert(inert: boolean): void {
  for (const selector of ['.workspace', '.tool-top', '.tool-bottom', '.topbar', '.footer']) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) el.inert = inert;
  }
}

function openShapeDialog(mode: 'export' | 'material'): void {
  shapeDialogMode = mode;
  dialogReturnFocus = document.activeElement as HTMLElement | null;
  const primary = document.getElementById('shape-dialog-primary')!;
  const secondary = document.getElementById('shape-dialog-secondary')!;
  primary.textContent = mode === 'export' ? 'Switch to Square & Export' : 'Switch to Square';
  secondary.textContent = mode === 'export' ? 'Export Anyway' : 'Keep Current Shape';
  document.getElementById('shape-dialog')!.classList.add('visible');
  lockScroll();
  setBackgroundInert(true);
  primary.focus();
}

function closeShapeDialog(): void {
  document.getElementById('shape-dialog')!.classList.remove('visible');
  setBackgroundInert(false);
  unlockScroll();
  shapeDialogMode = null;
  dialogReturnFocus?.focus();
  dialogReturnFocus = null;
}

// Bulletproof scroll lock: overflow:hidden is advisory on mobile browsers —
// fixing the body in place removes the page from the scroll flow entirely.
let lockY = 0;

function lockScroll(): void {
  lockY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockY}px`;
  document.body.style.width = '100%';
  document.documentElement.style.overflow = 'hidden';
}

function unlockScroll(): void {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.documentElement.style.overflow = '';
  window.scrollTo(0, lockY);
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

// Keep Tab inside the dialog while it is open (aria-modal alone does not
// stop keyboard focus from wandering into the inert page behind it).
document.getElementById('shape-dialog')!.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const card = document.querySelector<HTMLElement>('#shape-dialog .modal-card');
  if (!card) return;
  const focusables = [...card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shapeDialogMode) {
    e.preventDefault();
    closeShapeDialog();
  }
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
  paintRangeFill(elBgAngle);
  document.getElementById('angle-label')!.textContent = S.bgAngle + '°';
  document.querySelectorAll<HTMLElement>('.angle-btn').forEach((b) => {
    const on = Number(b.dataset.angle) === S.bgAngle;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
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

const EXPORT_ERROR_DEFAULT = 'Choose a valid icon, text, emoji, or SVG first.';

function exportError(show: boolean, message: string = EXPORT_ERROR_DEFAULT): void {
  const el = document.getElementById('export-error');
  if (!el) return;
  el.classList.toggle('visible', show);
  if (!show) return;
  // role="alert" announces content changes only while rendered — show the
  // element first, then write the message on the next frame.
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

function clampExportSize(v: number): number {
  return Number.isFinite(v) ? Math.min(4096, Math.max(16, Math.round(v))) : 128;
}

// Export base name: <provider>_<name>_<fill>
// e.g. fontawesome_star_gradient, bootstrap_alarm_solid,
// svg_my-icon_solid, text_hi_solid, emoji_1f600_gradient
function exportBaseName(): string {
  const provider =
    S.source === 'fa'
      ? 'fontawesome'
      : S.source === 'bi'
        ? 'bootstrap'
        : S.source === 'svg'
          ? 'svg'
          : S.source === 'text'
            ? 'text'
            : 'emoji';
  let name: string;
  if (S.source === 'fa' || S.source === 'bi') name = S.iconName;
  else if (S.source === 'svg') {
    name =
      S.iconName
        .replace(/\.svg$/i, '')
        .toLowerCase()
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'icon';
  } else if (S.source === 'text') name = S.textValue.replace(/[^\w-]+/g, '').toLowerCase() || 'text';
  else name = emojiCodepoints(S.iconName).join('-') || 'emoji';
  return `${provider}_${name}_${S.bgType === 'gradient' ? 'gradient' : 'solid'}`;
}

async function exportAs(fmt: string): Promise<void> {
  if (!S.valid) {
    exportError(true, EXPORT_ERROR_DEFAULT);
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
    announce(`SVG icon downloaded as ${fname}.svg`);
    return;
  }
  await fontsReady();
  svgTextToPngBlob(await buildExportSVG(), w, h)
    .then((b) => {
      downloadBlob(b, `${fname}-${w}x${h}.png`);
      announce(`PNG icon downloaded at ${w} by ${h} pixels`);
    })
    .catch(() => exportError(true, 'PNG export failed — try again.'));
}

for (const b of document.querySelectorAll<HTMLElement>('.export-btn')) {
  b.addEventListener('click', () => void exportAs(b.dataset.fmt!));
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors — the shared ColorField picker (src/scripts/tools/color-picker.ts)
// owns the swatch, the hex input and the popup. It reports every change as
// a `colorchange` event on the field root.
// ─────────────────────────────────────────────────────────────────────────────
function watchColorField(id: string, apply: (hex: string) => void): void {
  document.getElementById(id)?.addEventListener('colorchange', (event) => {
    apply((event as CustomEvent<string>).detail);
    render();
  });
}

watchColorField('cp-icon', (hex) => {
  if (isIconColorDisabled()) {
    setColorPickerValue(elIconColorField, S.iconColor);
    return;
  }
  S.iconColor = hex;
  if (S.source === 'svg') updateSvgRegionControls();
});
watchColorField('cp-bg', (hex) => {
  S.bgColor = hex;
});
watchColorField('cp-bg2', (hex) => {
  S.bgColor2 = hex;
});

// ─────────────────────────────────────────────────────────────────────────────
// Android XML builders (vector sources: FA + Bootstrap + uploaded SVG)
// ─────────────────────────────────────────────────────────────────────────────
function buildForegroundXML(): string {
  const [vbX, vbY, vbW, vbH] = S.viewBox.trim().split(/[,\s]+/).map(Number);
  const safeDp = 72 * (S.iconScale / 100);
  const scale = safeDp / Math.max(vbW, vbH);
  const scaledW = vbW * scale,
    scaledH = vbH * scale;
  // Account for a non-zero viewBox origin before centering the artwork.
  const tx = ((108 - scaledW) / 2 - vbX * scale).toFixed(4);
  // Vertical offset: composite canvas units map 100 → 108dp
  const ty = ((108 - scaledH) / 2 - vbY * scale + (S.iconOffsetY * 108) / 100).toFixed(4);
  const sc = scale.toFixed(6);

  const pathEls = S.paths!
    .map((p) => {
      const alpha = p.opacity ? `\n        android:fillAlpha="${p.opacity}"` : '';
      const fillType = p.fillRule === 'evenodd' ? `\n        android:fillType="evenOdd"` : '';
      return `    <path\n        android:fillColor="${p.color ?? S.iconColor}"${alpha}${fillType}\n        android:pathData="${escapeXml(p.d)}"/>`;
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
  const isVector = isVectorSource(S.source);
  const isEmoji = S.source === 'noto' || S.source === 'twemoji';
  const srcLabel = {
    fa: 'Font Awesome',
    bi: 'Bootstrap Icons',
    text: 'Custom Text',
    noto: 'Noto Emoji',
    twemoji: 'Twemoji',
    svg: 'Uploaded SVG',
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
    (Font Awesome, Bootstrap, or uploaded SVG). PNG mipmaps are sufficient
    for all Android versions.)`;

  const rasterNote = !isVector
    ? `
NOTE FOR ${isEmoji ? 'EMOJI' : 'TEXT'} ICONS
  ${isEmoji ? 'Emoji sources (Noto, Twemoji)' : 'Text icons'} export PNG mipmaps only. Android's
  VectorDrawable format does not support the ${isEmoji ? 'gradients and raster\n  references used in emoji SVGs' : 'text elements used in text icons'}. For full adaptive icon XML support
  (API 26+ shape masking, Material You theming), use a vector
  source (Font Awesome, Bootstrap, or uploaded SVG) instead.
${isEmoji ? '' : `  Standalone SVG exports embed the "${S.fontFamily}" typeface, so they\n  render identically anywhere. PNG exports are fully rasterized.\n`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    : '';

  const fontLine =
    S.source === 'text'
      ? `  Font:              ${S.fontFamily} ${S.fontWeight}${S.fontItalic ? ' italic' : ''}${S.fontUnderline ? ' + underline' : ''}${S.textSpacing ? `, spacing ${S.textSpacing}` : ''}\n`
      : '';

  const customPathColors = S.paths?.filter((path) => path.color).length ?? 0;
  const iconColorSummary =
    S.source === 'svg' && customPathColors
      ? `${S.iconColor} default · ${customPathColors} custom region ${customPathColors === 1 ? 'color' : 'colors'}`
      : isVector || S.source === 'text'
        ? S.iconColor
        : '(emoji own colors)';

  const shapeNote = nonSquareBg()
    ? `\n  NOTE:              Background shape is '${S.bgShape}' — switch to square so launchers can mask freely.`
    : '';

  return `╔══════════════════════════════════════════════════════════════╗
║           ANDROID ICON PACKAGE — s17 Labs Icon Maker         ║
║           https://s17labs.github.io/tools/icon-maker/        ║
╚══════════════════════════════════════════════════════════════╝

ICON DETAILS
  Source:            ${srcLabel}
  Name / Text / Emoji / File: ${S.iconName}
  Icon color:        ${iconColorSummary}
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
    exportError(true, EXPORT_ERROR_DEFAULT);
    return;
  }
  exportError(false);
  // Baked-in circle/rounded backgrounds fight the launcher mask — stop and
  // ask before building the package.
  if (nonSquareBg()) {
    openShapeDialog('export');
    return;
  }

  const isVector = isVectorSource(S.source);
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
    progressFill.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));
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

    // XML files: vector sources (FA, Bootstrap, uploaded SVG) only
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
    announce(`Android icon package downloaded with ${densities.length * 2 + 1} images`);

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
    exportError(true, 'Export failed: ' + (e as Error).message);
    announce('Android package export failed');
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
      // A broken thumbnail must never stall the whole preview row.
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
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
initColorPickers();
setPreset(128);
