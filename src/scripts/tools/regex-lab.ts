/* Regex Lab — live matching, groups, replace — all local */

const elPattern = document.getElementById('pattern') as HTMLInputElement;
const elFlagsWrap = document.getElementById('flags') as HTMLElement;
const elError = document.getElementById('pattern-error') as HTMLElement;
const elTest = document.getElementById('test-input') as HTMLTextAreaElement;
const elHighlight = document.getElementById('highlight-wrap') as HTMLElement;
const elStat = document.getElementById('match-stat') as HTMLElement;
const elReplaceInput = document.getElementById('replace-input') as HTMLInputElement;
const elReplaceWrap = document.getElementById('replace-wrap') as HTMLElement;
const elReplacePreview = document.getElementById('replace-preview') as HTMLElement;
const elCopyReplace = document.getElementById('copy-replace') as HTMLButtonElement;
const elMatchesPanel = document.getElementById('matches-panel') as HTMLElement;
const elMatchesList = document.getElementById('matches-list') as HTMLElement;
const elCheatToggle = document.getElementById('cheat-toggle') as HTMLElement;
const elCheatBody = document.getElementById('cheat-body') as HTMLElement;
const elCheatPanel = elCheatToggle.closest('.cheat-panel') as HTMLElement;

const SAMPLES: Record<string, { pattern: string; flags: string; test: string; replace?: string }> = {
  email: {
    pattern: '([\\w.-]+)@([\\w-]+)\\.([\\w.]+)',
    flags: 'gi',
    test: 'Reach us at hello@s17labs.dev or support@example.com — not at @missing or test@.',
    replace: '[$1 at $2]',
  },
  url: {
    pattern: 'https?:\\/\\/[^\\s/$.?#].[^\\s]*',
    flags: 'gi',
    test: 'Visit https://s17labs.github.io and http://example.com/path?q=1#hash for details.',
  },
  ipv4: {
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    test: 'Servers: 192.168.1.1, 10.0.0.42, 999.999.999.999, 8.8.8.8',
  },
  hex: {
    pattern: '#[0-9a-fA-F]{3,8}\\b',
    flags: 'g',
    test: 'Palette: #ff4136, #1a1a1c, #FFF, #GGG, #0e0e10',
  },
  date: {
    pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    flags: 'g',
    test: 'Released on 2026-03-21 and updated 2026-08-26, not 21/03/2026.',
  },
  time: {
    pattern: '\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?\\b',
    flags: 'gi',
    test: 'Meet at 9:30 AM, 14:00, 23:59:59 — not 25:00.',
  },
};

function getFlags(): string {
  return [...elFlagsWrap.querySelectorAll<HTMLElement>('.flag-btn.active')].map((b) => b.dataset.flag!).join('');
}

