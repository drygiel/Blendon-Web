// GizmoVisibility: Hide Gizmo, Blender's Show Gizmo inverted. Only Blendon's tools in its context hide (the Editor's
// Rect too, which the demo lacks). Unity's tool in a switched-off gizmo's slot stays, and Game Object hides nothing.
// Gone with the visit, as an Editor restart shows the gizmos again.
import { PlaygroundEvents } from '../../../../bridge/events.ts';
import { SceneView } from '../../../unity/sceneview.ts';

let hidden = false;

export const GizmoVisibility = {
  get hidden() {
    return hidden;
  },
  toggle() {
    hidden = !hidden;
    SceneView.repaintAll();
  },
  install() {
    PlaygroundEvents.on('reset', () => void (hidden = false));
  },
};
