import { iconSvg } from '../../icons';
import {
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

// ── State ──────────────────────────────────────────────────────────────────
let files: File[] = [];
let results: { blob: Blob; name: string }[] = []; // per processed image
let aspectLocked = true;
let aspectRatio = 800 / 600;
let lastChanged: 'w' | 'h' = 'w';

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dzEmpty = document.getElementById('dz-empty')!;
const dzFilled = document.getElementById('dz-filled')!;
const dzGrid = document.getElementById('dz-preview-grid')!;
const dzCountLabel = document.getElementById('dz-count-label')!;
const dzChangeBtn = document.getElementById('dz-change-btn')!;
const inputW = document.getElementById('input-w') as HTMLInputElement;
const inputH = document.getElementById('input-h') as HTMLInputElement;
const resizeBtn = document.getElementById('resize-btn') as HTMLButtonElement;
const resultsPanel = document.getElementById('results-panel')!;
const resultsList = document.getElementById('results-list')!;
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
  zipName: () => `resized-images-${Date.now()}.zip`,
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

// ── Drop zone interactions ─────────────────────────────────────────────────
setupDropZone({
  zone: dropZone,
  input: fileInput,
  changeButton: dzChangeBtn,
  accept: (f) => f.type.startsWith('image/'),
  onFiles: addFiles,
});

// ── Add files ─────────────────────────────────────────────────────────────
function addFiles(newFiles: File[]): void {
  appendDedupeFiles(files, newFiles);
  if (!files.length) return;
  renderUploadPreview();
  clearResults();
  resizeBtn.disabled = false;
  resizeBtn.classList.add('ready');
}

// ── Upload preview grid ────────────────────────────────────────────────────
function renderUploadPreview(): void {
  for (const u of previewUrls) URL.revokeObjectURL(u);
  previewUrls = [];
  renderUploadGrid({
    grid: dzGrid,
    emptyEl: dzEmpty,
    filledEl: dzFilled,
    countLabel: dzCountLabel,
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

// Re-render on resize so desktop↔mobile switch works
window.addEventListener('resize', () => {
  if (files.length) renderUploadPreview();
});

// ── Aspect ratio ───────────────────────────────────────────────────────────
function setAspectLocked(locked: boolean): void {
  aspectLocked = locked;
  document.getElementById('aspect-track')!.classList.toggle('on', locked);
  document.getElementById('aspect-label')!.textContent = locked ? 'Lock Aspect Ratio' : 'Free Resize';
  document.getElementById('aspect-toggle-row')!.setAttribute('aria-checked', String(locked));
  if (locked && Number(inputW.value) && Number(inputH.value))
    aspectRatio = Number(inputW.value) / Number(inputH.value);
}

const aspectRow = document.getElementById('aspect-toggle-row')!;
aspectRow.addEventListener('click', () => setAspectLocked(!aspectLocked));
aspectRow.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setAspectLocked(!aspectLocked);
  }
});

inputW.addEventListener('input', () => {
  lastChanged = 'w';
  if (aspectLocked) {
    const w = Number(inputW.value);
    if (w > 0) inputH.value = String(Math.round(w / aspectRatio));
  }
});

inputH.addEventListener('input', () => {
  lastChanged = 'h';
  if (aspectLocked) {
    const h = Number(inputH.value);
    if (h > 0) inputW.value = String(Math.round(h * aspectRatio));
  }
});

// ── Resize ─────────────────────────────────────────────────────────────────
resizeBtn.addEventListener('click', () => {
  if (!files.length) return;
  clearResults();
  resultsPanel.style.display = '';
  results = [];
  let done = 0;

  for (const file of files) {
    processFile(file, () => {
      done++;
      if (done === files.length) {
        updateZipButton(zipOpts(), results.length);
        dlAllBtn.disabled = false;
      }
    });
  }

  dlAllBtn.disabled = true; // disable until all processed
});

function processFile(file: File, onDone?: () => void): void {
  const clampDim = (v: number, fallback: number): number =>
    Number.isFinite(v) ? Math.min(8000, Math.max(1, Math.round(v))) : fallback;
  const targetW = clampDim(Number(inputW.value), 800);
  const targetH = clampDim(Number(inputH.value), 600);
  const { base: baseName, ext } = splitFileName(file.name);
  const isJpeg = ext === 'jpg' || ext === 'jpeg';
  const mime = isJpeg ? 'image/jpeg' : 'image/png';

  const item = makePlaceholderItem({
    fileName: file.name,
    statusHtml: `${iconSvg('circle-notch', 'spin')} Processing…`,
    downloadIconHtml: iconSvg('download'),
  });
  resultsList.appendChild(item);

  const fail = (msg: string): void => {
    const meta = item.querySelector('.result-meta');
    if (meta) meta.textContent = msg;
    onDone?.();
  };

  readFileAsDataURL(file).then(
    (dataUrl) => {
      const img = new Image();
      img.onerror = () => fail(`Failed to load ${file.name} — file may be corrupt.`);
      img.onload = () => {
        let outW = targetW,
          outH = targetH;
        if (aspectLocked) {
          const r = img.naturalWidth / img.naturalHeight;
          if (lastChanged === 'w') outH = Math.round(outW / r);
          else outW = Math.round(outH * r);
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        canvas.getContext('2d')!.drawImage(img, 0, 0, outW, outH);

        const outName = `${baseName}-${outW}x${outH}.${isJpeg ? 'jpg' : 'png'}`;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fail(`Failed to encode ${file.name}.`);
              return;
            }
            const thumbUrl = URL.createObjectURL(blob);
            thumbUrls.push(thumbUrl);

            const thumb = document.createElement('img');
            thumb.src = thumbUrl;
            thumb.className = 'result-thumb';
            thumb.alt = outName;

            const { item: doneItem } = makeResultItem({
              thumb,
              name: outName,
              metaHtml: `${outW} &times; ${outH} px &middot; ${formatKB(blob.size)}`,
              downloadIconHtml: iconSvg('download'),
              onDownload: () => downloadBlob(blob, outName),
            });
            item.replaceWith(doneItem);

            results.push({ blob, name: outName });
            onDone?.();
          },
          mime,
          isJpeg ? 0.92 : undefined,
        );
      };
      img.src = dataUrl;
    },
    (err: Error) => fail(err.message),
  );
}

// ── Download All → single or ZIP ───────────────────────────────────────────
dlAllBtn.addEventListener('click', () => void downloadResultsAsZip(zipOpts()));

// ── Clear results ──────────────────────────────────────────────────────────
function clearResults(): void {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls = [];
  results = [];
  resetResultsUI({
    list: resultsList,
    panel: resultsPanel,
    progressWrap: zipWrap,
    progressFill: zipFill,
    actionBtn: dlAllBtn,
  });
}
