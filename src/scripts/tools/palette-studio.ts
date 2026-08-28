/* Palette Studio — fully local, no deps */

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

// ── Color utils ──────────────────────────────────────────────────────────────
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string): Rgb | null {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m[0] + m[0] + m[1] + m[1] + m[2] + m[2] : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const v = parseInt(full, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const tc = [hk + 1 / 3, hk, hk - 1 / 3];
  const rgb = tc.map((t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  });
  return { r: Math.round(rgb[0] * 255), g: Math.round(rgb[1] * 255), b: Math.round(rgb[2] * 255) };
}

function rgbToStr(rgb: Rgb): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

// ── WCAG contrast ──────────────────────────────────────────────────────────
function luminancer(c: Rgb): number {
  const s = [c.r, c.g, c.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function contrast(a: Rgb, b: Rgb): number {
  const la = luminancer(a), lb = luminancer(b);
  const l1 = Math.max(la, lb), l2 = Math.min(la, lb);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ── Harmony generators — always return 5 hexes, first is base ─────────────
function generatePalette(baseHex: string, mode: string): string[] {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const out: string[] = [baseHex.toUpperCase()];
  const pushHsl = (h: number, s = hsl.s, l = hsl.l): void => {
    const c = hslToRgb(h, s, l);
    out.push(rgbToHex(c.r, c.g, c.b));
  };

  switch (mode) {
    case 'complementary': {
      pushHsl((hsl.h + 180) % 360);
      pushHsl((hsl.h + 30) % 360, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 8, 0, 100));
      pushHsl((hsl.h + 180 + 30) % 360, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 8, 0, 100));
      pushHsl(hsl.h, clamp(hsl.s - 20, 0, 100), clamp(hsl.l - 12, 0, 100));
      break;
    }
    case 'triadic': {
      pushHsl((hsl.h + 120) % 360);
      pushHsl((hsl.h + 240) % 360);
      pushHsl((hsl.h + 60) % 360, clamp(hsl.s - 8, 0, 100), clamp(hsl.l + 10, 0, 100));
      pushHsl((hsl.h + 180) % 360, clamp(hsl.s - 15, 0, 100), clamp(hsl.l - 10, 0, 100));
      break;
    }
    case 'tetradic': {
      pushHsl((hsl.h + 90) % 360);
      pushHsl((hsl.h + 180) % 360);
      pushHsl((hsl.h + 270) % 360);
      pushHsl((hsl.h + 45) % 360, clamp(hsl.s - 12, 0, 100), clamp(hsl.l + 8, 0, 100));
      break;
    }
    case 'split': {
      pushHsl((hsl.h + 150) % 360);
      pushHsl((hsl.h + 210) % 360);
      pushHsl((hsl.h + 30) % 360, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 6, 0, 100));
      pushHsl((hsl.h + 180) % 360, clamp(hsl.s - 18, 0, 100), clamp(hsl.l - 8, 0, 100));
      break;
    }
    case 'monochromatic': {
      pushHsl(hsl.h, clamp(hsl.s + 10, 0, 100), clamp(hsl.l + 18, 0, 100));
      pushHsl(hsl.h, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 32, 0, 100));
      pushHsl(hsl.h, clamp(hsl.s + 5, 0, 100), clamp(hsl.l - 18, 0, 100));
      pushHsl(hsl.h, clamp(hsl.s - 15, 0, 100), clamp(hsl.l - 32, 0, 100));
      break;
    }
    case 'shades': {
      pushHsl(hsl.h, hsl.s, clamp(hsl.l + 22, 0, 100));
      pushHsl(hsl.h, hsl.s, clamp(hsl.l + 40, 0, 100));
      pushHsl(hsl.h, hsl.s, clamp(hsl.l - 18, 0, 100));
      pushHsl(hsl.h, hsl.s, clamp(hsl.l - 34, 0, 100));
      break;
    }
    case 'analogous':
    default: {
      pushHsl((hsl.h + 30) % 360);
      pushHsl((hsl.h - 30 + 360) % 360);
      pushHsl((hsl.h + 60) % 360, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 5, 0, 100));
      pushHsl((hsl.h - 60 + 360) % 360, clamp(hsl.s - 10, 0, 100), clamp(hsl.l + 5, 0, 100));
      break;
    }
  }
  return out.slice(0, 5);
}

