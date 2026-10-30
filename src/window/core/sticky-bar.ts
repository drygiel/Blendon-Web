// GeneralSettings.StickySearchBar: the page header with its search box slides away on scrolling down and
// comes straight back on any scroll up (SettingsEditorWindow.StickyBar).
import { clamp, M } from './util.ts';

export const STICKY_KEY = 'GeneralSettings.StickySearchBar';

const SLIDE_SECONDS = 0.18;

/** Hiding starts past one bar of scroll, so the slide always has room to compensate. */
export const HIDE_MIN_SCROLL = M.headerH + 10;

const EPSILON = 0.01;

const smoothStep = (t: number) => t * t * (3 - 2 * t);

export interface BarInput {
  /** The setting; off animates the bar back to shown. */
  enabled: boolean;
  scrollY: number;
  searching: boolean;
  searchFocused: boolean;
  /** A scrollbar or slider drag owns the geometry; resizing the view under it drops the thumb. */
  dragging: boolean;
}

export class StickyBar {
  /** 1 shown, 0 hidden. */
  fraction = 1;
  target = 1;
  /** The header band's animated height; everything above the list is placed from it. */
  height: number = M.headerH;
  lastScrollY = 0;

  get animating() {
    return Math.abs(this.fraction - this.target) > 1e-6;
  }

  /** A fresh page starts with the bar on screen. */
  reset(scrollY = 0) {
    this.fraction = this.target = 1;
    this.height = M.headerH;
    this.lastScrollY = scrollY;
  }

  /** A scroll the code made (a jump to a row, a page switch) is not the user scrolling. */
  sync(scrollY: number) {
    this.lastScrollY = scrollY;
  }

  static mustShow(i: BarInput) {
    return !i.enabled || i.scrollY <= EPSILON || i.searching || i.searchFocused;
  }

  /** One frame of the slide. Returns the scroll change that keeps the rows where they are. */
  step(dt: number, i: BarInput, instant = false): number {
    if (StickyBar.mustShow(i)) this.target = 1;
    if (i.dragging) return 0;

    if (this.animating)
      this.fraction = instant
        ? this.target
        : this.fraction + clamp(this.target - this.fraction, -dt / SLIDE_SECONDS, dt / SLIDE_SECONDS);

    const height = M.headerH * smoothStep(clamp(this.fraction, 0, 1));
    // The view's top moves with the bar, so the scroll moves the same amount.
    const delta = height - this.height;
    if (delta === 0) return 0;
    this.height = height;
    const scroll = Math.max(0, i.scrollY + delta);
    this.lastScrollY = scroll;
    return scroll - i.scrollY;
  }

  /** A scroll the user made decides the bar's way. */
  track(scrollY: number, enabled: boolean, dragging: boolean) {
    const delta = scrollY - this.lastScrollY;
    this.lastScrollY = scrollY;
    if (!enabled || dragging) return;
    if (delta < -EPSILON) this.target = 1;
    else if (delta > EPSILON && scrollY > HIDE_MIN_SCROLL) this.target = 0;
  }
}
