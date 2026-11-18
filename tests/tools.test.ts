import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOOLS } from '../src/data/tools.ts';
import { icons } from '../src/icons.ts';

const iconNames = Object.keys(icons) as Array<keyof typeof icons>;

test('tool slugs are unique and non-empty', () => {
  const slugs = TOOLS.map((tool) => tool.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slug found');
  for (const slug of slugs) assert.ok(slug.trim().length > 0, 'empty slug');
});

test('every tool references a registered icon', () => {
  for (const tool of TOOLS) {
    assert.ok(iconNames.includes(tool.icon), `unknown icon "${tool.icon}" for ${tool.slug}`);
  }
});

test('every tool has a name, description and non-empty tags', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name.trim().length > 0, `empty name for ${tool.slug}`);
    assert.ok(tool.description.trim().length > 0, `empty description for ${tool.slug}`);
    assert.ok(Array.isArray(tool.tags) && tool.tags.length > 0, `empty tags for ${tool.slug}`);
    for (const tag of tool.tags) {
      assert.ok(tag.trim().length > 0, `empty tag for ${tool.slug}`);
    }
  }
});