// ── DOM ────────────────────────────────────────────────────────────────────
const elBasePreview = document.getElementById('base-preview') as HTMLElement;
const elBasePicker = document.getElementById('base-picker') as HTMLInputElement;
const elBaseHex = document.getElementById('base-hex') as HTMLInputElement;
const elRgbR = document.getElementById('rgb-r') as HTMLInputElement;
const elRgbG = document.getElementById('rgb-g') as HTMLInputElement;
const elRgbB = document.getElementById('rgb-b') as HTMLInputElement;
const elRandom = document.getElementById('random-btn') as HTMLButtonElement;
const elHarmonyGrid = document.getElementById('harmony-grid')!;
const elPaletteGrid = document.getElementById('palette-grid')!;
const elCopyMsg = document.getElementById('copy-msg')!;
const elPickerCanvas = document.getElementById('picker-canvas') as HTMLCanvasElement;
const elPickerCursor = document.getElementById('picker-cursor') as HTMLElement;
const elPickerWrap = document.getElementById('picker-wrap') as HTMLElement;
const elHue = document.getElementById('hue-slider') as HTMLInputElement;
const elDropZone = document.getElementById('drop-zone') as HTMLElement;
const elDzEmpty = document.getElementById('dz-empty') as HTMLElement;
const elImgInput = document.getElementById('img-input') as HTMLInputElement;
const elImgPreview = document.getElementById('img-preview') as HTMLImageElement;
const elImgCanvas = document.getElementById('img-canvas') as HTMLCanvasElement;
const elExtractedRow = document.getElementById('extracted-row') as HTMLElement;
const elExtractedColors = document.getElementById('extracted-colors') as HTMLElement;
const elDzActions = document.getElementById('dz-actions') as HTMLElement;
const elChangeImageBtn = document.getElementById('change-image-btn') as HTMLButtonElement;
const elRemoveImageBtn = document.getElementById('remove-image-btn') as HTMLButtonElement;
const elUseDominantBtn = document.getElementById('use-dominant-btn') as HTMLButtonElement;
const elExportTabs = document.getElementById('export-tabs')!;
const elExportCode = document.getElementById('export-code')!;
const elExportCopy = document.getElementById('export-copy') as HTMLButtonElement;
const elBtnPng = document.getElementById('btn-png') as HTMLButtonElement;
const elBtnCss = document.getElementById('btn-css') as HTMLButtonElement;

let lastExtracted: string[] = [];

let state = {
  hex: '#FF4136',
  hsl: rgbToHsl(255, 65, 54),
  mode: 'analogous' as string,
  palette: [] as string[],
  exportTab: 'css' as 'css' | 'tailwind' | 'json',
  sv: { s: 1, v: 1 }, // position in picker
};

// ── Picker canvas logic (reused pattern from icon-maker but local) ─────────
function drawPicker(): void {
  const ctx = elPickerCanvas.getContext('2d')!;
  const w = elPickerCanvas.width, h = elPickerCanvas.height;
  const hueHex = rgbToHex(...Object.values(hslToRgb(state.hsl.h, 100, 50)) as [number, number, number]);
  const gH = ctx.createLinearGradient(0, 0, w, 0);
  gH.addColorStop(0, '#fff');
  gH.addColorStop(1, hueHex);
  ctx.fillStyle = gH;
  ctx.fillRect(0, 0, w, h);
  const gV = ctx.createLinearGradient(0, 0, 0, h);
  gV.addColorStop(0, 'transparent');
  gV.addColorStop(1, '#000');
  ctx.fillStyle = gV;
  ctx.fillRect(0, 0, w, h);
}

function updateCursor(): void {
  const r = elPickerWrap.getBoundingClientRect();
  elPickerCursor.style.left = state.sv.s * r.width + 'px';
  elPickerCursor.style.top = (1 - state.sv.v) * r.height + 'px';
}

function setPickerFromHsl(): void {
  state.sv.s = state.hsl.s / 100;
  state.sv.v = state.hsl.l < 50 ? (state.hsl.l / 50) * (1 - state.sv.s * 0.5) + 0.5 * state.sv.s : state.hsl.l / 100;
  // Actually we store explicit SV independent; simpler: derive SV from saturation & a hacked value
  // For correctness, we keep SV synced to actual color; use saturation for x, and a pseudo-value derived from l
  // Instead just recompute: s = hsl.s/100, v = 1 - ( (50 - hsl.l) / 50 *0.5 ) ?? simpler keep as before
  // We'll just compute directly: s = hsl.s/100, v = clamp(hsl.l/100 + 0.3, 0,1) — but for interaction we trust picking loop
  // So we re-derive approximatively:
  state.sv.s = clamp(state.hsl.s / 100, 0, 1);
  state.sv.v = clamp(1 - (100 - state.hsl.l) / 100 * 0.7 + 0.15, 0, 1);
  // Not perfect but cursor will be close; picking will correct
}

