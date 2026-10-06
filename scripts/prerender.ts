// `pnpm prerender`: writes the landing's server-rendered markup and its JSON-LD into dist/index.html, so
// crawlers and link previews read the page without running it. Runs after `vite build` and the SSR build.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface ServerEntry {
  render: () => string;
  structuredData: (siteUrl: string) => object[];
}

const root = resolve(import.meta.dirname, '..');
const page = resolve(root, 'dist', 'index.html');
const entry = pathToFileURL(resolve(root, 'dist-ssr', 'entry-server.js')).href;

const { render, structuredData } = (await import(entry)) as ServerEntry;
let html = readFileSync(page, 'utf8');

// The deployed address, as vite.config.ts wrote it into the canonical link.
const siteUrl = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
if (!siteUrl) throw new Error('dist/index.html has no canonical link');

const ROOT = '<div id="root"></div>';
if (!html.includes(ROOT)) throw new Error('dist/index.html has no empty #root');
html = html.replace(ROOT, () => `<div id="root">${render()}</div>`);

// "<" escaped so no string in the data can close the script element.
const jsonLd = structuredData(siteUrl)
  .map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`)
  .join('\n    ');
html = html.replace('</head>', () => `  ${jsonLd}\n  </head>`);

writeFileSync(page, html);
console.log(`Prerendered ${page} (${Math.round(html.length / 1024)} KB)`);
