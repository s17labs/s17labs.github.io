/* JSON Lab — format / validate / tree / stats — zero deps */

const elInput = document.getElementById('json-input') as HTMLTextAreaElement;
const elGutter = document.getElementById('gutter') as HTMLElement;
const elError = document.getElementById('error-msg') as HTMLElement;
const elStat = document.getElementById('input-stat') as HTMLElement;
const elOutputCode = document.getElementById('output-code') as HTMLElement;
const elTreeWrap = document.getElementById('tree-wrap') as HTMLElement;
const elStatsGrid = document.getElementById('stats-grid') as HTMLElement;
const elFileInput = document.getElementById('file-input') as HTMLInputElement;
const elPasteSample = document.getElementById('paste-sample') as HTMLButtonElement;
const elClear = document.getElementById('clear-btn') as HTMLButtonElement;
const elIndent = document.getElementById('indent-select') as HTMLSelectElement;
const elOptSort = document.getElementById('opt-sort') as HTMLInputElement;

const elBtnFormat = document.getElementById('btn-format') as HTMLButtonElement;
const elBtnMinify = document.getElementById('btn-minify') as HTMLButtonElement;
const elBtnSort = document.getElementById('btn-sort') as HTMLButtonElement;
const elBtnValidate = document.getElementById('btn-validate') as HTMLButtonElement;
const elBtnCopyPretty = document.getElementById('btn-copy-pretty') as HTMLButtonElement;
const elBtnDownload = document.getElementById('btn-download') as HTMLButtonElement;
const elCopyPretty = document.getElementById('copy-pretty') as HTMLButtonElement;
const elTabs = document.getElementById('tabs') as HTMLElement;

let lastValid: unknown = null;
let lastValidText = '';

const SAMPLE = JSON.stringify(
  {
    project: 's17 Labs',
    tools: ['Icon Maker', 'Image Resizer', 'SVG to PNG', 'Case Converter', 'QR Generator', 'Palette Studio', 'JSON Lab', 'Regex Lab'],
    stats: { stars: 42, contributors: 3, active: true },
    meta: { version: '2.0.0', tags: ['minimal', 'privacy-first', 'offline'] },
  },
  null,
  2
);

// ── Gutter (line numbers) ──────────────────────────────────────────────────
function updateGutter(): void {
  const lines = elInput.value.split('\n').length;
  const nums = Array.from({ length: lines }, (_, i) => String(i + 1)).join('\n');
  elGutter.textContent = nums;
  elGutter.scrollTop = elInput.scrollTop;
}
elInput.addEventListener('scroll', () => (elGutter.scrollTop = elInput.scrollTop));
elInput.addEventListener('input', () => {
  updateGutter();
  updateInputStat();
  clearError();
});

// ── Input stat ─────────────────────────────────────────────────────────────
function updateInputStat(): void {
  const len = elInput.value.length;
  const lines = elInput.value ? elInput.value.split('\n').length : 0;
  elStat.textContent = len ? `${len.toLocaleString()} chars · ${lines} lines` : '';
}

// ── Error handling ─────────────────────────────────────────────────────────
function showError(msg: string): void {
  elError.textContent = msg;
  elError.classList.add('visible');
}
function clearError(): void {
  elError.textContent = '';
  elError.classList.remove('visible');
}

function parseErrorMessage(e: unknown, text: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Try to extract position like "at position 123"
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = before.split('\n').pop()!.length + 1;
    const preview = text.slice(Math.max(0, pos - 30), pos + 30).replace(/\n/g, '↵ ');
    return `${msg}\n→ line ${line}, column ${col} (offset ${pos})\n…${preview}…`;
  }
  return msg;
}

// ── Sorting ────────────────────────────────────────────────────────────────
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function getIndent(): string | number {
  const v = elIndent.value;
  if (v === 'tab') return '\t';
  return parseInt(v, 10);
}

// ── Highlight (lightweight tokeniser) ─────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJson(jsonStr: string): string {
  // Tokenise with regex: strings, numbers, booleans, null, punctuation
  const re = /("(?:\\.|[^"\\])*"(?:\s*:)?)|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jsonStr)) !== null) {
    out += escapeHtml(jsonStr.slice(last, m.index));
    const tok = m[0];
    if (m[1] !== undefined) {
      // string — key if ends with :
      const isKey = /:\s*$/.test(m[1]);
      out += `<span class="${isKey ? 'tok-key' : 'tok-string'}">${escapeHtml(tok)}</span>`;
    } else if (m[2] !== undefined) {
      if (tok === 'null') out += `<span class="tok-null">${tok}</span>`;
      else out += `<span class="tok-boolean">${tok}</span>`;
    } else if (m[3] !== undefined) {
      out += `<span class="tok-number">${tok}</span>`;
    } else {
      out += `<span class="tok-punct">${escapeHtml(tok)}</span>`;
    }
    last = m.index + tok.length;
  }
  out += escapeHtml(jsonStr.slice(last));
  return out;
}

