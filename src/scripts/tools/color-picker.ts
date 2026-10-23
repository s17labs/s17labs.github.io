// Shared color picker for every tool that needs a color (Icon Maker, QR
// Generator, …). Each [data-cp-field] block owns a swatch button, a hex
// input and its own popup (canvas + hue track + hex). Changes bubble as a
// `colorchange` CustomEvent whose detail is the new `#rrggbb`.
//
// Touch and mouse both work: the canvas tracks the pointer while it is
// pressed, and the popup closes on an outside click or Escape.

import { normalizeHex } from './lib';
import { paintRangeFill } from '../range-fill';

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

interface Picker {
  field: HTMLElement;
  row: HTMLElement;
  swatch: HTMLButtonElement;
  fill: HTMLElement;
  hexInput: HTMLInputElement;
  popup: HTMLElement;
  canvasWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  cursor: HTMLElement;
  hue: HTMLInputElement;
  preview: HTMLElement;
  hexPopup: HTMLInputElement;
  current: string;
  h: number;
  s: number;
  v: number;
}

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

function rgbToHsv(rIn: number, gIn: number, bIn: number): Hsv {
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
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** A field can be muted (Icon Maker's icon color in emoji mode). */
function isDisabled(field: HTMLElement): boolean {
  return field.classList.contains('cp-disabled') || field.hasAttribute('data-cp-disabled');
}

let openPicker: Picker | null = null;
let listenersAttached = false;

function toHex(p: Picker): string {
  const { r, g, b } = hsvToRgb(p.h, p.s, p.v);
  return rgbToHex(r, g, b);
}

function draw(p: Picker): void {
  const ctx = p.canvas.getContext('2d');
  if (!ctx) return;
  const W = p.canvas.width,
    H = p.canvas.height;
  const { r, g, b } = hsvToRgb(p.h, 1, 1);
  const gH = ctx.createLinearGradient(0, 0, W, 0);
  gH.addColorStop(0, '#fff');
  gH.addColorStop(1, rgbToHex(r, g, b));
  ctx.fillStyle = gH;
  ctx.fillRect(0, 0, W, H);
  const gV = ctx.createLinearGradient(0, 0, 0, H);
  gV.addColorStop(0, 'transparent');
  gV.addColorStop(1, '#000');
  ctx.fillStyle = gV;
  ctx.fillRect(0, 0, W, H);
}

function moveCursor(p: Picker): void {
  p.cursor.style.left = p.s * p.canvasWrap.offsetWidth + 'px';
  p.cursor.style.top = (1 - p.v) * p.canvasWrap.offsetHeight + 'px';
}

/** Push the current color into every control of the field. */
function sync(p: Picker): void {
  const hex = toHex(p);
  p.fill.style.background = hex;
  p.hexInput.value = hex;
  p.preview.style.background = hex;
  p.hexPopup.value = hex;
  p.hue.value = String(Math.round(p.h));
  paintRangeFill(p.hue);
  moveCursor(p);
}

function commit(p: Picker): void {
  p.current = toHex(p);
  sync(p);
  p.field.dispatchEvent(new CustomEvent<string>('colorchange', { detail: p.current, bubbles: true }));
}

/** Load a hex into the picker state (hue only moves when asked to). */
function applyHex(p: Picker, hex: string, updateHue: boolean): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (updateHue) p.h = hsv.h;
  p.s = hsv.s;
  p.v = hsv.v;
  draw(p);
  return true;
}

function position(p: Picker): void {
  const r = p.row.getBoundingClientRect();
  const pw = p.popup.offsetWidth || 220;
  const ph = p.popup.offsetHeight || 230;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = r.bottom + 6;
  let left = r.left;
  if (top + ph > vh - 8) top = r.top - ph - 6;
  if (left + pw > vw - 8) left = vw - pw - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  p.popup.style.top = top + 'px';
  p.popup.style.left = left + 'px';
}

function close(p: Picker): void {
  p.popup.classList.remove('visible');
  p.row.classList.remove('open');
  p.swatch.setAttribute('aria-expanded', 'false');
  if (openPicker === p) openPicker = null;
}

function open(p: Picker): void {
  if (openPicker && openPicker !== p) close(openPicker);
  openPicker = p;
  applyHex(p, p.current, true);
  // Show first: sync() measures the canvas box to place the cursor dot,
  // which reads 0×0 while the popup is display:none.
  p.popup.classList.add('visible');
  p.row.classList.add('open');
  p.swatch.setAttribute('aria-expanded', 'true');
  draw(p);
  sync(p);
  position(p);
}

function pickFromEvent(p: Picker, e: MouseEvent | TouchEvent): void {
  const rect = p.canvasWrap.getBoundingClientRect();
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX;
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY;
  const x = (clientX ?? 0) - rect.left;
  const y = (clientY ?? 0) - rect.top;
  p.s = Math.max(0, Math.min(1, x / rect.width));
  p.v = Math.max(0, Math.min(1, 1 - y / rect.height));
  commit(p);
}

function wire(p: Picker): void {
  p.swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isDisabled(p.field)) return;
    if (openPicker === p) close(p);
    else open(p);
  });

  // Typing a hex edits the color without opening the popup.
  p.hexInput.addEventListener('input', () => {
    const hex = normalizeHex(p.hexInput.value);
    if (!hex) {
      p.hexInput.setAttribute('aria-invalid', 'true');
      return;
    }
    p.hexInput.removeAttribute('aria-invalid');
    applyHex(p, hex, true);
    commit(p);
  });

  p.hexInput.addEventListener('blur', () => {
    p.hexInput.removeAttribute('aria-invalid');
    p.hexInput.value = p.current;
  });

  p.hexPopup.addEventListener('input', () => {
    const hex = normalizeHex(p.hexPopup.value);
    if (!hex) return;
    applyHex(p, hex, true);
    commit(p);
  });

  p.hue.addEventListener('input', () => {
    p.h = Number(p.hue.value);
    draw(p);
    commit(p);
  });

  p.canvasWrap.addEventListener('mousedown', (e) => {
    e.preventDefault();
    pickFromEvent(p, e);
    const move = (ev: MouseEvent) => pickFromEvent(p, ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  p.canvasWrap.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      pickFromEvent(p, e);
      const move = (ev: TouchEvent) => {
        ev.preventDefault();
        pickFromEvent(p, ev);
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
}

function createPicker(field: HTMLElement): Picker | null {
  const row = field.querySelector<HTMLElement>('[data-cp-row]');
  const swatch = field.querySelector<HTMLButtonElement>('[data-cp-swatch]');
  const fill = field.querySelector<HTMLElement>('[data-cp-fill]');
  const hexInput = field.querySelector<HTMLInputElement>('[data-cp-hex]');
  const popup = field.querySelector<HTMLElement>('[data-cp-popup]');
  const canvasWrap = field.querySelector<HTMLElement>('[data-cp-canvas-wrap]');
  const canvas = field.querySelector<HTMLCanvasElement>('[data-cp-canvas]');
  const cursor = field.querySelector<HTMLElement>('[data-cp-cursor]');
  const hue = field.querySelector<HTMLInputElement>('[data-cp-hue]');
  const preview = field.querySelector<HTMLElement>('[data-cp-preview]');
  const hexPopup = field.querySelector<HTMLInputElement>('[data-cp-hex-popup]');
  if (
    !row ||
    !swatch ||
    !fill ||
    !hexInput ||
    !popup ||
    !canvasWrap ||
    !canvas ||
    !cursor ||
    !hue ||
    !preview ||
    !hexPopup
  ) {
    return null;
  }

  const current = hexToRgb(hexInput.value) ? hexInput.value.replace('#', '').toLowerCase() : '#ffffff';
  const rgb = hexToRgb(current) ?? { r: 255, g: 255, b: 255 };
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  return {
    field,
    row,
    swatch,
    fill,
    hexInput,
    popup,
    canvasWrap,
    canvas,
    cursor,
    hue,
    preview,
    hexPopup,
    current: '#' + current,
    h: hsv.h,
    s: hsv.s,
    v: hsv.v,
  };
}

/** Wire every [data-cp-field] on the page. Safe to call more than once. */
export function initColorPickers(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-cp-field]').forEach((field) => {
    if (field.dataset.cpBound) return;
    const picker = createPicker(field);
    if (!picker) return;
    field.dataset.cpBound = 'true';
    wire(picker);
  });

  if (listenersAttached) return;
  listenersAttached = true;

  document.addEventListener('click', (e) => {
    if (!openPicker) return;
    const target = e.target as Node;
    if (openPicker.popup.contains(target) || openPicker.row.contains(target)) return;
    close(openPicker);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPicker) close(openPicker);
  });

  window.addEventListener('resize', () => {
    if (openPicker) position(openPicker);
  });
}
