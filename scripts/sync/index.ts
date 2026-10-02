// `pnpm sync`: regenerates src/generated/window-data.json and public/plugin/ from the Blendon
// plugin this repository is mounted in (../ by default, or BLENDON_DIR).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeAssets } from './assets.ts';
import { buildWindowData } from './window-data.ts';

const root = resolve(import.meta.dirname, '..', '..');
const plugin = resolve(root, process.env.BLENDON_DIR ?? '..');

const paths = {
  editor: join(plugin, 'Editor'),
  icons: join(plugin, 'Editor', 'Icons'),
  ref: join(plugin, 'Metadata~', 'PlaygroundRef'),
  video: join(plugin, 'Metadata~', 'Video'),
};

console.log('Reading Blendon from', plugin);
const { data, assets } = buildWindowData(paths);
const count = await writeAssets(assets, join(root, 'public'), ['plugin']);

const outDir = join(root, 'src', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'window-data.json'), JSON.stringify(data, null, 1) + '\n');
console.log(`Wrote window-data.json (${Object.keys(data.props).length} settings, ${count} assets).`);
