// Builds src/plugin/generated/tutorial.json from the plugin's TutorialCurriculum.cs: every chapter's icon and
// accent, and every task's text, the picture and clip it shows, and the line the badge gives while its need is
// unmet. How each task is ticked lives in the Playground's own curriculum.ts, keyed by the same ids.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TutorialChapter, TutorialData, TutorialTask } from '../../src/plugin/tutorial.ts';
import type { AssetPlan } from './assets.ts';
import { stripComments } from './csharp.ts';
import { ACCENTS, HEADER_CLIP } from './window-data.ts';

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const CHAPTER = new RegExp(
  String.raw`\bnew\(\s*${STR}\s*,\s*${STR}\s*,\s*${STR}\s*,\s*\(\)\s*=>\s*Palette\.Accent(\w+)`,
  'g',
);
const TASK = new RegExp(
  String.raw`TutorialTask\.(?:Shortcut|Gesture|Command|Transform)\(\s*${STR}\s*,\s*${STR}\s*,\s*${STR}`,
  'g',
);
const SHOWING = new RegExp(String.raw`\.Showing\(\s*${STR}(?:\s*,\s*${STR})?\s*\)`, 'g');
const NEEDS = /\.Needs\(\s*(\w+)\s*,/g;
const CONST = new RegExp(String.raw`const\s+string\s+(\w+)\s*=\s*${STR}\s*;`, 'g');

// Palette accent names that aren't a page id.
const ACCENT_PAGE: Record<string, string> = { Shared: 'SharedGizmos' };

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

// Same public names the settings window's data uses, so both share one copy of each file.
const tipOut = (image: string) =>
  (image.endsWith('Header.png') ? 'plugin/headers/' : 'plugin/tips/') +
  image.slice(5).replace(/\//g, '_').replace('.png', '.webp');

export function buildTutorialData(paths: { editor: string; icons: string; video: string }): {
  data: TutorialData;
  assets: AssetPlan[];
} {
  const source = stripComments(
    readFileSync(join(paths.editor, 'Tutorial', 'TutorialCurriculum.cs'), 'utf8').replace(/\r\n/g, '\n'),
  );
  const consts = new Map([...source.matchAll(CONST)].map((m) => [m[1], unescape(m[2])]));

  // Every match in source order: a task belongs to the chapter before it, a Showing or Needs to the task before it.
  type Hit = { at: number; kind: 'chapter' | 'task' | 'showing' | 'needs'; m: RegExpExecArray };
  const hits: Hit[] = [];
  for (const [re, kind] of [
    [CHAPTER, 'chapter'],
    [TASK, 'task'],
    [SHOWING, 'showing'],
    [NEEDS, 'needs'],
  ] as const)
    for (const m of source.matchAll(re)) hits.push({ at: m.index, kind, m });
  hits.sort((a, b) => a.at - b.at);

  const assets: AssetPlan[] = [];
  const chapters: TutorialChapter[] = [];
  let task: TutorialTask | null = null;

  for (const { kind, m } of hits) {
    if (kind === 'chapter') {
      const page = ACCENT_PAGE[m[4]] ?? m[4];
      const accent = ACCENTS[page];
      if (!accent) throw new Error('No accent for Palette.Accent' + m[4]);
      chapters.push({ title: unescape(m[1]), subtitle: unescape(m[2]), icon: m[3], accent, tasks: [] });
      task = null;
    } else if (kind === 'task') {
      const chapter = chapters.at(-1);
      if (!chapter) throw new Error('Tutorial task before any chapter: ' + m[1]);
      task = { id: m[1], title: unescape(m[2]), hint: unescape(m[3]), picture: '', clip: '', aspect: '', needs: '' };
      chapter.tasks.push(task);
    } else if (kind === 'needs') {
      const text = consts.get(m[1]);
      if (!task || text === undefined) throw new Error('Unexpected Needs(' + m[1] + ')');
      task.needs = text;
    } else {
      if (!task || task.picture) throw new Error('Unexpected Showing(' + m[1] + ')');
      const image = m[1];
      const out = tipOut(image);
      const owner = task;
      assets.push({
        kind: 'webp',
        src: join(paths.icons, image),
        out,
        quality: out.includes('/headers/') ? 90 : 88,
        onSize: (w, h) => (owner.aspect = w + ' / ' + h),
      });
      task.picture = out;

      if (m[2]) {
        const key = m[2].slice(5).replace('/Header.webm', '').replace('.webm', '');
        const clip = HEADER_CLIP[key];
        if (!clip) throw new Error('No clip for tutorial video ' + m[2]);
        task.clip = 'plugin/video/' + clip + '.mp4';
        assets.push({ kind: 'copy', src: join(paths.video, clip + '.mp4'), out: task.clip });
      }
    }
  }

  const all = chapters.flatMap((c) => c.tasks);
  const bare = all.filter((t) => !t.picture);
  if (bare.length) throw new Error('Tutorial tasks without a picture: ' + bare.map((t) => t.id).join(', '));
  const ids = new Set<string>();
  for (const t of all) {
    if (ids.has(t.id)) throw new Error('Tutorial task id used twice: ' + t.id);
    ids.add(t.id);
  }

  return { data: { chapters }, assets };
}
