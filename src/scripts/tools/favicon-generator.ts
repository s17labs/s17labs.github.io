import { announce, copyText, debounce, setupDropZone } from './lib';
import { setColorPickerValue } from './color-picker';
import { downloadResultsAsZip, updateZipButton, type ZipExportOptions } from './zip-export';
import { iconSvg } from '../../icons';

interface Options {
  name: string;
  theme: string;
  bg: string;
  transparent: boolean;
  radius: number;
  padding: number;
  sizes: number[];
  ico: boolean;
}

const STORAGE_KEY = 's17-favicon-generator-v1';
const ALL_SIZES = [16, 32, 48, 64, 180, 192, 256, 512];

const DEFAULTS: Options = {
  name: 'My App',
  theme: '#0e0e10',
  bg: '#0e0e10',
  transparent: false,
  radius: 18,
  padding: 8,
  sizes: [16, 32, 48, 180, 192, 512],
  ico: true,
};

const elDrop = document.getElementById('fav-drop')!;
const elInput = document.getElementById('fav-input') as HTMLInputElement;
const elError = document.getElementById('fav-error')!;
const elReady = document.getElementById('fav-ready')!;
const elName = document.getElementById('app-name') as HTMLInputElement;
const elThemeField = document.getElementById('theme-color')!;
const elBgField = document.getElementById('bg-color')!;
const elTransparent = document.getElementById('bg-transparent') as HTMLInputElement;
const elRadius = document.getElementById('fav-radius') as HTMLInputElement;
const elRadiusVal = document.getElementById('radius-val')!;
const elPadding = document.getElementById('fav-padding') as HTMLInputElement;
const elPaddingVal = document.getElementById('padding-val')!;
const elSizeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('#sizes-grid input[type="checkbox"]'),
);
const elIco = document.getElementById('include-ico') as HTMLInputElement;
const elPreview = document.getElementById('fav-preview') as HTMLCanvasElement;
const elPreviewSmall = document.getElementById('fav-preview-small') as HTMLCanvasElement;
const elManifest = document.getElementById('manifest-output') as HTMLTextAreaElement;
const elHtml = document.getElementById('html-output') as HTMLTextAreaElement;
const elExportMsg = document.getElementById('export-msg')!;
const elProgress = document.getElementById('zip-progress')!;
const elFill = document.getElementById('zip-fill')!;
const elProgressLabel = document.getElementById('zip-label')!;

const O: Options = structuredClone(DEFAULTS);
let source: HTMLImageElement | null = null;
let sourceUrl: string | null = null;
let results: { blob: Blob; name: string }[] = [];

/* ── Drawing ───────────────────────────────────────────────────────── */

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawIcon(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, 0, 0, size, size, (O.radius * size) / 100);
  ctx.clip();

  if (!O.transparent) {
    ctx.fillStyle = O.bg;
    ctx.fillRect(0, 0, size, size);
  }

  if (source) {
    const sw = source.naturalWidth || source.width || size;
    const sh = source.naturalHeight || source.height || size;
    const box = size * (1 - (2 * O.padding) / 100);
    const scale = Math.min(box / sw, box / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
  }
  ctx.restore();
}

function drawPreview(): void {
  const a = elPreview.getContext('2d');
  const b = elPreviewSmall.getContext('2d');
  if (a) drawIcon(a, elPreview.width);
  if (b) drawIcon(b, elPreviewSmall.width);
}

