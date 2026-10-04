// ShadingModes: Blender's four viewport shading modes over the Scene view's draw mode and its lighting
// toggle. Unlit and Shaded share the Textured draw mode and are told apart by the lighting toggle.
// The effect toggles Unity remembers per mode (skybox, fog, post) don't exist in the browser view.
import { DrawCameraMode, type SceneView } from '../../unity/sceneview.ts';

export const ShadingMode = { Wireframe: 0, WireframeShaded: 1, Unlit: 2, Shaded: 3 } as const;
export type ShadingMode = (typeof ShadingMode)[keyof typeof ShadingMode];

export const ShadingModes = {
  apply(view: SceneView, mode: ShadingMode) {
    view.drawMode =
      mode === ShadingMode.Wireframe
        ? DrawCameraMode.Wireframe
        : mode === ShadingMode.WireframeShaded
          ? DrawCameraMode.TexturedWire
          : DrawCameraMode.Textured;
    // Wireframe touches nothing else, so leaving it and coming back loses nothing.
    if (mode !== ShadingMode.Wireframe) view.sceneLighting = mode !== ShadingMode.Unlit;
    view.repaint();
  },

  current(view: SceneView): ShadingMode {
    if (view.drawMode === DrawCameraMode.Wireframe) return ShadingMode.Wireframe;
    if (view.drawMode === DrawCameraMode.TexturedWire) return ShadingMode.WireframeShaded;
    return view.sceneLighting ? ShadingMode.Shaded : ShadingMode.Unlit;
  },
};
