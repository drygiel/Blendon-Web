// The browser Scene view: an engine host on a canvas, Blendon installed into it, Unity's chrome on top.
import { useEffect, useRef, useState } from 'react';
import { SharedSettings } from '../lib/shared-settings.ts';
import { loadWindowData, D } from '../window/data/store.ts';
import { SharedGizmoSettings } from './blendon/gizmos/shared-settings.ts';
import { installBlendon } from './blendon/install.ts';
import { buildDemoScene, resetDemoScene } from './demo.ts';
import { SceneHost } from './engine/host.ts';
import { Prefs, ShortcutManager } from './unity/editor.ts';
import { Chrome } from './ui/Chrome.tsx';
import { OrientationOverlay } from './ui/OrientationOverlay.tsx';
import { SceneOverlays, TopStripHeight, useOverlays } from './ui/overlays.ts';
import { SceneMenuView } from './ui/SceneMenuView.tsx';
import { ShortcutTipCard } from './ui/ShortcutTipCard.tsx';
import { TutorialCard } from './ui/TutorialCard.tsx';
import type { PivotPointApi } from './ui/pivot.ts';
import styles from './ui/Scene.module.scss';

interface Props {
  onActiveChange?: (active: boolean) => void;
}

// Blendon's pivot point, which the toolbar dropdown edits in place of Unity's Pivot/Center.
const pivotPoint: PivotPointApi = {
  get: () => SharedGizmoSettings.PivotPoint,
  set: (m) => void (SharedGizmoSettings.PivotPoint = m),
};

export default function ScenePlayground({ onActiveChange }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<SceneHost | null>(null);
  const activeCb = useRef(onActiveChange);
  useEffect(() => {
    activeCb.current = onActiveChange;
  });

  useEffect(() => {
    let disposed = false;
    let h: SceneHost | null = null;
    void loadWindowData().then(() => {
      if (disposed || !canvasRef.current || !frameRef.current) return;
      // The captured Editor's values, else the shipped defaults; a page that follows the Defaults card
      // reads the General value.
      const val = (key: string): string | number | boolean | undefined => {
        if (key in D.initial) return D.initial[key];
        const follows = D.followers[key];
        if (follows) return val(follows);
        const p = D.props[key];
        return p?.d;
      };
      const pieOf = new Map(D.pies.map((p) => [p.sid, p.id]));
      // The settings window's values once its tab has loaded, the defaults until then.
      Prefs.source = {
        val: (key) => SharedSettings.reader?.val(key) ?? val(key),
        // Only Blendon's own shortcuts are in the window; Unity's (Undo, the tool keys) keep their defaults.
        // A pie switched off in the window gives its key back.
        shortcut: (id) => {
          if (!(id in D.shortcuts)) return undefined;
          const r = SharedSettings.reader;
          const pie = pieOf.get(id);
          if (pie && r && !r.pieOn(pie)) return '';
          return r?.shortcut(id) ?? D.shortcuts[id].d;
        },
      };
      h = new SceneHost(canvasRef.current, frameRef.current);
      h.listeners.onActiveChange = (a) => activeCb.current?.(a);
      installBlendon();
      buildDemoScene(h);
      // Lets end-to-end tests read the scene without a global.
      (frameRef.current as HTMLElement & { sceneHost?: SceneHost }).sceneHost = h;
      setHost(h);
    });
    return () => {
      disposed = true;
      h?.dispose();
    };
  }, []);

  // A setting changed in the window: rebindings, switched-off features and the overlays all follow.
  const [, setSettingsTick] = useState(0);
  useEffect(
    () =>
      SharedSettings.subscribe(() => {
        ShortcutManager.invalidate();
        Prefs.changed();
        host?.requestFrame();
        setSettingsTick((t) => t + 1);
      }),
    [host],
  );

  // The dock's reset button: the scene as first built, every overlay back.
  useEffect(() => {
    if (!host) return;
    const reset = () => {
      resetDemoScene(host);
      SceneOverlays.reset();
    };
    window.addEventListener('blendon:reset', reset);
    return () => window.removeEventListener('blendon:reset', reset);
  }, [host]);

  const overlays = useOverlays();

  return (
    <div ref={frameRef} className={styles.frame} aria-label="Unity Scene view running Blendon" role="application">
      {/* Unity's camera viewport starts under the docked top toolbar. */}
      <div className={styles.viewport} style={{ top: overlays.topStrip ? TopStripHeight : 0 }}>
        <div ref={canvasRef} className={styles.canvas} />
        {host && <TutorialCard host={host} />}
        {host && <ShortcutTipCard host={host} />}
        {host && <SceneMenuView host={host} />}
      </div>
      {host && <Chrome host={host} pivot={pivotPoint} />}
      {host && <OrientationOverlay host={host} />}
    </div>
  );
}
