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
| `/projects/` | `src/pages/projects.astro` | Project showcase, rendered from `src/data/projects.ts` |
| `/privacy/` | `src/pages/privacy.astro` | Privacy policy statement |
| `/terms/` | `src/pages/terms.astro` | Terms of use |
| `/404` | `src/pages/404.astro` | Not-found page |

## Architecture

```
src/
  layouts/BaseLayout.astro    # base HTML shell for all pages (head, top bar, footer)
  components/                 # BaseHead.astro, Icon.astro, TopBar.astro, SearchDialog.astro, SearchFab.astro, Footer.astro, ToolLayout.astro
  pages/                      # routes: index.astro, 404.astro, tools/index.astro, design.astro
  pages/tools/                # one .astro page per tool (/tools/<slug>)
  data/tools.ts               # single source of truth: the tools registry (name, slug, tags, icon)
  data/nav.ts                 # site nav + design-system section registry (top bar menu, search, /design/ pills)
  data/site.ts                # site metadata (urls, socials, projects)
  scripts/topbar.ts           # top bar: menu disclosure, client-side search, scroll-aware bar (all pages)
  scripts/tools/<slug>.ts     # client-side logic per tool (typechecked TypeScript)
  scripts/tools/lib.ts        # shared tool helpers (downloads, clipboard, rasterize, …)
  scripts/tools/zip-export.ts # shared single-or-ZIP "Download All" flow
  styles/global.css           # top bar + homepage + footer styles (Tailwind v4), owns the shared chrome tokens
  styles/tool.css             # shared design system for the standard tools
  styles/design.css           # /design/ page styles (ds- namespaced, never competes)
  styles/tools/               # per-tool overrides (icon-maker.css)
  icons.ts                    # Font Awesome icon definitions (Icon component + iconSvg)
public/                       # served as-is (see Assets below)
docs/                         # repo docs: README.md (this map), PRIVACY.md + TERMS.md (canonical policy texts, mirrored on /privacy/ and /terms/)
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
- **New shared UI needs a specimen** — adding a component, button, link
  style, token, or page pattern? Showcase it on `/design/`
  (`src/pages/design.astro`) using the real classes, or it will drift
  undocumented.
- Everything is **fully client-side** ("your data never leaves your browser")
  — no server endpoints, no analytics.

## Navigation

`BaseLayout.astro` renders the site chrome; pages never hand-roll a header.

| Component | Role |
|---|---|
| `TopBar.astro` | Sticky bar — back link, page header, search, hamburger menu. Props: `title`, `backHref`, `backLabel`, `width` |
| `SearchDialog.astro` | The search dialog. Rendered on **every** page so the bar button and the home FAB drive the same one |
| `SearchFab.astro` | Floating search button, used on `/` where there is no bar |

- Pages pass `barTitle` (plus optional `backHref` / `backLabel` / `barWidth`)
  to `BaseLayout`. Omit `barTitle` and you get the bare FAB — that is the home
  page's configuration. **`barWidth` must equal the page's content measure** so
  the bar and the column share both edges: 900px for `/tools/`, `/projects/`,
  `/design/`, `/privacy/` and `/terms/`; 680px for the individual tool pages,
  which are narrower because their panels are built around a tight measure.
  `.topbar-inner` uses the same 20px side padding as the page columns, so the
  back link and the first card line up exactly. Anything else is a bug — check
  the numbers, not the eyeball.
- **Search** (<kbd>/</kbd> or <kbd>⌘K</kbd>) indexes tools, projects, pages,
  and `/design/` sections straight from the existing registries — there is no
  separate index to keep in sync. Arrow keys move, <kbd>Enter</kbd> opens,
  <kbd>Esc</kbd> closes. A result on the current page (a design section, a
  project) closes the dialog as well as navigating, since a hash change never
  unloads the page.
- The field's ✕ **clears** the query and only appears when there is text;
  <kbd>Esc</kbd> and the backdrop click close the dialog. The shortcut legend
  in the dialog's footer is hidden under 580px, where there is no keyboard to
  hint at and it would wrap.
- Chrome tokens live in `global.css` (page, `--surface-1` well, `--surface-2`
  panel, `--surface-3` raised, border, radius, motion) so the bar and footer
  never depend on `tool.css` being loaded.

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

- `src/data/site.ts` — `SITE` object: urls, socials, projects, byline.
  Footer sections (brand, Resources, Legal, Links) are defined in
  `src/components/Footer.astro`.
- `src/components/Footer.astro` — renders the four footer columns plus
  copyright. To add a site page link, extend the Resources section.

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
