import type { IconName } from '../icons';

export interface Tool {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  icon: IconName;
}

export const TOOLS_SECTION = {
  title: 's17 Labs Tools',
  description:
    'A suite of lightweight, browser-based utilities that run entirely on your device. Fast, open-source, and privacy-first — your data never leaves your browser.',
} as const;

export const TOOLS: Tool[] = [
  {
    name: 'Icon Maker',
    slug: 'icon-maker',
    description:
      'Generate and export custom icons from Font Awesome, Noto Emoji, or Twemoji. Includes full Android launcher package export.',
    tags: ['icons', 'android', 'design'],
    icon: 'icons',
  },
  {
    name: 'Image Resizer',
    slug: 'image-resizer',
    description: 'Batch resize images locally with aspect ratio locking and high-quality output.',
    tags: ['images'],
    icon: 'image',
  },
  {
    name: 'SVG to PNG',
    slug: 'svg-to-png',
    description: 'Convert vector graphics to high-quality transparent PNGs locally in your browser.',
    tags: ['images', 'conversion'],
    icon: 'bezier-curve',
  },
  {
    name: 'Case Converter',
    slug: 'case-converter',
    description: 'Convert strings between various programming conventions and writing formats.',
    tags: ['text', 'dev'],
    icon: 'font',
  },
  {
    name: 'JSON Lab',
    slug: 'json-lab',
    description: 'Format, validate, minify and explore JSON with tree view, error pinpointing and stats. All local.',
    tags: ['text', 'dev', 'json'],
    icon: 'code',
  },
  {
    name: 'Regex Lab',
    slug: 'regex-lab',
    description: 'Test and debug regular expressions live — highlight matches, inspect groups and preview replacements.',
    tags: ['text', 'dev', 'regex'],
    icon: 'magnifying-glass',
  },
  {
    name: 'Palette Studio',
    slug: 'palette-studio',
    description: 'Generate harmonious palettes from any base color — with WCAG contrast checks and CSS / Tailwind export.',
    tags: ['design', 'colors'],
    icon: 'palette',
  },
];
