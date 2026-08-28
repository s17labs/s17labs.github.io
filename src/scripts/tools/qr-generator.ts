import QRCode from '../../lib/qrcode.js';

interface QrState {
  text: string;
  size: number;
  ec: 'L' | 'M' | 'Q' | 'H';
  fg: string;
  bg: string;
  ready: boolean;
}

const S: QrState = {
  text: '',
  size: 256,
  ec: 'M',
  fg: '#f1f1f1',
  bg: '#0e0e10',
  ready: false,
};

let qrInstance: unknown = null;

const elInput = document.getElementById('qr-input') as HTMLTextAreaElement;
const elSize = document.getElementById('qr-size') as HTMLInputElement;
const elSizeVal = document.getElementById('size-val')!;
const elEC = document.getElementById('qr-ec') as HTMLSelectElement;
const elFgPicker = document.getElementById('qr-fg-picker') as HTMLInputElement;
const elFgHex = document.getElementById('qr-fg-hex') as HTMLInputElement;
const elBgPicker = document.getElementById('qr-bg-picker') as HTMLInputElement;
const elBgHex = document.getElementById('qr-bg-hex') as HTMLInputElement;
const elContainer = document.getElementById('qr-container')!;
const elPlaceholder = document.getElementById('qr-placeholder')!;
const elCharCount = document.getElementById('char-count')!;
const elErrorMsg = document.getElementById('error-msg')!;
const elExportMsg = document.getElementById('export-msg')!;
const elBtnPNG = document.getElementById('btn-png') as HTMLButtonElement;
const elBtnSVG = document.getElementById('btn-svg') as HTMLButtonElement;

/* ── Helpers ────────────────────────────────────────── */
function hexToFull(h: string): string {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h.toUpperCase().padEnd(6, '0').slice(0, 6);
}
void hexToFull;

function isValidHex(h: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(h.replace('#', ''));
}

function dl(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

function showMsg(el: HTMLElement, show: boolean): void {
  el.classList.toggle('visible', show);
}

function flashExport(): void {
  showMsg(elExportMsg, true);
  setTimeout(() => showMsg(elExportMsg, false), 2000);
}

/* ── QR generation ──────────────────────────────────── */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpdate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(generateQR, 300);
}

function generateQR(): void {
  const text = S.text.trim();

  if (!text) {
    showMsg(elErrorMsg, true);
    clearPreview();
    return;
  }
  showMsg(elErrorMsg, false);

  clearPreview();
  elPlaceholder.style.display = 'none';

  const qrDiv = document.createElement('div');
  qrDiv.id = 'qr-inner-' + Date.now();
  elContainer.appendChild(qrDiv);

  try {
    const QRCodeLib = QRCode as unknown as {
      new (el: HTMLElement, opts: Record<string, unknown>): unknown;
      CorrectLevel: Record<string, unknown>;
    };
    qrInstance = new QRCodeLib(qrDiv, {
      text: text,
      width: S.size,
      height: S.size,
      colorDark: S.fg,
      colorLight: S.bg,
      correctLevel: QRCodeLib.CorrectLevel[S.ec],
    });

    // qrcodejs may create a canvas AND an img; hide the img, keep canvas
    setTimeout(() => {
      const qrDivCurrent = elContainer.querySelector<HTMLDivElement>('[id^="qr-inner-"]');
      const canvas = qrDivCurrent?.querySelector('canvas');
      const img = qrDivCurrent?.querySelector('img');
      if (img) img.style.display = 'none';
      if (canvas) canvas.style.borderRadius = '2px';
      S.ready = true;
      elBtnPNG.disabled = false;
      elBtnSVG.disabled = false;
    }, 50);
    void qrInstance;
  } catch (err) {
    console.error('QR generation error:', err);
    clearPreview();
    elErrorMsg.textContent = 'Could not generate QR code for this input.';
    showMsg(elErrorMsg, true);
  }
}

function clearPreview(): void {
  for (const el of [...elContainer.children]) {
    if (el !== elPlaceholder) el.remove();
  }
  elPlaceholder.style.display = 'flex';
  S.ready = false;
  elBtnPNG.disabled = true;
  elBtnSVG.disabled = true;
}

/* ── Get current canvas ─────────────────────────────── */
function getCanvas(): HTMLCanvasElement | null {
  return elContainer.querySelector('canvas');
}

