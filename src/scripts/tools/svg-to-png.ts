import JSZip from 'jszip';
import { iconSvg } from '../../icons';

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

// ── Mobile detection ───────────────────────────────────────────────────────
const isMobile = (): boolean => window.innerWidth <= 580;

// ── Drop zone ──────────────────────────────────────────────────────────────
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
  addFiles([...e.dataTransfer!.files].filter(isSVG));
});

fileInput.addEventListener('change', () => {
  addFiles([...(fileInput.files ?? [])].filter(isSVG));
  fileInput.value = '';
});

function isSVG(f: File): boolean {
  return f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml';
}

// ── Add files & render preview ─────────────────────────────────────────────
function addFiles(newFiles: File[]): void {
  if (!newFiles.length) return;
  files = newFiles;
  renderUploadPreview();
  clearResults();
  convertBtn.disabled = false;
  convertBtn.classList.add('ready');
}

// Desktop: 5 plain + 1 solid overflow = 6 tiles
// Mobile:  7 plain + 1 dimmed overflow = 8 tiles
function renderUploadPreview(): void {
  dzGrid.innerHTML = '';

  const mobile = isMobile();
  const maxPlain = mobile ? 7 : 5;
  const overflow = files.length - maxPlain;

  for (const file of files.slice(0, maxPlain)) {
    dzGrid.appendChild(makeSVGTile(file));
  }

  if (overflow > 0) {
    if (mobile) {
      // Dimmed tile — still shows the SVG icon underneath
      const overflowFile = files[maxPlain];
      const tile = makeSVGTile(overflowFile);
      tile.classList.add('overflow-img');
      const dim = document.createElement('div');
      dim.className = 'overflow-dim';
      dim.innerHTML = `<span>+${overflow}</span>`;
      tile.appendChild(dim);
      dzGrid.appendChild(tile);
    } else {
      // Solid tile, desktop
      const tile = document.createElement('div');
      tile.className = 'dz-thumb overflow-solid';
      tile.innerHTML = `<span>+${overflow}</span>`;
      dzGrid.appendChild(tile);
    }
  }

  const n = files.length;
  dzCountLbl.textContent = `${n} SVG file${n !== 1 ? 's' : ''} selected`;
  dzEmpty.style.display = 'none';
  dzFilled.classList.add('visible');
}

// Build SVG tile with live preview — falls back to icon if SVG fails to render
function makeSVGTile(file: File): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'dz-thumb svg-preview';

  const url = URL.createObjectURL(file);
  const img = document.createElement('img');
  img.alt = file.name;
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  img.onerror = () => {
    URL.revokeObjectURL(url);
    img.remove();
    const fallbackIcon = document.createElement('span');
    fallbackIcon.className = 'svg-icon';
    fallbackIcon.innerHTML = iconSvg('bezier-curve');
    // restore fallback tile styling
    tile.classList.remove('svg-preview');
    tile.prepend(fallbackIcon);
  };
  tile.appendChild(img);

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
  document.querySelectorAll<HTMLElement>('.scale-btn').forEach((b) => {
    b.classList.toggle('active', Number(b.textContent) === px);
  });
}

for (const b of document.querySelectorAll<HTMLElement>('.scale-btn')) {
  b.addEventListener('click', () => setW(Number(b.textContent)));
}

inputW.addEventListener('input', () =>
  document.querySelectorAll<HTMLElement>('.scale-btn').forEach((b) => b.classList.remove('active'))
);

// ── Convert ────────────────────────────────────────────────────────────────
convertBtn.addEventListener('click', () => {
  if (!files.length) return;
  clearResults();
  resultsPanel.style.display = '';
  results = [];
  dlAllBtn.disabled = true;

  let done = 0;

  for (const file of files) {
    convertFile(file, () => {
      done++;
      if (done === files.length) {
        // All done — update download button
        updateDlButton();
        dlAllBtn.disabled = false;
      }
    });
  }
});

