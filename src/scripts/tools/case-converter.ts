export function words(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // split acronyms
    .replace(/[-_./]+/g, ' ') // split separators
    .replace(/[^a-zA-Z0-9\s]/g, '') // strip special chars
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function cap(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export interface CaseFormat {
  id: string;
  label: string;
  preview: string;
  fn: (s: string) => string;
}

export const FORMATS: CaseFormat[] = [
  { id: 'lower', label: 'lowercase', preview: 'hello world', fn: (s) => words(s).join(' ').toLowerCase() },
  { id: 'upper', label: 'UPPERCASE', preview: 'HELLO WORLD', fn: (s) => words(s).join(' ').toUpperCase() },
  {
    id: 'camel',
    label: 'camelCase',
    preview: 'helloWorld',
    fn: (s) => {
      const w = words(s);
      return w[0].toLowerCase() + w.slice(1).map(cap).join('');
    },
  },
  { id: 'pascal', label: 'PascalCase', preview: 'HelloWorld', fn: (s) => words(s).map(cap).join('') },
  { id: 'snake', label: 'snake_case', preview: 'hello_world', fn: (s) => words(s).join('_').toLowerCase() },
  { id: 'kebab', label: 'kebab-case', preview: 'hello-world', fn: (s) => words(s).join('-').toLowerCase() },
  { id: 'title', label: 'Title Case', preview: 'Hello World', fn: (s) => words(s).map(cap).join(' ') },
  {
    id: 'sentence',
    label: 'Sentence case',
    preview: 'Hello world',
    fn: (s) => {
      const w = words(s);
      if (!w.length) return '';
      return cap(w[0]) + (w.slice(1).length ? ' ' + w.slice(1).join(' ').toLowerCase() : '');
    },
  },
  { id: 'screaming', label: 'SCREAMING_SNAKE', preview: 'HELLO_WORLD', fn: (s) => words(s).join('_').toUpperCase() },
  { id: 'cobol', label: 'COBOL-CASE', preview: 'HELLO-WORLD', fn: (s) => words(s).join('-').toUpperCase() },
  { id: 'dot', label: 'dot.case', preview: 'hello.world', fn: (s) => words(s).join('.').toLowerCase() },
  { id: 'path', label: 'path/case', preview: 'hello/world', fn: (s) => words(s).join('/').toLowerCase() },
  { id: 'train', label: 'Train-Case', preview: 'Hello-World', fn: (s) => words(s).map(cap).join('-') },
  { id: 'flat', label: 'flatcase', preview: 'helloworld', fn: (s) => words(s).join('').toLowerCase() },
  { id: 'upperflat', label: 'UPPERFLAT', preview: 'HELLOWORLD', fn: (s) => words(s).join('').toUpperCase() },
];

export const DEFAULT_FORMAT_ID = 'snake';

if (typeof document !== 'undefined') {
  let activeFormat: CaseFormat = FORMATS.find((f) => f.id === DEFAULT_FORMAT_ID)!;

  const grid = document.getElementById('case-grid')!;
  const inputEl = document.getElementById('input') as HTMLTextAreaElement;
  const outputEl = document.getElementById('output') as HTMLTextAreaElement;

  function convert(): void {
    const raw = inputEl.value;
    outputEl.value = raw ? activeFormat.fn(raw) : '';
  }

  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.case-btn');
    if (!btn) return;
    const fmt = FORMATS.find((f) => f.id === btn.dataset.id);
    if (!fmt) return;
    activeFormat = fmt;
    for (const b of grid.querySelectorAll<HTMLElement>('.case-btn')) {
      b.classList.toggle('active', b.dataset.id === fmt.id);
    }
    convert();
  });

  inputEl.addEventListener('input', convert);

  const copyBtn = document.getElementById('copy-btn')!;
  copyBtn.addEventListener('click', () => {
    const val = outputEl.value;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1800);
    });
  });
}
