import { createContext, use, type MouseEvent } from 'react';
import type { WindowModel } from '../core/model.ts';
import type { TipSource } from '../core/state.ts';

export const AppContext = createContext<WindowModel | null>(null);

export function useApp(): WindowModel {
  const app = use(AppContext);
  if (!app) throw new Error('useApp outside the window');
  return app;
}

/** Hover handlers that show a tooltip after the usual delay. */
export function useTip(tip: TipSource | null | undefined) {
  const app = useApp();
  return {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => app.tipIn(e, tip),
    onMouseLeave: () => app.tipOut(),
  };
}
