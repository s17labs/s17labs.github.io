// Back-link label fitting (tool headers + design page).
//
// The label hides only when it would actually collide with the centered
// title — a fixed breakpoint hides it even when there is room (short
// titles on tablets) and shows it when there isn't (long titles on
// phones). Measure both boxes after layout and fonts, refit on resize.

function fitBackLink(): void {
  const link = document.querySelector<HTMLElement>('.back-link');
  const header = link?.closest('.tool-header, .ds-hero');
  const title = header?.querySelector('h1');
  if (!link || !header || !title) return;
  link.classList.remove('compact');
  const linkBox = link.getBoundingClientRect();
  const titleBox = title.getBoundingClientRect();
  if (linkBox.right + 8 > titleBox.left) link.classList.add('compact');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitBackLink);
} else {
  fitBackLink();
}
window.addEventListener('resize', fitBackLink);
// Aldrich loads async and changes the title width — refit once it arrives.
if (document.fonts) {
  document.fonts.ready.then(() => fitBackLink());
}