// ── Format / Minify ────────────────────────────────────────────────────────
function tryParse(): { ok: true; value: unknown } | { ok: false; error: unknown } {
  const raw = elInput.value.trim();
  if (!raw) return { ok: false, error: new Error('Input is empty — paste some JSON first.') };
  try {
    const v = JSON.parse(raw);
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function doFormat(): void {
  const res = tryParse();
  if (!res.ok) {
    showError(parseErrorMessage(res.error, elInput.value));
    return;
  }
  let val: unknown = res.value;
  if (elOptSort.checked) val = sortKeysDeep(val);
  const indent = getIndent();
  const pretty = JSON.stringify(val, null, indent);
  lastValid = val;
  lastValidText = pretty;
  elOutputCode.innerHTML = highlightJson(pretty);
  showTree(val);
  showStats(val, pretty);
  clearError();
  // Auto-switch to pretty tab
  switchTab('pretty');
}

function doMinify(): void {
  const res = tryParse();
  if (!res.ok) {
    showError(parseErrorMessage(res.error, elInput.value));
    return;
  }
  let val: unknown = res.value;
  if (elOptSort.checked) val = sortKeysDeep(val);
  const min = JSON.stringify(val);
  lastValid = val;
  lastValidText = min;
  elOutputCode.innerHTML = highlightJson(min);
  elOutputCode.scrollTop = 0;
  showTree(val);
  showStats(val, min);
  clearError();
  switchTab('pretty');
}

function doSort(): void {
  const res = tryParse();
  if (!res.ok) {
    showError(parseErrorMessage(res.error, elInput.value));
    return;
  }
  const sorted = sortKeysDeep(res.value);
  const pretty = JSON.stringify(sorted, null, getIndent());
  lastValid = sorted;
  lastValidText = pretty;
  elInput.value = pretty;
  updateGutter();
  updateInputStat();
  elOutputCode.innerHTML = highlightJson(pretty);
  showTree(sorted);
  showStats(sorted, pretty);
  clearError();
}

function doValidate(): void {
  const res = tryParse();
  if (!res.ok) {
    showError('✗ Invalid JSON\n' + parseErrorMessage(res.error, elInput.value));
    lastValid = null;
    return;
  }
  const pretty = JSON.stringify(res.value, null, 2);
  showError('✓ Valid JSON — ' + countNodes(res.value).total + ' nodes');
  elError.classList.remove('error');
  elError.classList.add('success', 'visible');
  setTimeout(() => {
    elError.classList.remove('success');
    elError.classList.add('error');
    if (elError.textContent?.startsWith('✓')) clearError();
  }, 2200);
  lastValid = res.value;
  lastValidText = pretty;
  showTree(res.value);
  showStats(res.value, pretty);
}

// ── Stats ──────────────────────────────────────────────────────────────────
function countNodes(v: unknown): { total: number; objects: number; arrays: number; primitives: number; depth: number } {
  let total = 0, objects = 0, arrays = 0, primitives = 0;
  let maxDepth = 0;
  function walk(node: unknown, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);
    total++;
    if (Array.isArray(node)) {
      arrays++;
      for (const el of node) walk(el, depth + 1);
    } else if (node !== null && typeof node === 'object') {
      objects++;
      for (const k in node as Record<string, unknown>) walk((node as Record<string, unknown>)[k], depth + 1);
    } else {
      primitives++;
    }
  }
  walk(v, 1);
  return { total, objects, arrays, primitives, depth: maxDepth };
}

function showStats(val: unknown, pretty: string): void {
  const c = countNodes(val);
  const size = new Blob([pretty]).size;
  const minSize = new Blob([JSON.stringify(val)]).size;
  const savings = size - minSize;
  elStatsGrid.innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Nodes</div><div class="stat-card-value">${c.total}</div><div class="stat-card-sub">${c.objects} objects · ${c.arrays} arrays · ${c.primitives} primitives</div></div>
    <div class="stat-card"><div class="stat-card-label">Depth</div><div class="stat-card-value">${c.depth}</div><div class="stat-card-sub">max nesting level</div></div>
    <div class="stat-card"><div class="stat-card-label">Pretty size</div><div class="stat-card-value">${(size / 1024).toFixed(2)} KB</div><div class="stat-card-sub">${pretty.split('\n').length} lines · ${pretty.length.toLocaleString()} chars</div></div>
    <div class="stat-card"><div class="stat-card-label">Minified</div><div class="stat-card-value">${(minSize / 1024).toFixed(2)} KB</div><div class="stat-card-sub">${savings > 0 ? `saves ${(savings / 1024).toFixed(2)} KB (${Math.round(savings / size * 100)}%)` : 'no savings'}</div></div>
  `;
}

// ── Tree view ──────────────────────────────────────────────────────────────
function buildTree(val: unknown, key?: string): HTMLElement {
  const row = document.createElement('div');
  const isObj = val !== null && typeof val === 'object';
  const type = Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val;

  if (isObj) {
    const entries = Array.isArray(val) ? (val as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(val as Record<string, unknown>);
    const summary = Array.isArray(val) ? `Array(${entries.length})` : `Object {${entries.length}}`;
    const header = document.createElement('div');
    header.className = 'tree-row';
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    const label = document.createElement('span');
    label.innerHTML = `${key !== undefined ? `<span class="tree-key">"${escapeHtml(key)}"</span>: ` : ''}<span class="tree-type">${summary}</span>`;
    header.appendChild(toggle);
    header.appendChild(label);
    row.appendChild(header);

    const children = document.createElement('div');
    children.className = 'tree-children';
    for (const [k, v] of entries) {
      children.appendChild(buildTree(v, Array.isArray(val) ? undefined : k));
    }
    row.appendChild(children);

    toggle.addEventListener('click', () => {
      const collapsed = children.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▸' : '▾';
    });
    // Clicking header also toggles, but not when selecting text
    header.addEventListener('click', (e) => {
      if (e.target === toggle) return;
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      const collapsed = children.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▸' : '▾';
    });
  } else {
    const line = document.createElement('div');
    line.className = 'tree-row';
    const spacer = document.createElement('span');
    spacer.className = 'tree-toggle';
    spacer.textContent = '·';
    spacer.style.opacity = '0.25';
    const label = document.createElement('span');
    let valHtml: string;
    if (typeof val === 'string') valHtml = `<span class="tok-string">"${escapeHtml(val)}"</span>`;
    else if (typeof val === 'number') valHtml = `<span class="tok-number">${val}</span>`;
    else if (typeof val === 'boolean') valHtml = `<span class="tok-boolean">${val}</span>`;
    else valHtml = `<span class="tok-null">null</span>`;
    label.innerHTML = `${key !== undefined ? `<span class="tree-key">"${escapeHtml(key)}"</span>: ` : ''}${valHtml} <span class="tree-type">${type}</span>`;
    line.appendChild(spacer);
    line.appendChild(label);
    row.appendChild(line);
  }
  return row;
}

function showTree(val: unknown): void {
  elTreeWrap.innerHTML = '';
  elTreeWrap.appendChild(buildTree(val));
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function switchTab(name: string): void {
  for (const t of elTabs.querySelectorAll<HTMLElement>('.tab')) t.classList.toggle('active', t.dataset.tab === name);
  for (const p of document.querySelectorAll<HTMLElement>('.tab-pane')) p.classList.toggle('active', p.id === `pane-${name}`);
}
elTabs.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (!b) return;
  switchTab(b.dataset.tab!);
});

// ── Copy / Download ────────────────────────────────────────────────────────
function copyText(text: string, btn: HTMLElement): void {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1600);
  });
}

elCopyPretty.addEventListener('click', () => copyText(lastValidText || elOutputCode.textContent || '', elCopyPretty));
elBtnCopyPretty.addEventListener('click', () => copyText(lastValidText || elOutputCode.textContent || '', elBtnCopyPretty));

elBtnDownload.addEventListener('click', () => {
  const text = lastValidText || elOutputCode.textContent || '';
  if (!text.trim() || text.includes('Formatted output will appear')) return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'data.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ── Buttons ────────────────────────────────────────────────────────────────
elBtnFormat.addEventListener('click', doFormat);
elBtnMinify.addEventListener('click', doMinify);
elBtnSort.addEventListener('click', doSort);
elBtnValidate.addEventListener('click', doValidate);

elPasteSample.addEventListener('click', () => {
  elInput.value = SAMPLE;
  updateGutter();
  updateInputStat();
  clearError();
  doFormat();
});
elClear.addEventListener('click', () => {
  elInput.value = '';
  updateGutter();
  updateInputStat();
  clearError();
  elOutputCode.innerHTML = '<span class="muted">Formatted output will appear here</span>';
  elTreeWrap.innerHTML = '<span class="muted">Tree view appears after valid JSON</span>';
  elStatsGrid.innerHTML = '';
  lastValid = null;
  lastValidText = '';
});
elFileInput.addEventListener('change', () => {
  const f = elFileInput.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    elInput.value = String(reader.result || '');
    updateGutter();
    updateInputStat();
    clearError();
  };
  reader.readAsText(f);
  elFileInput.value = '';
});

// ── Keyboard: Tab inserts 2 spaces, Cmd+Enter formats ───────────────────────
elInput.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = elInput.selectionStart, ee = elInput.selectionEnd;
    const indent = getIndent() === '\t' ? '\t' : ' '.repeat(getIndent() as number);
    elInput.value = elInput.value.slice(0, s) + indent + elInput.value.slice(ee);
    elInput.selectionStart = elInput.selectionEnd = s + indent.length;
    updateGutter();
    updateInputStat();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    doFormat();
  }
});

// Init
updateGutter();
updateInputStat();
