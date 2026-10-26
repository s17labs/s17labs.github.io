import { iconSvg } from '../../icons';
import {
  announce,
  appendDedupeFiles,
  downloadBlob,
  formatKB,
  makePlaceholderItem,
  makeResultItem,
  rasterizeSvg,
  readFileAsText,
  renderUploadGrid,
  resetResultsUI,
  setupDropZone,
} from './lib';
import { downloadResultsAsZip, updateZipButton, type ZipExportOptions } from './zip-export';

// ── State ──────────────────────────────────────────────────────────────────
let files: File[] = []; // File objects
let results: { blob: Blob; name: string }[] = []; // per converted PNG

// ── DOM refs ───────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dzEmpty = document.getElementById('dz-empty')!;
const dzFilled = document.getElementById('dz-filled')!;
const dzGrid = document.getElementById('dz-preview-grid')!;
const dzCountLbl = document.getElementById('dz-count-label')!;
const dzChangeBtn = document.getElementById('dz-change-btn')!;
const inputW = document.getElementById('input-w') as HTMLInputElement;
const convertBtn = document.getElementById('convert-btn') as HTMLButtonElement;
const resultsPanel = document.getElementById('results-panel')!;
const resultsList = document.getElementById('results-list')!;
const dlAllBtn = document.getElementById('dl-all-btn') as HTMLButtonElement;
const dlIcon = document.getElementById('dl-icon')!;
const dlLabel = document.getElementById('dl-label')!;
const zipWrap = document.getElementById('zip-progress-wrap')!;
const zipFill = document.getElementById('zip-progress-fill')!;
const zipLabel = document.getElementById('zip-progress-label')!;

// Object URLs for result thumbnails (revoked when results are cleared)
let thumbUrls: string[] = [];

const zipOpts = (): ZipExportOptions => ({
  results,
  zipName: () => `svg-to-png-${Date.now()}.zip`,
  kindWord: 'PNGs',
  packingHtml: `${iconSvg('circle-notch', 'spin')} Packing ZIP…`,
  singleIconHtml: iconSvg('download'),
  multiIconHtml: iconSvg('file-zipper'),
  singleLabel: 'Save PNG',
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

function isSVG(f: File): boolean {
  return f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml';
}

// ── Drop zone ──────────────────────────────────────────────────────────────
setupDropZone({
  zone: dropZone,
  input: fileInput,
  changeButton: dzChangeBtn,
  accept: isSVG,
  onFiles: addFiles,
});

// ── Add files & render preview ─────────────────────────────────────────────
function addFiles(newFiles: File[]): void {
  appendDedupeFiles(files, newFiles);
  if (!files.length) return;
  renderUploadPreview();
  clearResults();
  convertBtn.disabled = false;
}

function renderUploadPreview(): void {
  renderUploadGrid({
    grid: dzGrid,
    emptyEl: dzEmpty,
    filledEl: dzFilled,
    countLabel: dzCountLbl,
    zone: dropZone,
    files,
    countText: (n) => `${n} SVG file${n !== 1 ? 's' : ''} selected`,
    renderTile: makeSVGTile,
  });
}

// Build a simple SVG file tile (icon + truncated filename — no canvas rendering)
function makeSVGTile(file: File): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'dz-thumb';

  const icon = document.createElement('span');
  icon.className = 'svg-icon';
  icon.innerHTML = iconSvg('bezier-curve');
  tile.appendChild(icon);

  // Short name: strip .svg and truncate
  const shortName = file.name.replace(/\.svg$/i, '');
  const nameEl = document.createElement('div');
  nameEl.className = 'svg-name';
  nameEl.textContent = shortName;
  tile.appendChild(nameEl);

  return tile;
}

window.addEventListener('resize', () => {
  if (files.length) renderUploadPreview();
});

// ── Width preset buttons ───────────────────────────────────────────────────
function setW(px: number): void {
  inputW.value = String(px);
  document.querySelectorAll<HTMLElement>('.choice-btn').forEach((b) => {
    const on = Number(b.textContent) === px;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

for (const b of document.querySelectorAll<HTMLElement>('.choice-btn')) {
  b.addEventListener('click', () => setW(Number(b.textContent)));
}

inputW.addEventListener('input', () =>
  document.querySelectorAll<HTMLElement>('.choice-btn').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  }),
);

// ── Convert ────────────────────────────────────────────────────────────────
convertBtn.addEventListener('click', () => {
  if (!files.length) return;
  clearResults();
  resultsPanel.style.display = '';
  results = [];
  dlAllBtn.disabled = true;
  resultsList.setAttribute('aria-busy', 'true');

  let done = 0;
  let failed = 0;

  for (const file of files) {
    convertFile(file, (ok) => {
      if (!ok) failed++;
      done++;
      if (done === files.length) {
        // All done — update download button
        resultsList.setAttribute('aria-busy', 'false');
        updateZipButton(zipOpts(), results.length);
        dlAllBtn.disabled = results.length === 0;
        const succeeded = results.length;
        if (failed) {
          announce(`${succeeded} SVG${succeeded === 1 ? '' : 's'} converted, ${failed} failed`);
        } else {
          announce(`${succeeded} SVG${succeeded === 1 ? '' : 's'} converted to PNG`);
        }
      }
    });
  }
});

function convertFile(file: File, onDone?: (ok: boolean) => void): void {
  // Unclamped widths allocate giant canvases (tab OOM) — same bounds as resizer.
  const targetW = Math.min(8000, Math.max(16, Math.round(Number(inputW.value) || 512)));
  inputW.value = String(targetW);
  const baseName = file.name.replace(/\.svg$/i, '');

  const item = makePlaceholderItem({
    fileName: file.name,
    statusHtml: `${iconSvg('circle-notch', 'spin')} Converting…`,
    downloadIconHtml: iconSvg('download'),
  });
  resultsList.appendChild(item);

  const fail = (msg: string): void => {
    const meta = item.querySelector('.result-meta');
    if (meta) meta.textContent = msg;
    announce(msg);
    onDone?.(false);
  };

  readFileAsText(file).then(
    (svgText) =>
      rasterizeSvg(svgText, targetW).then(
        ({ blob: pngBlob, width: outW, height: outH }) => {
          const outName = `${baseName}-${outW}x${outH}.png`;

          const thumbUrl = URL.createObjectURL(pngBlob);
          thumbUrls.push(thumbUrl);
          const thumb = document.createElement('img');
          thumb.src = thumbUrl;
          thumb.className = 'result-thumb';
          thumb.alt = outName;

          const { item: doneItem } = makeResultItem({
            thumb,
            name: outName,
            metaHtml: `${outW} &times; ${outH} px &middot; ${formatKB(pngBlob.size)} &middot; transparent`,
            downloadIconHtml: iconSvg('download'),
            onDownload: () => downloadBlob(pngBlob, outName),
          });
          item.replaceWith(doneItem);

          results.push({ blob: pngBlob, name: outName });
          onDone?.(true);
        },
        () => fail('Failed to render SVG — check the file is valid.'),
      ),
    (err: Error) => fail(err.message),
  );
}

// ── Download All → single or ZIP ───────────────────────────────────────────
dlAllBtn.addEventListener('click', () => void downloadResultsAsZip(zipOpts()));

// ── Clear ─────────────────────────────────────────────────────────────────
function clearResults(): void {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls = [];
  results = [];
  resultsList.setAttribute('aria-busy', 'false');
  resetResultsUI({
    list: resultsList,
    panel: resultsPanel,
    progressWrap: zipWrap,
    progressFill: zipFill,
    actionBtn: dlAllBtn,
  });
}
