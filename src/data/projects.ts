import type { IconName } from '../icons';

export interface Project {
  name: string;
  description: string;
  url: string;
  external: boolean;
  icon: IconName;
  tags: string[];
}

export const PROJECTS_SECTION = {
  title: 'Projects',
  description:
    'Apps and kits built by s17 Labs — lightweight, focused software for Android and the web.',
} as const;

export const PROJECTS: Project[] = [
  {
    name: 'Koda',
    description: 'A clean and lightweight Android text editor built with Kotlin.',
    url: 'https://s17labs.github.io/koda/',
    external: true,
    icon: 'font',
    tags: ['android', 'editor'],
  },
  {
    name: 'PebbleDo',
    description: 'A quiet little to-do list built for focus.',
    url: 'https://s17labs.github.io/pebbledo/',
    external: true,
    icon: 'check',
    tags: ['android', 'productivity'],
  },
  {
    name: 'WebShell',
    description:
      'A minimal Android WebView wrapper kit for building native apps with plain HTML, CSS, and JavaScript.',
    url: 'https://github.com/s17labs/webshell',
    external: true,
    icon: 'globe',
    tags: ['android', 'webview'],
  },
  {
    name: 'WebShell Forge',
    description: 'Turn plain HTML, CSS, and JS into installable APKs — form or CLI in, app out.',
    url: 'https://github.com/s17labs/webshell-forge',
    external: true,
    icon: 'wand-magic-sparkles',
    tags: ['android', 'build'],
  },
  {
    name: 'Notes',
    description: 'A simple, clean Android notes app with markdown support, pinning, and trash.',
    url: 'https://github.com/s17labs/notes',
    external: true,
    icon: 'copy',
    tags: ['android', 'notes'],
  },
  {
    name: 'minimal-ui',
    description: 'A minimalist CSS framework for rapid prototyping.',
    url: 'https://github.com/s17labs/minimal-ui',
    external: true,
    icon: 'scissors',
    tags: ['css', 'web'],
  },
];
