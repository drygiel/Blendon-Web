# Blendon Web

Website for [Blendon](https://github.com/drygiel/Blendon) - a Blender-style workflow extension for the Unity Scene view.
Live at **https://drygiel.github.io/Blendon-Web/**.

This repository is mounted as a Git submodule at `Web~/` in the main Blendon repository. Unity skips folders ending
with `~`, so nothing here (including `node_modules`) is imported into the project.

## Stack

React 19, TypeScript (strict), Vite, SCSS (CSS Modules), Vitest, Playwright, ESLint and Prettier. No CSS framework.

## Requirements

- Node 24 LTS (see `.nvmrc`; Node 22.12+ also works)
- pnpm 12, pinned in `package.json` - run `corepack enable` once and the right version is used automatically. An
  older pnpm rewrites `pnpm-lock.yaml` in its own format, which CI then rejects.

## Scripts

| Command          | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| `pnpm install`   | Install dependencies                                          |
| `pnpm dev`       | Dev server with hot reload                                    |
| `pnpm build`     | Type-check, build the static site into `dist/` and prerender  |
| `pnpm prerender` | Render the landing and its JSON-LD into `dist/index.html`     |
| `pnpm preview`   | Serve the production build locally                            |
| `pnpm check`     | Type-check, lint, format check and unit tests (what CI runs)  |
| `pnpm test`      | Unit tests (Vitest)                                           |
| `pnpm test:e2e`  | End-to-end tests in Chromium, Firefox and WebKit (Playwright) |
| `pnpm format`    | Format everything with Prettier                               |

Playwright needs its browsers once: `pnpm exec playwright install`.

## Settings window data

The site shows Blendon's settings window, rebuilt from the plugin itself. `pnpm sync` reads the plugin this repository
is mounted in (`../`, or `BLENDON_DIR`):

- `Editor/**/*Settings.cs` - each page's `DrawSettings` code, turned into the window's layout
- `Editor/Icons` - tooltip images, page header images and Blendon's own icons
- `Metadata~/PlaygroundRef` - labels, tooltips, defaults and constants plus the Editor's built-in icons, dumped from
  the Unity Editor (`model*.json`, `ui/`)
- `Metadata~/Video` - the feature clips
- `Documentation/Blendon_Manual.pdf` - the manual the page links to

It writes `src/generated/window-data.json`, `public/plugin/` and `public/docs/`. Both are committed, so CI never needs the plugin.
Run it after changing the plugin's settings pages, then commit the result.

### Refreshing the Unity dump

`Metadata~/PlaygroundRef` holds what only a running Editor can answer: labels, tooltips and defaults resolved through
the settings classes, the shortcut tables, the pie menus, and the built-in icons. When those change:

1. Copy `tools/unity/BlendonWebExport.cs` into any `Editor` folder of the Unity project.
2. Run **Tools > Blendon > Export Web Data**. It rewrites `Metadata~/PlaygroundRef` (`model*.json`, `ui/`).
3. Delete the copied script, then run `pnpm sync` and commit.

The exporter reads Blendon only through reflection, so it compiles in any assembly and changes no settings.

## Layout

| Path                      | Contents                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| `src/landing/`            | The landing page: one folder per section under `sections/`, shared bits in `ui/` |
| `src/window/`             | The settings window, loaded as its own chunk when its section comes near         |
| `src/window/core/`        | Layout builder, settings model and helpers - plain TypeScript, unit-tested       |
| `src/window/gizmo/`       | The 3D gizmo preview, a port of the plugin's `GizmoPreview` to canvas            |
| `src/window/styles/`      | The window's styles, scoped under `.uw`                                          |
| `src/generated/`          | `pnpm sync` output                                                               |
| `scripts/sync/`           | `pnpm sync`: reads the plugin's C# sources and the Unity dump                    |
| `src/entry-server.tsx`    | `pnpm prerender`'s server entry; `scripts/prerender.ts` writes its output        |
| `tools/unity/`            | The Unity-side exporter for `Metadata~/PlaygroundRef`                            |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites                                                     |

Animations stop under `prefers-reduced-motion`: the hero holds still, clips don't autoplay and the gizmo preview
stops turning.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: checks, build, then deploy to GitHub Pages. Pull requests only
run the checks. A separate job runs the end-to-end tests in Chromium, Firefox and WebKit; it reports failures but does
not hold back a deploy.

One-time repository setup: **Settings > Pages > Build and deployment > Source: GitHub Actions**.

The site is built for the `/Blendon-Web/` path. For a custom domain, build with `BASE_PATH=/` and add a `public/CNAME`.
