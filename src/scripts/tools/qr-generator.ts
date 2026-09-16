import QRCode from 'qrcode';
import { debounce, downloadUrl, normalizeHex } from './lib';

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

function isSameColor(a: string, b: string): boolean {
  return a.replace('#', '').toLowerCase() === b.replace('#', '').toLowerCase();
}

function showMsg(el: HTMLElement, show: boolean): void {
  el.classList.toggle('visible', show);
}

function flashExport(): void {
  showMsg(elExportMsg, true);
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

async function generateQR(): Promise<void> {
  const text = S.text.trim();

  if (!text) {
    elErrorMsg.textContent = 'Please enter some text or a URL.';
    showMsg(elErrorMsg, true);
    clearPreview();
    return;
  }
  if (isSameColor(S.fg, S.bg)) {
    elErrorMsg.textContent = 'Foreground and background colors match — the QR code would be unscannable.';
    showMsg(elErrorMsg, true);
    clearPreview();
    return;
  }
  showMsg(elErrorMsg, false);

  clearPreview();
  elPlaceholder.style.display = 'none';

  const canvas = document.createElement('canvas');
  elContainer.appendChild(canvas);

  try {
    await QRCode.toCanvas(canvas, text, {
      width: S.size,
      color: { dark: S.fg, light: S.bg },
      errorCorrectionLevel: S.ec,
      margin: 4,
    });

    canvas.style.borderRadius = '2px';
    S.ready = true;
    elBtnPNG.disabled = false;
    elBtnSVG.disabled = false;
  } catch (err) {
    console.error('QR generation error:', err);
    clearPreview();
    elErrorMsg.textContent = 'Could not generate QR code for this input.';
    showMsg(elErrorMsg, true);
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
    flashExport();
  } catch (err) {
    console.error('PNG export error:', err);
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
    flashExport();
  } catch (err) {
    console.error('SVG export error:', err);
  }
}

function syncColor(picker: HTMLInputElement, hexInput: HTMLInputElement, key: 'fg' | 'bg'): void {
  picker.addEventListener('input', () => {
    hexInput.value = picker.value.replace('#', '').toUpperCase();
    S[key] = picker.value;
    scheduleUpdate();
  });

  hexInput.addEventListener('input', () => {
    const hex = normalizeHex(hexInput.value);
    if (hex) {
      hexInput.removeAttribute('aria-invalid');
      hexInput.value = hex.replace('#', '');
      S[key] = hex;
      // <input type=color> expects lowercase #rrggbb.
      picker.value = hex.toLowerCase();
      scheduleUpdate();
    } else {
      hexInput.setAttribute('aria-invalid', 'true');
    }
  });

  hexInput.addEventListener('blur', () => {
    const hex = normalizeHex(hexInput.value);
    hexInput.removeAttribute('aria-invalid');
    if (hex) {
      hexInput.value = hex.replace('#', '');
      S[key] = hex;
      picker.value = hex.toLowerCase();
    } else {
      hexInput.value = S[key].replace('#', '').toUpperCase();
    }
  });
}

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

elSizeVal.textContent = S.size + ' px';