function syncPicker(): void {
  drawPicker();
  updateCursor();
  elHue.value = String(Math.round(state.hsl.h));
}

function applyPickerSV(): void {
  const r = hslToRgb(state.hsl.h, state.sv.s * 100, (state.sv.v * 50 + 25));
  // Actually HSV-ish: better to convert SV + hue to HSL via hsvToHsl? Simplify: use hslToRgb with s=sv.s, l= sv.v * 60+20
  // Instead use true HSV->RGB then RGB->hex via hsvToRgb
  const hsvRgb = hsvToRgb(state.hsl.h, state.sv.s, state.sv.v);
  state.hex = rgbToHex(hsvRgb.r, hsvRgb.g, hsvRgb.b);
  state.hsl = rgbToHsl(hsvRgb.r, hsvRgb.g, hsvRgb.b);
  updateFromHex(state.hex, false);
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const i = Math.floor(h / 60), f = h / 60 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const map: [number, number, number][] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]];
  const [r, g, b] = map[i];
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function applyBaseColor(hex: string): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  state.hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  state.sv.s = state.hsl.s / 100;
  state.sv.v = state.hsl.l / 100 * 0.8 + 0.2;
  syncInputs();
  syncPicker();
  renderPalette();
}

function updateFromHex(hex: string, doPickerUpdate: boolean): void {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  state.hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  syncInputs();
  if (doPickerUpdate) {
    drawPicker();
    updateCursor();
    elHue.value = String(Math.round(state.hsl.h));
  }
  renderPalette();
}

function syncInputs(): void {
  elBasePreview.style.background = state.hex;
  elBasePicker.value = state.hex;
  elBaseHex.value = state.hex.toUpperCase();
  const rgb = hexToRgb(state.hex)!;
  elRgbR.value = String(rgb.r);
  elRgbG.value = String(rgb.g);
  elRgbB.value = String(rgb.b);
}

// ── Palette rendering ──────────────────────────────────────────────────────
function renderPalette(): void {
  state.palette = generatePalette(state.hex, state.mode);
  elPaletteGrid.innerHTML = '';
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const black: Rgb = { r: 0, g: 0, b: 0 };
  for (const hex of state.palette) {
    const rgb = hexToRgb(hex)!;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cW = contrast(rgb, white);
    const cB = contrast(rgb, black);
    const bestOn = cW > cB ? white : black;
    const ratioBest = Math.max(cW, cB);
    const wcagPass = ratioBest >= 4.5;
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.title = 'Click to copy ' + hex;
    sw.innerHTML = `
      <div class="swatch-color" style="background:${hex}"></div>
      <div class="swatch-info">
        <div class="swatch-hex">${hex}</div>
        <div class="swatch-meta">
          <span>${rgbToStr(rgb)}</span>
        </div>
        <div class="swatch-meta">
          <span>hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)</span>
        </div>
        <div class="swatch-meta">
          <span class="wcag ${wcagPass ? 'pass' : 'fail'}" style="color:${wcagPass ? '' : (bestOn === white ? '#fff' : '#000')}; background:${hex}">${ratioBest.toFixed(1)}:1 ${wcagPass ? 'AA' : ''}</span>
          <span style="opacity:0.6">on ${bestOn === white ? 'white' : 'black'}</span>
        </div>
      </div>
    `;
    sw.addEventListener('click', () => {
      navigator.clipboard.writeText(hex).then(() => {
        elCopyMsg.textContent = `Copied ${hex}`;
        elCopyMsg.classList.add('visible');
        setTimeout(() => elCopyMsg.classList.remove('visible'), 1400);
      });
    });
    elPaletteGrid.appendChild(sw);
  }
  renderExport();
}

