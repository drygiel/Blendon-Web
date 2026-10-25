// Builds src/plugin/generated/tutorial.json from the plugin's TutorialCurriculum.cs: every chapter's icon and
// accent, every task's text, picture and clip, and the plain part of its rules - page, keys, the other ways
// through it, the tasks it builds on, why a switch skips it. What those rules compute on the live scene (a
// selection check, a setting test, a key sequence) is ported by hand in the Playground's curriculum.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fillTokens, presetSource } from '../../src/plugin/keys.ts';
import type { WindowDataFile } from '../../src/plugin/schema.ts';
import type { TutorialChapter, TutorialData, TutorialTask, TutorialWay } from '../../src/plugin/tutorial.ts';
import type { AssetPlan } from './assets.ts';
import { splitArgs, stripComments } from './csharp.ts';
import type { Problems } from './dump.ts';
import { ACCENTS, HEADER_CLIP, SITE_CLIP } from './window-data.ts';

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const CHAPTER = new RegExp(
  String.raw`\bnew\(\s*${STR}\s*,\s*${STR}\s*,\s*${STR}\s*,\s*\(\)\s*=>\s*Palette\.Accent(\w+)`,
  'g',
);
const TASK = /TutorialTask\.(Shortcut|Gesture|Command|Transform)\(/g;
const LITERAL = new RegExp('^' + STR + '$');
const LAMBDA = /^\(\)\s*=>\s*([\s\S]+)$/;
const CALL = /^(\w+)\(([\s\S]*)\)$/;

// Palette accent names that aren't a page id.
const ACCENT_PAGE: Record<string, string> = { Shared: 'SharedGizmos' };

const unescape = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

// A task that shows a still of its own gets the clip of the same name in Metadata~/Video/Tutorial, which only the
// site plays: the package leaves those clips out and the plugin shows the still. Its site copy is the picture's size.
const TUTORIAL_CLIPS = 'Tutorial';
const ownClipOut = (name: string) => 'plugin/video/tutorial/' + name + '.webm';
// Clips the plugin keeps after dropping their task (select.group), so the orphan check lets them be.
const RETIRED_CLIPS = new Set(['Grouping']);

// Same public names the settings window's data uses, so both share one copy of each file.
const tipOut = (image: string) =>
  (image.endsWith('Header.png') ? 'plugin/headers/' : 'plugin/tips/') +
  image.slice(5).replace(/\//g, '_').replace('.png', '.webp');

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.name.endsWith('.cs')) out.push(p);
  }
  return out;
}

// Index past the bracket that closes the one at `open`, string and char literals skipped.
function closeOf(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') if (--depth === 0) return i + 1;
  }
  throw new Error('Unclosed bracket at ' + s.slice(open, open + 40));
}

/**
 * Every `const string` of the Editor's C#, by "Class.Name", resolved through the constants and literals it is
 * built from (ShortcutIds.MoveGrabId, Prefix + "View Front"). A Class.Name declared twice with two values throws.
 */
function readConstants(editorDir: string): (ref: string, inClass: string) => string {
  const raw = new Map<string, { expr: string; cls: string } | null>();
  const DECL = /\b(?:class|struct)\s+(\w+)|\bconst\s+string\s+(\w+)\s*=\s*([^;]+);/g;
  for (const file of walkFiles(editorDir)) {
    let cls = '';
    for (const m of stripComments(readFileSync(file, 'utf8')).matchAll(DECL)) {
      if (m[1]) cls = m[1];
      else if (m[2] && m[3]) {
        const key = cls + '.' + m[2];
        const prev = raw.get(key);
        raw.set(key, prev === undefined || prev?.expr === m[3].trim() ? { expr: m[3].trim(), cls } : null);
      }
    }
  }
  const resolved = new Map<string, string>();
  const resolve = (ref: string, inClass: string, seen: string[] = []): string => {
    const parts = ref.split('.');
    const key = parts.length === 1 ? inClass + '.' + ref : parts.slice(-2).join('.');
    const hit = resolved.get(key);
    if (hit !== undefined) return hit;
    const decl = raw.get(key);
    if (decl === undefined) throw new Error('No C# constant ' + ref);
    if (decl === null) throw new Error('C# constant ' + key + ' has more than one value');
    if (seen.includes(key)) throw new Error('C# constant ' + key + ' refers to itself');
    const value = splitTop(decl.expr, '+')
      .map((piece) => {
        const lit = LITERAL.exec(piece);
        return lit ? unescape(lit[1] ?? '') : resolve(piece, decl.cls, [...seen, key]);
      })
      .join('');
    resolved.set(key, value);
    return value;
  };
  return resolve;
}

// Splits at a top-level operator character, outside string literals and brackets.
function splitTop(expr: string, op: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i] ?? '';
    if (c === '"') {
      const start = i;
      for (i++; i < expr.length && expr[i] !== '"'; i++) if (expr[i] === '\\') i++;
      cur += expr.slice(start, i + 1);
      continue;
    }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === op && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const literal = (arg: string | undefined): string => {
  const m = LITERAL.exec(arg ?? '');
  if (!m) throw new Error('Expected a string literal, found ' + arg);
  return unescape(m[1] ?? '');
};

