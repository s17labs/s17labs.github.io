import { iconSvg } from '../../icons';
import {
  announce,
  appendDedupeFiles,
  downloadBlob,
  formatKB,
  makePlaceholderItem,
  makeResultItem,
  readFileAsDataURL,
  renderUploadGrid,
  resetResultsUI,
  setupDropZone,
  splitFileName,
} from './lib';
import { downloadResultsAsZip, updateZipButton, type ZipExportOptions } from './zip-export';

type Format = 'original' | 'jpeg' | 'png' | 'webp';

// Guard against allocating a giant canvas (same safety bound as the other image tools).
const MAX_SIDE = 4096;

// ── State ──────────────────────────────────────────────────────────────────
let files: File[] = [];
let results: { blob: Blob; name: string }[] = [];
let format: Format = 'original';
let quality = 0.8;
let totalIn = 0;
let totalOut = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dzEmpty = document.getElementById('dz-empty')!;
const dzFilled = document.getElementById('dz-filled')!;
const dzGrid = document.getElementById('dz-preview-grid')!;
const dzCountLabel = document.getElementById('dz-count-label')!;
const dzChangeBtn = document.getElementById('dz-change-btn')!;
const formatBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('#format-row .choice-btn'));
const qualityInput = document.getElementById('quality') as HTMLInputElement;
const qualityValue = document.getElementById('quality-value')!;
const qualityField = document.getElementById('quality-field')!;
const qualityNote = document.getElementById('quality-note')!;
const compressBtn = document.getElementById('compress-btn') as HTMLButtonElement;
const resultsPanel = document.getElementById('results-panel')!;
const resultsList = document.getElementById('results-list')!;
const summary = document.getElementById('compress-summary')!;
const dlAllBtn = document.getElementById('dl-all-btn') as HTMLButtonElement;
const dlIcon = document.getElementById('dl-icon')!;
const dlLabel = document.getElementById('dl-label')!;
const zipWrap = document.getElementById('zip-progress-wrap')!;
const zipFill = document.getElementById('zip-progress-fill')!;
const zipLabel = document.getElementById('zip-progress-label')!;

// Object URLs for upload previews (revoked on re-render to avoid leaks)
let previewUrls: string[] = [];

// Object URLs for result thumbnails (revoked when results are cleared)
let thumbUrls: string[] = [];

const zipOpts = (): ZipExportOptions => ({
  results,
  zipName: () => `compressed-images-${Date.now()}.zip`,
  kindWord: 'images',
  packingHtml: `${iconSvg('circle-notch', 'spin')} Packing ZIP…`,
  singleIconHtml: iconSvg('download'),
  multiIconHtml: iconSvg('file-zipper'),
  singleLabel: 'Download Image',
  multiLabel: (n) => `Download All (${n})`,
  ui: {
    button: dlAllBtn,
    iconSlot: dlIcon,
    labelSlot: dlLabel,
    progressWrap: zipWrap,
    progressFill: zipFill,
    progressLabel: zipLabel,
  },
});