function convertFile(file: File, onDone?: () => void): void {
  const targetW = Number(inputW.value) || 512;
  const baseName = file.name.replace(/\.svg$/i, '');

  // Placeholder row
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
      <div class="result-thumb placeholder"></div>
      <div class="result-info">
        <div class="result-name">${file.name}</div>
        <div class="result-meta">${iconSvg('circle-notch', 'spin')} Converting…</div>
      </div>
      <button class="result-dl" disabled>${iconSvg('download')} Save</button>`;
  resultsList.appendChild(item);

  const reader = new FileReader();
  reader.onload = (ev) => {
    const svgText = ev.target!.result as string;
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const ratio = (img.naturalHeight || img.naturalWidth) / img.naturalWidth;
      const outW = targetW;
      const outH = Math.max(1, Math.round(outW * ratio));
      const outName = `${baseName}-${outW}x${outH}.png`;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d')!.drawImage(img, 0, 0, outW, outH);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;

        // Thumbnail
        const thumbUrl = URL.createObjectURL(pngBlob);
        const thumb = document.createElement('img');
        thumb.src = thumbUrl;
        thumb.className = 'result-thumb';
        thumb.alt = outName;

        const info = document.createElement('div');
        info.className = 'result-info';
        info.innerHTML = `
            <div class="result-name">${outName}</div>
            <div class="result-meta">${outW} &times; ${outH} px &middot; ${(pngBlob.size / 1024).toFixed(1)} KB &middot; transparent</div>`;

        const dlBtn = document.createElement('button');
        dlBtn.className = 'result-dl';
        dlBtn.type = 'button';
        dlBtn.innerHTML = `${iconSvg('download')} Save`;
        dlBtn.addEventListener('click', () => triggerDownload(pngBlob, outName));

        item.innerHTML = '';
        item.appendChild(thumb);
        item.appendChild(info);
        item.appendChild(dlBtn);

        results.push({ blob: pngBlob, name: outName });
        onDone?.();
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      item.querySelector('.result-meta')!.textContent = 'Failed to render SVG — check the file is valid.';
      onDone?.();
    };

    img.src = svgUrl;
  };

  reader.readAsText(file);
}

// ── Update download button label based on result count ─────────────────────
function updateDlButton(): void {
  const n = results.length;
  if (n <= 1) {
    // Single file
    dlIcon.innerHTML = iconSvg('download');
    dlLabel.textContent = 'Save PNG';
  } else {
    // Multiple files → ZIP
    dlIcon.innerHTML = iconSvg('file-zipper');
    dlLabel.textContent = `Download All (${n})`;
  }
}

// ── Download All handler ───────────────────────────────────────────────────
dlAllBtn.addEventListener('click', async () => {
  if (!results.length) return;

  // Single file — just download directly, no zip
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
  zipLabel.textContent = `Adding ${results.length} PNGs…`;

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } },
    (meta) => {
      zipFill.style.width = 50 + meta.percent * 0.5 + '%';
      zipLabel.textContent = `Compressing… ${Math.round(meta.percent)}%`;
    }
  );

  zipFill.style.width = '100%';
  zipLabel.textContent = 'Done!';

  const zipName = `svg-to-png-${Date.now()}.zip`;
  triggerDownload(zipBlob, zipName);

  setTimeout(() => {
    dlAllBtn.disabled = false;
    updateDlButton();
    zipWrap.classList.remove('visible');
    zipFill.style.width = '0%';
  }, 1800);
});

// ── Trigger download helper ────────────────────────────────────────────────
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

// ── Clear ─────────────────────────────────────────────────────────────────
function clearResults(): void {
  results = [];
  resultsList.innerHTML = '';
  resultsPanel.style.display = 'none';
  zipWrap.classList.remove('visible');
  zipFill.style.width = '0%';
  dlAllBtn.disabled = true;
}
