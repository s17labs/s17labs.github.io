# s17labs.github.io — Docs

Homepage and browser tools suite for **s17 Labs**, deployed at
<https://s17labs.github.io>. An Astro static site (zero runtime JS frameworks)
that also hosts the self-contained, privacy-first s17 Labs Tools.

> Agent? Read [`AGENTS.md`](../AGENTS.md) first — it has the build commands,
> guardrails, and commit/PR rules. This file is the human-oriented map of
> what's in the repo and where it lives.

## Stack

- **Astro 7** + **Tailwind CSS v4** (`@tailwindcss/vite`), **TypeScript** (`astro/tsconfigs/strict`)
- **Node >= 22** (CI uses Node 22), npm
- Static output → GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`, `main` only)

```sh
npm install         # install dependencies
npm run dev         # local dev server
npm run build       # production build to dist/
npm run preview     # preview the production build
npx astro check     # typecheck .astro/.ts (no test/lint scripts exist)
```

## Routes

| Route | Source | Notes |
|---|---|---|
| `/` | `src/pages/index.astro` | Homepage hero, card, footer |
| `/tools/` | `src/pages/tools/index.astro` | Tool listing, rendered from the registry |
| `/tools/<slug>/` | `src/pages/tools/<slug>.astro` | One page per tool (Icon Maker, Image Resizer, SVG to PNG, Case Converter, QR Generator) |
| `/design/` | `src/pages/design.astro` | Design system + brand kit with live specimens |
| `/404` | `src/pages/404.astro` | Not-found page |

## Architecture

```
src/
  layouts/BaseLayout.astro    # base HTML shell for all pages (head, footer)
  components/                 # BaseHead.astro, Icon.astro, Footer.astro, ToolLayout.astro
  pages/                      # routes: index.astro, 404.astro, tools/index.astro, design.astro
  pages/tools/                # one .astro page per tool (/tools/<slug>)
  data/tools.ts               # single source of truth: the tools registry (name, slug, tags, icon)
  data/site.ts                # site metadata (urls, socials, projects, footer sections)
  scripts/back-link.ts        # shared header back-link fit logic (all headers)
  scripts/tools/<slug>.ts     # client-side logic per tool (typechecked TypeScript)
  scripts/tools/lib.ts        # shared tool helpers (downloads, clipboard, rasterize, …)
  scripts/tools/zip-export.ts # shared single-or-ZIP "Download All" flow
  styles/global.css           # homepage + footer styles (Tailwind v4)
  styles/tool.css             # shared design system for the standard tools
  styles/design.css           # /design/ page styles (ds- namespaced, never competes)
  styles/tools/               # per-tool overrides (icon-maker.css)
  icons.ts                    # Font Awesome icon definitions (Icon component + iconSvg)
public/                       # served as-is (see Assets below)
docs/                         # this file — repo documentation
```

Key patterns:

- **Adding a new tool** touches exactly three places: create
  `src/pages/tools/<slug>.astro` using `ToolLayout`, put client logic in
  `src/scripts/tools/<slug>.ts`, register it in `src/data/tools.ts`. The
  `/tools` listing renders from that registry — never hardcode tool entries.
- **Shared design system** (`src/styles/tool.css` + `ToolLayout.astro`).
  Anything used twice gets promoted from tool stylesheets into `tool.css`.
- **Production CSS order differs from dev** — page stylesheets load BEFORE
  `tool.css`, so page overrides must win on specificity (e.g.
  `.workspace .panel`), never on source order.
- Everything is **fully client-side** ("your data never leaves your browser")
  — no server endpoints, no analytics.

## Tools

Native Astro pages sharing the s17 design system, served at
[s17labs.github.io/tools](https://s17labs.github.io/tools). Logic is
typechecked TypeScript in `src/scripts/tools/` (shared helpers in `lib.ts`
and `zip-export.ts`) — keep it free of Node-only APIs.

- **Icon Maker** — icons from Font Awesome, Bootstrap Icons, text, Noto/Twemoji;
  solid + gradient backgrounds; SVG/PNG + full Android launcher package (XMLs,
  mipmaps, Material You) export.
- **Image Resizer** — batch resize with aspect lock.
- **SVG to PNG** — vector → transparent PNG rasterization.
- **Case Converter** — string conventions and writing formats.
- **QR Generator** — QR codes with custom colors/sizes, PNG/SVG export.

## Design System & Brand

Tokens, typography, iconography, and components — documented and showcased
with live specimens (real classes, so docs can't drift) at
[s17labs.github.io/design](https://s17labs.github.io/design/)
(`src/pages/design.astro`, `src/styles/design.css`).

- Dark-first aesthetic; accent red `#ff4136`; Aldrich display, Verdana body,
  Courier New for data.
- Logo: accent square (`.cube`) + `s17 Labs.` wordmark. Official artwork lives
  in the [`s17labs/assets`](https://github.com/s17labs/assets) repo.

## Assets (`public/`)

Served as-is at the site root:

| File | Purpose |
|---|---|
| `favicon.ico` | Browser tab icon (see `BaseHead.astro`) |
| `fonts/aldrich-latin.woff2` | Display font, preloaded (see `BaseHead.astro`) |
| `fonts/icon-maker/` | Bundled woff2 typefaces for Icon Maker text (SIL OFL) |
| `s17labs-icon-large.png` | Brand icon, solid (from `s17labs/assets`) |
| `s17labs-icon-large-transparent.png` | Brand icon, transparent (from `s17labs/assets`) |
| `s17labs-logo-dark.png` | Brand lockup for dark backgrounds (from `s17labs/assets`) |
| `s17labs-logo-dark-transparent.png` | Brand lockup, transparent (from `s17labs/assets`) |
| `link_preview.png` | Social card (1280×640, see `BaseHead.astro` og/twitter tags) |
| `robots.txt` | Crawler rules |

Link previews / SEO live in `src/components/BaseHead.astro`: canonical URL,
`og:`/`twitter:` tags pointing at `/link_preview.png`, sitemap reference.

## Site Data & Footer

- `src/data/site.ts` — `SITE` object: urls, socials, projects, byline, and
  the footer sections (brand, Pages, Projects, Links).
- `src/components/Footer.astro` — renders the four footer columns from `SITE`
  plus copyright. To add a site page link, extend the Pages section.

## Deploy

`.github/workflows/deploy.yml`: every push to `main` builds (Node 22,
`withastro/action@v3`) and deploys `dist/` to GitHub Pages
(`actions/deploy-pages@v4`); `workflow_dispatch` supported. There are no
checks on PRs — run `npm run build` locally before merging.

## Contributing

All changes land on `main` through pull requests: branch off `main` as
`<type>/<short-description>`, keep commits atomic with
`type(scope): short imperative summary` subjects, and never commit or push to
`main` directly. Full rules (commits, PR body, screenshots, attribution) are
in [`AGENTS.md`](../AGENTS.md).

Related repos: [`s17labs/assets`](https://github.com/s17labs/assets) (brand
artwork), [`s17labs/webshell`](https://github.com/s17labs/webshell),
[`s17labs/koda`](https://github.com/s17labs/koda).
