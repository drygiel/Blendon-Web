// The Scene view's overlays as they sit in the reference capture. Only what Blendon changes or reads
// is interactive (tool buttons, pivot point, handle orientation); the rest is a picture of Unity.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import tools from '../../assets/scene/overlay-tools.png';
import top from '../../assets/scene/overlay-top.png';
import bottom from '../../assets/scene/overlay-bottom.png';
import dropdown from '../../assets/scene/icons/d_dropdown.png';
import handleCenter from '../../assets/scene/icons/d_ToolHandleCenter.png';
import handleGlobal from '../../assets/scene/icons/d_ToolHandleGlobal.png';
import handleLocal from '../../assets/scene/icons/d_ToolHandleLocal.png';
import handlePivot from '../../assets/scene/icons/d_ToolHandlePivot.png';
import moveOff from '../../assets/scene/icons/d_MoveTool.png';
import moveOn from '../../assets/scene/icons/d_MoveTool_On.png';
import rotateOff from '../../assets/scene/icons/d_RotateTool.png';
import rotateOn from '../../assets/scene/icons/d_RotateTool_On.png';
import scaleOff from '../../assets/scene/icons/d_ScaleTool.png';
import scaleOn from '../../assets/scene/icons/d_ScaleTool_On.png';
import transformOff from '../../assets/scene/icons/d_TransformTool.png';
import transformOn from '../../assets/scene/icons/d_TransformTool_On.png';
import type { SceneHost } from '../engine/host.ts';
import { PivotMode, PivotRotation, Tool, Tools } from '../unity/editor.ts';
import { iconUrl } from '../unity/icons.ts';
import { pivotPointNames, type PivotPointApi } from './pivot.ts';
import styles from './Scene.module.scss';

// The capture was taken at 175 % display scaling; its pixels map to points by this.
const PX = 1 / 1.75;
const pt = (px: number) => px * PX;

const HANDLE_ROTATIONS = [
  { label: 'Global', value: PivotRotation.Global, icon: handleGlobal },
  { label: 'Local', value: PivotRotation.Local, icon: handleLocal },
  { label: 'Grid', value: PivotRotation.Grid, icon: iconUrl('d_GridAndSnap') },
];

const TOOL_BUTTONS = [
  { tool: Tool.Move, top: 129, off: moveOff, on: moveOn, label: 'Move Tool' },
  { tool: Tool.Rotate, top: 166, off: rotateOff, on: rotateOn, label: 'Rotate Tool' },
  { tool: Tool.Scale, top: 203, off: scaleOff, on: scaleOn, label: 'Scale Tool' },
  { tool: Tool.Transform, top: 277, off: transformOff, on: transformOn, label: 'Transform Tool' },
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
        <img src={icon} alt="" width={16} height={16} />
        <span>{label}</span>
        <img className={styles.caret} src={dropdown} alt="" width={12} height={12} />
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
  const current = Tools.current;
  const mode = pivot.get();
  const rotation = HANDLE_ROTATIONS.find((o) => o.value === Tools.pivotRotation) ?? HANDLE_ROTATIONS[0];
  const pos = (left: number, topPx: number, w: number, h: number): CSSProperties => ({
    left: pt(left),
    top: pt(topPx),
    width: pt(w),
    height: pt(h),
  });
  const focusView = () => host.focusRoot.focus({ preventScroll: true });

  return (
    <div className={styles.chrome} onPointerDown={(e) => e.stopPropagation()}>
      <img className={styles.pic} src={tools} alt="" style={pos(0, 0, 76, 530)} draggable={false} />
      <img className={styles.pic} src={top} alt="" style={pos(79, 3, 213, 45)} draggable={false} />
      <img
        className={styles.picBottom}
        src={bottom}
        alt=""
        style={{ width: pt(670), height: pt(53) }}
        draggable={false}
      />

      {TOOL_BUTTONS.map((b) => (
        <button
          key={b.tool}
          type="button"
          className={styles.toolBtn + (current === b.tool ? ' ' + styles.toolOn : '')}
          style={pos(5, b.top, 65, 35)}
          title={b.label}
          aria-label={b.label}
          aria-pressed={current === b.tool}
          onClick={() => {
            Tools.current = b.tool;
            focusView();
            host.requestFrame();
          }}
        >
          <img src={current === b.tool ? b.on : b.off} alt="" width={16} height={16} />
        </button>
      ))}

      <div className={styles.toolbar2} style={{ left: pt(80), top: pt(52), height: pt(45) }}>
        <i className={styles.grip} />
        <Dropdown
          icon={Tools.pivotMode === PivotMode.Pivot ? handlePivot : handleCenter}
          label={pivotPointNames[mode].short}
          title={'Pivot Point: ' + pivotPointNames[mode].long}
          items={[0, 1, 2, 3].map((m) => ({
            label: pivotPointNames[m].long,
            checked: m === mode,
            separatorBefore: m === 2,
            run: () => {
              pivot.set(m);
              focusView();
              host.requestFrame();
            },
          }))}
        />
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
    </div>
  );
}
