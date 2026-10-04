// IsolateView: Blender's local view. Num / hides everything but the selection; again brings it back.
import { Selection, ShortcutManager } from '../../unity/editor.ts';
import { SceneVisibilityManager } from '../../unity/scene.ts';
import { SceneView } from '../../unity/sceneview.ts';
import { SceneTutorial } from '../foundation.ts';
import { ViewportGesture } from '../gizmos/viewport-gesture.ts';
import { FrameSelected, unityFrameSelected } from './frame-selected.ts';
import { FrameSelectedSettings, IsolateViewSettings } from './settings.ts';

const ShortcutId = 'Blendon/Isolate View';

export const IsolateView = {
  ShortcutId,
  Settings: IsolateViewSettings,

  install() {
    ShortcutManager.register(ShortcutId, () => IsolateView.toggle(), false, 'Num /');
  },

  toggle() {
    // Mid-grab Num / is the reciprocal key of the typed value; an open pie owns the view.
    if (ViewportGesture.claimed(ShortcutId) || ViewportGesture.busy) return;
    if (!IsolateViewSettings.Enabled) return;
    const view = SceneView.lastActiveSceneView;
    if (!view) return;
    if (SceneVisibilityManager.isCurrentStageIsolated()) {
      SceneVisibilityManager.exitIsolation();
      view.repaint();
      // Reported on the way out: the lesson is that the same key brings the scene back.
      SceneTutorial.reportShortcut(ShortcutId);
      return;
    }
    const selection = Selection.gameObjects;
    if (selection.length === 0) return;
    SceneVisibilityManager.isolate(selection, IsolateViewSettings.IncludeChildren);
    view.repaint();
    if (!IsolateViewSettings.FrameOnIsolate) return;
    if (FrameSelectedSettings.Enabled) FrameSelected.run();
    else unityFrameSelected(view);
  },
};
