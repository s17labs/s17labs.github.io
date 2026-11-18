import { announce, copyText, debounce, downloadBlob, downloadUrl, setupDropZone } from './lib';
import { setColorPickerValue } from './color-picker';
import { iconSvg } from '../../icons';

interface Stop {
  color: string;
  pos: number;
}

interface PaletteState {
  palette: string[];
  stops: Stop[];
  type: 'linear' | 'radial';
  angle: number;
  size: string;
}

type Rgb = { r: number; g: number; b: number };

const STORAGE_KEY = 's17-palette-studio-v1';
const MAX_STOPS = 5;
const MIN_STOPS = 2;

const DEFAULTS: PaletteState = {
  palette: ['#ff4136', '#7a1f1a', '#0e0e10', '#909090', '#f1f1f1', '#3ddc84'],
  stops: [
    { color: '#ff4136', pos: 0 },
    { color: '#7a1f1a', pos: 50 },
    { color: '#0e0e10', pos: 100 },
  ],
  type: 'linear',
  angle: 135,
  size: '1200x630',
};

const elDrop = document.getElementById('pal-drop')!;
const elInput = document.getElementById('pal-input') as HTMLInputElement;
const elError = document.getElementById('pal-error')!;
const elStrip = document.getElementById('palette-strip')!;
const elCount = document.getElementById('pal-count')!;
const elType = document.getElementById('grad-type') as HTMLSelectElement;
const elAngle = document.getElementById('grad-angle') as HTMLInputElement;
const elAngleVal = document.getElementById('angle-val')!;
const elAngleField = document.getElementById('angle-field')!;
const elStops = document.getElementById('stops')!;
const elPreview = document.getElementById('gradient-preview')!;
const elSize = document.getElementById('export-size') as HTMLSelectElement;
const elCss = document.getElementById('css-output') as HTMLTextAreaElement;
const elExportMsg = document.getElementById('export-msg')!;

const stopRows = Array.from(elStops.querySelectorAll<HTMLElement>('.stop-row'));
const S: PaletteState = structuredClone(DEFAULTS);

/* ── Color helpers ─────────────────────────────────────────────────── */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHex({ r, g, b }: Rgb): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0'))
      .join('')
  );
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function sortColors(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const ha = rgbToHsl(hexToRgb(a));
    const hb = rgbToHsl(hexToRgb(b));
    return ha.h - hb.h || ha.l - hb.l;
  });
}

function harmony(base: string, offsets: number[], sRange: [number, number], lRange: [number, number]): string[] {
  const { h } = rgbToHsl(hexToRgb(base));
  return offsets.map((offset, i) =>
    rgbToHex(
      hslToRgb(
        h + offset,
        sRange[0] + ((sRange[1] - sRange[0]) * i) / Math.max(1, offsets.length - 1),
        lRange[0] + ((lRange[1] - lRange[0]) * i) / Math.max(1, offsets.length - 1),
      ),
    ),
  );
}

/* ── Gradient geometry ─────────────────────────────────────────────── */

function orderedStops(): Stop[] {
  return S.stops.slice(0, MAX_STOPS).sort((a, b) => a.pos - b.pos);
}

function gradientCss(): string {
  const list = orderedStops()
    .map((s) => `${s.color} ${s.pos}%`)
    .join(', ');
  return S.type === 'radial'
    ? `radial-gradient(circle at center, ${list})`
    : `linear-gradient(${S.angle}deg, ${list})`;
}

/** CSS-style angle (0 = up, 90 = right) mapped onto a canvas gradient line. */
function gradientLine(angle: number, w: number, h: number): [number, number, number, number] {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const length = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return [cx - (dx * length) / 2, cy - (dy * length) / 2, cx + (dx * length) / 2, cy + (dy * length) / 2];
}

