// `pnpm sync`: regenerates src/plugin/generated/window-data.json and tutorial.json, public/plugin/ and public/docs/
// from the Blendon plugin this repository is mounted in (../ by default, or BLENDON_DIR).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANUAL_FILE } from '../../src/lib/paths.ts';
import { writeAssets } from './assets.ts';
import { buildTutorialData } from './tutorial.ts';
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
const tutorial = buildTutorialData(paths);
assets.push(...tutorial.assets);
assets.push({ kind: 'copy', src: join(plugin, 'Documentation', 'Blendon_Manual.pdf'), out: MANUAL_FILE });
const count = await writeAssets(assets, join(root, 'public'), ['plugin', 'docs']);

const outDir = join(root, 'src', 'plugin', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'window-data.json'), JSON.stringify(data, null, 1) + '\n');
writeFileSync(join(outDir, 'tutorial.json'), JSON.stringify(tutorial.data, null, 1) + '\n');
console.log(`Wrote window-data.json (${Object.keys(data.props).length} settings, ${count} assets) and tutorial.json.`);