// ── Format + quality settings ──────────────────────────────────────────────
function setFormat(next: Format): void {
  format = next;
  for (const btn of formatBtns) {
    const on = btn.dataset.format === next;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  // PNG ignores quality — dim and disable the slider so it can't mislead.
  const lossless = next === 'png';
  qualityField.classList.toggle('inactive', lossless);
  qualityInput.disabled = lossless;
  qualityNote.textContent = lossless
    ? 'PNG is lossless — quality does not apply.'
    : next === 'original'
      ? 'Applies to JPEG and WebP inputs. PNG stays lossless.'
      : `Applies to ${next === 'jpeg' ? 'JPEG' : 'WebP'} output. Lower means smaller files.`;
}

for (const btn of formatBtns) {
  btn.addEventListener('click', () => setFormat(btn.dataset.format as Format));
}

qualityInput.addEventListener('input', () => {
  quality = Number(qualityInput.value) / 100;
  qualityValue.textContent = `${qualityInput.value}%`;
});

setFormat('original');

// ── Drop zone interactions ─────────────────────────────────────────────────
setupDropZone({
  zone: dropZone,
  input: fileInput,
  changeButton: dzChangeBtn,
  accept: (f) => f.type.startsWith('image/'),
  onFiles: addFiles,
});

function addFiles(newFiles: File[]): void {
  appendDedupeFiles(files, newFiles);
  if (!files.length) return;
  renderUploadPreview();
  clearResults();
  compressBtn.disabled = false;
}

function renderUploadPreview(): void {
  for (const u of previewUrls) URL.revokeObjectURL(u);
  previewUrls = [];
  renderUploadGrid({
    grid: dzGrid,
    emptyEl: dzEmpty,
    filledEl: dzFilled,
    countLabel: dzCountLabel,
    zone: dropZone,
    files,
    countText: (n) => `${n} image${n !== 1 ? 's' : ''} selected`,
    renderTile: (file) => {
      const tile = document.createElement('div');
      tile.className = 'dz-thumb';
      const img = document.createElement('img');
      img.alt = file.name;
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url;
      tile.appendChild(img);
      return tile;
    },
  });
}

window.addEventListener('resize', () => {
  if (files.length) renderUploadPreview();
});

// ── Output encoding ────────────────────────────────────────────────────────
function outputMime(file: File): string {
  if (format !== 'original') {
    return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
  }
  const { ext } = splitFileName(file.name);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  // GIF/BMP/etc. can't be encoded by canvas — fall back to lossless PNG.
  return 'image/png';
}

function extForMime(mime: string): string {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}

// ── Compress ───────────────────────────────────────────────────────────────
compressBtn.addEventListener('click', () => {
  if (!files.length) return;
  clearResults();
  resultsPanel.style.display = '';
  results = [];
  totalIn = 0;
  totalOut = 0;
  dlAllBtn.disabled = true;
  resultsList.setAttribute('aria-busy', 'true');

  let done = 0;
  let failed = 0;

  for (const file of files) {
    processFile(file, (ok) => {
      if (!ok) failed++;
      done++;
      if (done === files.length) {
        resultsList.setAttribute('aria-busy', 'false');
        updateZipButton(zipOpts(), results.length);
        dlAllBtn.disabled = results.length === 0;
        renderSummary();

        const n = results.length;
        const diff = totalIn - totalOut;
        const pct = totalIn > 0 ? Math.round((diff / totalIn) * 100) : 0;
        const saving = diff === 0 ? 'no size change' : diff > 0 ? `saved ${pct}%` : `${Math.abs(pct)}% larger`;
        announce(`${n} image${n === 1 ? '' : 's'} compressed — ${saving}${failed ? `, ${failed} failed` : ''}`);
      }
    });
  }
});

function processFile(file: File, onDone?: (ok: boolean) => void): void {
  const requestedMime = outputMime(file);
  const usesQuality = requestedMime === 'image/jpeg' || requestedMime === 'image/webp';

  const item = makePlaceholderItem({
    fileName: file.name,
    statusHtml: `${iconSvg('circle-notch', 'spin')} Compressing…`,
    downloadIconHtml: iconSvg('download'),
  });
  resultsList.appendChild(item);

  const fail = (msg: string): void => {
    const meta = item.querySelector('.result-meta');
    if (meta) meta.textContent = msg;
    announce(msg);
    onDone?.(false);
  };

  readFileAsDataURL(file).then(
    (dataUrl) => {
      const img = new Image();
      img.onerror = () => fail(`Failed to load ${file.name} — file may be corrupt.`);
      img.onload = () => {
        try {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (!w || !h) throw new Error(`${file.name} has no image data.`);

          const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const capped = scale < 1;

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D unavailable');

          // Canvas leaves transparent pixels black in JPEG — paint white first.
          if (requestedMime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail(`Failed to encode ${file.name}.`);
                return;
              }

              // Re-encoding can inflate an already-optimized file. In
              // "Original" mode (no explicit target format), keep the source
              // when the re-encode isn't smaller.
              const keptOriginal = format === 'original' && blob.size >= file.size;
              const outBlob: Blob = keptOriginal ? file : blob;

              // If the browser can't encode the requested format, it silently
              // returns a PNG — reflect the real type in the filename/meta.
              const usedMime = blob.type || requestedMime;
              const fallback = usedMime !== requestedMime;
              const ext = extForMime(usedMime);
              const { base } = splitFileName(file.name);
              const outName = keptOriginal ? file.name : `${base}-compressed.${ext}`;

              const pct = file.size > 0 ? Math.round((1 - outBlob.size / file.size) * 100) : 0;
              const savingHtml = keptOriginal
                ? '<span class="meta-kept">kept original &mdash; already optimal</span>'
                : `<span class="${pct >= 0 ? 'meta-saved' : 'meta-larger'}">${pct >= 0 ? `saved ${pct}%` : `${Math.abs(pct)}% larger`}</span>`;
              const cappedHtml = capped && !keptOriginal ? ' &middot; scaled to fit' : '';
              const fallbackHtml = fallback && !keptOriginal ? ' &middot; PNG fallback' : '';

              const thumbUrl = URL.createObjectURL(outBlob);
              thumbUrls.push(thumbUrl);
              const thumb = document.createElement('img');
              thumb.src = thumbUrl;
              thumb.className = 'result-thumb';
              thumb.alt = outName;

              const { item: doneItem } = makeResultItem({
                thumb,
                name: outName,
                metaHtml: `${formatKB(file.size)} &rarr; ${formatKB(outBlob.size)} &middot; ${savingHtml}${cappedHtml}${fallbackHtml}`,
                downloadIconHtml: iconSvg('download'),
                onDownload: () => downloadBlob(outBlob, outName),
              });
              item.replaceWith(doneItem);

              results.push({ blob: outBlob, name: outName });
              totalIn += file.size;
              totalOut += outBlob.size;
              onDone?.(true);
            },
            requestedMime,
            usesQuality ? quality : undefined,
          );
        } catch (e) {
          fail(e instanceof Error ? e.message : 'Compression failed.');
        }
      };
      img.src = dataUrl;
    },
    (err: Error) => fail(err.message),
  );
}

function renderSummary(): void {
  if (!results.length) {
    summary.textContent = '';
    return;
  }
  const diff = totalIn - totalOut;
  const pct = totalIn > 0 ? Math.round((diff / totalIn) * 100) : 0;
  const saved = diff >= 0;
  const change = diff === 0
    ? 'no size change'
    : `${saved ? 'saved' : 'added'} ${formatKB(Math.abs(diff))} (${Math.abs(pct)}%)`;
  summary.innerHTML = `${results.length} image${results.length !== 1 ? 's' : ''} &middot; <span class="${diff === 0 ? '' : saved ? 'saved' : 'larger'}">${change}</span>`;
}

// ── Download All → single or ZIP ───────────────────────────────────────────
dlAllBtn.addEventListener('click', () => void downloadResultsAsZip(zipOpts()));

// ── Clear results ──────────────────────────────────────────────────────────
function clearResults(): void {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls = [];
  results = [];
  totalIn = 0;
  totalOut = 0;
  summary.textContent = '';
  resultsList.setAttribute('aria-busy', 'false');
  resetResultsUI({
    list: resultsList,
    panel: resultsPanel,
    progressWrap: zipWrap,
    progressFill: zipFill,
    actionBtn: dlAllBtn,
  });
}
