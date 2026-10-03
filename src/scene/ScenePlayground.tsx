// The browser Scene view: an engine host on a canvas, Blendon installed into it, Unity's chrome on top.
import { useEffect, useRef, useState } from 'react';
import { loadWindowData, D } from '../window/data/store.ts';
import { installBlendon } from './blendon/install.ts';
import { buildDemoScene } from './demo.ts';
import { SceneHost } from './engine/host.ts';
import { Prefs } from './unity/editor.ts';
import { Chrome } from './ui/Chrome.tsx';
import type { PivotPointApi } from './ui/pivot.ts';
import styles from './ui/Scene.module.scss';

interface Props {
  onActiveChange?: (active: boolean) => void;
}

const localPivot = (): PivotPointApi => {
  let mode = 1;
  return { get: () => mode, set: (m) => void (mode = m) };
};

export default function ScenePlayground({ onActiveChange }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<SceneHost | null>(null);
  const [pivot] = useState(localPivot);
  const activeCb = useRef(onActiveChange);
  activeCb.current = onActiveChange;

  useEffect(() => {
    let disposed = false;
    let h: SceneHost | null = null;
    void loadWindowData().then(() => {
      if (disposed || !canvasRef.current || !frameRef.current) return;
      // The shipped defaults; a page that follows the Defaults card reads the General value.
      const val = (key: string): string | number | boolean | undefined => {
        const follows = D.followers[key];
        if (follows) return val(follows);
        const p = D.props[key];
        return p ? (p.d as string | number | boolean) : undefined;
      };
      Prefs.source = { val, shortcut: (id) => D.shortcuts[id]?.d };
      h = new SceneHost(canvasRef.current, frameRef.current);
      h.listeners.onActiveChange = (a) => activeCb.current?.(a);
      installBlendon();
      buildDemoScene(h);
      setHost(h);
    });
    return () => {
      disposed = true;
      h?.dispose();
    };
  }, []);

  return (
    <div ref={frameRef} className={styles.frame} aria-label="Unity Scene view running Blendon" role="application">
      <div ref={canvasRef} className={styles.canvas} />
      {host && <Chrome host={host} pivot={pivot} />}
    </div>
  );
}
