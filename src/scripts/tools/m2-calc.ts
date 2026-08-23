// ════════════════════════════════════════════════
//  m² Calc — standalone construction cost calculator
// ════════════════════════════════════════════════

interface Area {
  id: number;
  name: string;
  l: number;
  w: number;
}

type LangCode = 'en' | 'sk' | 'de';
type ThemeChoice = 'dark' | 'light' | 'system';

type Strings = Record<string, string>;

// ════════════════════════════════════════════════
//  TRANSLATIONS
// ════════════════════════════════════════════════
const LANGS: Record<LangCode, Strings> = {
  en: {
    sec_rate: 'Your Rate',
    lbl_rate: 'Price per m²',
    ph_rate: '0.00',
    lbl_waste: 'Waste / Extra %',
    ph_waste: '10',
    lbl_vat: 'VAT %',
    ph_vat: '21',
    sec_area: 'Area',
    tab_direct: 'm² Direct',
    tab_lw: 'L × W',
    tab_multi: 'Multiple',
    lbl_area_direct: 'Total Area (m²)',
    ph_area: 'e.g. 24.5',
    lbl_length: 'Length (m)',
    lbl_width: 'Width (m)',
    sec_result: 'Cost Breakdown',
    btn_add_area: 'Add Area',
    btn_reset: 'Clear All',
    theme_dark: 'Dark',
    theme_light: 'Light',
    theme_system: 'System',
    splash_title: 'm² Calc',
    splash_sub: 'Contractor Work Calculator',
    splash_desc:
      'Quickly calculate the <strong>total cost</strong> of any construction work by area — with VAT, waste factor and multiple room support.',
    sf1: 'Set your own €/m² rate',
    sf2: 'Direct m², L×W, or multiple areas',
    sf3: 'Waste % and VAT included',
    sf4: 'Dark, light & system theme',
    splash_dontshow: "Don't show this again",
    splash_btn: 'Get Started →',
    res_net: 'Net area',
    res_waste: 'Area incl. waste',
    res_rate: 'Rate',
    res_net_cost: 'Cost ex. VAT',
    res_vat: 'VAT',
    res_total: 'Total',
    res_total_vat: 'Total incl. VAT',
    empty_text: 'Enter your rate and area\nto see the cost breakdown.',
    ph_name: 'Name',
    ph_l: 'L (m)',
    ph_w: 'W (m)',
    total_prefix: 'Total: ',
    theme_label_dark: 'Dark',
    theme_label_light: 'Light',
    theme_label_system: 'System',
  },
  sk: {
    sec_rate: 'Vaša sadzba',
    lbl_rate: 'Cena za m²',
    ph_rate: '0,00',
    lbl_waste: 'Odpad / Prídavok %',
    ph_waste: '10',
    lbl_vat: 'DPH %',
    ph_vat: '20',
    sec_area: 'Plocha',
    tab_direct: 'm² priamo',
    tab_lw: 'D × Š',
    tab_multi: 'Viacero',
    lbl_area_direct: 'Celková plocha (m²)',
    ph_area: 'napr. 24,5',
    lbl_length: 'Dĺžka (m)',
    lbl_width: 'Šírka (m)',
    sec_result: 'Cenová kalkulácia',
    btn_add_area: 'Pridať plochu',
    btn_reset: 'Vymazať všetko',
    theme_dark: 'Tmavý',
    theme_light: 'Svetlý',
    theme_system: 'Systémový',
    splash_title: 'm² Kalkulátor',
    splash_sub: 'Kalkulátor pre stavbárov',
    splash_desc:
      'Rýchlo vypočítajte <strong>celkové náklady</strong> na akúkoľvek stavebnú prácu podľa plochy — vrátane DPH, odpadu a viacerých miestností.',
    sf1: 'Zadajte vlastnú sadzbu €/m²',
    sf2: 'Priamo m², D×Š alebo viacero plôch',
    sf3: 'Zahrnutý odpad % a DPH',
    sf4: 'Tmavý, svetlý a systémový motív',
    splash_dontshow: 'Viac nezobrazovať',
    splash_btn: 'Začať →',
    res_net: 'Čistá plocha',
    res_waste: 'Plocha vr. odpadu',
    res_rate: 'Sadzba',
    res_net_cost: 'Náklady bez DPH',
    res_vat: 'DPH',
    res_total: 'Celkom',
    res_total_vat: 'Celkom vr. DPH',
    empty_text: 'Zadajte sadzbu a plochu\npre výpočet nákladov.',
    ph_name: 'Názov',
    ph_l: 'D (m)',
    ph_w: 'Š (m)',
    total_prefix: 'Spolu: ',
    theme_label_dark: 'Tmavý',
    theme_label_light: 'Svetlý',
    theme_label_system: 'Systémový',
  },
  de: {
    sec_rate: 'Ihr Preis',
    lbl_rate: 'Preis pro m²',
    ph_rate: '0,00',
    lbl_waste: 'Verschnitt / Zugabe %',
    ph_waste: '10',
    lbl_vat: 'MwSt. %',
    ph_vat: '19',
    sec_area: 'Fläche',
    tab_direct: 'm² direkt',
    tab_lw: 'L × B',
    tab_multi: 'Mehrere',
    lbl_area_direct: 'Gesamtfläche (m²)',
    ph_area: 'z. B. 24,5',
    lbl_length: 'Länge (m)',
    lbl_width: 'Breite (m)',
    sec_result: 'Kostenübersicht',
    btn_add_area: 'Fläche hinzufügen',
    btn_reset: 'Alles löschen',
    theme_dark: 'Dunkel',
    theme_light: 'Hell',
    theme_system: 'System',
    splash_title: 'm² Rechner',
    splash_sub: 'Handwerker-Kalkulator',
    splash_desc:
      'Berechnen Sie schnell die <strong>Gesamtkosten</strong> für Bauarbeiten nach Fläche — mit MwSt., Verschnitt und Mehrraum-Unterstützung.',
    sf1: 'Eigenen €/m²-Preis festlegen',
    sf2: 'Direkt m², L×B oder mehrere Flächen',
    sf3: 'Verschnitt % und MwSt. einbezogen',
    sf4: 'Dunkel-, Hell- & Systemdesign',
    splash_dontshow: 'Nicht mehr anzeigen',
    splash_btn: 'Loslegen →',
    res_net: 'Nettofläche',
    res_waste: 'Fläche inkl. Verschnitt',
    res_rate: 'Preis',
    res_net_cost: 'Kosten ohne MwSt.',
    res_vat: 'MwSt.',
    res_total: 'Gesamt',
    res_total_vat: 'Gesamt inkl. MwSt.',
    empty_text: 'Preis und Fläche eingeben\num die Kalkulation zu sehen.',
    ph_name: 'Name',
    ph_l: 'L (m)',
    ph_w: 'B (m)',
    total_prefix: 'Gesamt: ',
    theme_label_dark: 'Dunkel',
    theme_label_light: 'Hell',
    theme_label_system: 'System',
  },
};

