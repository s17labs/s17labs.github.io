import JSZip from 'jszip';
import { library, findIconDefinition } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import { iconSvg } from '../../icons';

library.add(fas);
library.add(far);
library.add(fab);

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  source: 'fa', // 'fa' | 'noto' | 'twemoji'
  iconName: '', // FA icon name OR raw emoji character
  iconColor: '#ffffff',
  bgColor: '#ff4136',
  bgShape: 'circle',
  iconScale: 70,
  // FA specific
  paths: null as string[] | null,
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
    error: 'Icon not found — check spelling at fontawesome.com/icons',
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

  // Update source buttons
  document.querySelectorAll<HTMLElement>('.source-btn').forEach((b) => b.classList.toggle('active', b.dataset.source === src));

  // Update input appearance
  const cfg = INPUT_CONFIG[src];
  const input = document.getElementById('icon-input') as HTMLInputElement;
  document.getElementById('input-label')!.textContent = cfg.label;
  input.placeholder = cfg.placeholder;
  input.value = '';
  input.className = cfg.cls;

  // Error message text
  const errorMsg = document.getElementById('error-msg')!;
  errorMsg.textContent = cfg.error;
  errorMsg.classList.remove('visible');

  // Icon color: disabled + note for emoji
  const isEmoji = src !== 'fa';
  document.getElementById('icon-color-field')!.classList.toggle('cp-disabled', isEmoji);
  document.getElementById('cp-fa-only-note')!.classList.toggle('visible', isEmoji);

  // Material You checkbox: only for FA (emoji won't produce VectorDrawable XMLs)
  const row = document.getElementById('material-row')!;
  row.classList.toggle('cb-disabled', isEmoji);
  document.getElementById('material-sub')!.textContent = isEmoji
    ? 'FA only — not supported for emoji sources'
    : 'Adds <monochrome> layer for Android 13+';

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
function findFAIcon(name: string): { paths: string[]; viewBox: string } | null {
  for (const prefix of ['fas', 'far', 'fab'] as const) {
    try {
      const def = findIconDefinition({ prefix, iconName: name } as Parameters<typeof findIconDefinition>[0]);
      if (def?.icon) {
        const [w, h, , , pd] = def.icon;
        return { paths: Array.isArray(pd) ? pd : [pd], viewBox: `0 0 ${w} ${h}` };
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build composite SVG
// ─────────────────────────────────────────────────────────────────────────────
function buildSVG(shapeOverride?: string): string {
  const shape = shapeOverride ?? S.bgShape;
  const { iconColor, bgColor, iconScale } = S;
  const pad = (100 - iconScale) / 2;
  const rx = shape === 'circle' ? 50 : shape === 'rounded' ? 14 : 0;
  const bgEl =
    shape !== 'none' ? `<rect width="100" height="100" fill="${bgColor}" rx="${rx}"/>` : '';

  let iconEl = '';

  if (S.source === 'fa' && S.paths) {
    const pathEls = S.paths.map(
      (d, i) => `<path d="${d}" fill="${iconColor}"${S.paths!.length > 1 && i === 0 ? ' opacity="0.4"' : ''}/>`
    ).join('');
    iconEl = `<svg x="${pad}" y="${pad}" width="${iconScale}" height="${iconScale}" viewBox="${S.viewBox}">${pathEls}</svg>`;
  } else if (S.source !== 'fa' && S.emojiSvg) {
    // Embed emoji as image using data URI — preserves all colors and gradients
    const uri = svgDataUri(S.emojiSvg);
    iconEl = `<image x="${pad}" y="${pad}" width="${iconScale}" height="${iconScale}" href="${uri}" preserveAspectRatio="xMidYMid meet"/>`;
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

  const svg = new DOMParser().parseFromString(buildSVG(), 'image/svg+xml').documentElement;
  svg.classList.add('live');
  svg.style.cssText = 'width:180px;height:180px;display:block;';
  if (old) old.replaceWith(svg);
  else container.appendChild(svg);

  const sourceLabels: Record<string, string> = { fa: 'Font Awesome', noto: 'Noto', twemoji: 'Twemoji' };
  document.getElementById('meta-source')!.textContent = sourceLabels[S.source];
  document.getElementById('meta-icon')!.textContent = S.iconName;
  document.getElementById('meta-bg')!.textContent = S.bgShape === 'none' ? 'transparent' : S.bgColor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon input handler (FA + emoji, shared input element)
// ─────────────────────────────────────────────────────────────────────────────
let iconTimer: ReturnType<typeof setTimeout>;

const elIconInput = document.getElementById('icon-input') as HTMLInputElement;

elIconInput.addEventListener('input', () => {
  clearTimeout(iconTimer);
  const raw = elIconInput.value;
  const val = raw.trim();

  if (!val) {
    S.valid = false;
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
});

function err(show: boolean): void {
  document.getElementById('error-msg')!.classList.toggle('visible', show);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape + scale
// ─────────────────────────────────────────────────────────────────────────────
function setShape(s: string): void {
  S.bgShape = s;
  document.querySelectorAll<HTMLElement>('.shape-btn').forEach((b) => b.classList.toggle('active', b.dataset.shape === s));
  render();
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Resolution presets
// ─────────────────────────────────────────────────────────────────────────────
function setPreset(px: number): void {
  (document.getElementById('custom-w') as HTMLInputElement).value = String(px);
  (document.getElementById('custom-h') as HTMLInputElement).value = String(px);
  document.querySelectorAll<HTMLElement>('.preset-btn').forEach((b) =>
    b.classList.toggle('active', b.textContent === px + 'px')
  );
}

for (const b of document.querySelectorAll<HTMLElement>('.preset-btn')) {
  b.addEventListener('click', () => setPreset(Number(b.textContent)));
}

for (const id of ['custom-w', 'custom-h']) {
  document.getElementById(id)!.addEventListener('input', () =>
    document.querySelectorAll<HTMLElement>('.preset-btn').forEach((b) => b.classList.remove('active'))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard export
// ─────────────────────────────────────────────────────────────────────────────
function exportAs(fmt: string): void {
  if (!S.valid) {
    alert('Enter a valid icon or emoji first.');
    return;
  }
  const w = Number((document.getElementById('custom-w') as HTMLInputElement).value) || 128;
  const h = Number((document.getElementById('custom-h') as HTMLInputElement).value) || 128;
  const fname = S.source === 'fa' ? `${S.iconName}-icon` : `emoji-icon`;

  if (fmt === 'svg') {
    dl(URL.createObjectURL(new Blob([buildSVG()], { type: 'image/svg+xml' })), fname + '.svg');
    return;
  }
  svgToPngBlob(buildSVG(), w, h).then((b) => dl(URL.createObjectURL(b), `${fname}-${w}x${h}.png`));
}

for (const b of document.querySelectorAll<HTMLElement>('.export-btn')) {
  b.addEventListener('click', () => exportAs(b.dataset.fmt!));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function dl(url: string, name: string): void {
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
}

function svgToPngBlob(svgMarkup: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject();
    };
    img.src = url;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom color picker
// ─────────────────────────────────────────────────────────────────────────────
const CP = { target: null as 'icon' | 'bg' | null, h: 0, s: 1, v: 1 };

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

function cpOpen(target: 'icon' | 'bg'): void {
  CP.target = target;
  cpFromHex(target === 'icon' ? S.iconColor : S.bgColor, true);
  cpDraw();
  cpSync();
  document.getElementById('cp-popup')!.classList.add('visible');
  document.getElementById(`cp-row-${target}`)!.classList.add('open');
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
    const t = btn.dataset.target as 'icon' | 'bg';
    // Don't open icon color picker when in emoji mode
    if (t === 'icon' && S.source !== 'fa') return;
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
  let v = elCpHexPopup.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    cpFromHex(v, true);
    cpDraw();
    cpCommit();
  }
});

(['icon', 'bg'] as const).forEach((target) => {
  const hexEl = document.getElementById(`cp-hex-${target}`) as HTMLInputElement;

  hexEl.addEventListener('input', function () {
    let v = this.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      if (target === 'icon') S.iconColor = v;
      if (target === 'bg') S.bgColor = v;
      (document.getElementById(`cp-fill-${target}`) as HTMLElement).style.background = v;
      if (CP.target === target) {
        cpFromHex(v, true);
        cpDraw();
        cpSync();
      }
      render();
    }
  });

  hexEl.addEventListener('focus', function () {
    if (target === 'icon' && S.source !== 'fa') return;
    if (CP.target !== target) cpOpen(target);
  });
});

document.addEventListener('click', (e) => {
  if (!CP.target) return;
  const popup = document.getElementById('cp-popup')!;
  const inside =
    popup.contains(e.target as Node) ||
    (['icon', 'bg'] as const).some((t) => document.getElementById(`cp-row-${t}`)!.contains(e.target as Node));
  if (!inside) cpClose();
});

window.addEventListener('resize', () => {
  if (CP.target) cpPosition(document.getElementById(`cp-row-${CP.target}`)!);
});

// ─────────────────────────────────────────────────────────────────────────────
// Android XML builders (FA only)
// ─────────────────────────────────────────────────────────────────────────────
function buildForegroundXML(): string {
  const [, , vbW, vbH] = S.viewBox.split(' ').map(Number);
  const safeDp = 72 * (S.iconScale / 100);
  const scale = safeDp / Math.max(vbW, vbH);
  const scaledW = vbW * scale,
    scaledH = vbH * scale;
  const tx = ((108 - scaledW) / 2).toFixed(4);
  const ty = ((108 - scaledH) / 2).toFixed(4);
  const sc = scale.toFixed(6);

  const pathEls = S.paths!
    .map((d, i) => {
      const alpha = S.paths!.length > 1 && i === 0 ? '\n        android:fillAlpha="0.4"' : '';
      return `    <path\n        android:fillColor="${S.iconColor}"${alpha}\n        android:pathData="${d}"/>`;
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

function buildBackgroundXML(): string {
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
  const isFa = S.source === 'fa';
  const srcLabel = { fa: 'Font Awesome', noto: 'Noto Emoji', twemoji: 'Twemoji' }[S.source];

  const monoSection = !isFa
    ? `N/A — emoji sources do not produce VectorDrawable XML files.`
    : withMonochrome
      ? `YES — <monochrome> element included in ic_launcher.xml and ic_launcher_round.xml.
   Android 13+ (API 33) will use this layer for Material You themed icons,
   tinting it automatically to match the device wallpaper color scheme.`
      : `NO  — not included. Re-export with "Include Material You / Themed Icons"
   checked to add the <monochrome> layer for Android 13+ support.`;

  const xmlNote = isFa
    ? `├── mipmap-anydpi-v26/
  │   ├── ic_launcher.xml           Adaptive icon${withMonochrome ? ' + monochrome (API 33+)' : ' (API 26+)'}
  │   └── ic_launcher_round.xml     Adaptive icon${withMonochrome ? ' + monochrome (API 33+)' : ' (API 26+)'}
  ├── drawable/
  │   ├── ic_launcher_background.xml   Solid color background layer
  │   └── ic_launcher_foreground.xml   Vector foreground (scale: ${S.iconScale}%)
  ├── drawable-v24/
  │   └── ic_launcher_foreground.xml   Foreground — explicit API 24+ copy
  └── values/
      └── colors.xml                   ic_launcher_background color resource`
    : `  (No XML files — VectorDrawable adaptive icons require FA source.
   PNG mipmaps are sufficient for all Android versions.)`;

  const emojiNote = !isFa
    ? `
NOTE FOR EMOJI ICONS
  Emoji sources (Noto, Twemoji) export PNG mipmaps only. Android's
  VectorDrawable format does not support the gradients and raster
  references used in emoji SVGs. For full adaptive icon XML support
  (API 26+ shape masking, Material You theming), use the
  Font Awesome source instead.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    : '';

  return `╔══════════════════════════════════════════════════════════════╗
║           ANDROID ICON PACKAGE — s17 Labs Icon Maker         ║
║           https://s17labs.github.io/tools/icon-maker/        ║
╚══════════════════════════════════════════════════════════════╝

ICON DETAILS
  Source:            ${srcLabel}
  Name / Emoji:      ${S.iconName}
  Icon color:        ${isFa ? S.iconColor : '(emoji own colors)'}
  Background color:  ${S.bgColor}
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
${emojiNote}${isFa ? `
ABOUT ADAPTIVE ICONS  (Android 8.0 / API 26+)

  Adaptive icons use two separate layers that the launcher composites:

    Background (ic_launcher_background.xml)
      A solid-color shape using the chosen background color (${S.bgColor}).

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
    alert('Enter a valid icon or emoji first.');
    return;
  }

  const isFa = S.source === 'fa';
  const withMonochrome = isFa && (document.getElementById('material-toggle') as HTMLInputElement).checked;
  const btn = document.getElementById('android-btn') as HTMLButtonElement;
  const progressWrap = document.getElementById('progress-wrap')!;
  const progressFill = document.getElementById('progress-fill')!;
  const progressLabel = document.getElementById('progress-label')!;

  btn.disabled = true;
  btn.innerHTML = `${iconSvg('circle-notch', 'spin')} <span><span class="android-label">Building package…</span></span>`;
  progressWrap.classList.add('visible');

  function setProgress(pct: number, label: string): void {
    progressFill.style.width = pct + '%';
    progressLabel.textContent = label;
  }

  try {
    const zip = new JSZip();
    const res = zip.folder('res')!;
    const safeName = isFa ? S.iconName.replace(/-/g, '_') : 'emoji_icon';

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
      const squareBlob = await svgToPngBlob(buildSVG(), size, size);
      res.folder(`mipmap-${density}`)!.file('ic_launcher.png', squareBlob);
      nextStep(`mipmap-${density}/ic_launcher.png  ${size}px`);

      const roundBlob = await svgToPngBlob(buildSVG('circle'), size, size);
      res.folder(`mipmap-${density}`)!.file('ic_launcher_round.png', roundBlob);
      nextStep(`mipmap-${density}/ic_launcher_round.png  ${size}px`);
    }

    setProgress(82, 'play_store_icon.png  512px…');
    const playBlob = await svgToPngBlob(buildSVG(), 512, 512);
    zip.file('play_store_icon.png', playBlob);

    // XML files: FA only
    if (isFa) {
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

    const suffix = isFa ? ` + XMLs${withMonochrome ? ' + Material You' : ''}` : ' (PNG only)';
    setProgress(100, `Done — ${densities.length * 2 + 1} images${suffix}`);

    showAndroidPreview(densities);
    dl(URL.createObjectURL(zipBlob), `${safeName}-android-icons.zip`);

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
    const url = URL.createObjectURL(new Blob([buildSVG('circle')], { type: 'image/svg+xml;charset=utf-8' }));
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