function renderExport(): void {
  const palette = state.palette;
  if (elExportTabs.querySelector('.export-tab.active')?.getAttribute('data-tab')) {
    state.exportTab = elExportTabs.querySelector('.export-tab.active')!.getAttribute('data-tab') as typeof state.exportTab;
  }
  let text = '';
  if (state.exportTab === 'css') {
    text = `:root {\n${palette.map((c, i) => `  --color-${i + 1}: ${c}; /* ${rgbToStr(hexToRgb(c)!)} */`).join('\n')}\n}\n\n/* usage */\n/* background: var(--color-1); */`;
  } else if (state.exportTab === 'tailwind') {
    const obj: Record<string, string> = {};
    palette.forEach((c, i) => obj[`brand-${i + 1}`] = c);
    text = `// tailwind.config.js — extend colors\n{\n  "colors": {\n${palette.map((c, i) => `    "brand-${i + 1}": "${c}"`).join(',\n')}\n  }\n}`;
  } else {
    text = JSON.stringify({ palette, base: state.hex, mode: state.mode, generated: new Date().toISOString() }, null, 2);
  }
  elExportCode.textContent = text;
}

// ── Events ─────────────────────────────────────────────────────────────────
elBasePicker.addEventListener('input', () => applyBaseColor(elBasePicker.value));
elBaseHex.addEventListener('input', () => {
  let v = elBaseHex.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) applyBaseColor(v);
});
elBaseHex.addEventListener('blur', () => { elBaseHex.value = state.hex.toUpperCase(); });

for (const inp of [elRgbR, elRgbG, elRgbB]) {
  inp.addEventListener('input', () => {
    const r = clamp(parseInt(elRgbR.value) || 0, 0, 255);
    const g = clamp(parseInt(elRgbG.value) || 0, 0, 255);
    const b = clamp(parseInt(elRgbB.value) || 0, 0, 255);
    applyBaseColor(rgbToHex(r, g, b));
  });
}

elHarmonyGrid.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.harmony-btn');
  if (!btn) return;
  state.mode = btn.dataset.mode!;
  for (const b of elHarmonyGrid.querySelectorAll<HTMLElement>('.harmony-btn')) b.classList.toggle('active', b === btn);
  renderPalette();
});

elRandom.addEventListener('click', () => {
  const h = Math.floor(Math.random() * 360);
  const s = 70 + Math.floor(Math.random() * 30);
  const l = 45 + Math.floor(Math.random() * 18);
  const c = hslToRgb(h, s, l);
  applyBaseColor(rgbToHex(c.r, c.g, c.b));
});

// Picker interactions
function pickerPos(e: MouseEvent | TouchEvent): { s: number; v: number } {
  const r = elPickerWrap.getBoundingClientRect();
  const cx = (e instanceof MouseEvent ? e.clientX : e.touches[0].clientX) - r.left;
  const cy = (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY) - r.top;
  return { s: clamp(cx / r.width, 0, 1), v: clamp(1 - cy / r.height, 0, 1) };
}
function handlePicker(e: MouseEvent | TouchEvent): void {
  const { s, v } = pickerPos(e);
  state.sv = { s, v };
  elPickerCursor.style.left = s * elPickerWrap.offsetWidth + 'px';
  elPickerCursor.style.top = (1 - v) * elPickerWrap.offsetHeight + 'px';
  const rgb = hsvToRgb(state.hsl.h, s, v);
  state.hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  syncInputs();
  renderPalette();
}
elPickerWrap.addEventListener('mousedown', (e) => {
  e.preventDefault();
  handlePicker(e);
  const move = (ev: MouseEvent) => handlePicker(ev);
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});
elPickerWrap.addEventListener('touchstart', (e) => {
  e.preventDefault();
  handlePicker(e);
  const move = (ev: TouchEvent) => { ev.preventDefault(); handlePicker(ev); };
  const end = () => { window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
}, { passive: false });

elHue.addEventListener('input', () => {
  state.hsl.h = parseInt(elHue.value);
  const rgb = hsvToRgb(state.hsl.h, state.sv.s, state.sv.v);
  state.hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  drawPicker();
  syncInputs();
  renderPalette();
});

// Image extract
function extractColors(img: HTMLImageElement): void {
  const c = elImgCanvas;
  const ctx = c.getContext('2d')!;
  const maxW = 200;
  const scale = Math.min(1, maxW / img.naturalWidth);
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  // Simple quantization: bucket by 32 steps, pick most frequent
  const buckets = new Map<string, number>();
  const bucketToRgb = new Map<string, Rgb>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i + 1] / 32) * 32;
    const b = Math.round(data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
    if (!bucketToRgb.has(key)) bucketToRgb.set(key, { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) });
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Filter similar
  const out: string[] = [];
  for (const [key] of sorted) {
    const rgb = bucketToRgb.get(key)!;
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (!out.includes(hex) && out.length < 6) {
      // distance check
      let tooClose = false;
      for (const ex of out) {
        const er = hexToRgb(ex)!;
        const dist = Math.sqrt((er.r - rgb.r) ** 2 + (er.g - rgb.g) ** 2 + (er.b - rgb.b) ** 2);
        if (dist < 40) { tooClose = true; break; }
      }
      if (!tooClose) out.push(hex);
    }
  }
  lastExtracted = out;
  elExtractedColors.innerHTML = '';
  for (const hex of out) {
    const sw = document.createElement('div');
    sw.className = 'extracted-swatch';
    sw.style.background = hex;
    sw.title = hex + ' — click to use as base';
    sw.addEventListener('click', () => applyBaseColor(hex));
    elExtractedColors.appendChild(sw);
  }
  const hasColors = out.length > 0;
  elExtractedRow.style.display = hasColors ? '' : 'none';
  elUseDominantBtn.style.display = hasColors ? '' : 'none';
  elUseDominantBtn.textContent = hasColors ? `Use ${out[0]} as base` : 'Use dominant color as base';
}