function paintGradient(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const stops = orderedStops();
  let grad: CanvasGradient;
  if (S.type === 'radial') {
    const radius = Math.hypot(w, h) / 2;
    grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, radius);
  } else {
    const [x0, y0, x1, y1] = gradientLine(S.angle, w, h);
    grad = ctx.createLinearGradient(x0, y0, x1, y1);
  }
  for (const s of stops) grad.addColorStop(clamp(s.pos, 0, 100) / 100, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function gradientSvg(w: number, h: number): string {
  const stops = orderedStops();
  const entries = stops
    .map((s) => `<stop offset="${clamp(s.pos, 0, 100)}%" stop-color="${s.color}"/>`)
    .join('');
  let def: string;
  if (S.type === 'radial') {
    def = `<radialGradient id="g" cx="50%" cy="50%" r="70%">${entries}</radialGradient>`;
  } else {
    const [x0, y0, x1, y1] = gradientLine(S.angle, w, h);
    def = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}">${entries}</linearGradient>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${def}</defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
}

/* ── Rendering ─────────────────────────────────────────────────────── */

function renderPalette(): void {
  elStrip.replaceChildren();
  elCount.textContent = `${S.palette.length} colors`;

  S.palette.forEach((hex) => {
    const item = document.createElement('div');
    item.className = 'swatch-item';
    item.setAttribute('role', 'listitem');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.setAttribute('aria-label', `Copy ${hex} to clipboard`);
    btn.innerHTML = `
      <span class="swatch-chip" style="background:${hex}"></span>
      <span class="swatch-hex">${hex}</span>
    `;
    btn.addEventListener('click', async () => {
      const ok = await copyText(hex);
      announce(ok ? `Copied ${hex}` : 'Could not copy to clipboard');
      flashExport(ok ? `Copied ${hex}` : 'Could not copy');
    });

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'swatch-use';
    send.title = 'Use in gradient';
    send.setAttribute('aria-label', `Use ${hex} in gradient`);
    send.innerHTML = iconSvg('arrow-right');
    send.addEventListener('click', () => {
      if (!S.stops[0]) return;
      S.stops[0].color = hex;
      render();
      persist();
      announce(`${hex} added to gradient`);
      flashExport(`${hex} added to gradient.`);
    });

    item.append(btn, send);
    elStrip.append(item);
  });
}

function renderStops(): void {
  const rows = S.stops.length;
  stopRows.forEach((row, i) => {
    row.hidden = i >= rows;
    const remove = row.querySelector<HTMLButtonElement>('[data-remove-stop]');
    if (remove) remove.disabled = rows <= MIN_STOPS;
  });
  document.getElementById('add-stop')?.toggleAttribute('disabled', rows >= MAX_STOPS);
}

function render(): void {
  elType.value = S.type;
  elAngle.value = String(S.angle);
  elAngleVal.textContent = `${S.angle}°`;
  elAngle.setAttribute('aria-valuetext', `${S.angle} degrees`);
  elAngleField.hidden = S.type !== 'linear';
  elSize.value = S.size;

  stopRows.forEach((row, i) => {
    const field = document.getElementById(`stop-${i}`);
    const posInput = row.querySelector<HTMLInputElement>('[data-pos-input]');
    const posVal = row.querySelector<HTMLElement>('[data-pos-val]');
    if (field && S.stops[i] && !field.dataset.cpBound) {
      setColorPickerValue(field, S.stops[i].color);
    } else if (field && S.stops[i]) {
      setColorPickerValue(field, S.stops[i].color);
    }
    if (posInput && S.stops[i]) {
      posInput.value = String(S.stops[i].pos);
      if (posVal) posVal.textContent = `${S.stops[i].pos}%`;
    }
  });

  renderStops();
  renderPalette();
  elPreview.style.backgroundImage = gradientCss();

  const vars = S.palette
    .map((hex, i) => `  --color-${i + 1}: ${hex};`)
    .join('\n');
  elCss.value = `:root {\n${vars}\n  --gradient: ${gradientCss()};\n}`;
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
function flashExport(message: string): void {
  elExportMsg.textContent = message;
  elExportMsg.classList.add('visible');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => elExportMsg.classList.remove('visible'), 2200);
}

/* ── State persistence ─────────────────────────────────────────────── */

const persist = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    history.replaceState(null, '', `${location.pathname}#s=${encodeURIComponent(JSON.stringify(S))}`);
  } catch {
    /* storage unavailable — the tool still works for this session */
  }
}, 400);

function restore(): void {
  let raw: string | null = null;
  const match = location.hash.match(/(?:^#|&)s=([^&]+)/);
  if (match) {
    try {
      raw = decodeURIComponent(match[1]);
    } catch {
      raw = null;
    }
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
  }
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<PaletteState>;
    if (Array.isArray(parsed.palette) && parsed.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))) {
      S.palette = parsed.palette.slice(0, 8);
    }
    if (Array.isArray(parsed.stops) && parsed.stops.length >= MIN_STOPS) {
      S.stops = parsed.stops.slice(0, MAX_STOPS).map((s) => ({
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ff4136',
        pos: clamp(Number(s.pos) || 0, 0, 100),
      }));
    }
    if (parsed.type === 'linear' || parsed.type === 'radial') S.type = parsed.type;
    if (typeof parsed.angle === 'number') S.angle = clamp(parsed.angle, 0, 360);
    if (typeof parsed.size === 'string' && /^\d+x\d+$/.test(parsed.size)) S.size = parsed.size;
  } catch {
    /* malformed saved state — keep defaults */
  }
}

/* ── Palette extraction ────────────────────────────────────────────── */

async function extractPalette(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = url;
    });

    const size = 72;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;

    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 8 || lum > 248) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }

    const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
    const picked: string[] = [];
    for (const bucket of ranked) {
      const rgb = {
        r: bucket.r / bucket.n,
        g: bucket.g / bucket.n,
        b: bucket.b / bucket.n,
      };
      if (picked.some((hex) => distance(hexToRgb(hex), rgb) < 42)) continue;
      picked.push(rgbToHex(rgb));
      if (picked.length === 6) break;
    }

    if (picked.length < 3) {
      const base = picked[0] ?? '#ff4136';
      for (const hex of harmony(base, [0, 28, 160, 190, 320], [0.45, 0.7], [0.35, 0.68])) {
        if (picked.length >= 6) break;
        if (!picked.includes(hex)) picked.push(hex);
      }
    }
    return sortColors(picked);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ── Events ────────────────────────────────────────────────────────── */

