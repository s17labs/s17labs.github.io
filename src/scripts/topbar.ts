// Top bar: menu disclosure, client-side search, and the scroll-aware bar.
// Runs on every page — the search dialog is rendered by BaseLayout even
// when the page has no top bar (home).

import { TOOLS } from '../data/tools';
import { PROJECTS } from '../data/projects';
import { SITE } from '../data/site';
import { SITE_NAV, SITE_LINKS, DESIGN_SECTIONS } from '../data/nav';
import { iconSvg, type IconName } from '../icons';

interface SearchItem {
  label: string;
  hint: string;
  href: string;
  kind: string;
  keywords: string;
  icon?: IconName;
  haystack: string;
}

const items: SearchItem[] = [
  ...TOOLS.map((tool) => ({
    label: tool.name,
    hint: tool.description,
    href: `${SITE.toolsUrl}${tool.slug}/`,
    kind: 'Tool',
    keywords: tool.tags.join(' '),
    icon: tool.icon,
  })),
  ...PROJECTS.map((project) => ({
    label: project.name,
    hint: project.description,
    href: project.url,
    kind: 'Project',
    keywords: project.tags.join(' '),
    icon: project.icon,
  })),
  ...SITE_NAV.map((link) => ({
    label: link.label,
    hint: link.description,
    href: link.href,
    kind: 'Page',
    keywords: 'site page',
  })),
  ...DESIGN_SECTIONS.map((section) => ({
    label: section.label,
    hint: section.description,
    href: `${SITE.designUrl}#${section.id}`,
    kind: 'Design',
    // Group only — a bare "design" keyword would match every section and
    // bury the Design System page itself.
    keywords: section.group,
  })),
  ...SITE_LINKS.map((link) => ({
    label: link.label,
    hint: link.description,
    href: link.href,
    kind: 'Link',
    keywords: 'social community',
    icon: link.icon,
  })),
].map((item) => ({
  ...item,
  haystack: `${item.label} ${item.hint} ${item.keywords}`.toLowerCase(),
}));

const MAX_RESULTS = 8;

function score(item: SearchItem, term: string): number {
  const label = item.label.toLowerCase();
  if (label === term) return 100;
  if (label.startsWith(term)) return 80;
  if (label.includes(term)) return 60;
  if (item.keywords.toLowerCase().includes(term)) return 40;
  if (item.haystack.includes(term)) return 20;
  return 0;
}

/** Every term must hit something; the best-scoring term decides the rank. */
function runSearch(query: string): SearchItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.slice(0, MAX_RESULTS);

  const ranked = items
    .map((item) => {
      const scores = terms.map((term) => score(item, term));
      const total = scores.reduce((sum, value) => sum + value, 0);
      return { item, total, missed: scores.some((value) => value === 0) };
    })
    .filter((entry) => !entry.missed && entry.total > 0);

  return ranked
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.item);
}

const openButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-search-open]'));
const menuToggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const menu = document.querySelector<HTMLElement>('[data-menu]');
const search = document.querySelector<HTMLElement>('[data-search]');
const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
const searchResults = document.querySelector<HTMLElement>('[data-search-results]');
const searchClear = document.querySelector<HTMLButtonElement>('[data-search-clear]');

let restoreFocus: HTMLElement | null = null;
let results: SearchItem[] = [];
let active = -1;

function lock(open: boolean): void {
  document.documentElement.classList.toggle('topbar-open', open);
}

function closeMenu(): void {
  if (!menu || !menuToggle) return;
  menu.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Menu');
  if (!search || search.hidden) lock(false);
}

function openMenu(): void {
  if (!menu || !menuToggle) return;
  menu.hidden = false;
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Close menu');
  lock(true);
}

function closeSearch(): void {
  if (!search) return;
  search.hidden = true;
  openButtons.forEach((button) => button.setAttribute('aria-label', 'Search'));
  active = -1;
  // No menu on the home page, so `!menu` must also count as "menu closed".
  if (!menu || menu.hidden) lock(false);
  (restoreFocus ?? openButtons[0])?.focus();
}

function openSearch(): void {
  if (!search || !searchInput) return;
  restoreFocus = document.activeElement as HTMLElement | null;
  if (menu) menu.hidden = true;
  menuToggle?.setAttribute('aria-expanded', 'false');
  search.hidden = false;
  lock(true);
  searchInput.value = '';
  // Assigning .value fires no input event, so sync the clear button here too.
  if (searchClear) searchClear.hidden = true;
  render(runSearch(''));
  searchInput.focus();
}

/** The field's ✕ appears only once there's something to clear, so it only
    ever clears — Escape and the backdrop click close the dialog. */
