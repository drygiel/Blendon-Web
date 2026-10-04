// Blendon's orientation gizmo as the Scene view overlay it is in Unity, docked top right.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { OrientationGizmoElement } from '../blendon/navigation/orientation/drag-controller.ts';
import { OrientationGizmoSettings } from '../blendon/navigation/orientation/gizmo.ts';
import { ViewAlignment, ViewSnap, WorldAxes } from '../blendon/navigation/view-snap.ts';
import type { SceneHost } from '../engine/host.ts';
import { iconUrl } from '../unity/icons.ts';
import { Vector2 } from '../unity/math.ts';
import { TopStripHeight, useOverlays } from './overlays.ts';
import styles from './Scene.module.scss';

// The overlay window's padding around the widget, and its distance from the view's corner.
const WindowPadding = 2;
const Margin = { right: 2.3, top: 3.6 };

export function OrientationOverlay({ host }: { host: SceneHost }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const element = useMemo(() => new OrientationGizmoElement(host.view), [host]);
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState<Vector2 | null>(null);
  const [overlayHover, setOverlayHover] = useState(false);
  const size = element.size;
  const w = size.x - 2 * WindowPadding;
  const h = size.y - 2 * WindowPadding;
  const geometry = element.geometry(w, h);

  useEffect(() => {
    let last = '';
    const paint = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      element.paint(ctx, geometry);
    };
    const unlisten = element.listen(() => {
      paint();
      setTick((t) => t + 1);
    });
    // Only the camera turning (or the projection) changes what it shows.
    const onFrame = () => {
      const v = host.view;
      const key = `${v.rotation.x},${v.rotation.y},${v.rotation.z},${v.rotation.w},${v.orthographic},${v.isRotationLocked}`;
      if (key === last) return;
      last = key;
      paint();
      setTick((t) => t + 1);
    };
    host.frameListeners.add(onFrame);
    paint();
    return () => {
      unlisten();
      host.frameListeners.delete(onFrame);
    };
  }, [host, element, w, h, geometry]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const local = (e: ReactPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return new Vector2(e.clientX - r.left, e.clientY - r.top);
  };
  const focusView = () => host.focusRoot.focus({ preventScroll: true });
  const overlays = useOverlays();

  if (!OrientationGizmoSettings.Enabled || !overlays.isShown('orientation')) return null;
  const label = OrientationGizmoSettings.DirectionLabelEnabled ? element.directionLabel : '';
  const animated = OrientationGizmoSettings.AnimationEnabled;
  const current = ViewAlignment.currentDirection(host.view);
  const items = [
    { label: 'Free', checked: current < 0, run: () => ViewSnap.toNiceAngle(host.view, animated) },
    ...WorldAxes.Directions.map((d, i) => ({
      label: d.name,
      checked: current === i,
      run: () => ViewSnap.to(host.view, d.axisIndex, d.isPositive, animated),
    })),
    {
      label: 'Perspective',
      checked: !host.view.orthographic,
      run: () => ViewSnap.toggleProjection(host.view, animated),
      sep: true,
    },
  ];

  return (
    <div
      className={styles.orientation}
      style={{
        right: Margin.right,
        top: Margin.top + (overlays.topStrip ? TopStripHeight : 0),
        width: size.x,
        height: size.y,
        padding: WindowPadding,
      }}
      onPointerEnter={() => setOverlayHover(true)}
      onPointerLeave={() => setOverlayHover(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* The overlay's drag grip: Unity's, so only a picture. */}
      <i className={styles.orientationGrip} />
      <canvas
        ref={canvasRef}
        style={{ width: w, height: h }}
        aria-label="Orientation gizmo"
        role="img"
        onPointerDown={(e) => {
          e.stopPropagation();
          setMenu(null);
          const p = local(e);
          if (e.button === 2) {
            if (element.containsPoint(p, geometry)) setMenu(p);
            return;
          }
          if (element.pointerDown(e.button, p, geometry)) e.currentTarget.setPointerCapture(e.pointerId);
          focusView();
        }}
        onPointerMove={(e) => {
          element.setHovered(element.containsPoint(local(e), geometry) || element.isDragging);
          element.pointerMove(local(e), geometry, (e.buttons & 2) !== 0);
        }}
        onPointerUp={(e) => {
          element.pointerUp(local(e), geometry);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => element.setHovered(element.isDragging)}
        onLostPointerCapture={() => element.isDragging && element.cancel()}
        onKeyDown={(e) => e.key === 'Escape' && element.keyEscape()}
      />
      <button
        type="button"
        className={styles.orientationLock}
        style={{ opacity: host.view.isRotationLocked ? 1 : overlayHover ? 0.6 : 0.0001 }}
        title={
          host.view.isRotationLocked
            ? 'Unlock rotation - the gizmo follows the Scene View camera again.'
            : 'Lock rotation - the gizmo stays facing this direction as the camera moves.'
        }
        aria-pressed={host.view.isRotationLocked}
        onPointerDown={(e) => {
          e.stopPropagation();
          element.toggleRotationLock();
        }}
      >
        <img src={iconUrl(host.view.isRotationLocked ? 'LockIcon-On' : 'LockIcon')} alt="" width={10} height={10} />
      </button>
      {label && (
        <button
          type="button"
          className={styles.orientationLabel}
          style={{ top: w - 1 + WindowPadding, width: size.x, height: Math.max(0, h - w) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.button === 0 || e.button === 1) element.toggleProjection();
          }}
        >
          {label}
        </button>
      )}
      {menu && (
        <div
          className={styles.menu + ' ' + styles.orientationMenu}
          role="menu"
          style={{ left: menu.x - 120, top: menu.y }}
        >
          {items.map((it) => (
            <div key={it.label}>
              {it.sep && <div className={styles.menuSep} />}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={it.checked}
                className={styles.menuItem}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  it.run();
                  setMenu(null);
                  focusView();
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
