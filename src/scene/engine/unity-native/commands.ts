// The Editor's own key commands the demo runs: the tool keys, the handle toggles and Frame Selected.
// Each keeps its default key unless a live plugin shortcut holds it; the moved keys are where Blendon's
// Blender preset puts the Editor's command aside.
import { PivotMode, PivotRotation, Selection, ShortcutManager, Tool, Tools } from '../../unity/editor.ts';
import { Bounds, Vector3 } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';

/** SceneView.FrameSelected: the selection's bounding sphere fills the view, eased over half a second. */
export function frameSelected(view: SceneView) {
  let b: Bounds | null = null;
  for (const t of Selection.transforms)
    for (const d of t.walk()) {
      const rb = d.gameObject.visible ? d.gameObject.bounds : null;
      if (rb) b = b ? b.encapsulate(rb) : rb;
    }
  if (!b)
    for (const t of Selection.transforms) b = b ? b.encapsulate(t.position) : new Bounds(t.position, Vector3.zero);
  if (!b) return;
  const size = b.extents.magnitude;
  view.lookAt(b.center, view.rotation, size < 1e-6 ? 10 : size, view.orthographic, false);
}

const tool = (t: Tool) => () => {
  Tools.current = t;
  SceneView.repaintAll();
};

export const UnityCommands = {
  install() {
    const R = (...a: Parameters<typeof ShortcutManager.registerNative>) => ShortcutManager.registerNative(...a);
    R('Tools/View', tool(Tool.View), false, 'Q', 'Alt+Q');
    R('Tools/Move', tool(Tool.Move), false, 'W');
    R('Tools/Rotate', tool(Tool.Rotate), false, 'E');
    R('Tools/Scale', tool(Tool.Scale), false, 'R', 'Shift+R');
    R('Tools/Transform', tool(Tool.Transform), false, 'Y');
    R(
      'Tools/Toggle Pivot Position',
      () => (Tools.pivotMode = Tools.pivotMode === PivotMode.Pivot ? PivotMode.Center : PivotMode.Pivot),
      false,
      'Z',
      'Alt+Z',
    );
    R(
      'Tools/Toggle Pivot Orientation',
      () =>
        (Tools.pivotRotation =
          Tools.pivotRotation === PivotRotation.Local ? PivotRotation.Global : PivotRotation.Local),
      false,
      'X',
    );
    R(
      'Main Menu/Edit/Frame Selected',
      () => {
        const v = SceneView.lastActiveSceneView;
        if (v) frameSelected(v);
      },
      false,
      'F',
    );
  },
};
