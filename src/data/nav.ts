import { SITE } from './site';
import type { IconName } from '../icons';

export interface NavLink {
  label: string;
  href: string;
  description: string;
  icon?: IconName;
  external?: boolean;
}

/** Primary site destinations — the toolbar menu, in visit order. */
export const SITE_NAV: NavLink[] = [
  {
    label: 'Home',
    href: '/',
    description: 'Back to the s17 Labs homepage.',
  },
  {
    label: 'Tools',
    href: SITE.toolsUrl,
    description: 'Browser utilities that run entirely on your device.',
  },
  {
    label: 'Projects',
    href: SITE.projectsUrl,
    description: 'Apps and kits built by s17 Labs.',
  },
  {
    label: 'Design system',
    href: SITE.designUrl,
    description: 'Tokens, type, components, and the rules behind them.',
  },
  {
    label: 'Privacy policy',
    href: SITE.privacyUrl,
    description: 'No accounts, no tracking, no analytics.',
  },
  {
    label: 'Terms of use',
    href: SITE.termsUrl,
    description: 'The rules for using this site and its tools.',
  },
];

/** Community links — mirrors the footer's "Links" column. */
export const SITE_LINKS: NavLink[] = [
  {
    label: 'GitHub',
    href: SITE.orgUrl,
    description: 'Source for everything on this site.',
    icon: 'github',
    external: true,
  },
  {
    label: SITE.socials.x.name,
    href: SITE.socials.x.url,
    description: 'Release notes and build logs.',
    icon: 'x',
    external: true,
  },
  {
    label: SITE.socials.discord.name,
    href: SITE.socials.discord.url,
    description: 'Chat, feedback, and ideas.',
    icon: 'discord',
    external: true,
  },
  {
    label: SITE.parent.name,
    href: SITE.parent.url,
    description: 'The parent community.',
    icon: 'globe',
    external: true,
  },
];

export interface DesignSection {
  id: string;
  label: string;
  group: string;
  description: string;
}

/** Sections of /design/ — single source for the page nav pills and the
    toolbar's search index. Ids must match the section markup. The
    hamburger menu does not list them; search is how you reach one. */
export const DESIGN_SECTIONS: DesignSection[] = [
  {
    id: 'brand',
    label: 'Brand',
    group: 'Brand',
    description: 'The cube, the wordmark, and the voice.',
  },
  {
    id: 'colors',
    label: 'Colors',
    group: 'Foundations',
    description: 'Every color token and where it is used.',
  },
  {
    id: 'typography',
    label: 'Typography',
    group: 'Foundations',
    description: 'Aldrich, Verdana, and Courier New.',
  },
  {
    id: 'icons',
    label: 'Iconography',
    group: 'Foundations',
    description: 'The bundled glyph registry and its sources.',
  },
  {
    id: 'spacing',
    label: 'Spacing · Radius · Borders',
    group: 'Foundations',
    description: 'One radius token, hairline borders, one easing.',
  },
  {
    id: 'navigation',
    label: 'Navigation',
    group: 'Components',
    description: 'Tags, links, tool cards, and the top bar.',
  },
  {
    id: 'buttons',
    label: 'Buttons',
    group: 'Components',
    description: 'One primary button and its small controls.',
  },
  {
    id: 'forms',
    label: 'Forms',
    group: 'Components',
    description: 'Labels, controls, hints, and focus rings.',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    group: 'Components',
    description: 'Status lines, progress, results, and modals.',
  },
  {
    id: 'contributing',
    label: 'Contributing',
    group: 'Guidelines',
    description: 'Conventions, commits, and pull request rules.',
  },
];
