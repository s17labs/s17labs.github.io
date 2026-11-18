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
      'Generate and export custom icons from Font Awesome, Bootstrap Icons, uploaded SVG artwork, custom text, Noto Emoji, or Twemoji. Includes full Android launcher package export.',
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
    name: 'Image Compressor',
    slug: 'image-compressor',
    description: 'Compress images and convert between JPEG, PNG, and WebP with a quality slider and before/after size savings.',
    tags: ['images', 'conversion'],
    icon: 'file-zipper',
  },
  {
    name: 'Palette & Gradient Studio',
    slug: 'palette-studio',
    description:
      'Extract a color palette from an image, build custom gradients, and export CSS variables, PNG, or SVG.',
    tags: ['images', 'design', 'generator'],
    icon: 'palette',
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
    name: 'QR Generator',
    slug: 'qr-generator',
    description: 'Generate QR codes from any text or URL with custom colors and sizes. Export as PNG or SVG.',
    tags: ['generator', 'dev'],
    icon: 'qrcode',
  },
];

/** Tools that share the most tags with `slug`, in registry order for ties.
 * Tools with no tags in common are omitted, so callers can hide the section
 * entirely when there is nothing meaningful to suggest. */
export function getRelatedTools(slug: string, limit = 3): Tool[] {
  const current = TOOLS.find((tool) => tool.slug === slug);
  if (!current) return [];

  const tags = new Set(current.tags);

  return TOOLS.map((tool, order) => ({ tool, order }))
    .filter(({ tool }) => tool.slug !== slug)
    .map((entry) => ({
      ...entry,
      score: entry.tool.tags.reduce((total, tag) => total + (tags.has(tag) ? 1 : 0), 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ tool }) => tool);
}
