// The gizmo HUD's own canvas, stacked above the Scene view's overlays as Unity's GizmoHudLayer is.
import { useEffect, useRef } from 'react';
import { GizmoHudLayer } from '../blendon/gizmos/hud-layer.ts';
import type { SceneHost } from '../engine/host.ts';
import styles from './Scene.module.scss';

export function GizmoHudView({ host }: { host: SceneHost }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let drawn = false;
    // After every frame, so the labels the scene pass just queued land in the same frame.
    const onFrame = () => {
      const view = host.view;
      const ppp = view.pixelsPerPoint;
      const w = Math.round(view.position.width * ppp);
      const h = Math.round(view.position.height * ppp);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      } else if (drawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
      }
      ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
      drawn = GizmoHudLayer.draw(view, ctx);
    };
    host.frameListeners.add(onFrame);
    return () => void host.frameListeners.delete(onFrame);
  }, [host]);

  return <canvas ref={canvasRef} className={styles.hud} aria-hidden />;
}
