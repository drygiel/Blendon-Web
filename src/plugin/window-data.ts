import { publicUrl } from '../lib/links.ts';
import type { WindowData, WindowDataFile } from './schema.ts';

/** The window data, set once by loadWindowData before anything renders. */
export let D: WindowData;

export const assetUrl = (path: string) => (path ? publicUrl(path) : '');

let pending: Promise<WindowData> | null = null;

/** Loads the generated data (a chunk of its own) and points its asset paths at the deployed site. */
export function loadWindowData(): Promise<WindowData> {
  pending ??= import('./generated/window-data.json').then((m) => {
    const file = m.default as unknown as WindowDataFile;
    const urls = (rec: Record<string, string>) => {
      for (const k of Object.keys(rec)) rec[k] = assetUrl(rec[k] ?? '');
    };
    urls(file.tips);
    urls(file.headerImages);
    urls(file.headerVideos);
    for (const ic of Object.values(file.icons)) ic.u = assetUrl(ic.u);
    file.logo = assetUrl(file.logo);
    D = { ...file, known: Object.fromEntries(file.contested.map((r) => [r.bid, r])) };
    return D;
  });
  return pending;
}