// ════════════════════════════════════════════════
//  COOKIES
// ════════════════════════════════════════════════
function setCookie(k: string, v: string, days = 365): void {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = k + '=' + encodeURIComponent(v) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

function getCookie(k: string): string | null {
  const name = k + '=';
  for (const c of document.cookie.split(';')) {
    const t = c.trim();
    if (t.startsWith(name)) return decodeURIComponent(t.substring(name.length));
  }
  return null;
}

// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
let lang = (getCookie('m2_lang') as LangCode) || 'en';
let themeChoice = (getCookie('m2_theme') as ThemeChoice) || 'system';
let method: 'direct' | 'lw' | 'multi' = 'direct';
let areas: Area[] = [
  { id: 1, name: '', l: 0, w: 0 },
  { id: 2, name: '', l: 0, w: 0 },
];
let nid = 3;

const $ = (id: string) => document.getElementById(id)!;

// ════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════
const themeIcons: Record<ThemeChoice, string> = {
  dark: `<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>`,
  light: `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`,
  system: `<rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/>`,
};

function applyTheme(choice: ThemeChoice): void {
  themeChoice = choice;
  let actual: ThemeChoice = choice;
  if (choice === 'system') {
    actual = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.setAttribute('data-theme', actual);
  const icon = $('theme-icon');
  icon.innerHTML = themeIcons[choice] || themeIcons.dark;
  const T = LANGS[lang];
  const labels: Record<ThemeChoice, string> = {
    dark: T.theme_label_dark,
    light: T.theme_label_light,
    system: T.theme_label_system,
  };
  $('theme-label').textContent = labels[choice] || choice;
  (['dark', 'light', 'system'] as const).forEach((k) => {
    $('thck-' + k).style.color = k === choice ? 'var(--amber)' : 'transparent';
  });
}

function setTheme(choice: ThemeChoice): void {
  setCookie('m2_theme', choice);
  applyTheme(choice);
  closeAllMenus();
}

function toggleThemeMenu(e: Event): void {
  e.stopPropagation();
  const m = $('theme-menu');
  const isOpen = m.classList.contains('open');
  closeAllMenus();
  if (!isOpen) m.classList.add('open');
}

// ════════════════════════════════════════════════
//  LANGUAGE
// ════════════════════════════════════════════════
function t(key: string): string {
  return (LANGS[lang] || LANGS.en)[key] || key;
}

function applyLang(l: LangCode): void {
  lang = l;
  const T = LANGS[l];
  const labels: Record<LangCode, string> = { en: 'EN', sk: 'SK', de: 'DE' };
  $('lang-label').textContent = labels[l];
  (['en', 'sk', 'de'] as const).forEach((k) => {
    $('lngck-' + k).style.color = k === l ? 'var(--amber)' : 'transparent';
    const slBtn = document.getElementById('sl-' + k);
    if (slBtn) slBtn.classList.toggle('active', k === l);
  });
  // Update all data-i elements
  document.querySelectorAll('[data-i]').forEach((el) => {
    const key = el.getAttribute('data-i')!;
    const val = T[key];
    if (!val) return;
    if (key.startsWith('splash_desc')) el.innerHTML = val;
    else el.textContent = val;
  });
  // Update placeholders
  document.querySelectorAll('[data-i-ph]').forEach((el) => {
    const key = el.getAttribute('data-i-ph')!;
    (el as HTMLInputElement).placeholder = T[key] || '';
  });
  // Update theme dropdown labels
  document.querySelectorAll('#theme-menu .dd-item').forEach((el, i) => {
    const keys = ['theme_dark', 'theme_light', 'theme_system'];
    const span = el.querySelector('span:nth-child(2)');
    if (span) span.textContent = T[keys[i]];
  });
  // Re-apply theme label
  applyTheme(themeChoice);
  // Re-render dynamic content
  renderAreas();
  calc();
}

function setLang(l: LangCode): void {
  setCookie('m2_lang', l);
  applyLang(l);
  closeAllMenus();
}

function toggleLangMenu(e: Event): void {
  e.stopPropagation();
  const m = $('lang-menu');
  const isOpen = m.classList.contains('open');
  closeAllMenus();
  if (!isOpen) m.classList.add('open');
}

function closeAllMenus(): void {
  document.querySelectorAll('.dropdown').forEach((d) => d.classList.remove('open'));
}
document.addEventListener('click', closeAllMenus);

$('theme-btn').addEventListener('click', toggleThemeMenu);
$('lang-btn').addEventListener('click', toggleLangMenu);

document.querySelectorAll<HTMLElement>('#theme-menu .dd-item').forEach((el) => {
  el.addEventListener('click', () => setTheme(el.dataset.theme as ThemeChoice));
});

document.querySelectorAll<HTMLElement>('#lang-menu .dd-item').forEach((el) => {
  el.addEventListener('click', () => setLang(el.dataset.lang as LangCode));
});

// ════════════════════════════════════════════════
//  SPLASH
// ════════════════════════════════════════════════
let splashChecked = false;

document.querySelector('.splash-check')!.addEventListener('click', () => {
  splashChecked = !splashChecked;
  const box = $('splash-cbox');
  box.classList.toggle('checked', splashChecked);
});

document.querySelectorAll<HTMLElement>('.sl-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const l = btn.dataset.lang as LangCode;
    (['en', 'sk', 'de'] as const).forEach((k) => {
      $('sl-' + k).classList.toggle('active', k === l);
    });
    setLang(l);
  });
});