const member = (arg: string | undefined, type: string): string => {
  const m = new RegExp('^' + type + String.raw`\.(\w+)$`).exec(arg ?? '');
  if (!m?.[1]) throw new Error(`Expected ${type}.Name, found ${arg}`);
  return m[1];
};

// A settings getter as a page row names it: MoveGizmo.Instance.Settings.X / OrbitSelected.Settings.X /
// SharedGizmoSettings.Instance.X -> "<Owner>Settings.X".
// "MoveGizmo.Instance.Settings.SurfaceSnapModifierSetting" names MoveGizmoSettings.SurfaceSnapModifier.
function settingPath(expr: string): string {
  const parts = expr.split('.');
  const owner = parts[0] ?? '';
  return (
    (owner.endsWith('Settings') ? owner : owner + 'Settings') + '.' + (parts.at(-1) ?? '').replace(/(.)Setting$/, '$1')
  );
}

export function buildTutorialData(paths: { editor: string; icons: string; video: string }): {
  data: TutorialData;
  assets: AssetPlan[];
} {
  const source = stripComments(
    readFileSync(join(paths.editor, 'Tutorial', 'TutorialCurriculum.cs'), 'utf8').replace(/\r\n/g, '\n'),
  );
  const constant = readConstants(paths.editor);
  const local = (ref: string) => constant(ref, 'TutorialCurriculum');
  const assets: AssetPlan[] = [];

  const picture = (image: string, onSize: (aspect: string) => void) => {
    const out = tipOut(image);
    assets.push({
      kind: 'webp',
      src: join(paths.icons, image),
      out,
      quality: out.includes('/headers/') ? 90 : 88,
      onSize: (w, h) => onSize(w + ' / ' + h),
    });
    return out;
  };

  // The shortcut whose binding a key getter returns: a lambda calling Binding(id), or a method that does.
  const keysOf = (expr: string): string => {
    const body =
      LAMBDA.exec(expr)?.[1]?.trim() ??
      new RegExp(String.raw`static\s+string\s+${expr}\(\)\s*\{([^}]*)\}`).exec(source)?.[1];
    const id = body && /\bBinding\(([\w.]+)\)/.exec(body)?.[1];
    if (!id) throw new Error('Unknown keys for an Otherwise way: ' + expr);
    return local(id);
  };

  // "Name" for a method group or a call without arguments, "Name:<shortcut id>" for a call on one.
  const gateOf = (expr: string): string => {
    if (/^\w+$/.test(expr)) return expr;
    const call = CALL.exec(LAMBDA.exec(expr)?.[1]?.trim() ?? '');
    if (!call?.[1]) throw new Error('Unknown gate for an Otherwise way: ' + expr);
    return call[2] ? call[1] + ':' + local(call[2].trim()) : call[1];
  };

  const chapters: TutorialChapter[] = [];
  type Hit = { at: number; chapter?: RegExpExecArray; task?: RegExpExecArray };
  const hits: Hit[] = [
    ...[...source.matchAll(CHAPTER)].map((m) => ({ at: m.index, chapter: m })),
    ...[...source.matchAll(TASK)].map((m) => ({ at: m.index, task: m })),
  ].sort((a, b) => a.at - b.at);

  for (const { chapter: c, task: m } of hits) {
    if (c) {
      const page = ACCENT_PAGE[c[4] ?? ''] ?? c[4] ?? '';
      const accent = ACCENTS[page];
      if (!accent) throw new Error('No accent for Palette.Accent' + c[4]);
      chapters.push({
        title: unescape(c[1] ?? ''),
        subtitle: unescape(c[2] ?? ''),
        icon: c[3] ?? '',
        accent,
        tasks: [],
      });
      continue;
    }
    if (!m) continue;
    const chapter = chapters.at(-1);
    const open = m.index + m[0].length - 1;
    let end = closeOf(source, open);
    const args = splitArgs(source.slice(open + 1, end - 1));
    const kind = (m[1] ?? '').toLowerCase() as TutorialTask['kind'];
    const hint = literal(args[2]);
    const task: TutorialTask = {
      id: literal(args[0]),
      title: literal(args[1]),
      hint,
      // Undefined is left out of the JSON, the key only holds this spot beside the hint.
      hintSrc: hint.includes('{') ? hint : undefined,
      picture: '',
      clip: '',
      aspect: '',
      needs: '',
      kind,
      page: '',
    };
    if (!chapter) throw new Error('Tutorial task before any chapter: ' + task.id);
    chapter.tasks.push(task);

    const rest = args.slice(kind === 'gesture' ? 5 : 4);
    if (kind === 'gesture') {
      task.signal = member(args[3], 'FeatureGesture');
      task.page = member(args[4], 'SettingsPage');
      if (rest.length) task.pressing = true;
    } else task.page = member(args[3], 'SettingsPage');
    if (kind === 'shortcut') task.ids = rest.map(local);
    if (kind === 'command') task.commands = rest.map(literal);
    if (kind === 'transform') task.traits = splitTop(rest[0] ?? '', '|').map((t) => member(t, 'T'));

    // The fluent calls after it, in the order written.
    for (;;) {
      const call = /^\s*\.(\w+)\(/.exec(source.slice(end));
      if (!call) break;
      const at = end + call[0].length - 1;
      end = closeOf(source, at);
      const a = splitArgs(source.slice(at + 1, end - 1));
      switch (call[1]) {
        case 'Showing': {
          if (task.picture) throw new Error('Showing twice on ' + task.id);
          task.picture = picture(literal(a[0]), (aspect) => (task.aspect = aspect));
          if (a[1]) {
            const clipPath = literal(a[1]);
            const key = clipPath.slice(5).replace('/Header.webm', '').replace('.webm', '');
            const clip = HEADER_CLIP[key];
            if (!clip) throw new Error('No clip for tutorial video ' + clipPath);
            task.clip = 'plugin/video/' + clip + '.webm';
            assets.push({ kind: 'copy', src: join(paths.video, clip + SITE_CLIP), out: task.clip });
          } else {
            const name = basename(literal(a[0]), '.png');
            const src = join(paths.video, TUTORIAL_CLIPS, name + SITE_CLIP);
            if (existsSync(src)) {
              task.clip = ownClipOut(name);
              assets.push({ kind: 'copy', src, out: task.clip });
            }
          }
          break;
        }
        case 'Pressing':
          task.pressing = true;
          break;
        case 'KeysIn': {
          const arg = a[0] ?? '';
          const lambda = LAMBDA.exec(arg)?.[1]?.trim();
          if (arg.startsWith('SettingsPage.')) task.keysPage = member(arg, 'SettingsPage');
          else if (lambda) task.keysSetting = settingPath(lambda);
          else task.keysShortcut = local(arg);
          break;
        }
        case 'Needs':
          task.needs = local(a[0] ?? '');
          break;
        case 'AvailableWhen':
          task.availableWhen = { reason: literal(a[1]) };
          break;
        case 'Otherwise': {
          const way: TutorialWay = {
            gate: gateOf(a[0] ?? ''),
            keys: keysOf(a[1] ?? ''),
            text: literal(a[2]),
            picture: '',
            aspect: '',
          };
          way.picture = picture(literal(a[3]), (aspect) => (way.aspect = aspect));
          (task.otherwise ??= []).push(way);
          break;
        }
        case 'After':
          task.after = a.map(literal);
          break;
        default:
          throw new Error(`Unknown TutorialTask.${call[1]} on ${task.id}`);
      }
    }
  }

  const all = chapters.flatMap((c) => c.tasks);
  const bare = all.filter((t) => !t.picture);
  if (bare.length) throw new Error('Tutorial tasks without a picture: ' + bare.map((t) => t.id).join(', '));
  // A clip left behind by a renamed or dropped picture would silently stop playing.
  const ownDir = join(paths.video, TUTORIAL_CLIPS);
  const used = new Set(all.map((t) => t.clip));
  const orphans = existsSync(ownDir)
    ? readdirSync(ownDir)
        .filter((n) => n.endsWith(SITE_CLIP))
        .map((n) => n.slice(0, -SITE_CLIP.length))
        .filter((n) => !RETIRED_CLIPS.has(n) && !used.has(ownClipOut(n)))
    : [];
  if (orphans.length) throw new Error('Tutorial clips no task shows: ' + orphans.join(', '));
  const ids = new Set<string>();
  for (const t of all) {
    if (ids.has(t.id)) throw new Error('Tutorial task id used twice: ' + t.id);
    for (const e of t.after ?? []) if (!ids.has(e)) throw new Error(`${t.id} builds on ${e}, which is not before it`);
    ids.add(t.id);
  }

  return { data: { chapters }, assets };
}

const RICH_TAG = /<\/?(?:b|i|size|color)(?:=[^>]*)?>/g;

/**
 * Keeps each hint as written in `hintSrc` and fills `hint` for the Blendon preset with default settings, as
 * plain text: the landing shows it with no live keys. Every key and setting a task names must exist.
 */
export function resolveTutorialHints(
  data: TutorialData,
  window: Pick<WindowDataFile, 'keymap' | 'props' | 'catalog'>,
  out: Problems,
): void {
  const blendon = presetSource(window, 'Blendon');
  const pages = new Set(window.catalog.map((p) => p.id));
  for (const t of data.chapters.flatMap((c) => c.tasks)) {
    const where = 'Tutorial task ' + t.id;
    if (t.hintSrc) t.hint = fillTokens(t.hintSrc, blendon).text.replace(RICH_TAG, '');
    for (const page of [t.page, t.keysPage])
      if (page && !pages.has(page)) out.add(`${where}: no settings page ${page}`);
    if (t.keysSetting && !window.props[t.keysSetting]) out.add(`${where}: no setting ${t.keysSetting}`);
    for (const id of [...(t.ids ?? []), t.keysShortcut, ...(t.otherwise ?? []).map((w) => w.keys)])
      if (id && !window.keymap[id]) out.add(`${where}: model2.json keymap lacks ${id}`);
  }
}
