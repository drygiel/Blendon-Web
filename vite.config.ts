import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo>/; BASE_PATH overrides it (e.g. "/" for a custom domain).
const base = process.env.BASE_PATH ?? '/Blendon-Web/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