function closeSplash(): void {
  if (splashChecked) {
    setCookie('m2_splash_seen', '1', 365);
  }
  $('splash-overlay').classList.remove('open');
}

$('.splash-btn')!.addEventListener('click', closeSplash);

function initSplash(): void {
  const seen = getCookie('m2_splash_seen');
  if (!seen) $('splash-overlay').classList.add('open');
}

// ════════════════════════════════════════════════
//  METHOD SWITCHING
// ════════════════════════════════════════════════
function setMethod(m: 'direct' | 'lw' | 'multi'): void {
  method = m;
  (['direct', 'lw', 'multi'] as const).forEach((k) => {
    $('inp-' + k).style.display = k === m ? 'block' : 'none';
    $('tab-' + k).classList.toggle('active', k === m);
  });
  syncFromMethod();
  calc();
}

for (const m of ['direct', 'lw', 'multi'] as const) {
  $('tab-' + m).addEventListener('click', () => setMethod(m));
}

function syncFromMethod(): void {
  if (method === 'multi') {
    const tot = areas.reduce((s, a) => s + a.l * a.w, 0);
    ($('area-direct') as HTMLInputElement).value = tot ? String(tot) : '';
  } else if (method === 'lw') {
    lwChange();
  }
}

// ════════════════════════════════════════════════
//  L×W
// ════════════════════════════════════════════════
function lwChange(): void {
  const l = Number(($('lw-l') as HTMLInputElement).value);
  const w = Number(($('lw-w') as HTMLInputElement).value);
  const a = l * w;
  $('lw-prev').textContent = l && w ? `= ${fmt(a, 3)} m²` : '';
  ($('area-direct') as HTMLInputElement).value = l && w ? String(a) : '';
  calc();
}

