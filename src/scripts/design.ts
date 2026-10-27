/**
 * /design/ page interactions — modal demo + specimen buttons.
 * Loaded by src/pages/design.astro.
 */

const demo = document.getElementById('ds-modal-demo');
const demoOpenBtn = document.getElementById('ds-modal-open');
const demoOk = document.getElementById('ds-modal-ok');
const live = document.getElementById('live-region');
let demoLockY = 0;
let demoReturnFocus: HTMLElement | null = null;

function dsAnnounce(message: string): void {
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}

function setDemoBackgroundInert(inert: boolean): void {
  for (const selector of ['.ds-page', '.topbar', '.footer', '.skip-link']) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) el.inert = inert;
  }
}

function demoLock(): void {
  demoLockY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${demoLockY}px`;
  document.body.style.width = '100%';
  document.documentElement.style.overflow = 'hidden';
}

function demoUnlock(): void {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.documentElement.style.overflow = '';
  window.scrollTo(0, demoLockY);
}

function demoOpen(): void {
  if (!demo || demo.classList.contains('visible')) return;
  demoReturnFocus = document.activeElement as HTMLElement | null;
  demo.classList.add('visible');
  demoLock();
  setDemoBackgroundInert(true);
  demoOk?.focus();
}
function demoClose(): void {
  if (!demo?.classList.contains('visible')) return;
  demo.classList.remove('visible');
  setDemoBackgroundInert(false);
  demoUnlock();
  const target = demoReturnFocus;
  demoReturnFocus = null;
  target?.focus();
}

demoOpenBtn?.addEventListener('click', demoOpen);
demoOk?.addEventListener('click', demoClose);
demo?.addEventListener('click', (e) => {
  if (e.target === demo) demoClose();
});

demo?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    demoClose();
    return;
  }
  if (e.key !== 'Tab') return;
  const card = demo.querySelector<HTMLElement>('.modal-card');
  if (!card) return;
  const focusables = [...card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// The page is a style reference: controls that are only specimens still
// respond, so nothing on the page is a silently dead button.
document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.ds-page button');
  if (!button || button.id === 'ds-modal-open' || button.hasAttribute('data-search-open')) return;
  if (button.closest('[data-cp-field]')) return;

  if (button.matches('.topbar-search-clear')) {
    const field = button.closest('.topbar-search-field');
    const input = field?.querySelector('input');
    if (input) {
      input.value = '';
      input.focus();
      button.hidden = true;
      dsAnnounce('Search specimen cleared');
    }
    return;
  }

  if (button.matches('.choice-btn')) {
    const siblings = [...(button.parentElement?.querySelectorAll<HTMLElement>('.choice-btn') ?? [])];
    if (siblings.length > 1) {
      for (const sibling of siblings) sibling.classList.toggle('active', sibling === button);
      dsAnnounce('Choice selected — styling specimen only');
      return;
    }
  }

  if (button.hasAttribute('aria-expanded')) {
    button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
  }

  dsAnnounce(button.dataset.specimen || 'Styling specimen — controls on this page are for reference');
});

document.querySelector('.ds-demo .drop-zone')?.addEventListener('click', () => {
  dsAnnounce('Drop zone is a visual specimen on this page');
});
export {};