function clearImage(): void {
  elImgPreview.removeAttribute('src');
  elImgPreview.style.display = 'none';
  elDzEmpty.style.display = '';
  elImgInput.value = '';
  elExtractedColors.innerHTML = '';
  elExtractedRow.style.display = 'none';
  elDzActions.style.display = 'none';
  elUseDominantBtn.style.display = 'none';
  lastExtracted = [];
}

function loadImage(file: File): void {
  const url = URL.createObjectURL(file);
  elImgPreview.src = url;
  elImgPreview.style.display = '';
  elDzEmpty.style.display = 'none';
  elDzActions.style.display = 'flex';
  elImgPreview.onload = () => {
    extractColors(elImgPreview);
    URL.revokeObjectURL(url);
  };
  elImgPreview.onerror = () => {
    URL.revokeObjectURL(url);
    clearImage();
  };
}

elDropZone.addEventListener('click', () => elImgInput.click());
elImgInput.addEventListener('change', () => {
  const f = elImgInput.files?.[0];
  if (f) loadImage(f);
});
elDropZone.addEventListener('dragover', (e) => { e.preventDefault(); elDropZone.classList.add('drag-over'); });
elDropZone.addEventListener('dragleave', () => elDropZone.classList.remove('drag-over'));
elDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elDropZone.classList.remove('drag-over');
  const f = e.dataTransfer?.files[0];
  if (f && f.type.startsWith('image/')) loadImage(f);
});
elChangeImageBtn.addEventListener('click', (e) => { e.stopPropagation(); elImgInput.click(); });
elRemoveImageBtn.addEventListener('click', (e) => { e.stopPropagation(); clearImage(); });
elUseDominantBtn.addEventListener('click', () => { if (lastExtracted.length) applyBaseColor(lastExtracted[0]); });

// Export tabs
elExportTabs.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.export-tab');
  if (!b) return;
  for (const x of elExportTabs.querySelectorAll<HTMLElement>('.export-tab')) x.classList.toggle('active', x === b);
  state.exportTab = b.dataset.tab as typeof state.exportTab;
  renderExport();
});
elExportCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(elExportCode.textContent || '').then(() => {
    elExportCopy.classList.add('copied');
    setTimeout(() => elExportCopy.classList.remove('copied'), 1600);
  });
});

// PNG export — 5 vertical strips
elBtnPng.addEventListener('click', () => {
  const c = document.createElement('canvas');
  const W = 800, H = 200, pad = 0;
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const sw = W / state.palette.length;
  for (let i = 0; i < state.palette.length; i++) {
    ctx.fillStyle = state.palette[i];
    ctx.fillRect(i * sw + pad, pad, sw - pad, H - pad * 2);
  }
  c.toBlob((b) => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = 'palette.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});
elBtnCss.addEventListener('click', () => {
  const text = elExportCode.textContent || '';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const ext = state.exportTab === 'json' ? 'json' : state.exportTab === 'tailwind' ? 'js' : 'css';
  const a = document.createElement('a');
  a.href = url; a.download = `palette.${ext}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ── Init ───────────────────────────────────────────────────────────────────
applyBaseColor(state.hex);
syncPicker();
renderPalette();