setupDropZone({
  zone: elDrop,
  input: elInput,
  accept: (file) => file.type.startsWith('image/'),
  onFiles: ([file]) => {
    if (!file) return;
    void extractPalette(file).then(
      (colors) => {
        S.palette = colors;
        elError.classList.remove('visible');
        render();
        persist();
        announce(`Extracted ${colors.length} colors from ${file.name}`);
      },
      () => {
        elError.classList.add('visible');
        announce('Could not read that image');
      },
    );
  },
});

document.getElementById('pal-random')?.addEventListener('click', () => {
  const base = rgbToHex(hslToRgb(Math.random() * 360, 0.6, 0.55));
  S.palette = sortColors(harmony(base, [0, 28, 160, 190, 320], [0.45, 0.75], [0.35, 0.7]));
  render();
  persist();
  announce('Generated a new palette');
});

document.getElementById('pal-reset')?.addEventListener('click', () => {
  Object.assign(S, structuredClone(DEFAULTS));
  render();
  persist();
  announce('Reset to defaults');
});

elType.addEventListener('change', () => {
  S.type = elType.value as PaletteState['type'];
  render();
  persist();
});

elAngle.addEventListener('input', () => {
  S.angle = clamp(parseInt(elAngle.value, 10) || 0, 0, 360);
  elAngleVal.textContent = `${S.angle}°`;
  elAngle.setAttribute('aria-valuetext', `${S.angle} degrees`);
  elPreview.style.backgroundImage = gradientCss();
  elCss.value = `:root {\n${S.palette.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n  --gradient: ${gradientCss()};\n}`;
  persist();
});

elSize.addEventListener('change', () => {
  S.size = elSize.value;
  persist();
});

stopRows.forEach((row, i) => {
  const field = document.getElementById(`stop-${i}`);
  field?.addEventListener('colorchange', (event) => {
    if (!S.stops[i]) return;
    S.stops[i].color = (event as CustomEvent<string>).detail;
    render();
    persist();
  });

  row.querySelector<HTMLInputElement>('[data-pos-input]')?.addEventListener('input', (event) => {
    if (!S.stops[i]) return;
    const input = event.target as HTMLInputElement;
    S.stops[i].pos = clamp(parseInt(input.value, 10) || 0, 0, 100);
    const label = row.querySelector<HTMLElement>('[data-pos-val]');
    if (label) label.textContent = `${S.stops[i].pos}%`;
    elPreview.style.backgroundImage = gradientCss();
    elCss.value = `:root {\n${S.palette.map((h, n) => `  --color-${n + 1}: ${h};`).join('\n')}\n  --gradient: ${gradientCss()};\n}`;
    persist();
  });

  row.querySelector<HTMLButtonElement>('[data-remove-stop]')?.addEventListener('click', () => {
    if (S.stops.length <= MIN_STOPS) return;
    S.stops.splice(i, 1);
    render();
    persist();
  });
});

document.getElementById('add-stop')?.addEventListener('click', () => {
  if (S.stops.length >= MAX_STOPS) return;
  const last = S.stops[S.stops.length - 1];
  S.stops.push({
    color: S.palette[S.stops.length % S.palette.length] ?? '#f1f1f1',
    pos: clamp(Math.round(last.pos + 12), 0, 100),
  });
  render();
  persist();
});

document.getElementById('apply-palette')?.addEventListener('click', () => {
  const colors = S.palette.slice(0, 5);
  if (colors.length < 2) return;
  const count = Math.min(MAX_STOPS, Math.max(MIN_STOPS, colors.length));
  S.stops = Array.from({ length: count }, (_, i) => ({
    color: colors[i % colors.length],
    pos: Math.round((100 * i) / (count - 1)),
  }));
  render();
  persist();
  announce(`Applied ${count} palette colors to the gradient`);
});

document.getElementById('copy-css')?.addEventListener('click', async () => {
  const ok = await copyText(elCss.value);
  announce(ok ? 'CSS copied to clipboard' : 'Could not copy CSS');
  flashExport(ok ? 'CSS copied to clipboard.' : 'Could not copy CSS.');
});

document.getElementById('download-png')?.addEventListener('click', () => {
  const [w, h] = S.size.split('x').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  paintGradient(ctx, w, h);
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, `s17-gradient-${w}x${h}.png`);
      announce('Gradient downloaded as PNG');
      flashExport('PNG downloaded.');
    }
  }, 'image/png');
});

document.getElementById('download-svg')?.addEventListener('click', () => {
  const [w, h] = S.size.split('x').map(Number);
  const svg = gradientSvg(w, h);
  downloadUrl(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), 's17-gradient.svg');
  announce('Gradient downloaded as SVG');
  flashExport('SVG downloaded.');
});

restore();
render();
