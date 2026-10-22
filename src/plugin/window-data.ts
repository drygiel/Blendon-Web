import { publicUrl } from '../lib/links.ts';
import type { WindowData, WindowDataFile } from './schema.ts';

/** The window data, set once by loadWindowData before anything renders. */
export let D: WindowData;

export const assetUrl = (path: string) => (path ? publicUrl(path) : '');

let pending: Promise<WindowData> | null = null;

/** Loads the generated data (a chunk of its own): asset paths point at the deployed site, icons at the sprite. */
export function loadWindowData(): Promise<WindowData> {
  pending ??= import('./generated/window-data.json').then((m) => {
    const file = m.default as unknown as WindowDataFile;
    const urls = (rec: Record<string, string>) => {
      for (const k of Object.keys(rec)) rec[k] = assetUrl(rec[k] ?? '');
    };
    urls(file.tips);
    urls(file.headerImages);
    urls(file.headerVideos);
    for (const k of Object.keys(file.icons)) file.icons[k] = 'public/' + file.icons[k];
    file.logo = 'public/' + file.logo;
    D = { ...file, known: Object.fromEntries(file.contested.map((r) => [r.bid, r])) };
    return D;
  });
  return pending;
}