/* ── PNG Export ─────────────────────────────────────── */
function exportPNG(): void {
  const canvas = getCanvas();
  if (!canvas) return;

  // Render at 2x for crisp exports
  const size = S.size * 2;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, size, size);

  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    dl(url, 'qrcode.png');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flashExport();
  }, 'image/png');
}

/* ── SVG Export ─────────────────────────────────────── */
function exportSVG(): void {
  // Re-derive the module matrix by reading pixel data from the canvas
  const canvas = getCanvas();
  if (!canvas) return;

  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, size, size);

  const fgR = parseInt(S.fg.slice(1, 3), 16);
  const fgG = parseInt(S.fg.slice(3, 5), 16);
  const fgB = parseInt(S.fg.slice(5, 7), 16);

  function isFG(x: number, y: number): boolean {
    const i = (y * size + x) * 4;
    const d = imgData.data;
    return Math.abs(d[i] - fgR) < 20 && Math.abs(d[i + 1] - fgG) < 20 && Math.abs(d[i + 2] - fgB) < 20;
  }

  // Find module size: scan horizontally for first fg run in top row area
  let modSize = 1;
  let quietStart = 0;
  for (let x = 0; x < size; x++) {
    if (isFG(x, Math.floor(size * 0.15))) {
      quietStart = x;
      break;
    }
  }
  let firstEnd = quietStart;
  for (let x = quietStart; x < size; x++) {
    if (!isFG(x, Math.floor(size * 0.15))) {
      firstEnd = x;
      break;
    }
  }
  modSize = Math.max(1, firstEnd - quietStart);
  const modules = Math.round(size / modSize);

  // Sample modules
  const grid: number[][] = [];
  for (let row = 0; row < modules; row++) {
    grid[row] = [];
    for (let col = 0; col < modules; col++) {
      const px = Math.floor(col * modSize + modSize / 2);
      const py = Math.floor(row * modSize + modSize / 2);
      grid[row][col] = isFG(px, py) ? 1 : 0;
    }
  }

  // Build SVG path
  const svgSize = 256;
  const cellPx = svgSize / modules;
  let rects = '';

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (grid[row][col]) {
        const x = (col * cellPx).toFixed(2);
        const y = (row * cellPx).toFixed(2);
        const w = cellPx.toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}"/>`;
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">
  <rect width="${svgSize}" height="${svgSize}" fill="${S.bg}"/>
  <g fill="${S.fg}">${rects}</g>
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  dl(url, 'qrcode.svg');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flashExport();
}

/* ── Color sync helpers ─────────────────────────────── */
function syncColor(picker: HTMLInputElement, hexInput: HTMLInputElement, key: 'fg' | 'bg'): void {
  picker.addEventListener('input', () => {
    const val = picker.value; // #rrggbb
    hexInput.value = val.replace('#', '').toUpperCase();
    S[key] = val;
    scheduleUpdate();
  });

  hexInput.addEventListener('input', () => {
    const raw = hexInput.value.replace('#', '');
    if (isValidHex(raw)) {
      const full = '#' + raw.toUpperCase();
      picker.value = full;
      S[key] = full;
      scheduleUpdate();
    }
  });

  hexInput.addEventListener('blur', () => {
    const raw = hexInput.value.replace('#', '');
    if (isValidHex(raw)) {
      hexInput.value = raw.toUpperCase();
    } else {
      hexInput.value = S[key].replace('#', '').toUpperCase();
    }
  });
}

/* ── Event listeners ────────────────────────────────── */
elInput.addEventListener('input', () => {
  S.text = elInput.value;
  const len = elInput.value.length;
  elCharCount.textContent = `${len} / 2953`;
  elCharCount.classList.toggle('warn', len > 2000);
  if (S.text.trim()) showMsg(elErrorMsg, false);
  scheduleUpdate();
});

elSize.addEventListener('input', () => {
  S.size = parseInt(elSize.value);
  elSizeVal.textContent = S.size + ' px';
  scheduleUpdate();
});

elEC.addEventListener('change', () => {
  S.ec = elEC.value as QrState['ec'];
  scheduleUpdate();
});

syncColor(elFgPicker, elFgHex, 'fg');
syncColor(elBgPicker, elBgHex, 'bg');

elBtnPNG.addEventListener('click', exportPNG);
elBtnSVG.addEventListener('click', exportSVG);

/* ── Init ───────────────────────────────────────────── */
elSizeVal.textContent = S.size + ' px';