['lw-l', 'lw-w'].forEach((id) => {
  $(id).addEventListener('input', lwChange);
  $(id).addEventListener('focus', checkRateFocus);
});

// ════════════════════════════════════════════════
//  MULTI AREAS
// ════════════════════════════════════════════════
function addArea(): void {
  areas.push({ id: nid++, name: '', l: 0, w: 0 });
  renderAreas();
}

$('add-area-btn').addEventListener('click', addArea);

function delArea(id: number): void {
  if (areas.length <= 1) return;
  areas = areas.filter((a) => a.id !== id);
  renderAreas();
}

function upArea(id: number, k: 'name' | 'l' | 'w', v: string): void {
  const a = areas.find((x) => x.id === id);
  if (!a) return;
  if (k === 'name') a.name = v;
  else a[k] = Number(v);
  // Update only the badge for this row — don't re-render DOM (keeps keyboard open)
  const badge = document.getElementById('badge-' + id);
  if (badge) badge.textContent = a.l && a.w ? fmt(a.l * a.w, 2) : '—';
  updateMultiTotal();
  calc();
}

function updateMultiTotal(): void {
  const T = LANGS[lang];
  const tot = areas.reduce((s, a) => s + a.l * a.w, 0);
  $('mtotal').textContent = tot > 0 ? (T.total_prefix || 'Total: ') + fmt(tot, 3) + ' m²' : '';
  ($('area-direct') as HTMLInputElement).value = tot ? String(tot) : '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderAreas(): void {
  const T = LANGS[lang];
  $('multi-list').innerHTML = areas
    .map(
      (a) => `
    <div class="arow" data-id="${a.id}">
      <input class="an" type="text" placeholder="${esc(T.ph_name || 'Name')}" value="${esc(a.name)}"
        data-k="name"
        style="flex:1.2;min-width:0;">
      <input class="ad" type="number" inputmode="decimal" placeholder="${esc(T.ph_l || 'L')}" value="${a.l || ''}"
        data-k="l"
        style="flex:1;min-width:0;">
      <input class="ad" type="number" inputmode="decimal" placeholder="${esc(T.ph_w || 'W')}" value="${a.w || ''}"
        data-k="w"
        style="flex:1;min-width:0;">
      <div class="abadge" id="badge-${a.id}">${a.l && a.w ? fmt(a.l * a.w, 2) : '—'}</div>
      <button class="delbtn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`
    )
    .join('');
  updateMultiTotal();
  calc();
}

// Delegated listeners for dynamically rendered area rows
const multiList = $('multi-list');

multiList.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  const row = input.closest<HTMLElement>('.arow');
  if (!row || !input.dataset.k) return;
  upArea(Number(row.dataset.id), input.dataset.k as 'name' | 'l' | 'w', input.value);
});

