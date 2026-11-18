// Paint the filled portion of a range input up to its thumb.
// Firefox does this natively with ::-moz-range-progress; WebKit needs a
// CSS variable because ::-webkit-slider-runnable-track cannot read the value.

export function paintRangeFill(range: HTMLInputElement): void {
  const min = Number(range.min || 0);
  const max = Number(range.max || 100);
  const span = max - min;
  const value = Number(range.value);
  const percent = span > 0 ? ((value - min) / span) * 100 : 0;
  range.style.setProperty('--range-progress', `${Math.min(100, Math.max(0, percent))}%`);
}

function initRangeFills(): void {
  document.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((range) => {
    paintRangeFill(range);
    range.addEventListener('input', () => paintRangeFill(range));
    range.addEventListener('change', () => paintRangeFill(range));
  });
}

/* Setting `value` from JavaScript never fires input/change, so a palette
   randomisation (or any other programmatic update) left the painted trail
   behind the thumb. Patch the setter once so every range stays in sync,
   including ranges created later. */
let patched = false;
function patchRangeValueSetter(): void {
  if (patched) return;
  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!descriptor?.get || !descriptor.set) return;
  const originalSet = descriptor.set;
  Object.defineProperty(proto, 'value', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(this: HTMLInputElement, value: string) {
      originalSet.call(this, value);
      if (this.type === 'range') paintRangeFill(this);
    },
  });
  patched = true;
}

patchRangeValueSetter();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRangeFills);
} else {
  initRangeFills();
}
