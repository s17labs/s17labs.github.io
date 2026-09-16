import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://s17labs.github.io',
  // Intentional: 'ignore' keeps /tools and /tools/ serving the same page;
  // pages link both forms. Do not "optimize" to 'always'/'never'.
  trailingSlash: 'ignore',
  // Intentional: changing HTML compression alters the deployed output
  // byte-for-byte; keep off unless there is a measured reason.
  compressHTML: false,
  integrations: [
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
