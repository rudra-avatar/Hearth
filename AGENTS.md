# Hearth — AGENTS.md

Hearth is a custom home screen for LG webOS TVs (app ID `tld.my.customlauncher`).
Single package. UI: Preact + TypeScript + Vite. Bundle targets Chrome 53 (webOS 4.x)
and is emitted as one classic script (`dist/assets/app.js`) because webOS refuses ES
modules loaded from `file://`.

## Developer commands

- `npm run dev` — Vite dev server (desktop browser, sample apps/folders)
- `npm run build` — `tsc --noEmit && vite build && node scripts/legacy.mjs` → `dist/` (typecheck is part of build; `legacy.mjs` transpiles for Chromium 38 / webOS 3.x)
- `npm run package` — `dist/` → `build/*.ipk` via `ares-package --no-minify` (needs `dist/` first)
- `npm run install:tv` — install + launch the `.ipk` on a rooted TV (needs `TV_HOST`)
- `npm run deploy` — build → package → install:tv
- `npm run manifest` — `node scripts/gen-manifest.mjs --repo <owner>/<name>` (Homebrew Channel release manifest; needs `GITHUB_REPOSITORY` or `--repo`)
- `npm test` — runs every `scripts/test-*.mjs` plus `scripts/test-homehook.sh` in order, chained with `&&` (stops on first failure). Includes `test-clocklift`, `test-inputhook`, `test-iconread` from later PRs.

## Running a single test

There is no test runner. Each `scripts/test-*.mjs` is a standalone Node script:
`node scripts/test-wallpaper.mjs` (exit code = number of failures). `scripts/test-homehook.sh`
is the shell-test equivalent (fake `luna-send`, fake clock).

## Setup

- Node 18+.
- For TV install: copy `tv.env.example` to `tv.env` (git-ignored) and set `TV_HOST=root@<tv-ip>`.
  The TV must be rooted with SSH and the Homebrew Channel service running.

## Build / config quirks worth remembering

- `HEARTH_WEATHER=0 npm run build` removes the weather widget from the bundle entirely
  (`__WEATHER__` define in `vite.config.ts`).
- `vite.config.ts` rewrites the entry to a classic `<script defer>` tag, sets `base: './'`,
  targets `chrome53`, and inlines dynamic imports (one `assets/app.js`).
- `src/config/catalog.local.ts` (git-ignored) optionally overrides the app catalogue /
  defaults. Copy from `catalog.local.example.ts`, then rebuild.
- `public/appinfo.json` declares the app ID/version; `scripts/install.sh` reads the ID from it.
- No lint, formatter, or CI is configured. TypeScript strict mode is on (`tsc --noEmit` in build). Chromium 38 (webOS 3.x) has no CSS custom properties: `src/theme/tokens.ts` re-emits the stylesheet with token values substituted in (see `SUPPORTS_VARS` / `refreshVarFallback`).

## Entry points

- `index.html` → `src/main.tsx` → `src/app.tsx` (`App`).
- `src/lib/` holds pure helpers (apps, wallpaper, weather, prefs, storage, …); each has a
  matching `scripts/test-*.mjs`.
- `src/homehook/*.sh` (apply/watch/stock/diagnose) is the Home-button hand-over helper that
  runs on the TV; tested by `scripts/test-homehook.sh`.
- `repo/apps.json` + `repo/description.html` are the Homebrew Channel repository files
  (regenerate per release with `gen-repo.mjs` / `gen-manifest.mjs`).

## Internationalization (i18n)

- `src/lib/i18n.ts` — simple translation table with `{{param}} substitution. `t(key, params?)` looks up the current language.
- `src/locales/en.json`, `src/locales/es.json` — translation tables (English default, Spanish).
- `src/hooks/useLanguage.ts` — reactive hook: `{t, lang, setLang}`; calling `setLang` re-renders all components using it.
- `src/lib/storage.ts` — `UserConfig.language` ('en' | 'es') persisted in localStorage; default 'en'.
- `src/main.tsx` — loads translation tables and initializes language from config at startup.
- Pure libs (`failure.ts`, `weather.ts`, `clock.ts`) import `t` directly; they re-translate on each call when the component re-renders.
- To add a new language: add to `Lang` type in `i18n.ts`, create `src/locales/<code>.json`, import it in `main.tsx`, update `storage.ts` `Lang` type and `loadConfig`.

## Deploy to TV (rooted)

`npm run deploy` requires `TV_HOST` and a rooted TV with SSH. The `.ipk` is copied to `/tmp`
on the TV, then `luna-send` installs and launches it. Nothing outside the app's own directory
is touched. Turn off "Make this launcher the default instead of LG Home" before uninstalling.
