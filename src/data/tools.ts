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
    name: 'Favicon Generator',
    slug: 'favicon-generator',
    description:
      'Turn one SVG or PNG into a full web icon set: favicon.ico, PNG sizes, Apple touch icon, manifest, and HTML.',
    tags: ['images', 'generator', 'dev'],
    icon: 'layer-group',
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
