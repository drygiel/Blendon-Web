// The Scene view's overlays as they sit in the reference capture. Only what Blendon changes or reads
// is interactive (tool buttons, pivot point, handle orientation); the rest looks like Unity and does nothing here.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import dropdown from '../../assets/scene/icons/d_dropdown.png?sprite';
import handleCenter from '../../assets/scene/icons/d_ToolHandleCenter.png?sprite';
import handleGlobal from '../../assets/scene/icons/d_ToolHandleGlobal.png?sprite';
import handleLocal from '../../assets/scene/icons/d_ToolHandleLocal.png?sprite';
import handlePivot from '../../assets/scene/icons/d_ToolHandlePivot.png?sprite';
import customTool from '../../assets/scene/icons/d_KnotPlacementTool.png?sprite';
import moveOff from '../../assets/scene/icons/d_MoveTool.png?sprite';
import moveOn from '../../assets/scene/icons/d_MoveTool_On.png?sprite';
import rotateOff from '../../assets/scene/icons/d_RotateTool.png?sprite';
import rotateOn from '../../assets/scene/icons/d_RotateTool_On.png?sprite';
import scaleOff from '../../assets/scene/icons/d_ScaleTool.png?sprite';
import scaleOn from '../../assets/scene/icons/d_ScaleTool_On.png?sprite';
import transformOff from '../../assets/scene/icons/d_TransformTool.png?sprite';
import transformOn from '../../assets/scene/icons/d_TransformTool_On.png?sprite';
import { Sprite } from '../../lib/Sprite.tsx';
import { BlendonContext, blendonContextActive } from '../blendon/tool-context.ts';
import type { SceneHost } from '../engine/host.ts';
import { PivotMode, PivotRotation, Tool, ToolContext, ToolManager, Tools } from '../unity/editor.ts';
import { editorIconSprite } from '../unity/icons.ts';
import { pivotPointNames, type PivotPointApi } from './pivot.ts';
import { contextIcon, TopStripHeight, useOverlays } from './overlays.ts';
import styles from './Scene.module.scss';
import { OverlayMenu, TopToolbar } from './Toolbars.tsx';

// The capture was taken at 175 % display scaling; its pixels map to points by this.
const PX = 1 / 1.75;
const pt = (px: number) => px * PX;

const HANDLE_ROTATIONS = [
  { label: 'Global', value: PivotRotation.Global, icon: handleGlobal },
  { label: 'Local', value: PivotRotation.Local, icon: handleLocal },
  { label: 'Grid', value: PivotRotation.Grid, icon: editorIconSprite('d_GridAndSnap') },
];

// Floating overlays keep clear of the view's edge.
const Edge = 5;

/** A box in capture pixels, placed in its parent; leave out the size to keep the content's. */
const at = (left: number, top: number, w?: number, h?: number): CSSProperties => ({
  position: 'absolute',
  left: pt(left),
  top: pt(top),
  ...(w !== undefined && { width: pt(w) }),
  ...(h !== undefined && { height: pt(h) }),
});

// The Tools overlay's column, top to bottom. The Rect Tool has nothing behind it in the demo.
const TOOL_BUTTONS = [
  {
    tool: Tool.View,
    off: editorIconSprite('d_ViewToolMove'),
    on: editorIconSprite('d_ViewToolMove'),
    label: 'View Tool',
  },
  { tool: Tool.Move, off: moveOff, on: moveOn, label: 'Move Tool' },
  { tool: Tool.Rotate, off: rotateOff, on: rotateOn, label: 'Rotate Tool' },
  { tool: Tool.Scale, off: scaleOff, on: scaleOn, label: 'Scale Tool' },
  {
    tool: Tool.Rect,
    off: editorIconSprite('d_RectTool'),
    on: editorIconSprite('d_RectTool'),
    label: 'Rect Tool',
    demo: true,
  },
  { tool: Tool.Transform, off: transformOff, on: transformOn, label: 'Transform Tool' },
];

