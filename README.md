# Blendon Web

Website for [Blendon](https://github.com/drygiel/Blendon) - a Blender-style workflow extension for the Unity Scene view.
Live at **https://drygiel.github.io/Blendon-Web/**.

This repository is mounted as a Git submodule at `Web~/` in the main Blendon repository. Unity skips folders ending
with `~`, so nothing here (including `node_modules`) is imported into the project.

## Stack

React 19, TypeScript (strict), Vite, SCSS (CSS Modules), Vitest, Playwright, ESLint and Prettier. No CSS framework.

## Requirements

- Node 24 LTS (see `.nvmrc`; Node 22.12+ also works)
- pnpm, pinned in `package.json` - run `corepack enable` once and the right version is used automatically

## Scripts

| Command         | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| `pnpm install`  | Install dependencies                                          |
| `pnpm dev`      | Dev server with hot reload                                    |
| `pnpm build`    | Type-check and build the static site into `dist/`             |
| `pnpm preview`  | Serve the production build locally                            |
| `pnpm check`    | Type-check, lint, format check and unit tests (what CI runs)  |
| `pnpm test`     | Unit tests (Vitest)                                           |
| `pnpm test:e2e` | End-to-end tests in Chromium, Firefox and WebKit (Playwright) |
| `pnpm format`   | Format everything with Prettier                               |

Playwright needs its browsers once: `pnpm exec playwright install`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: checks, build, then deploy to GitHub Pages. Pull requests only
run the checks.

One-time repository setup: **Settings > Pages > Build and deployment > Source: GitHub Actions**.

The site is built for the `/Blendon-Web/` path. For a custom domain, build with `BASE_PATH=/` and add a `public/CNAME`.
