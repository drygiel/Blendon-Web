// GizmoHudLayer: the HUD's labels, queued by the scene pass and drawn above the Scene view's overlays.
import { GUI, setDrawTarget, type RichStyle } from '../../unity/handles.ts';
import { Event, EventType } from '../../unity/imgui.ts';
import type { Color, Rect } from '../../unity/math.ts';
import { SceneView } from '../../unity/sceneview.ts';

interface Label {
  rect: Rect;
  text: string;
  style: RichStyle;
  fill: Color;
  radius: number;
}

const labels: Label[] = [];
// The view whose last repaint queued the labels. A new repaint of it starts the list over.
let labelsView: SceneView | null = null;

const onBeforeSceneGui = (view: SceneView) => {
  if (view === labelsView && Event.current.type === EventType.Repaint) labels.length = 0;
};

export const GizmoHudLayer = {
  install() {
    SceneView.beforeSceneGui.add(onBeforeSceneGui);
  },

  /** Queues one label for this repaint of the view, in its GUI space. */
  queue(view: SceneView, rect: Rect, text: string, style: RichStyle, fill: Color, radius: number) {
    if (labelsView !== view) {
      labels.length = 0;
      labelsView = view;
    }
    labels.push({ rect, text, style, fill, radius });
  },

  /** Draws the labels the view's last repaint queued into a context already scaled to points; true if any. */
  draw(view: SceneView, ctx: CanvasRenderingContext2D) {
    if (view !== labelsView || labels.length === 0) return false;
    // The layer gets its own Repaint pass, as Unity's IMGUIContainer does.
    const outer = Event.current;
    Event.current = new Event(EventType.Repaint);
    setDrawTarget({ ctx, view });
    try {
      for (const l of labels) {
        GUI.drawRoundedRect(l.rect, l.radius, l.fill);
        GUI.richLabel(l.rect, l.text, l.style);
      }
    } finally {
      setDrawTarget(null);
      Event.current = outer;
    }
    return true;
  },
};
