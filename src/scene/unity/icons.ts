// EditorGUIUtility.IconContent for the browser: Unity's built-in icons exported to public/scene/icons
// (32 px, the @2x art where Unity has it). Images load lazily and repaint the view when they arrive.
import { publicUrl } from '../../lib/links.ts';
import { SceneView } from './sceneview.ts';

const cache = new Map<string, HTMLImageElement | null>();

export const iconUrl = (name: string) => publicUrl(`scene/icons/${name.replace(/@2x$/, '').replace(/ /g, '_')}.png`);

/** The icon if it has loaded (null until then, and for names that were not exported). */
export function editorIcon(name: string | null | undefined): HTMLImageElement | null {
  if (!name) return null;
  const key = name.replace(/@2x$/, '');
  if (cache.has(key)) {
    const img = cache.get(key)!;
    return img && img.complete && img.naturalWidth ? img : null;
  }
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => SceneView.repaintAll();
  img.onerror = () => cache.set(key, null);
  img.src = iconUrl(key);
  cache.set(key, img);
  return null;
}
