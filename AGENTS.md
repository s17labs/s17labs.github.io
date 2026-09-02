# AGENTS.md

Guidance for AI coding agents (OpenCode, Claude Code, etc.) working in this repository.

## Project Overview

Homepage and browser tools suite for s17 Labs, deployed at https://s17labs.github.io. An Astro static site (zero runtime JS frameworks) that also hosts the self-contained, privacy-first s17 Labs Tools (Icon Maker, Image Resizer, SVG to PNG, Case Converter, QR Generator, m² Calc).

- Language/stack: Astro 7 + Tailwind CSS v4 (`@tailwindcss/vite`), TypeScript (`astro/tsconfigs/strict`), a little client-side TS per tool
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
  layouts/BaseLayout.astro    # base HTML shell for all pages
  components/                 # BaseHead.astro, Icon.astro, Footer.astro, ToolLayout.astro
  pages/                      # routes: index.astro, 404.astro, tools/index.astro
  pages/tools/                # one .astro page per tool (/tools/<slug>)
  data/tools.ts               # single source of truth: the tools registry (name, slug, tags, icon)
  data/site.ts                # site metadata
  scripts/tools/<slug>.ts     # client-side logic per tool (typechecked TypeScript)
  styles/global.css           # homepage styles (Tailwind v4)
  styles/tool.css             # shared design system for the standard tools
  styles/tools/               # per-tool overrides (icon-maker.css, m2-calc.css)
  icons.ts                    # Font Awesome icon definitions
public/                       # served as-is: fonts/ (Aldrich + self-hosted Barlow for m² Calc), robots.txt, link_preview.png
public/tools/m2-calc/         # standalone assets for the m² Calc tool
```

Key patterns:

- Adding a new tool touches exactly three places: create `src/pages/tools/<slug>.astro` using `ToolLayout`, put client logic in `src/scripts/tools/<slug>.ts`, register it in `src/data/tools.ts`. The `/tools` listing renders from that registry — never hardcode tool entries elsewhere.
- Standard tools share one design system (`src/styles/tool.css` + `ToolLayout.astro`); m² Calc intentionally keeps its own design system (own themes, EN/SK/DE i18n). Do not force it onto the shared one.
- Everything is fully self-hosted — no CDN dependencies. Font Awesome icon data comes from the npm `@fortawesome/*` packages via `src/icons.ts`; fonts live in `public/fonts/`.
- User-facing strings for tools live in their page/component code; keep i18n strings of m² Calc intact.

## UI Conventions

- Dark-first s17 Labs aesthetic; accent red `#ff4136`, "Aldrich" display font.
- New tool pages must use `ToolLayout` + `tool.css` tokens instead of bespoke styling.

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
- All tools must stay fully client-side ("your data never leaves your browser") — never add server endpoints or analytics.
