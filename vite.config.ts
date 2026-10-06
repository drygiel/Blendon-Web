import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo>/; BASE_PATH overrides it (e.g. "/" for a custom domain).
const base = process.env.BASE_PATH ?? '/Blendon-Web/';
// Absolute URL of the deployed site, for the social preview tags in index.html.
const siteUrl = process.env.SITE_URL ?? `https://drygiel.github.io${base}`;

export default defineConfig(({ isSsrBuild }) => ({
  base,
  plugins: [react(), { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl) }],
  css: {
    preprocessorOptions: {
      // Lets any module `@use 'tokens'` / `@use 'mixins'` without relative paths.
      scss: { loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))] },
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // The prerender's server bundle only renders markup; the client build ships public/.
    copyPublicDir: !isSsrBuild,
    // The landing, and the Playground on a page of its own at /playground/.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        playground: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
}));
