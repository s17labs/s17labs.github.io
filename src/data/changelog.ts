/** A release/change worth surfacing in the "What's new" surface.
    Dates are the dates of the commits that shipped the change. */
export interface ChangelogEntry {
  date: string;
  title: string;
  description: string;
  /** Optional deep link into the tool suite. */
  tool?: { name: string; href: string };
}

/** Recent, shipped changes — newest first. Derived from the repo history and
    the current tools registry; do not add entries for planned work. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-17',
    title: 'Image Compressor',
    description:
      'A new tool for batch compression and JPEG, PNG, and WebP conversion, with a quality slider, before/after sizes, and single or ZIP download. Originals are kept when re-encoding would make them larger.',
    tool: { name: 'Image Compressor', href: '/tools/image-compressor/' },
  },
  {
    date: '2026-11-16',
    title: 'Colorable SVG artwork in Icon Maker',
    description:
      'Uploaded SVGs can be recolored per path or per region, with custom colors carried through SVG, PNG, and Android VectorDrawable exports.',
    tool: { name: 'Icon Maker', href: '/tools/icon-maker/' },
  },
  {
    date: '2026-10-28',
    title: 'Back to top button',
    description:
      'The footer gained a TOP button that scrolls back to the start of the page and respects reduced-motion preferences.',
  },
  {
    date: '2026-10-27',
    title: 'Web standards pass',
    description:
      'Valid HTML and metadata plus accessibility fixes across the pages and tools, with keyboard and screen-reader behavior tightened up.',
  },
  {
    date: '2026-10-26',
    title: 'Unified button and link treatments',
    description:
      'Buttons and links now share one hover language, and disabled states look and behave consistently everywhere.',
  },
  {
    date: '2026-10-21',
    title: 'Shared top bar with search and menu',
    description:
      'Every page now carries one sticky bar with the page title, back link, instant search, and a compact site menu.',
  },
  {
    date: '2026-10-21',
    title: 'Tool card and control polish',
    description:
      'Tool cards, range sliders, and color inputs got a visual pass — cards lift on hover without shifting layout.',
  },
  {
    date: '2026-09-25',
    title: 'Projects, policies, and the design system',
    description:
      'Added the project showcase, the privacy and terms pages, and a live design-system reference built from the real classes.',
  },
];