function getRegex(): RegExp | null {
  const p = elPattern.value;
  if (!p) {
    elError.textContent = '';
    elError.classList.remove('visible');
    (elPattern.closest('.pattern-row') as HTMLElement).classList.remove('error');
    return null;
  }
  try {
    const r = new RegExp(p, getFlags());
    elError.textContent = '';
    elError.classList.remove('visible');
    (elPattern.closest('.pattern-row') as HTMLElement).classList.remove('error');
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    elError.textContent = '✗ ' + msg;
    elError.classList.add('visible');
    (elPattern.closest('.pattern-row') as HTMLElement).classList.add('error');
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render(): void {
  const re = getRegex();
  const text = elTest.value;
  elHighlight.classList.add('simple');

  // Empty states
  if (!re || !text) {
    if (!text) {
      elHighlight.innerHTML = '<span style="color:var(--secondary-text);opacity:0.5;">No test string — type above to see highlights</span>';
      elStat.textContent = re ? 'Enter test text to match against' : '';
    } else if (!re) {
      if (!elPattern.value) {
        elHighlight.innerHTML = '<span style="color:var(--secondary-text);opacity:0.5;">Enter a pattern above — matches will highlight here</span>';
        elStat.textContent = '';
      } else {
        elHighlight.textContent = text;
        elStat.textContent = '';
      }
    }
    elMatchesPanel.style.display = 'none';
    elReplaceWrap.style.display = 'none';
    return;
  }

  // Match loop — protect against non-global infinite
  const flags = getFlags();
  const isGlobal = flags.includes('g') || flags.includes('y');
  const reGlobal = isGlobal ? re : new RegExp(re.source, flags + 'g');

  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  // Limit to prevent catastrophic hang
  let iter = 0;
  const MAX = 500;
  reGlobal.lastIndex = 0;
  while ((m = reGlobal.exec(text)) !== null) {
    matches.push(m);
    iter++;
    if (iter > MAX) break;
    if (m[0].length === 0) {
      reGlobal.lastIndex++;
      if (reGlobal.lastIndex > text.length) break;
    }
    // If original wasn't global, only one match
    if (!isGlobal) break;
  }

  // Highlight html
  if (matches.length === 0) {
    elHighlight.innerHTML = escapeHtml(text) + ' <span style="opacity:0.45">— no matches</span>';
    elStat.innerHTML = `No matches — <span style="opacity:0.6">${text.length} chars</span>`;
  } else {
    let html = '';
    let last = 0;
    for (const mm of matches) {
      const start = mm.index;
      const end = start + mm[0].length;
      html += escapeHtml(text.slice(last, start));
      // If empty-length match, show caret
      if (mm[0].length === 0) {
        html += '<span class="hl-match" style="padding:0 1px;border-style:dashed;">¦</span>';
      } else {
        html += `<span class="hl-match">${escapeHtml(mm[0])}</span>`;
      }
      last = end;
    }
    html += escapeHtml(text.slice(last));
    elHighlight.innerHTML = html;
    elStat.innerHTML = `<strong>${matches.length}</strong> match${matches.length === 1 ? '' : 'es'} · ${text.length} chars · ${flags ? `/${flags}` : ''}`;
  }

  // Matches list
  if (matches.length) {
    elMatchesPanel.style.display = '';
    elMatchesList.innerHTML = '';
    matches.forEach((mm, idx) => {
      const card = document.createElement('div');
      card.className = 'match-card';
      const named = mm.groups ? Object.entries(mm.groups).filter(([, v]) => v !== undefined) : [];
      const groupsHtml = mm.length > 1
        ? `<div class="match-groups">${mm
            .slice(1)
            .map((g, i) => `<span class="grp"><b>$${i + 1}</b> ${escapeHtml(g ?? '∅')}</span>`)
            .join('')}${named.map(([k, v]) => `<span class="grp grp-named"><b>$&lt;${escapeHtml(k)}&gt;</b> ${escapeHtml(v!)}</span>`).join('') || ''}</div>`
        : named.length
          ? `<div class="match-groups">${named.map(([k, v]) => `<span class="grp grp-named"><b>$&lt;${escapeHtml(k)}&gt;</b> ${escapeHtml(v!)}</span>`).join('')}</div>`
          : '';
      card.innerHTML = `
        <div class="match-head">
          <span class="match-idx">Match ${idx + 1}</span>
          <span class="match-pos">@${mm.index} · len ${mm[0].length}</span>
        </div>
        <div class="match-text">${escapeHtml(mm[0] || '∅ (zero-length)')}</div>
        ${groupsHtml}
      `;
      elMatchesList.appendChild(card);
    });
  } else {
    elMatchesPanel.style.display = 'none';
  }

  // Replace preview
  const repl = elReplaceInput.value;
  if (repl) {
    try {
      // Use original regex for replace (respect flags)
      const replaced = text.replace(re, repl);
      elReplacePreview.textContent = replaced;
      elReplaceWrap.style.display = '';
      (document.getElementById('btn-replace-copy') as HTMLElement).style.display = replaced !== text ? '' : 'none';
    } catch {
      elReplacePreview.textContent = '— invalid replacement —';
      elReplaceWrap.style.display = '';
    }
  } else {
    elReplaceWrap.style.display = 'none';
    (document.getElementById('btn-replace-copy') as HTMLElement).style.display = 'none';
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
elPattern.addEventListener('input', render);
elTest.addEventListener('input', render);
elReplaceInput.addEventListener('input', render);

elFlagsWrap.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.flag-btn');
  if (!b) return;
  b.classList.toggle('active');
  render();
});

for (const btn of document.querySelectorAll<HTMLElement>('.sample-btn')) {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    (btn as HTMLElement).blur();
    const key = btn.dataset.sample!;
    const s = SAMPLES[key];
    if (!s) return;
    elPattern.value = s.pattern;
    // set flags
    for (const fb of elFlagsWrap.querySelectorAll<HTMLElement>('.flag-btn')) {
      fb.classList.toggle('active', s.flags.includes(fb.dataset.flag!));
    }
    elTest.value = s.test;
    elReplaceInput.value = s.replace || '';
    render();
  });
}

// Copy buttons
function copyBtn(text: string, btn: HTMLElement): void {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  });
}

document.getElementById('btn-copy-pattern')!.addEventListener('click', () => {
  const flags = getFlags();
  const src = elPattern.value ? `/${elPattern.value}/${flags}` : '';
  copyBtn(src, document.getElementById('btn-copy-pattern') as HTMLElement);
});
document.getElementById('btn-copy-test')!.addEventListener('click', () => {
  copyBtn(elTest.value, document.getElementById('btn-copy-test') as HTMLElement);
});
elCopyReplace.addEventListener('click', () => copyBtn(elReplacePreview.textContent || '', elCopyReplace));
document.getElementById('btn-replace-copy')!.addEventListener('click', () => copyBtn(elReplacePreview.textContent || '', document.getElementById('btn-replace-copy') as HTMLElement));

// Cheat sheet toggle
elCheatToggle.addEventListener('click', () => {
  elCheatPanel.classList.toggle('open');
});
elCheatPanel.classList.add('open');

// Default demo
if (!elPattern.value && !elTest.value) {
  elPattern.value = '(?<user>\\w+)@(?<domain>\\w+)\\.(?<tld>\\w+)';
  elTest.value = 'Contact hello@s17labs.dev or hi@example.com — also test@invalid';
  for (const fb of elFlagsWrap.querySelectorAll<HTMLElement>('.flag-btn')) {
    fb.classList.toggle('active', ['g', 'i'].includes(fb.dataset.flag!));
  }
}
render();

// Sync highlight height with textarea scroll (for simple block mode we don't need, but keep stat live)
// Handle tab in test string like json lab
elTest.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = elTest.selectionStart, ee = elTest.selectionEnd;
    elTest.value = elTest.value.slice(0, s) + '\t' + elTest.value.slice(ee);
    elTest.selectionStart = elTest.selectionEnd = s + 1;
    render();
  }
});
