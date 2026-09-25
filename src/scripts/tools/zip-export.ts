/* Shared "Download All" flow for batch file tools (image-resizer, svg-to-png):
   a single result downloads directly, multiple results pack into a ZIP
   with progress. Callers keep their own file processing + button copy. */
import JSZip from 'jszip';
import { downloadBlob } from './lib';

export interface ZipExportUI {
  button: HTMLButtonElement;
  iconSlot: HTMLElement;
  labelSlot: HTMLElement;
  progressWrap: HTMLElement;
  progressFill: HTMLElement;
  progressLabel: HTMLElement;
}

export interface ZipExportOptions {
  results: { blob: Blob; name: string }[];
  /** e.g. `resized-images-1700000000000.zip` (function = evaluated at click time). */
  zipName: string | (() => string);
  /** Word used in the "Adding N …" progress label, e.g. `images` or `PNGs`. */
  kindWord: string;
  /** Raw HTML for the in-progress button state (spinner + text). */
  packingHtml: string;
  singleIconHtml: string;
  multiIconHtml: string;
  singleLabel: string;
  multiLabel: (n: number) => string;
  ui: ZipExportUI;
}

function renderButton(opts: ZipExportOptions, n: number): void {
  const { ui, singleIconHtml, multiIconHtml, singleLabel, multiLabel } = opts;
  if (n <= 1) {
    ui.iconSlot.innerHTML = singleIconHtml;
    ui.labelSlot.textContent = singleLabel;
  } else {
    ui.iconSlot.innerHTML = multiIconHtml;
    ui.labelSlot.textContent = multiLabel(n);
  }
}

export async function downloadResultsAsZip(opts: ZipExportOptions): Promise<void> {
  const { results, zipName, kindWord, packingHtml, ui } = opts;
  if (!results.length) return;

  // Single file — direct download, no ZIP.
  if (results.length === 1) {
    downloadBlob(results[0].blob, results[0].name);
    return;
  }

  // Multiple — pack into a ZIP.
  ui.button.disabled = true;
  const restoreHtml = ui.button.innerHTML;
  ui.button.innerHTML = packingHtml;
  ui.progressWrap.classList.add('visible');

  // Duplicate names silently overwrite each other in the ZIP — suffix extras
  // (`icon-128x128.png` → `icon-128x128-2.png`).
  const seen = new Map<string, number>();

  function uniqueName(name: string): string {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (!n) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${stem}-${n + 1}${ext}`;
  }

  try {
    const zip = new JSZip();
    for (const r of results) zip.file(uniqueName(r.name), r.blob);

    ui.progressFill.style.width = '50%';
    ui.progressLabel.textContent = `Adding ${results.length} ${kindWord}…`;

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        ui.progressFill.style.width = `${50 + meta.percent * 0.5}%`;
        ui.progressLabel.textContent = `Compressing… ${Math.round(meta.percent)}%`;
      },
    );

    ui.progressFill.style.width = '100%';
    ui.progressLabel.textContent = 'Done!';

    downloadBlob(zipBlob, typeof zipName === 'function' ? zipName() : zipName);

    setTimeout(() => {
      ui.button.disabled = false;
      ui.button.innerHTML = restoreHtml;
      renderButton(opts, results.length);
      ui.progressWrap.classList.remove('visible');
      ui.progressFill.style.width = '0%';
    }, 1800);
  } catch (e) {
    console.error(e);
    ui.button.disabled = false;
    ui.button.innerHTML = restoreHtml;
    renderButton(opts, results.length);
    ui.progressFill.style.width = '0%';
    ui.progressLabel.textContent = 'Export failed — try again.';
  }
}

/** Refresh the Download All button for the finished result count. */
export function updateZipButton(opts: ZipExportOptions, n: number): void {
  renderButton(opts, n);
}
