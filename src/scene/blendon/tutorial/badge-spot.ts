// Where the tutorial badge sits and whether its hover card is up, as TutorialBadge.Bounds and
// TutorialTip.IsShownIn. Written by the badge (ui/TutorialBadge.tsx), read by cards that keep clear of it.

export interface BadgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let bounds: BadgeRect | null = null;
let tipShown = false;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version++;
  for (const l of listeners) l();
}

export const TutorialBadgeSpot = {
  /** The docked spot in view points, null while the badge isn't drawn. */
  get bounds() {
    return bounds;
  },

  /** The badge's hover card is up. Other Scene view cards make way for it. */
  get tipShown() {
    return tipShown;
  },

  get version() {
    return version;
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },

  setBounds(r: BadgeRect | null) {
    if (r === bounds || (r && bounds && r.x === bounds.x && r.y === bounds.y && r.w === bounds.w && r.h === bounds.h))
      return;
    bounds = r;
    changed();
  },

  setTipShown(shown: boolean) {
    if (shown === tipShown) return;
    tipShown = shown;
    changed();
  },
};
