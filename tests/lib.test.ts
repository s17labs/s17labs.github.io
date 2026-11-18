import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendDedupeFiles,
  formatKB,
  normalizeHex,
  splitFileName,
} from '../src/scripts/tools/lib.ts';

test('normalizeHex normalizes valid colors to lowercase #rrggbb', () => {
  assert.equal(normalizeHex('#FF4136'), '#ff4136');
  assert.equal(normalizeHex('ff4136'), '#ff4136');
  assert.equal(normalizeHex('  #ABCDEF  '), '#abcdef');
});

test('normalizeHex rejects invalid colors', () => {
  assert.equal(normalizeHex('#fff'), null);
  assert.equal(normalizeHex('#GGGGGG'), null);
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('red'), null);
  assert.equal(normalizeHex(''), null);
});

test('splitFileName splits off the final extension', () => {
  assert.deepEqual(splitFileName('archive.tar.gz'), { base: 'archive.tar', ext: 'gz' });
  assert.deepEqual(splitFileName('photo.PNG'), { base: 'photo', ext: 'png' });
});

test('splitFileName leaves extensionless names and dotfiles intact', () => {
  assert.deepEqual(splitFileName('README'), { base: 'README', ext: '' });
  assert.deepEqual(splitFileName('.gitignore'), { base: '.gitignore', ext: '' });
  assert.deepEqual(splitFileName('.env.local'), { base: '.env', ext: 'local' });
});

test('formatKB renders bytes as KB with one decimal place', () => {
  assert.equal(formatKB(0), '0.0 KB');
  assert.equal(formatKB(512), '0.5 KB');
  assert.equal(formatKB(1024), '1.0 KB');
  assert.equal(formatKB(1536), '1.5 KB');
});

test('appendDedupeFiles ignores empty incoming lists', () => {
  const files = [new File(['a'], 'a.png', { lastModified: 1 })];
  assert.equal(appendDedupeFiles(files, undefined), files);
  assert.equal(appendDedupeFiles(files, null), files);
  assert.equal(appendDedupeFiles(files, []), files);
  assert.equal(files.length, 1);
});

test('appendDedupeFiles dedupes on name, size and lastModified', () => {
  const existing = new File(['aaa'], 'a.png', { lastModified: 1 });
  const files: File[] = [existing];
  const duplicate = new File(['aaa'], 'a.png', { lastModified: 1 });
  const newer = new File(['aaa'], 'a.png', { lastModified: 2 });
  const otherName = new File(['aaa'], 'b.png', { lastModified: 1 });

  const result = appendDedupeFiles(files, [duplicate, newer, otherName]);

  assert.equal(result, files, 'mutates and returns the input array');
  assert.deepEqual(result, [existing, newer, otherName]);
});
