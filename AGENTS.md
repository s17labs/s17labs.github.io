# AGENTS.md

Guidance for AI coding agents (OpenCode, Claude Code, etc.) working in this repository.

## Project Overview

Homepage and browser tools suite for s17 Labs, deployed at https://s17labs.github.io. An Astro static site (zero runtime JS frameworks) that also hosts the self-contained, privacy-first s17 Labs Tools (Icon Maker, Image Resizer, SVG to PNG, Case Converter, QR Generator).

- Language/stack: Astro 7 + [Tailwind CSS](https://tailwindcss.com) v4 (`@tailwindcss/vite`), TypeScript (`astro/tsconfigs/strict`), a little client-side TS per tool
- Toolchain: Node >= 22 (CI uses Node 22); npm
- Author/maintainer: yungsamd17 (https://github.com/yungsamd17)

## Build & Verify

```bash
npm install         # install dependencies
npm run dev         # dev server
npm run build       # production build to dist/
npm run preview     # preview the production build
npx astro check     # typecheck .astro/.ts (via @astrojs/check; no test/lint scripts exist)
```

- CI is `.github/workflows/deploy.yml`: on every push to `main` it builds via `withastro/action@v3` (Node 22) and deploys `dist/` to GitHub Pages with `actions/deploy-pages@v4`. It also supports `workflow_dispatch`.
- Deploy fires only on pushes to `main` — there are no checks on PRs. Run `npm run build` locally before merging so you do not deploy a broken site.

## Architecture

```
src/
  layouts/BaseLayout.astro    # base HTML shell for all pages (renders the top bar)
  components/                 # BaseHead.astro, Icon.astro, TopBar.astro, SearchDialog.astro, SearchFab.astro, Footer.astro, ToolLayout.astro, ColorField.astro
  pages/                      # routes: index.astro, 404.astro, tools/index.astro, design.astro, projects.astro, privacy.astro, terms.astro
  pages/tools/                # one .astro page per tool (/tools/<slug>)
  data/tools.ts               # single source of truth: the tools registry (name, slug, tags, icon)
  data/projects.ts            # same pattern for the /projects/ showcase
  data/nav.ts                 # site nav + design-system section registry (menu, search, /design/ pills)
  data/site.ts                # site metadata (urls, socials, projects)
  scripts/topbar.ts           # top bar: menu disclosure, client-side search, scroll-aware bar (all pages)
  scripts/tools/<slug>.ts     # client-side logic per tool (typechecked TypeScript)
  scripts/tools/lib.ts        # shared tool helpers (downloads, clipboard, rasterize)
  scripts/tools/color-picker.ts # shared swatch + canvas color picker engine
  scripts/tools/zip-export.ts # shared single-or-ZIP download-all flow
  styles/global.css           # top bar + homepage + footer styles (Tailwind v4), owns the shared chrome tokens
  styles/tool.css             # shared design system for the standard tools
  styles/design.css           # /design/ page styles (ds- namespaced, never competes)
  styles/tools/               # per-tool overrides (icon-maker.css, icon-maker-fonts.css)
  icons.ts                    # Font Awesome icon definitions
public/                       # served as-is: fonts/ (Aldrich + icon-maker bundles), robots.txt, link_preview.png
```

Key patterns:

- Adding a new tool touches exactly three places: create `src/pages/tools/<slug>.astro` using `ToolLayout`, put client logic in `src/scripts/tools/<slug>.ts`, register it in `src/data/tools.ts`. The `/tools` listing renders from that registry — never hardcode tool entries elsewhere.
- Standard tools share one design system (`src/styles/tool.css` + `ToolLayout.astro`).
- Every page's header, back link, search, and menu come from `TopBar.astro`, rendered once by `BaseLayout`. Pass `barTitle` (plus optional `backHref`/`backLabel`/`barWidth`) — never hand-roll a page header. Omit `barTitle` (home) and `BaseLayout` renders just `SearchFab.astro`; `SearchDialog.astro` renders on every page either way. Site links and `/design/` sections live in `src/data/nav.ts`.
- The bar's header size is hand-tuned, not measured: Aldrich's baseline lands level with the icons' base and a 1px `translateY` is the optical correction (see the comment in `global.css`). Don't "fix" it by centering the line box — that pushes the title visibly low. The cube keeps global.css's 0.82em so the bar's lockup matches the home hero's proportion. The bar's width and the page column's width are **independent** measures: the bar is 900px on every page that has one, while content is 680px on the tools/projects listings and the tool pages (900px on design/privacy/terms and Icon Maker). So the bar is deliberately wider than the content on most pages — don't "fix" that. `.topbar-inner` still uses the same 20px side padding as the page columns, so where the two measures match they line up exactly.
- Anything used twice gets promoted from tool stylesheets into `tool.css` — the live token/component reference is `/design/` (`src/pages/design.astro`), which showcases the real classes so it can't drift.
- When adding a shared component, button, link style, token, or page pattern, showcase it on `/design/` too — new UI without a specimen will drift undocumented.
- Color inputs use `src/components/ColorField.astro` — it renders the swatch + hex input and wires the shared picker (`src/scripts/tools/color-picker.ts`). Listen for the `colorchange` event on the field root; never hand-roll a second picker.
- Everything is self-hosted except Icon Maker emoji SVGs, which fetch from a CDN at runtime — Font Awesome icon data comes from the npm `@fortawesome/*` packages via `src/icons.ts`; fonts live in `public/fonts/`.
- User-facing strings for tools live in their page/component code.

## UI Conventions

- Dark-first s17 Labs aesthetic; accent red `#ff4136`, "Aldrich" display font.
- New tool pages must use `ToolLayout` + `tool.css` tokens instead of bespoke styling.
- The full token/component reference is the live page at `/design/` (`src/pages/design.astro`) — check it before adding UI.
## Commit Messages

Format: `type(scope): short imperative summary` — lowercase after type, no trailing period.
Keep commits atomic — one logical change per commit.

| Type | Use for |
|---|---|
| `feat` | new user-facing feature |
| `fix` | bug fix |
| `refactor` | code change that neither fixes nor adds behavior |
| `style` | formatting/UI polish without logic change |
| `test` | adding or fixing tests |
| `docs` | documentation only |
| `chore` | build, deps, CI, tooling |
| `release` | version bump / release tagging |

Scope is a short area name for this project (e.g. `tools`, `home`, `css`, `ci`).
Use plain `type:` only when a change genuinely spans everything (rare).

- Never add a `Co-authored-by` / `Signed-off-by` trailer for the same identity
  that authors the commit — a self co-author is a redundant duplicate. Only
  credit a genuinely different human co-author, and only when asked. No AI
  co-author trailers in commits either; AI attribution stays only in the PR body.
- Keep the body free of trailers entirely unless explicitly asked for one.
  When squash-merging via `gh pr merge --squash`, pass an explicit
  `--subject` and an empty `--body ""` so GitHub doesn't re-inject branch
  trailers or auto-credit the branch author as a co-author.

## Agent Guardrails

- Never commit or push directly to `main`; all changes land through pull requests.
- Never open a PR unless the developer explicitly asks for it.
- One concern per change. If the description says "also", split it into another branch/PR.
- Do not commit secrets, keystores, or local-only files (e.g. `.and-code/`).
- Never modify `.github/workflows/deploy.yml` — the Pages deployment depends on its exact permissions and actions.
- When watching CI/bot feedback on your PRs: poll checks and comments newer than the last push,
  verify each bot finding against the source before "fixing" it, dismiss false positives with a
  written reason, and stop when checks are green on the latest commit.

## Pull Requests

All changes land on `main` through pull requests.

1. Create a branch off `main`: `<type>/<short-description>` (e.g. `feat/qr-generator-history`).
2. Commit there using the format from **Commit Messages**; keep commits atomic.
3. Push the branch and open a PR against `main`.

PR rules:

- One feature/fix per PR — small and focused beats large and thorough.
- Title follows the commit message format: `type(scope): short imperative summary`
  (e.g. `feat(tools): add batch rename to image resizer`) — it becomes the squash-merge commit message.
- Body stays concise: what changed and why, bullet list of touched areas, testing checklist (tick before merge).
- UI changes must include clear before/after screenshots (upload directly to GitHub — never commit PR-only screenshots).
- End the body with an AI attribution line that states the real model and agent/harness that
  produced this PR. Use this exact sentence with your actual values — do NOT output literal
  `{model}`/`{agent}` or copy the example verbatim:

  ```
  Built with YOUR_MODEL_NAME in the YOUR_AGENT_NAME harness.
  ```

  Replace `YOUR_MODEL_NAME` with your real model ID and `YOUR_AGENT_NAME` with your
  harness (e.g. `Built with claude-opus-4 in the Claude Code harness.` or
  `Built with gemini-2.5-pro in the OpenCode harness.`).

- Do **not** put AI attribution in GitHub Release notes — releases stay clean.

## Gotchas

- `compressHTML: false` and `trailingSlash: 'ignore'` in `astro.config.mjs` are intentional — do not change them to "optimize".
- Merging to `main` deploys to production immediately (Pages workflow); since PRs get no CI, local `npm run build` is the only pre-merge verification.
- Client logic in `src/scripts/tools/*.ts` runs in the browser and is typechecked by `astro check` — keep it free of Node-only APIs.
- Page stylesheets load BEFORE `tool.css` in the production bundle (dev order differs) — page overrides must beat shared rules with specificity (e.g. `.workspace .panel`), never rely on source order.
- Chrome styles that restyle a `tool.css` control must out-specify it: `input[type="text"]` (0,1,1) beats a bare `.my-input` (0,1,0), so the search field's rules are scoped under `.topbar-search-field`. Its input also needs `border-radius: 0` or the caret clips at the start and the selection highlight renders rounded.
- `::selection` is the accent tint site-wide in `global.css`; don't re-declare it per page.
- All tools must stay fully client-side ("your data never leaves your browser") — never add server endpoints or analytics.
