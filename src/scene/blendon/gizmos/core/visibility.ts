// GizmoVisibility: the Hide Gizmo switch. On hides every Blendon tool gizmo and Unity's own handles.
import { SceneView } from '../../../unity/sceneview.ts';
import { GeneralSettings } from '../../settings.ts';
import { GizmoToolsOverride } from '../common/layout.ts';

const owner = {};
let hidden = false;

// Re-checked every pass, so switching Blendon off hands Unity its handles back even while hidden.
function sync() {
  if (hidden && GeneralSettings.Enabled) GizmoToolsOverride.acquire(owner);
  else GizmoToolsOverride.release(owner);
}

export const GizmoVisibility = {
  get hidden() {
    return hidden;
  },
  toggle() {
    hidden = !hidden;
    sync();
    SceneView.repaintAll();
  },
  install() {
    SceneView.duringSceneGui.add(sync);
  },
};
