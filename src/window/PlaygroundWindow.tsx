// The landing's settings window, filling its pane of the Try It dock. Loaded as a chunk of its own,
// together with the generated window data.
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import './styles/window.scss';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SharedSettings } from '../lib/shared-settings.ts';
import { useReducedMotion } from '../lib/hooks.ts';
import { iconVars } from './core/icons.ts';
import { layoutWindow } from './core/layout.ts';
import { newInstance, WindowModel } from './core/model.ts';
import { initialState, reduce } from './core/state.ts';
import { D, loadWindowData } from './data/store.ts';
import { draw, settings, SPEED } from './gizmo/gizmo.ts';
import styles from './PlaygroundWindow.module.scss';
import { SettingsWindow } from './ui/Window.tsx';

await loadWindowData();

// Dev hook for side-by-side checks against Unity captures: ?w=1100&h=740&page=OrbitSelected&yaw=0
const DEV_SIZE = new URLSearchParams(location.search).has('w');

/** GizmoPreview's heartbeat: at most 30 repaints a second; the spin advances only while a live card is on screen. */
function drawGizmos(app: WindowModel, now: number, spin: boolean) {
  const inst = app.inst;
  if (now - inst.gizmoLast < 1000 / 30 - 2) return;
  const dt = inst.gizmoLast ? Math.min(now - inst.gizmoLast, 100) / 1000 : 0;
  inst.gizmoLast = now;
  if (document.hidden) return;
  let spun = false;
  for (const [owner, { el, live }] of inst.gizmos) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
    if (inst.gizmoYaw != null) inst.gizmoAngle = inst.gizmoYaw;
    else if (live && spin && !spun) {
      inst.gizmoAngle = (inst.gizmoAngle + dt * SPEED) % 360;
      spun = true;
    }
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(r.width * dpr);
    const bh = Math.round(r.height * dpr);
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
    const ctx = el.getContext('2d');
    if (!ctx) continue;
    ctx.setTransform(bw / r.width, 0, 0, bh / r.height, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    draw(ctx, r.width, r.height, dpr, settings(app, owner), inst.gizmoAngle);
  }
}

export default function PlaygroundWindow() {
  const [state, update] = useReducer(reduce, D.initial, (i) => ({ ...initialState(i), docked: !DEV_SIZE }));
  const [inst] = useState(newInstance);
  const app = useMemo(() => new WindowModel(state, inst, update), [state, inst]);
  const L = layoutWindow(app);
  const vars = useMemo(() => iconVars(), []);
  const reduced = useReducedMotion();

  // The Scene view above reads the window's values; every change is published to it.
  useEffect(() => SharedSettings.publish({ val: (k) => app.val(k), shortcut: (id) => app.shortcut(id) }), [app]);

  const latest = useRef({ app, reduced });
  useLayoutEffect(() => {
    latest.current = { app, reduced };
  });

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const yaw = q.get('yaw');
    if (yaw) latest.current.app.fixGizmoYaw(Number(yaw));
    const w = q.get('w');
    if (w)
      update({
        winW: Number(w),
        winH: Number(q.get('h')) || 740,
        page: q.get('page') ?? 'Overview',
        sideCollapsed: q.get('c') === '1' ? true : null,
        search: q.get('s') ?? '',
        sideW: q.get('sw') ? Number(q.get('sw')) : null,
      });

    const measure = () => latest.current.app.measure();
    const ro = new ResizeObserver(measure);
    if (inst.host) ro.observe(inst.host);
    measure();

    // LabelIndentWidth: the label style's left padding plus seven spaces of the label font.
    const measureIndent = () => {
      const el = inst.win?.querySelector('.lim');
      if (!el) return;
      const li = 1 + el.getBoundingClientRect().width;
      update((s) => (li > 10 && Math.abs(li - (s.li ?? 0)) > 0.05 ? { li } : {}));
    };
    measureIndent();
    void document.fonts.ready.then(measureIndent);

    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      drawGizmos(latest.current.app, now, !latest.current.reduced);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      latest.current.app.endDrag();
      clearTimeout(inst.tipTimer);
    };
  }, [inst]);

  return (
    <div className={DEV_SIZE ? styles.host : styles.docked} ref={app.attach('host')}>
      <SettingsWindow app={app} L={L} iconVars={vars} />
    </div>
  );
}