multiList.addEventListener('focusin', () => checkRateFocus());

multiList.addEventListener('click', (e) => {
  const del = (e.target as HTMLElement).closest('.delbtn');
  if (!del) return;
  const row = del.closest<HTMLElement>('.arow')!;
  delArea(Number(row.dataset.id));
});

// ════════════════════════════════════════════════
//  CALC
// ════════════════════════════════════════════════
function fmt(n: number, d = 2): string {
  if (isNaN(n) || !isFinite(n)) return '—';
  if (n === 0 && d > 0) return '0.' + '0'.repeat(d);
  return n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function eur(n: number): string {
  return '€\u202f' + fmt(n, 2);
}

function calc(): void {
  const rate = Number(($('rate') as HTMLInputElement).value);
  const waste = Number(($('waste') as HTMLInputElement).value) || 0;
  const vat = Number(($('vat') as HTMLInputElement).value) || 0;
  const area = Number(($('area-direct') as HTMLInputElement).value);
  const wrap = $('result-wrap');
  const T = LANGS[lang];

  if (!rate || !area) {
    wrap.innerHTML = `<div class="result-card"><div class="empty"><div class="empty-icon">📐</div>${(T.empty_text || '').replace('\n', '<br>')}</div></div>`;
    return;
  }

  const areaW = area * (1 + waste / 100);
  const net = areaW * rate;
  const vatAmt = (net * vat) / 100;
  const total = net + vatAmt;
  const totalLabel = vat ? T.res_total_vat : T.res_total;

  const wasteRow = waste
    ? `<div class="rrow"><div class="rk">${T.res_waste} (${waste}%)</div><div class="rv">${fmt(areaW, 3)} m²</div></div>`
    : '';
  const vatRow = vat
    ? `<div class="rrow"><div class="rk">${T.res_vat} (${vat}%)</div><div class="rv">${eur(vatAmt)}</div></div>`
    : '';

  wrap.innerHTML = `
    <div class="result-card">
      <div class="total-bar">
        <div class="total-lbl">${totalLabel}</div>
        <div class="total-val">${eur(total)}</div>
      </div>
      <div class="rrows">
        <div class="rrow"><div class="rk">${T.res_net}</div><div class="rv">${fmt(area, 3)} m²</div></div>
        ${wasteRow}
        <div class="rrow"><div class="rk">${T.res_rate}</div><div class="rv">${eur(rate)}/m²</div></div>
        <div class="rrow"><div class="rk">${T.res_net_cost}</div><div class="rv">${eur(net)}</div></div>
        ${vatRow}
      </div>
    </div>`;
}

['rate', 'waste', 'vat'].forEach((id) => $(id).addEventListener('input', calc));

// ════════════════════════════════════════════════
//  RATE HIGHLIGHT
// ════════════════════════════════════════════════
function checkRateFocus(): void {
  const rateEl = $('rate') as HTMLInputElement;
  if (!rateEl.value) {
    rateEl.focus();
    rateEl.classList.remove('rate-highlight');
    void rateEl.offsetWidth; // reflow to restart animation
    rateEl.classList.add('rate-highlight');
    rateEl.addEventListener('animationend', () => rateEl.classList.remove('rate-highlight'), { once: true });
  }
}

$('area-direct').addEventListener('focus', checkRateFocus);

// ════════════════════════════════════════════════
//  RESET
// ════════════════════════════════════════════════
function resetAll(): void {
  (['rate', 'waste', 'vat', 'area-direct', 'lw-l', 'lw-w'] as const).forEach((id) => {
    ($(id) as HTMLInputElement).value = '';
  });
  $('lw-prev').textContent = '';
  areas = [
    { id: 1, name: '', l: 0, w: 0 },
    { id: 2, name: '', l: 0, w: 0 },
  ];
  nid = 3;
  renderAreas();
  setMethod('direct');
  calc();
}

$('reset-btn').addEventListener('click', resetAll);

// ════════════════════════════════════════════════
//  SYSTEM THEME LISTENER
// ════════════════════════════════════════════════
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (themeChoice === 'system') applyTheme('system');
});

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
applyTheme(themeChoice);
applyLang(lang);
initSplash();
