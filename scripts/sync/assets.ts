// Copies (or re-encodes) the plugin files the generated data points at, into a staging folder first: nothing
// the site serves changes until every file is built, and then everything changes at once.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export type AssetPlan =
  | { kind: 'copy'; src: string; out: string }
  | { kind: 'webp'; src: string; out: string; quality: number; onSize?: (w: number, h: number) => void };

/** The plans' source files that don't exist, each once. */
export function missingSources(plans: AssetPlan[]): string[] {
  return [...new Set(plans.filter((p) => !existsSync(p.src)).map((p) => p.src))].sort();
}

/**
 * Writes every planned asset under `dir` (the staging copy of public/), creating `ownedDirs` even when no plan
 * lands in them. Image sizes reach their plans' onSize on the way.
 */
export async function stageAssets(plans: AssetPlan[], dir: string, ownedDirs: string[]): Promise<number> {
  const missing = missingSources(plans);
  if (missing.length) throw new Error('Missing source files:\n  ' + missing.join('\n  '));
  for (const d of ownedDirs) mkdirSync(join(dir, d), { recursive: true });
  const done = new Set<string>();
  const jobs: (() => Promise<void>)[] = [];
  for (const plan of plans) {
    const target = join(dir, plan.out);
    if (plan.kind === 'webp' && plan.onSize) {
      const meta = await sharp(plan.src).metadata();
      plan.onSize(meta.width, meta.height);
    }
    if (done.has(plan.out)) continue;
    done.add(plan.out);
    mkdirSync(dirname(target), { recursive: true });
    if (plan.kind === 'copy') copyFileSync(plan.src, target);
    // Effort 4: higher settings take seconds per image for a few percent of size.
    else
      jobs.push(() =>
        sharp(plan.src)
          .webp({ quality: plan.quality, effort: 4 })
          .toFile(target)
          .then(() => undefined),
      );
  }
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map((job) => job()));
  return done.size;
}

// Windows can refuse a rename for a moment while a scanner or watcher holds the folder.
function move(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
}

/**
 * Replaces each `entries` path (file or folder, relative) under `root` with the one staged under `stage`. A move
 * that fails puts every path already replaced back, so the site is either all old or all new.
 */
export function commitStaged(stage: string, root: string, entries: string[]): void {
  const old = join(stage, '.old');
  const done: { live: string; kept: string | null }[] = [];
  try {
    for (const [i, rel] of entries.entries()) {
      const staged = join(stage, rel);
      if (!existsSync(staged)) throw new Error('Nothing staged for ' + rel);
      const live = join(root, rel);
      let kept: string | null = null;
      if (existsSync(live)) {
        kept = join(old, String(i));
        mkdirSync(old, { recursive: true });
        move(live, kept);
      }
      done.push({ live, kept });
      mkdirSync(dirname(live), { recursive: true });
      move(staged, live);
    }
  } catch (e) {
    // Whatever sits at a replaced path now is the new copy: the old one was moved aside first.
    for (const { live, kept } of done.reverse()) {
      rmSync(live, { recursive: true, force: true });
      if (kept !== null) move(kept, live);
    }
    throw e;
  }
  rmSync(old, { recursive: true, force: true });
}
