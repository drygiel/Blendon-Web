import { publicUrl } from '../lib/links.ts';
import type { WindowData } from './schema.ts';

/** The window data, set once by loadWindowData before anything renders. */
export let D: WindowData;

export const assetUrl = (path: string) => (path ? publicUrl(path) : '');

let pending: Promise<WindowData> | null = null;

/** Loads the generated data (a chunk of its own) and points its asset paths at the deployed site. */
export function loadWindowData(): Promise<WindowData> {
  pending ??= import('./generated/window-data.json').then((m) => {
    const d = m.default as unknown as WindowData;
    const urls = (rec: Record<string, string>) => {
      for (const k of Object.keys(rec)) rec[k] = assetUrl(rec[k] ?? '');
    };
    urls(d.tips);
    urls(d.headerImages);
    urls(d.headerVideos);
    for (const ic of Object.values(d.icons)) ic.u = assetUrl(ic.u);
    d.logo = assetUrl(d.logo);
    D = d;
    return d;
  });
  return pending;
}