function renderPng(size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'));
  drawIcon(ctx, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

async function buildIco(sizes: number[]): Promise<Blob> {
  const entries: { size: number; data: Uint8Array }[] = [];
  for (const size of sizes) {
    const blob = await renderPng(size);
    entries.push({ size, data: new Uint8Array(await blob.arrayBuffer()) });
  }

  const header = 6;
  const directory = 16 * entries.length;
  let offset = header + directory;
  const total = offset + entries.reduce((sum, e) => sum + e.data.length, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);

  entries.forEach((entry, i) => {
    const p = header + i * 16;
    const dim = entry.size >= 256 ? 0 : entry.size;
    view.setUint8(p, dim);
    view.setUint8(p + 1, dim);
    view.setUint8(p + 2, 0);
    view.setUint8(p + 3, 0);
    view.setUint16(p + 4, 1, true);
    view.setUint16(p + 6, 32, true);
    view.setUint32(p + 8, entry.data.length, true);
    view.setUint32(p + 12, offset, true);
    offset += entry.data.length;
  });

  const bytes = new Uint8Array(buffer);
  let pos = header + directory;
  for (const entry of entries) {
    bytes.set(entry.data, pos);
    pos += entry.data.length;
  }
  return new Blob([buffer], { type: 'image/x-icon' });
}

/* ── Outputs ───────────────────────────────────────────────────────── */

function fileName(size: number): string {
  return size === 180 ? 'apple-touch-icon.png' : `favicon-${size}x${size}.png`;
}

function renderOutputs(): void {
  const iconEntries = O.sizes
    .filter((size) => size >= 180)
    .sort((a, b) => a - b)
    .map((size) => ({
      src: `/${fileName(size)}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    }));

  const manifest = {
    name: O.name.trim() || 'App',
    short_name: (O.name.trim() || 'App').slice(0, 12),
    icons: iconEntries,
    theme_color: O.theme,
    background_color: O.bg,
    display: 'standalone',
    start_url: '/',
  };
  elManifest.value = JSON.stringify(manifest, null, 2);

  const lines = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    ...O.sizes
      .filter((size) => size <= 64)
      .sort((a, b) => a - b)
      .map(
        (size) =>
          `<link rel="icon" type="image/png" sizes="${size}x${size}" href="/${fileName(size)}">`,
      ),
  ];
  if (O.sizes.includes(180)) lines.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  lines.push('<link rel="manifest" href="/manifest.webmanifest">');
  lines.push(`<meta name="theme-color" content="${O.theme}">`);
  elHtml.value = lines.join('\n');

  if (!O.ico) {
    const first = lines.findIndex((line) => line.includes('favicon.ico'));
    if (first >= 0) lines.splice(first, 1);
    elHtml.value = lines.join('\n');
  }
}

const zipOptions: ZipExportOptions = {
  results,
  zipName: () => `s17-icons-${Date.now()}.zip`,
  kindWord: 'icons',
  packingHtml: '<span>Working…</span>',
  singleIconHtml: iconSvg('download'),
  multiIconHtml: iconSvg('file-zipper'),
  singleLabel: 'Download icon',
  multiLabel: (n) => `Download ${n} icons`,
  ui: {
    button: document.getElementById('download-all') as HTMLButtonElement,
    iconSlot: document.getElementById('zip-icon')!,
    labelSlot: document.getElementById('zip-label-btn')!,
    progressWrap: elProgress,
    progressFill: elFill,
    progressLabel: elProgressLabel,
  },
};

async function buildResults(): Promise<void> {
  results = [];
  for (const size of O.sizes.slice().sort((a, b) => a - b)) {
    results.push({ blob: await renderPng(size), name: fileName(size) });
  }
  if (O.ico) results.push({ blob: await buildIco([16, 32, 48]), name: 'favicon.ico' });
  results.push({
    blob: new Blob([new TextEncoder().encode(elManifest.value)], { type: 'application/manifest+json' }),
    name: 'manifest.webmanifest',
  });
  zipOptions.results = results;
  updateZipButton(zipOptions, results.length);
  (document.getElementById('download-all') as HTMLButtonElement).disabled = results.length === 0;
}

const scheduleBuild = debounce(() => {
  void buildResults();
}, 250);

/* ── State ─────────────────────────────────────────────────────────── */

const persist = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(O));
    history.replaceState(null, '', `${location.pathname}#s=${encodeURIComponent(JSON.stringify(O))}`);
  } catch {
    /* storage unavailable — options still apply for this session */
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
    const parsed = JSON.parse(raw) as Partial<Options>;
    if (typeof parsed.name === 'string') O.name = parsed.name.slice(0, 60);
    if (/^#[0-9a-f]{6}$/i.test(parsed.theme ?? '')) O.theme = parsed.theme!;
    if (/^#[0-9a-f]{6}$/i.test(parsed.bg ?? '')) O.bg = parsed.bg!;
    if (typeof parsed.transparent === 'boolean') O.transparent = parsed.transparent;
    if (typeof parsed.radius === 'number') O.radius = Math.max(0, Math.min(50, parsed.radius));
    if (typeof parsed.padding === 'number') O.padding = Math.max(0, Math.min(30, parsed.padding));
    if (Array.isArray(parsed.sizes)) {
      O.sizes = parsed.sizes.filter((s): s is number => ALL_SIZES.includes(s));
    }
    if (typeof parsed.ico === 'boolean') O.ico = parsed.ico;
  } catch {
    /* malformed saved state — keep defaults */
  }
}

function render(): void {
  elName.value = O.name;
  elTransparent.checked = O.transparent;
  elBgField.classList.toggle('cp-disabled', O.transparent);
  elRadius.value = String(O.radius);
  elRadiusVal.textContent = `${O.radius}%`;
  elRadius.setAttribute('aria-valuetext', `${O.radius} percent`);
  elPadding.value = String(O.padding);
  elPaddingVal.textContent = `${O.padding}%`;
  elPadding.setAttribute('aria-valuetext', `${O.padding} percent`);
  elIco.checked = O.ico;
  elSizeInputs.forEach((input) => {
    input.checked = O.sizes.includes(Number(input.value));
  });
  setColorPickerValue(elThemeField, O.theme);
  setColorPickerValue(elBgField, O.bg);
  drawPreview();
  renderOutputs();
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
function flash(message: string): void {
  elExportMsg.textContent = message;
  elExportMsg.classList.add('visible');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => elExportMsg.classList.remove('visible'), 2200);
}

/* ── Events ────────────────────────────────────────────────────────── */

setupDropZone({
  zone: elDrop,
  input: elInput,
  accept: (file) => /image\/(png|svg\+xml|webp|jpeg)/.test(file.type),
  onFiles: ([file]) => {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      source = img;
      elError.classList.remove('visible');
      elReady.classList.add('visible');
      drawPreview();
      void buildResults();
      announce(`Loaded ${file.name}`);
    };
    img.onerror = () => {
      source = null;
      elError.classList.add('visible');
      elReady.classList.remove('visible');
      announce('Could not read that image');
    };
    img.src = sourceUrl;
  },
});

elName.addEventListener('input', () => {
  O.name = elName.value;
  renderOutputs();
  void buildResults();
  persist();
});

elThemeField.addEventListener('colorchange', (event) => {
  O.theme = (event as CustomEvent<string>).detail;
  renderOutputs();
  void buildResults();
  persist();
});

elBgField.addEventListener('colorchange', (event) => {
  O.bg = (event as CustomEvent<string>).detail;
  drawPreview();
  renderOutputs();
  void buildResults();
  persist();
});

elTransparent.addEventListener('change', () => {
  O.transparent = elTransparent.checked;
  elBgField.classList.toggle('cp-disabled', O.transparent);
  drawPreview();
  void buildResults();
  persist();
});

elRadius.addEventListener('input', () => {
  O.radius = Math.max(0, Math.min(50, parseInt(elRadius.value, 10) || 0));
  elRadiusVal.textContent = `${O.radius}%`;
  elRadius.setAttribute('aria-valuetext', `${O.radius} percent`);
  drawPreview();
  scheduleBuild();
  persist();
});

elPadding.addEventListener('input', () => {
  O.padding = Math.max(0, Math.min(30, parseInt(elPadding.value, 10) || 0));
  elPaddingVal.textContent = `${O.padding}%`;
  elPadding.setAttribute('aria-valuetext', `${O.padding} percent`);
  drawPreview();
  scheduleBuild();
  persist();
});

elSizeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    O.sizes = elSizeInputs
      .filter((el) => el.checked)
      .map((el) => Number(el.value));
    renderOutputs();
    void buildResults();
    persist();
  });
});

elIco.addEventListener('change', () => {
  O.ico = elIco.checked;
  renderOutputs();
  void buildResults();
  persist();
});

document.getElementById('download-all')?.addEventListener('click', () => {
  void downloadResultsAsZip(zipOptions);
});

for (const [id, text, label] of [
  ['copy-manifest', elManifest, 'Manifest'],
  ['copy-html', elHtml, 'HTML snippet'],
] as const) {
  document.getElementById(id)?.addEventListener('click', async () => {
    const ok = await copyText(text.value);
    announce(ok ? `${label} copied to clipboard` : 'Could not copy');
    flash(ok ? `${label} copied.` : 'Could not copy.');
  });
}

restore();
render();
void buildResults();
