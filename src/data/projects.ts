import type { IconName } from '../icons';

export interface Project {
  name: string;
  description: string;
  url: string;
  external: boolean;
  icon: IconName;
  iconImg?: string; // real app artwork — shown instead of the glyph when set
  emoji?: string; // e.g. 🐚 — shown instead of the glyph when set
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
    iconImg: '/projects/koda-app-icon.png',
    tags: ['android', 'editor'],
  },
  {
    name: 'PebbleDo',
    description: 'A quiet little to-do list built for focus.',
    url: 'https://s17labs.github.io/pebbledo/',
    external: true,
    icon: 'check',
    iconImg: '/projects/pebbledo-icon.png',
    tags: ['android', 'productivity'],
  },
  {
    name: 'WebShell',
    description:
      'A minimal Android WebView wrapper kit for building native apps with plain HTML, CSS, and JavaScript.',
    url: 'https://github.com/s17labs/webshell',
    external: true,
    icon: 'globe',
    emoji: '🐚',
    tags: ['android', 'webview'],
  },
  {
    name: 'Notes',
    description: 'A simple Android notes app with markdown, pinning, search, and trash.',
    url: 'https://github.com/s17labs/notes',
    external: true,
    icon: 'font',
    emoji: '📝',
    tags: ['android', 'notes', 'archived'],
  },
  {
    name: 'videobug',
    description:
      'Turns phone screen recordings into agent-readable bug reports with key frames and freeze/jank analysis.',
    url: 'https://github.com/s17labs/videobug',
    external: true,
    icon: 'image',
    emoji: '🎥',
    tags: ['tool', 'ai', 'dev'],
  },
];