// Unity 6.4's names for the global contexts, its own and Blendon's.
const CONTEXTS = [
  { context: ToolContext.GameObject, title: 'Game Object (Default)' },
  { context: ToolContext.Blendon, title: 'Game Object (Blendon)' },
];

interface MenuItem {
  label: string;
  checked: boolean;
  run: () => void;
  separatorBefore?: boolean;
}

function Dropdown({ icon, label, title, items }: { icon: string; label: string; title: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div className={styles.dropWrap} ref={ref}>
      <button
        type="button"
        className={styles.drop + (open ? ' ' + styles.dropOpen : '')}
        title={title}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Sprite name={icon} size={16} />
        <span className={styles.dropLabel}>{label}</span>
        <Sprite className={styles.caret} name={dropdown} size={12} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {items.map((it) => (
            <div key={it.label}>
              {it.separatorBefore && <div className={styles.menuSep} />}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={it.checked}
                className={styles.menuItem}
                onClick={() => {
                  it.run();
                  setOpen(false);
                }}
              >
                <span className={styles.check}>{it.checked ? '✓' : ''}</span>
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Chrome({ host, pivot }: { host: SceneHost; pivot: PivotPointApi }) {
  const [, setTick] = useState(0);
  useEffect(() => Tools.onChange(() => setTick((t) => t + 1)), []);
  const inBlendon = useSyncExternalStore(BlendonContext.subscribe, blendonContextActive, () => true);
  const current = Tools.current;
  const mode = pivot.get();
  // Blendon's tools have its Pivot Point in place of Unity's Pivot / Center. Unity's own tools keep theirs.
  const blendonTool = BlendonContext.ownsSlot(current);
  const pivotModes = pivot.blendon() ? [0, 1, 2, 3] : [0, 2];
  const rotation = HANDLE_ROTATIONS.find((o) => o.value === Tools.pivotRotation) ?? HANDLE_ROTATIONS[0];
  const focusView = () => host.focusRoot.focus({ preventScroll: true });
  const overlays = useOverlays();
  const top = overlays.topStrip ? TopStripHeight : 0;
  const below = (px: number) => top + pt(px);

  return (
    <div className={styles.chrome} onPointerDown={(e) => e.stopPropagation()}>
      <TopToolbar host={host} />
      <OverlayMenu host={host} />
      {/* Unity 6.4's Tools overlay, placed in pixels of the reference capture from the panel's corner. */}
      {overlays.isShown('tools') && (
        <div className={styles.tools} style={{ ...at(0, 0, 75, 406), left: Edge, top: below(10) }}>
          <i className={styles.toolsGrip} style={at(23, 10, 28)} />
          {/* Shows the active context; the Tool Contexts overlay is where it switches here. */}
          <span className={styles.demoOnly} style={at(5, 34, 65, 46)} title="Tool context (not in this demo)">
            <Sprite name={contextIcon(inBlendon)} size={16} style={at(6.25, 8.25)} />
            <Sprite name={dropdown} size={12} style={at(34.6, 10)} />
          </span>
          <div className={styles.toolColumn} style={{ ...at(5, 86, 65, 220), gap: pt(2) }}>
            {TOOL_BUTTONS.map((b) =>
              b.demo ? (
                <span
                  key={b.tool}
                  className={styles.toolBtn + ' ' + styles.demoOnly}
                  title={`${b.label} (not in this demo)`}
                >
                  <Sprite name={b.off} size={16} />
                </span>
              ) : (
                <button
                  key={b.tool}
                  type="button"
                  className={styles.toolBtn + (current === b.tool ? ' ' + styles.toolOn : '')}
                  title={b.label}
                  aria-label={b.label}
                  aria-pressed={current === b.tool}
                  onClick={() => {
                    Tools.current = b.tool;
                    focusView();
                    host.requestFrame();
                  }}
                >
                  <Sprite name={current === b.tool ? b.on : b.off} size={16} />
                </button>
              ),
            )}
          </div>
          <span
            className={styles.toolBtn + ' ' + styles.toolSolo + ' ' + styles.demoOnly}
            style={at(5, 312, 65, 35)}
            title="Custom tools (not in this demo)"
          >
            <Sprite name={customTool} size={16} />
          </span>
          {/* Folded, as in the capture, over a Box Collider's tools. */}
          <span
            className={styles.componentTools + ' ' + styles.demoOnly}
            style={at(5, 354, 65, 48)}
            title="Component tools (not in this demo)"
          >
            <i className={styles.fold} style={at(9, 18)} />
            <Sprite name={editorIconSprite('d_BoxCollider Icon')} size={16} style={at(30.25, 8.25)} />
          </span>
        </div>
      )}

      {/* Unity 6.4 puts Tool Contexts before Tool Settings; here they float beside the Tools overlay. */}
      <div className={styles.toolRow} style={{ left: Edge + pt(overlays.isShown('tools') ? 92 : 4), top: below(9) }}>
        {overlays.isShown('toolContexts') && (
          <div className={styles.toolbar2} style={{ height: pt(45) }}>
            <i className={styles.grip} />
            {CONTEXTS.map((c) => {
              const on = inBlendon === (c.context === ToolContext.Blendon);
              return (
                <button
                  key={c.context}
                  type="button"
                  className={styles.ctxBtn + (on ? ' ' + styles.ctxOn : '')}
                  title={c.title}
                  aria-label={c.title}
                  aria-pressed={on}
                  onClick={() => {
                    ToolManager.setActiveContext(c.context);
                    focusView();
                    host.requestFrame();
                  }}
                >
                  <Sprite name={contextIcon(c.context === ToolContext.Blendon)} size={16} />
                </button>
              );
            })}
          </div>
        )}
        {overlays.isShown('toolSettings') && (
          <div className={styles.toolbar2} style={{ height: pt(45) }}>
            <i className={styles.grip} />
            {blendonTool ? (
              // Keyed apart, so a menu left open doesn't carry over to the other dropdown.
              <Dropdown
                key="blendon"
                icon={Tools.pivotMode === PivotMode.Pivot ? handlePivot : handleCenter}
                label={pivotPointNames[mode].short}
                title={'Pivot Point: ' + (pivot.blendon() ? pivotPointNames[mode].long : pivotPointNames[mode].short)}
                items={pivotModes.map((m) => ({
                  // With the menu off each side is the mode named like it.
                  label: pivot.blendon() ? pivotPointNames[m].long : pivotPointNames[m].short,
                  checked: m === mode,
                  separatorBefore: pivot.blendon() && m === 2,
                  run: () => {
                    pivot.set(m);
                    focusView();
                    host.requestFrame();
                  },
                }))}
              />
            ) : (
              // The Editor's own Pivot / Center, for Unity's tools and outside Blendon's context.
              <Dropdown
                key="unity"
                icon={Tools.pivotMode === PivotMode.Pivot ? handlePivot : handleCenter}
                label={Tools.pivotMode === PivotMode.Pivot ? 'Pivot' : 'Center'}
                title="Tool Handle Position"
                items={[PivotMode.Pivot, PivotMode.Center].map((m) => ({
                  label: m === PivotMode.Pivot ? 'Pivot' : 'Center',
                  checked: Tools.pivotMode === m,
                  run: () => {
                    Tools.pivotMode = m;
                    focusView();
                    host.requestFrame();
                  },
                }))}
              />
            )}
            <Dropdown
              icon={rotation.icon}
              label={rotation.label}
              title="Tool Handle Rotation"
              items={HANDLE_ROTATIONS.map((o) => ({
                label: o.label,
                checked: Tools.pivotRotation === o.value,
                run: () => {
                  Tools.pivotRotation = o.value;
                  focusView();
                  host.requestFrame();
                },
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
