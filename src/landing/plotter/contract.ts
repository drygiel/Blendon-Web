// The page's side of the background plotter. Sections and elements mark themselves with the attributes built
// here, so every name the engine, its routes and its plates look for is typed in one place.
import type { PLATES } from './plates/index.ts';

/** A section's drawing, by its name in the plate registry. */
export type PlateName = keyof typeof PLATES;

/** The pen's way past a section; see the route registry. */
export type RouteKind = 'right' | 'camera' | 'split' | 'chart' | 'touch' | 'tiles' | 'net' | 'middle';

/** Elements a plate or the pen measures, unique on the page. */
export type Anchor =
  | 'hero-stage'
  | 'video-player'
  | 'compare-table'
  | 'ruler-space'
  | 'pie-center'
  | 'tutorial-plot'
  | 'try-intro'
  | 'try-dock'
  | 'hood-block'
  | 'cta-button';

/**
 * Parts of a section its route runs between, looked up within the section: two `left` and `right` columns, the
 * element `above` them, a row of `tiles`, the `keys` over a drawing, the `panel` beside it and a row of `cols`.
 */
export type Part = 'left' | 'right' | 'above' | 'tiles' | 'keys' | 'panel' | 'cols';

/** Named points of the pen's route; passing one sets a plate off or uncovers a title. */
export type Mark =
  'camera' | 'ruler' | 'chart-in' | 'chart-0' | 'chart-1' | 'chart-out' | 'try-0' | 'net' | 'keys-0' | 'keys-1';

/** Points the pen leaps into after its section's title and circles. */
export type StationName = 'pie';

interface SectionPlot {
  /** One drawing or several, drawn in order. */
  plate?: PlateName | PlateName[];
  route?: RouteKind;
  /** The plot readout's "NN / NAME" for a section without an eyebrow. */
  hud?: string;
}

export const plotSection = ({ plate, route, hud }: SectionPlot) => ({
  'data-plate': Array.isArray(plate) ? plate.join(' ') : plate,
  'data-plot-route': route,
  'data-hud': hud,
});

export const plotAnchor = (name: Anchor) => ({ 'data-plot-anchor': name });

export const plotPart = (name: Part) => ({ 'data-plot-part': name });

/** The pen follows the mouse to this element's first row while it is over it. */
export const plotHold = { 'data-plot-hold': '' } as const;

interface StationPlot {
  name: StationName;
  /** Radius of the circle drawn round the point, in pixels. */
  radius: number;
  /** Leaps straight from the end of the title's underline rather than from the rail. */
  fromTitle?: boolean;
}

export const plotStation = ({ name, radius, fromTitle }: StationPlot) => ({
  'data-plot-station': name,
  'data-plot-radius': radius.toFixed(1),
  'data-plot-leap': fromTitle ? 'title' : undefined,
});

/** A section's part, or null when its markup has none. */
export const partIn = (section: Element, name: Part) => section.querySelector(`[data-plot-part="${name}"]`);

export const anchorIn = (section: Element, name: Anchor) => section.querySelector(`[data-plot-anchor="${name}"]`);
