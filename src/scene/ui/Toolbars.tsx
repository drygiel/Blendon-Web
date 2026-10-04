// The Scene view's top toolbar (Grid and Snap, Draw Modes, View Options) and the Overlay Menu at the
// bottom, as Unity 6 lays them out. What the demo can do works; the rest shows a forbidden cursor.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ShadingMode, ShadingModes } from '../blendon/piemenus/shading-modes.ts';
import type { SceneHost } from '../engine/host.ts';
import { EditorSnapSettings } from '../unity/editor.ts';
import { Vector3 } from '../unity/math.ts';
import { TopStripHeight, useOverlays, type OverlayId } from './overlays.ts';
import styles from './Toolbars.module.scss';

const icons = import.meta.glob<string>('../../assets/scene/toolbar/*.png', { eager: true, import: 'default' });
const icon = (name: string) => icons[`../../assets/scene/toolbar/${name}.png`] ?? '';

// The capture these were measured on was taken at 175 % display scaling.
const pt = (px: number) => px / 1.75;

// The view's own state, changed outside render.
const toggleGrid = (host: SceneHost) => (host.view.showGrid = !host.view.showGrid);
const toggleVisibility = (host: SceneHost) => (host.scene.visibilityEnabled = !host.scene.visibilityEnabled);

/** Re-renders while the scene changes things the toolbars show (snap values, draw mode, grid). */
function useSceneState(host: SceneHost) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let last = '';
    const id = window.setInterval(() => {
      const s = EditorSnapSettings;
      const v = host.view;
      const key = [
        s.gridSize.x,
        s.move.x,
        s.rotate,
        s.scale,
        s.gridSnapEnabled,
        s.snapToggle,
        s.angleSnapEnabled,
        s.scaleSnapEnabled,
        v.drawMode,
        v.sceneLighting,
        v.showGrid,
        host.scene.visibilityEnabled,
      ].join();
      if (key === last) return;
      last = key;
      setTick((t) => t + 1);
    }, 200);
    return () => window.clearInterval(id);
  }, [host]);
}

interface ButtonProps {
  img?: string;
  title: string;
  on?: boolean;
  /** No handler: a demo-only control. */
  onClick?: () => void;
  width?: number;
  caret?: boolean;
  children?: ReactNode;
  className?: string;
}

function Button({ img, title, on, onClick, width = 55, caret, children, className }: ButtonProps) {
  const off = !onClick;
  return (
    <button
      type="button"
      className={[styles.btn, on && styles.on, off && styles.forbidden, className].filter(Boolean).join(' ')}
      style={{ width: pt(width) }}
      title={off ? `${title} (not in this demo)` : title}
      aria-label={title}
      aria-pressed={on}
      aria-disabled={off}
      onClick={onClick}
    >
      {img && <img src={img} alt="" width={16} height={16} />}
      {children}
      {caret && <img className={styles.caret} src={icon('d_dropdown')} alt="" width={12} height={12} />}
    </button>
  );
}

