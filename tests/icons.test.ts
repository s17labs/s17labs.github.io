import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iconSvg, icons } from '../src/icons.ts';

test('iconSvg emits an inline SVG with the expected viewBox and path', () => {
  const svg = iconSvg('github');
  assert.match(svg, /^<svg /);
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('viewBox="0 0 24 24"'));
  assert.ok(svg.includes('fill="currentColor"'));
  assert.ok(svg.includes('aria-hidden="true"'));
  assert.ok(svg.includes(`<path d="${icons.github.path}"></path>`));
});

test('iconSvg adds a class only when one is provided', () => {
  assert.ok(!iconSvg('github').includes('class='));
  assert.ok(iconSvg('github', 'my-icon').includes('class="my-icon"'));
});

test('every registered icon renders its own viewBox and path', () => {
  for (const [name, icon] of Object.entries(icons)) {
    const svg = iconSvg(name as keyof typeof icons);
    assert.ok(svg.includes(`viewBox="${icon.viewBox}"`), `${name}: viewBox missing`);
    assert.ok(svg.includes(`<path d="${icon.path}"></path>`), `${name}: path missing`);
  }
});
