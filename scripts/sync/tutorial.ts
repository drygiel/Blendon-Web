// Builds src/generated/tutorial.json from the plugin's TutorialCurriculum.cs: every chapter's tasks with the
// picture and clip the Scene View tutorial shows when a task is hovered.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TutorialChapter, TutorialData, TutorialTask } from '../../src/landing/sections/tutorial/tutorial-data.ts';
import type { AssetPlan } from './assets.ts';
import { stripComments } from './csharp.ts';
import { HEADER_CLIP } from './window-data.ts';

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const CHAPTER = new RegExp(String.raw`\bnew\(\s*${STR}\s*,\s*${STR}`, 'g');
const TASK = new RegExp(String.raw`TutorialTask\.(?:Shortcut|Gesture)\(\s*${STR}\s*,\s*${STR}\s*,\s*${STR}`, 'g');
const SHOWING = new RegExp(String.raw`\.Showing\(\s*${STR}(?:\s*,\s*${STR})?\s*\)`, 'g');

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

  // Every match in source order: a task belongs to the chapter before it, a Showing to the task before it.
  type Hit = { at: number; kind: 'chapter' | 'task' | 'showing'; m: RegExpExecArray };
  const hits: Hit[] = [];
  for (const [re, kind] of [
    [CHAPTER, 'chapter'],
    [TASK, 'task'],
    [SHOWING, 'showing'],
  ] as const)
    for (const m of source.matchAll(re)) hits.push({ at: m.index, kind, m });
  hits.sort((a, b) => a.at - b.at);

  const assets: AssetPlan[] = [];
  const chapters: TutorialChapter[] = [];
  let task: TutorialTask | null = null;

  for (const { kind, m } of hits) {
    if (kind === 'chapter') {
      chapters.push({ title: unescape(m[1]), subtitle: unescape(m[2]), tasks: [] });
      task = null;
    } else if (kind === 'task') {
      const chapter = chapters.at(-1);
      if (!chapter) throw new Error('Tutorial task before any chapter: ' + m[1]);
      task = { id: m[1], title: unescape(m[2]), hint: unescape(m[3]), picture: '', clip: '' };
      chapter.tasks.push(task);
    } else {
      if (!task || task.picture) throw new Error('Unexpected Showing(' + m[1] + ')');
      const image = m[1];
      const out = tipOut(image);
      assets.push({ kind: 'webp', src: join(paths.icons, image), out, quality: out.includes('/headers/') ? 90 : 88 });
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

  const bare = chapters.flatMap((c) => c.tasks).filter((t) => !t.picture);
  if (bare.length) throw new Error('Tutorial tasks without a picture: ' + bare.map((t) => t.id).join(', '));

  return { data: { chapters }, assets };
}
