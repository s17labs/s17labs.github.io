/* Shared browser helpers for s17 Labs Tools.
   Import only what a tool needs — this module stays dependency-free so
   lightweight tools (qr-generator, case-converter) don't pull in JSZip. */

export interface Debounced {
  (...args: []): void;
}

/** Trailing-edge debounce with a fresh timer per call site. */
export function debounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Anchor-tag download. Blob URLs are revoked after `revokeAfterMs`. */
export function downloadUrl(url: string, name: string, revokeAfterMs = 1000): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

/** Blob download via a temporary object URL. */
export function downloadBlob(blob: Blob, name: string): void {
  downloadUrl(URL.createObjectURL(blob), name);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Validate a hex color and normalize it to uppercase `#RRGGBB`, or null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX_RE.test(withHash) ? withHash.toUpperCase() : null;
}

/** Clipboard write with a textarea+execCommand fallback. Resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(file);
  });
}

export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Split `archive.tar.gz` → `{ base: 'archive.tar', ext: 'gz' }`.
    Extensionless names (and dotfiles) yield `ext: ''` instead of
    mistaking the whole name for an extension. */
export function splitFileName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() };
}

/** Append files, deduping on name+size+lastModified so re-picking never
    duplicates or discards the current selection. Mutates and returns `files`. */
export function appendDedupeFiles(files: File[], incoming: File[] | FileList | undefined | null): File[] {
  if (!incoming?.length) return files;
  const seen = new Set(files.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
  for (const f of incoming) {
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    if (!seen.has(key)) {
      seen.add(key);
      files.push(f);
    }
  }
  return files;
}

export interface DropZoneOptions {
  zone: HTMLElement;
  input: HTMLInputElement;
  /** Optional in-zone button (e.g. "Add / Change") that opens the picker itself. */
  changeButton?: HTMLElement | null;
  accept: (file: File) => boolean;
  onFiles: (files: File[]) => void;
}

/** Wire click/keyboard/drag-drop/file-picker on an upload drop zone. */
export function setupDropZone({ zone, input, changeButton, accept, onFiles }: DropZoneOptions): void {
  const openPicker = (): void => input.click();
  const changeSelector = changeButton ? `#${changeButton.id}` : '[data-dz-change]';

  zone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest(changeSelector)) return;
    openPicker();
  });

  zone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if ((e.target as HTMLElement).closest(changeSelector)) return;
    e.preventDefault();
    openPicker();
  });

  changeButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPicker();
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget as Node)) zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    onFiles([...(e.dataTransfer?.files ?? [])].filter(accept));
  });

  input.addEventListener('change', () => {
    onFiles([...(input.files ?? [])].filter(accept));
    input.value = '';
  });
}

export interface UploadGridOptions {
  grid: HTMLElement;
  emptyEl: HTMLElement;
  filledEl: HTMLElement;
  countLabel: HTMLElement;
  files: File[];
  countText: (n: number) => string;
  renderTile: (file: File) => HTMLElement;
}

/** Render the upload preview grid: up to 5 plain tiles on desktop
    (7 on mobile) plus a solid/dimmed `+N` overflow tile. */
export function renderUploadGrid({
  grid,
  emptyEl,
  filledEl,
  countLabel,
  files,
  countText,
  renderTile,
}: UploadGridOptions): void {
  grid.innerHTML = '';

  const maxPlain = window.innerWidth <= 580 ? 7 : 5;
  for (const file of files.slice(0, maxPlain)) grid.appendChild(renderTile(file));

  const overflow = files.length - maxPlain;
  if (overflow > 0) {
    if (window.innerWidth <= 580 && files[maxPlain]) {
      const tile = renderTile(files[maxPlain]);
      tile.classList.add('overflow-img');
      const dim = document.createElement('div');
      dim.className = 'overflow-dim';
      dim.innerHTML = `<span>+${overflow}</span>`;
      tile.appendChild(dim);
      grid.appendChild(tile);
    } else {
      const tile = document.createElement('div');
      tile.className = 'dz-thumb overflow-solid';
      tile.innerHTML = `<span>+${overflow}</span>`;
      grid.appendChild(tile);
    }
  }

  countLabel.textContent = countText(files.length);
  emptyEl.style.display = 'none';
  filledEl.classList.add('visible');
}

/** Rasterize an SVG string to a PNG blob. */
export function svgTextToPngBlob(svgText: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D unavailable');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error('Raster failed'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG render failed'));
    };
    img.src = url;
  });
}

export interface RasterizedSvg {
  blob: Blob;
  width: number;
  height: number;
}

/** Rasterize an SVG string, auto-sizing height from its aspect ratio. */
export function rasterizeSvg(svgText: string, targetW: number): Promise<RasterizedSvg> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const probe = new Image();
    probe.onload = () => {
      if (!probe.naturalWidth || !probe.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error('SVG has no dimensions'));
        return;
      }
      const ratio = probe.naturalHeight / probe.naturalWidth;
      const outW = targetW;
      const outH = Math.max(1, Math.round(outW * ratio));
      URL.revokeObjectURL(url);
      svgTextToPngBlob(svgText, outW, outH).then(
        (blob) => resolve({ blob, width: outW, height: outH }),
        reject,
      );
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG render failed'));
    };
    probe.src = url;
  });
}

export interface ResultItemOptions {
  thumb: HTMLElement;
  name: string;
  /** Inner HTML for the `.result-meta` line. */
  metaHtml: string;
  downloadIconHtml: string;
  onDownload: () => void;
}

/** Build a finished `Download All` results row (thumbnail + info + Save button). */
export function makeResultItem({
  thumb,
  name,
  metaHtml,
  downloadIconHtml,
  onDownload,
}: ResultItemOptions): { item: HTMLDivElement; dlBtn: HTMLButtonElement } {
  const item = document.createElement('div');
  item.className = 'result-item';

  const info = document.createElement('div');
  info.className = 'result-info';
  const nameEl = document.createElement('div');
  nameEl.className = 'result-name';
  nameEl.textContent = name;
  const meta = document.createElement('div');
  meta.className = 'result-meta';
  meta.innerHTML = metaHtml;
  info.append(nameEl, meta);

  const dlBtn = document.createElement('button');
  dlBtn.className = 'result-dl';
  dlBtn.type = 'button';
  dlBtn.innerHTML = `${downloadIconHtml} Save`;
  dlBtn.addEventListener('click', onDownload);

  item.append(thumb, info, dlBtn);
  return { item, dlBtn };
}

/** Build a `Processing…` placeholder results row, replaced via `makeResultItem`. */
export function makePlaceholderItem(opts: {
  fileName: string;
  statusHtml: string;
  downloadIconHtml: string;
}): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
      <div class="result-thumb placeholder"></div>
      <div class="result-info">
        <div class="result-name"></div>
        <div class="result-meta">${opts.statusHtml}</div>
      </div>
      <button class="result-dl" disabled>${opts.downloadIconHtml} Save</button>`;
  item.querySelector('.result-name')!.textContent = opts.fileName;
  return item;
}

export interface ResultsUI {
  list: HTMLElement;
  panel: HTMLElement;
  progressWrap: HTMLElement;
  progressFill: HTMLElement;
  actionBtn: HTMLButtonElement;
}

/** Reset the results panel to its empty state. */
export function resetResultsUI({ list, panel, progressWrap, progressFill, actionBtn }: ResultsUI): void {
  list.innerHTML = '';
  panel.style.display = 'none';
  progressWrap.classList.remove('visible');
  progressFill.style.width = '0%';
  actionBtn.disabled = true;
}