function clearQuery(): void {
  if (!searchInput) return;
  searchInput.value = '';
  if (searchClear) searchClear.hidden = true;
  render(runSearch(''));
  searchInput.focus();
}

for (const button of openButtons) {
  button.addEventListener('click', () => {
    if (search?.hidden) openSearch();
    else closeSearch();
  });
}

menuToggle?.addEventListener('click', () => {
  if (menu?.hidden) openMenu();
  else closeMenu();
});

searchClear?.addEventListener('click', clearQuery);

// Click-away for the dropdown; the search dialog is modal, so it only
// closes on its own close button, Escape, or a result click.
document.addEventListener('click', (event) => {
  if (!menu || menu.hidden) return;
  const target = event.target as Node;
  if (menu.contains(target) || menuToggle?.contains(target)) return;
  closeMenu();
});

/* ── Search ───────────────────────────────────────────────────────── */

function render(list: SearchItem[]): void {
  if (!searchResults) return;
  results = list;
  active = list.length ? 0 : -1;
  searchResults.replaceChildren();

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'topbar-empty';
    empty.textContent = 'No matches — try a tool name, a tag, or a section.';
    searchResults.append(empty);
    searchInput?.setAttribute('aria-activedescendant', '');
    return;
  }

  list.forEach((item, index) => {
    const row = document.createElement('a');
    row.className = 'topbar-result';
    row.id = `topbar-result-${index}`;
    row.href = item.href;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === active));
    if (item.icon) {
      const icon = document.createElement('span');
      icon.className = 'topbar-result-icon';
      icon.innerHTML = iconSvg(item.icon);
      row.append(icon);
    }
    const text = document.createElement('span');
    text.className = 'topbar-result-text';
    const label = document.createElement('span');
    label.className = 'topbar-result-label';
    label.textContent = item.label;
    const hint = document.createElement('span');
    hint.className = 'topbar-result-hint';
    hint.textContent = item.hint;
    text.append(label, hint);
    const kind = document.createElement('span');
    kind.className = 'topbar-result-kind';
    kind.textContent = item.kind;
    row.append(text, kind);
    row.addEventListener('mouseenter', () => select(index));
    searchResults?.append(row);
  });

  select(active);
}

function select(index: number): void {
  active = index;
  searchResults
    ?.querySelectorAll<HTMLElement>('.topbar-result')
    .forEach((row, i) => {
      const on = i === index;
      row.setAttribute('aria-selected', String(on));
      row.classList.toggle('active', on);
      if (on) {
        row.scrollIntoView({ block: 'nearest' });
        searchInput?.setAttribute('aria-activedescendant', row.id);
      }
    });
}

function step(delta: number): void {
  if (!results.length) return;
  select((active + delta + results.length) % results.length);
}

function openActive(): void {
  const row = searchResults?.querySelectorAll<HTMLAnchorElement>('.topbar-result')[active];
  if (!row) return;
  // Close before activating: a same-page result (a /design/ section, a
  // project) only changes the hash, so nothing would ever close the dialog
  // for us and it would hang over the target it just jumped to.
  closeSearch();
  row.click();
}

searchInput?.addEventListener('input', () => {
  render(runSearch(searchInput.value));
  if (searchClear) searchClear.hidden = !searchInput.value;
});

searchInput?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    step(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    step(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    openActive();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeSearch();
  }
});

// Keep Tab inside the dialog while it is open — the page behind must not
// be reachable, and focus must never land in a page input on close.
search?.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusables = search.querySelectorAll<HTMLElement>(
    'input, button, a[href], [tabindex]:not([tabindex="-1"])',
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

search?.addEventListener('click', (event) => {
  if (event.target === search) closeSearch();
});

// A real click on a row is already navigation, so only the dialog needs
// closing — re-dispatching the click here would re-enter this handler.
searchResults?.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement | null)?.closest('.topbar-result');
  if (row) closeSearch();
});

/* ── Scroll-aware bar ─────────────────────────────────────────────── */

// At the top of the page the bar is the same color as the page and has no
// rule; scrolling swaps in a translucent blur + hairline. The class drives
// a CSS transition so the change is a fade, not a pop.
const topbar = document.querySelector<HTMLElement>('.topbar');
if (topbar) {
  const syncScrollState = () => topbar.classList.toggle('is-scrolled', window.scrollY > 4);
  syncScrollState();
  window.addEventListener('scroll', syncScrollState, { passive: true });
}

/* ── Global keys ──────────────────────────────────────────────────── */

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (search && !search.hidden) {
      event.preventDefault();
      closeSearch();
    } else if (menu && !menu.hidden) {
      closeMenu();
      menuToggle?.focus();
    }
    return;
  }

  const target = event.target as HTMLElement | null;
  const typing =
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable === true;
  if (typing) return;

  if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault();
    openSearch();
  }
});
