// `pnpm sync`: regenerates src/plugin/generated/window-data.json and tutorial.json, public/plugin/ and public/docs/
// from the Blendon plugin this repository is mounted in (../ by default, or BLENDON_DIR) and its Unity dump
// (Metadata~/PlaygroundRef there, or BLENDON_REF). `pnpm sync --check` reads and checks all of it, writes nothing.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANUAL_FILE } from '../../src/lib/paths.ts';
import { commitStaged, missingSources, stageAssets } from './assets.ts';
import { Problems } from './dump.ts';
import { buildTutorialData } from './tutorial.ts';
import { buildWindowData } from './window-data.ts';

const check = process.argv.includes('--check');
const root = resolve(import.meta.dirname, '..', '..');
const plugin = resolve(root, process.env.BLENDON_DIR ?? '..');
const ref = process.env.BLENDON_REF;

const paths = {
  editor: join(plugin, 'Editor'),
  icons: join(plugin, 'Editor', 'Icons'),
  ref: ref ? resolve(root, ref) : join(plugin, 'Metadata~', 'PlaygroundRef'),
  video: join(plugin, 'Metadata~', 'Video'),
};
// Folders under public/ the sync owns outright, replaced whole.
const OWNED = ['plugin', 'docs'];
const GENERATED = ['src/plugin/generated/window-data.json', 'src/plugin/generated/tutorial.json'];

console.log('Reading Blendon from', plugin);
console.log('Reading its Unity dump from', paths.ref);
const problems = new Problems();
const tutorial = problems.guard('Tutorial', () => buildTutorialData(paths));
const windowData = problems.guard('Window data', () =>
  buildWindowData(paths, problems, tutorial?.data.chapters.map((c) => c.icon) ?? []),
);
const assets = [...(windowData?.assets ?? []), ...(tutorial?.assets ?? [])];
assets.push({ kind: 'copy', src: join(plugin, 'Documentation', 'Blendon_Manual.pdf'), out: MANUAL_FILE });
for (const src of missingSources(assets)) problems.add('Missing source file ' + src);

if (problems.count || !windowData || !tutorial) {
  console.error(`${problems.count} problem(s), nothing written:\n  ${problems.lines().join('\n  ')}`);
  process.exit(1);
}
const settings = Object.keys(windowData.data.props).length;
if (check) {
  console.log(`Check passed: ${settings} settings, ${assets.length} asset plans, nothing written.`);
  process.exit(0);
}

const stage = join(root, '.cache', 'sync-stage');
rmSync(stage, { recursive: true, force: true });
try {
  const count = await stageAssets(assets, join(stage, 'public'), OWNED);
  // After staging: the image sizes in the data are read while the images are written.
  const generated = join(stage, 'src', 'plugin', 'generated');
  mkdirSync(generated, { recursive: true });
  writeFileSync(join(generated, 'window-data.json'), JSON.stringify(windowData.data, null, 1) + '\n');
  writeFileSync(join(generated, 'tutorial.json'), JSON.stringify(tutorial.data, null, 1) + '\n');
  commitStaged(stage, root, [...OWNED.map((d) => 'public/' + d), ...GENERATED]);
  console.log(`Wrote window-data.json (${settings} settings, ${count} assets) and tutorial.json.`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
