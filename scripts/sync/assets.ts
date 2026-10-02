// Copies (or re-encodes) the plugin files the generated data points at into public/.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export type AssetPlan =
  | { kind: 'copy'; src: string; out: string }
  | { kind: 'webp'; src: string; out: string; quality: number; onSize?: (w: number, h: number) => void };

/** Writes every planned asset under publicDir, after clearing the folders the plans own. */
export async function writeAssets(plans: AssetPlan[], publicDir: string, ownedDirs: string[]): Promise<number> {
  for (const d of ownedDirs) rmSync(join(publicDir, d), { recursive: true, force: true });
  const done = new Set<string>();
  const missing: string[] = [];
  const jobs: (() => Promise<void>)[] = [];
  for (const plan of plans) {
    if (!existsSync(plan.src)) {
      missing.push(plan.src);
      continue;
    }
    const target = join(publicDir, plan.out);
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
  if (missing.length) throw new Error('Missing source files:\n  ' + missing.join('\n  '));
  return done.size;
}
