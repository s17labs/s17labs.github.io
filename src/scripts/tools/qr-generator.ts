import QRCode from 'qrcode';
import { announce, debounce, downloadUrl } from './lib';

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

/** Byte-mode capacity per error-correction level (matches the ec-hint copy). */
const EC_CAPACITY: Record<QrState['ec'], number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

const elInput = document.getElementById('qr-input') as HTMLTextAreaElement;
const elSize = document.getElementById('qr-size') as HTMLInputElement;
const elSizeVal = document.getElementById('size-val')!;
const elEC = document.getElementById('qr-ec') as HTMLSelectElement;
const elContainer = document.getElementById('qr-container')!;
const elPlaceholder = document.getElementById('qr-placeholder')!;
const elCharCount = document.getElementById('char-count')!;
const elErrorMsg = document.getElementById('error-msg')!;
const elExportMsg = document.getElementById('export-msg')!;
const elBtnPNG = document.getElementById('btn-png') as HTMLButtonElement;
const elBtnSVG = document.getElementById('btn-svg') as HTMLButtonElement;

function isSameColor(a: string, b: string): boolean {
  return a.replace('#', '').toLowerCase() === b.replace('#', '').toLowerCase();
}

function showMsg(el: HTMLElement, show: boolean): void {
  el.classList.toggle('visible', show);
}

function flashExport(format: string): void {
  showMsg(elExportMsg, true);
  elExportMsg.textContent = `Downloaded successfully as ${format}.`;
  announce(`QR code downloaded as ${format}`);
  setTimeout(() => showMsg(elExportMsg, false), 2000);
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

const scheduleUpdate = debounce(() => void generateQR(), 300);
let qrSeq = 0; // guards against interleaved generations wiping each other

async function generateQR(): Promise<void> {
  const seq = ++qrSeq;
  const text = S.text.trim();

  if (!text) {
    showMsg(elErrorMsg, true);
    elErrorMsg.textContent = 'Please enter some text or a URL.';
    clearPreview();
    return;
  }
  if (isSameColor(S.fg, S.bg)) {
    showMsg(elErrorMsg, true);
    elErrorMsg.textContent = 'Foreground and background colors match — the QR code would be unscannable.';
    clearPreview();
    return;
  }
  showMsg(elErrorMsg, false);

  clearPreview();
  elPlaceholder.style.display = 'none';

  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Generated QR code preview');
  elContainer.appendChild(canvas);

  try {
    await QRCode.toCanvas(canvas, text, {
      width: S.size,
      color: { dark: S.fg, light: S.bg },
      errorCorrectionLevel: S.ec,
      margin: 4,
    });
    if (seq !== qrSeq) return; // superseded while rendering

    canvas.style.borderRadius = '2px';
    S.ready = true;
    elBtnPNG.disabled = false;
    elBtnSVG.disabled = false;
  } catch (err) {
    if (seq !== qrSeq) return; // a newer run owns the preview now
    console.error('QR generation error:', err);
    clearPreview();
    showMsg(elErrorMsg, true);
    elErrorMsg.textContent = 'Could not generate QR code for this input.';
  }
}

async function exportPNG(): Promise<void> {
  const text = S.text.trim();
  if (!text) return;

  try {
    // 2× render size keeps PNG exports crisp on high-density screens.
    const dataURL = await QRCode.toDataURL(text, {
      width: S.size * 2,
      color: { dark: S.fg, light: S.bg },
      errorCorrectionLevel: S.ec,
      margin: 4,
    });

    downloadUrl(dataURL, 'qrcode.png');
    flashExport('PNG');
  } catch (err) {
    console.error('PNG export error:', err);
    showMsg(elErrorMsg, true);
    elErrorMsg.textContent = 'PNG export failed — try again.';
  }
}

async function exportSVG(): Promise<void> {
  const text = S.text.trim();
  if (!text) return;

  try {
    const svgString = await QRCode.toString(text, {
      width: S.size,
      color: { dark: S.fg, light: S.bg },
      errorCorrectionLevel: S.ec,
      margin: 4,
      type: 'svg',
    });

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, 'qrcode.svg');
    flashExport('SVG');
  } catch (err) {
    console.error('SVG export error:', err);
    showMsg(elErrorMsg, true);
    elErrorMsg.textContent = 'SVG export failed — try again.';
  }
}

/** ColorField.astro handles picker ↔ hex sync and emits the normalized color. */
function watchColorField(id: string, key: 'fg' | 'bg'): void {
  document.getElementById(id)?.addEventListener('colorchange', (event) => {
    S[key] = (event as CustomEvent<string>).detail;
    scheduleUpdate();
  });
}

elInput.addEventListener('input', () => {
  S.text = elInput.value;
  updateCharCount();
  if (S.text.trim()) showMsg(elErrorMsg, false);
  scheduleUpdate();
});

elSize.addEventListener('input', () => {
  // Slider bounds don't stop typed/programmatic values — clamp (matches min/max).
  S.size = Math.min(512, Math.max(128, parseInt(elSize.value) || 256));
  elSize.value = String(S.size);
  elSizeVal.textContent = S.size + ' px';
  elSize.setAttribute('aria-valuetext', `${S.size} pixels`);
  scheduleUpdate();
});

elEC.addEventListener('change', () => {
  S.ec = elEC.value as QrState['ec'];
  updateCapacity();
  scheduleUpdate();
});

watchColorField('qr-fg', 'fg');
watchColorField('qr-bg', 'bg');

const byteLen = new TextEncoder();

function updateCharCount(): void {
  const max = EC_CAPACITY[S.ec];
  // Capacity is bytes, not UTF-16 units — CJK/emoji cost 3–4 bytes each.
  const len = byteLen.encode(elInput.value).length;
  elCharCount.textContent = `${len} / ${max}`;
  elCharCount.classList.toggle('warn', len > max * 0.7);
}

/** Clamp the input to the selected level's capacity (also enforced by maxlength). */
function updateCapacity(): void {
  const max = EC_CAPACITY[S.ec];
  elInput.maxLength = max;
  while (byteLen.encode(elInput.value).length > max) {
    elInput.value = elInput.value.slice(0, -1);
    S.text = elInput.value;
  }
  updateCharCount();
}

updateCapacity();

elBtnPNG.addEventListener('click', exportPNG);
elBtnSVG.addEventListener('click', exportSVG);

elSizeVal.textContent = S.size + ' px';
elSize.setAttribute('aria-valuetext', `${S.size} pixels`);