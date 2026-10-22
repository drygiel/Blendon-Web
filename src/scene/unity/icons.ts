// EditorGUIUtility.IconContent for the browser: Unity's built-in icons exported to public/scene/icons
// (32 px, the @2x art where Unity has it), drawn from the icon sprite. A canvas gets its icon once the sheet has
// loaded, and the view repaints then.
import { publicUrl } from '../../lib/links.ts';
import { spriteBitmap } from '../../lib/sprite-sheet.ts';
import { SceneView } from './sceneview.ts';

const file = (name: string) => `scene/icons/${name.replace(/@2x$/, '').replace(/ /g, '_')}.png`;

/** The icon's name on the icon sprite. */
export const editorIconSprite = (name: string) => 'public/' + file(name);

/** The icon's own file, for a CSS cursor, which can't show part of the sprite. */
export const editorIconFile = (name: string) => publicUrl(file(name));

/** The icon for a canvas, if it is ready (null until then, and for names that were not exported). */
export function editorIcon(name: string | null | undefined): ImageBitmap | null {
  return name ? spriteBitmap(editorIconSprite(name), () => SceneView.repaintAll()) : null;
}
