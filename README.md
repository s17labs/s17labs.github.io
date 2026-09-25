
<p align="center">
  <a href="https://s17labs.github.io">
    <img width="240" height="102" alt="1000007191" src="https://github.com/user-attachments/assets/9506db8d-5fd9-41aa-9c58-e6eca8145c2d" />
  </a>
</p>
<p align="center">
  Clean and minimal homepage for s17 Labs.
</p>

## Stack

Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com) v4. Static output, zero runtime JavaScript frameworks, deployed to GitHub Pages via GitHub Actions.

- **src/pages/** — routes (`/`, `/tools`, `/404`)
- **src/components/** — shared UI (`BaseHead`, `Icon`, `Footer`, …)
- **src/data/tools.ts** — single source of truth for the tools listing
- **public/** — static assets, fonts, and tool apps served as-is at `/tools/<name>/`

Full repo documentation lives in [docs/README.md](docs/README.md).

## Development

Requires Node 22+.
```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Design System

Colors, typography, iconography, components, and brand kit — documented and showcased with live specimens at [s17labs.github.io/design](https://s17labs.github.io/design/). New pages must use `ToolLayout` + the `tool.css` tokens; anything used twice gets promoted from the tool stylesheet into `tool.css`.

## Tools

The s17 Labs Tools suite lives in this repo and is served at [s17labs.github.io/tools](https://s17labs.github.io). Tools are native Astro pages sharing a common design system (`src/styles/tool.css`, `ToolLayout.astro`) with logic typechecked in `src/scripts/tools/` — see `src/data/tools.ts` for the registry.

- **Icon Maker, Image Resizer, SVG to PNG, Case Converter, QR Generator** — Astro pages sharing the s17 design system (`src/styles/tool.css`, `ToolLayout.astro`)

All tools run fully client-side — no server endpoints. Font Awesome icon data comes from npm packages; client logic is typechecked TypeScript in `src/scripts/tools/`. Note: emoji SVGs in Icon Maker are fetched from a CDN at runtime, so emoji sources need network access. The registry lives in `src/data/tools.ts`.

### Adding a new tool

1. Create `src/pages/tools/<slug>.astro` using `ToolLayout`
2. Put client logic in `src/scripts/tools/<slug>.ts`
3. Register it in `src/data/tools.ts`

---
© 2026 [s17 Labs](https://s17labs.github.io)