/** Unity's toolbar float field: shows the value, takes a new one on Enter or blur. */
function FloatField({ value, title, onCommit }: { value: number; title: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v > 0) onCommit(v);
    setText(null);
  };
  return (
    <input
      className={styles.field}
      style={{ width: pt(56) }}
      value={text ?? String(+value.toFixed(4))}
      title={title}
      aria-label={title}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

const Sep = () => <i className={styles.sep} />;
const Grip = () => <i className={styles.grip} />;

export function TopToolbar({ host }: { host: SceneHost }) {
  useSceneState(host);
  const overlays = useOverlays();
  if (!overlays.topStrip) return null;
  const s = EditorSnapSettings;
  const view = host.view;
  const touched = () => {
    view.repaint();
    host.focusRoot.focus({ preventScroll: true });
  };
  const shading = ShadingModes.current(view);
  const shade = (m: ShadingMode) => () => {
    ShadingModes.apply(view, m);
    touched();
  };
  const hiddenCount = [...host.scene.allObjects()].filter((o) => o.hidden).length;

  return (
    <div className={styles.top} style={{ height: TopStripHeight }} onPointerDown={(e) => e.stopPropagation()}>
      {overlays.isShown('gridAndSnap') && (
        <div className={styles.group}>
          <Grip />
          <Button
            img={icon(view.showGrid ? 'd_GridVisible_On' : 'd_GridVisible')}
            title="Toggle the visibility of the grid"
            on={view.showGrid}
            onClick={() => {
              toggleGrid(host);
              touched();
            }}
          />
          <FloatField
            value={s.gridSize.x}
            title="Grid size"
            onCommit={(v) => {
              s.gridSize = new Vector3(v, v, v);
              touched();
            }}
          />
          <Button title="Open Grid and Snap Settings" width={27} caret />
          <Sep />
          <Button
            img={icon(s.snapToggle && s.gridSnapEnabled ? 'd_SceneViewSnap_On' : 'd_SceneViewSnap')}
            title="Toggle absolute Grid Snapping on and off"
            on={s.snapToggle && s.gridSnapEnabled}
            onClick={() => {
              s.snapEnabled = s.gridSnapEnabled = !(s.snapToggle && s.gridSnapEnabled);
              touched();
            }}
          />
          <Sep />
          <Button
            img={icon(s.snapToggle && !s.gridSnapEnabled ? 'd_SnapIncrement_On' : 'd_SnapIncrement')}
            title="Toggle Incremental Snapping on and off"
            on={s.snapToggle && !s.gridSnapEnabled}
            onClick={() => {
              s.snapToggle = !(s.snapToggle && !s.gridSnapEnabled);
              s.gridSnapEnabled = false;
              touched();
            }}
          />
          <FloatField
            value={s.move.x}
            title="Incremental Snapping size"
            onCommit={(v) => {
              s.move = new Vector3(v, v, v);
              touched();
            }}
          />
          <Sep />
          <Button
            img={icon(s.angleSnapEnabled ? 'd_AngleSnap_On' : 'd_AngleSnap')}
            title="Toggle Angle Snapping on and off"
            on={s.angleSnapEnabled}
            onClick={() => {
              s.angleSnapEnabled = !s.angleSnapEnabled;
              touched();
            }}
          />
          <FloatField
            value={s.rotate}
            title="Incremental angle snap size"
            onCommit={(v) => {
              s.rotate = v;
              touched();
            }}
          />
          <Sep />
          <Button
            img={icon(s.scaleSnapEnabled ? 'd_ScaleSnap_On' : 'd_ScaleSnap')}
            title="Toggle Scale Snapping on and off"
            on={s.scaleSnapEnabled}
            onClick={() => {
              s.scaleSnapEnabled = !s.scaleSnapEnabled;
              touched();
            }}
          />
          <FloatField
            value={s.scale}
            title="Scale snap multiplier"
            onCommit={(v) => {
              s.scale = v;
              touched();
            }}
          />
        </div>
      )}
      <span className={styles.spacer} />
      {overlays.isShown('drawModes') && (
        <div className={styles.group}>
          <Grip />
          <span className={styles.strip}>
            <Button
              img={icon('d_wireframe')}
              title="Wireframe Draw Mode"
              on={shading === ShadingMode.Wireframe}
              onClick={shade(ShadingMode.Wireframe)}
            />
            <Button
              img={icon('d_ShadedWireframe')}
              title="Shaded Wireframe Draw Mode"
              on={shading === ShadingMode.WireframeShaded}
              onClick={shade(ShadingMode.WireframeShaded)}
            />
            <Button
              img={icon('d_UnlitMode')}
              title="Unlit Draw Mode"
              on={shading === ShadingMode.Unlit}
              onClick={shade(ShadingMode.Unlit)}
            />
            <Button
              img={icon(shading === ShadingMode.Shaded ? 'Shaded_On' : 'd_Shaded')}
              title="Shaded Draw Mode"
              on={shading === ShadingMode.Shaded}
              onClick={shade(ShadingMode.Shaded)}
            />
          </span>
          <Button img={icon('d_debug')} title="Debug Draw Mode" width={62} caret />
        </div>
      )}
      {overlays.isShown('viewOptions') && (
        <div className={styles.group}>
          <Grip />
          <Button
            img={icon('d_SceneView2D')}
            title="When toggled on, the Scene is in 2D view. When toggled off, the Scene is in 3D view."
          />
          <Button img={icon('d_SceneViewAudio')} title="Toggle audio on or off." />
          <Button
            img={icon('d_SceneViewFX_On')}
            title="Toggle skybox, fog, and various other effects."
            on
            width={62}
            caret
          />
          <Button
            img={icon(host.scene.visibilityEnabled ? 'd_SceneViewVisibility_On' : 'd_SceneViewVisibility')}
            title={`${hiddenCount} hidden objects, click to toggle scene visibility`}
            on={host.scene.visibilityEnabled}
            onClick={() => {
              toggleVisibility(host);
              touched();
            }}
          />
          <Button
            img={icon('d_SceneLayersToggle')}
            title="Select which layers display in the Scene view."
            width={61}
            caret
          />
          <Button img={icon('d_SceneViewCamera')} title="Settings for the Scene view camera." width={60} caret />
          <Button
            img={icon('d_GizmosToggle_On')}
            title="Toggle visibility of all Gizmos in the Scene view"
            width={62}
            caret
          />
        </div>
      )}
    </div>
  );
}

interface MenuEntry {
  title: string;
  img: string;
  overlay?: OverlayId;
}

const MENU: MenuEntry[] = [
  { title: 'AI Navigation', img: 'd_NavigationOverlay' },
  { title: 'Tools', img: 'd_MoveTool', overlay: 'tools' },
  { title: 'Tool Contexts', img: 'd_ToolContext' },
  { title: 'Tool Settings', img: 'd_ToolSettings', overlay: 'toolSettings' },
  { title: 'Grid and Snap', img: 'd_GridAndSnap', overlay: 'gridAndSnap' },
  { title: 'Draw Modes', img: 'd_Shaded', overlay: 'drawModes' },
  { title: 'View Options', img: 'd_ViewOptions', overlay: 'viewOptions' },
  { title: 'Search', img: 'd_SearchOverlay' },
  { title: 'Orientation', img: 'OrientationGizmo', overlay: 'orientation' },
  { title: 'Cameras', img: 'd_CameraPreview' },
];

/** Unity 6's Overlay Menu toolbar: one toggle per overlay, lit while it is shown. */
export function OverlayMenu({ host }: { host: SceneHost }) {
  const overlays = useOverlays();
  const style: CSSProperties = { height: pt(45) };
  return (
    <div className={styles.menu} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <Grip />
      <span className={styles.strip}>
        {MENU.map((m) => (
          <Button
            key={m.title}
            img={icon(m.img)}
            title={m.title}
            on={m.overlay ? overlays.isShown(m.overlay) : false}
            onClick={
              m.overlay
                ? () => {
                    overlays.toggle(m.overlay!);
                    host.requestFrame();
                    host.focusRoot.focus({ preventScroll: true });
                  }
                : undefined
            }
          />
        ))}
      </span>
    </div>
  );
}
