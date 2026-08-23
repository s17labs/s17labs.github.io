import JSZip from 'jszip';
import { iconSvg } from '../../icons';

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

// ── Mobile detection (for preview grid logic) ─────────────────────────────
const isMobile = (): boolean => window.innerWidth <= 580;

// ── Drop zone interactions ─────────────────────────────────────────────────
dropZone.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#dz-change-btn')) return;
  fileInput.click();
});

dzChangeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget as Node)) dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer!.files].filter((f) => f.type.startsWith('image/')));
});

fileInput.addEventListener('change', () => {
  addFiles([...(fileInput.files ?? [])].filter((f) => f.type.startsWith('image/')));
  fileInput.value = '';
});

// ── Add files ─────────────────────────────────────────────────────────────
function addFiles(newFiles: File[]): void {
  if (!newFiles.length) return;
  files = newFiles;
  renderUploadPreview();
  clearResults();
  resizeBtn.disabled = false;
  resizeBtn.classList.add('ready');
}

// ── Upload preview grid ────────────────────────────────────────────────────
// Desktop: 6 cols — show up to 5 plain + 1 solid overflow tile
// Mobile:  4 cols — show up to 7 plain + 1 dimmed-image overflow tile
function renderUploadPreview(): void {
  dzGrid.innerHTML = '';

  const mobile = isMobile();
  const maxPlain = mobile ? 7 : 5; // plain thumbs before overflow

  const show = files.slice(0, maxPlain);
  const overflow = files.length - maxPlain; // > 0 means we need overflow tile

  // Plain thumbnail tiles
  for (const file of show) {
    const tile = document.createElement('div');
    tile.className = 'dz-thumb';
    const img = document.createElement('img');
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    tile.appendChild(img);
    dzGrid.appendChild(tile);
  }

  // Overflow tile
  if (overflow > 0) {
    const extraFile = files[maxPlain]; // the actual next image

    if (mobile && extraFile) {
      // Mobile: show the actual image dimmed with overlay
      const tile = document.createElement('div');
      tile.className = 'dz-thumb overflow-img';

      const img = document.createElement('img');
      img.alt = extraFile.name;
      img.src = URL.createObjectURL(extraFile);
      tile.appendChild(img);

      const dim = document.createElement('div');
      dim.className = 'overflow-dim';
      dim.innerHTML = `<span>+${overflow}</span>`;
      tile.appendChild(dim);

      dzGrid.appendChild(tile);
    } else {
      // Desktop: solid tile, no image
      const tile = document.createElement('div');
      tile.className = 'dz-thumb overflow-solid';
      tile.innerHTML = `<span>+${overflow}</span>`;
      dzGrid.appendChild(tile);
    }
  }

  const n = files.length;
  dzCountLabel.textContent = `${n} image${n !== 1 ? 's' : ''} selected`;

  dzEmpty.style.display = 'none';
  dzFilled.classList.add('visible');
}

// Re-render on resize so desktop↔mobile switch works
window.addEventListener('resize', () => {
  if (files.length) renderUploadPreview();
});

// ── Aspect ratio ───────────────────────────────────────────────────────────
document.getElementById('aspect-toggle-row')!.addEventListener('click', () => {
  aspectLocked = !aspectLocked;
  document.getElementById('aspect-track')!.classList.toggle('on', aspectLocked);
  document.getElementById('aspect-label')!.textContent = aspectLocked ? 'Lock Aspect Ratio' : 'Free Resize';
  if (aspectLocked && Number(inputW.value) && Number(inputH.value))
    aspectRatio = Number(inputW.value) / Number(inputH.value);
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
        updateDlButton();
        dlAllBtn.disabled = false;
      }
    });
  }

  dlAllBtn.disabled = true; // disable until all processed
});

function processFile(file: File, onDone?: () => void): void {
  const targetW = Number(inputW.value) || 800;
  const targetH = Number(inputH.value) || 600;
  const ext = file.name.split('.').pop()!.toLowerCase();
  const isJpeg = ext === 'jpg' || ext === 'jpeg';
  const mime = isJpeg ? 'image/jpeg' : 'image/png';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  // Placeholder row
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
      <div class="result-thumb" style="background:var(--surface-3)"></div>
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-meta">${iconSvg('circle-notch', 'spin')} Processing…</div>
      </div>
      <button class="result-dl" disabled>${iconSvg('download')} Save</button>`;
  resultsList.appendChild(item);

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
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
          if (!blob) return;
          const thumbUrl = URL.createObjectURL(blob);

          const thumb = document.createElement('img');
          thumb.src = thumbUrl;
          thumb.className = 'result-thumb';
          thumb.alt = outName;

          const info = document.createElement('div');
          info.className = 'result-info';
          info.innerHTML = `
            <div class="result-name">${outName}</div>
            <div class="result-meta">${outW} &times; ${outH} px &middot; ${(blob.size / 1024).toFixed(1)} KB</div>`;

          const dlBtn = document.createElement('button');
          dlBtn.className = 'result-dl';
          dlBtn.type = 'button';
          dlBtn.innerHTML = `${iconSvg('download')} Save`;
          dlBtn.addEventListener('click', () => triggerDownload(blob, outName));

          item.innerHTML = '';
          item.appendChild(thumb);
          item.appendChild(info);
          item.appendChild(dlBtn);

          results.push({ blob, name: outName });
          onDone?.();
        },
        mime,
        isJpeg ? 0.92 : undefined
      );
    };
    img.src = ev.target!.result as string;
  };
  reader.readAsDataURL(file);
}

// ── Update download button label based on result count ────────────────────
function updateDlButton(): void {
  const n = results.length;
  if (n <= 1) {
    dlIcon.innerHTML = iconSvg('download');
    dlLabel.textContent = 'Download Image';
  } else {
    dlIcon.innerHTML = iconSvg('file-zipper');
    dlLabel.textContent = `Download All (${n})`;
  }
}

// ── Download All → single or ZIP ───────────────────────────────────────────
dlAllBtn.addEventListener('click', async () => {
  if (!results.length) return;

  // Single file — direct download, no ZIP
  if (results.length === 1) {
    triggerDownload(results[0].blob, results[0].name);
    return;
  }

  // Multiple — pack into ZIP
  dlAllBtn.disabled = true;
  dlAllBtn.innerHTML = `${iconSvg('circle-notch', 'spin')} Packing ZIP…`;
  zipWrap.classList.add('visible');

  const zip = new JSZip();
  for (const r of results) zip.file(r.name, r.blob);

  zipFill.style.width = '50%';
  zipLabel.textContent = `Adding ${results.length} images…`;

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } },
    (meta) => {
      zipFill.style.width = 50 + meta.percent * 0.5 + '%';
      zipLabel.textContent = `Compressing… ${Math.round(meta.percent)}%`;
    }
  );

  zipFill.style.width = '100%';
  zipLabel.textContent = 'Done!';

  triggerDownload(zipBlob, `resized-images-${Date.now()}.zip`);

  setTimeout(() => {
    dlAllBtn.disabled = false;
    updateDlButton();
    zipWrap.classList.remove('visible');
    zipFill.style.width = '0%';
  }, 1800);
});

// ── Download helper ────────────────────────────────────────────────────────
function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

// ── Clear results ──────────────────────────────────────────────────────────
function clearResults(): void {
  results = [];
  resultsList.innerHTML = '';
  resultsPanel.style.display = 'none';
  zipWrap.classList.remove('visible');
  zipFill.style.width = '0%';
  dlAllBtn.disabled = true;
}
