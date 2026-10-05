import { useEffect, useState } from 'react';
import type { SceneHost } from '../engine/host.ts';

/**
 * The Scene view's size in points, for overlays that place themselves in it. State is set only when the
 * size changes: an update scheduled every frame, even one that bails out, keeps interrupting React's
 * low-priority work, and a Suspense retry (the Blendon tab's lazy load) then never lands.
 */
export function useViewSize(host: SceneHost) {
  const [size, setSize] = useState({ w: host.view.position.width, h: host.view.position.height });
  useEffect(() => {
    let w = host.view.position.width;
    let h = host.view.position.height;
    const onFrame = () => {
      const p = host.view.position;
      if (p.width === w && p.height === h) return;
      w = p.width;
      h = p.height;
      setSize({ w, h });
    };
    host.frameListeners.add(onFrame);
    return () => void host.frameListeners.delete(onFrame);
  }, [host]);
  return size;
}
