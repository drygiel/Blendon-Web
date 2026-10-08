import type { Mark } from '../contract.ts';
import type { Point, Route, RoutePoint } from '../path.ts';
import type { Rect } from '../plates/index.ts';

/** A corner of a laid route. */
export type LaidPoint = RoutePoint & { mark?: Mark };

/**
 * A route as the page lays it out, its points named from the page's marks: also the line its title is written
 * along, or the stretch of route that uncovers the title.
 */
export type LaidRoute = Omit<Route, 'pts' | 'startMark'> & {
  pts: LaidPoint[];
  startMark?: Mark;
  lineY?: number;
  along?: [Mark, Mark];
};

/** A title's text extent in page coordinates. */
export interface TitleExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RouteCtx {
  section: HTMLElement;
  /** The section's box in page coordinates. */
  box: Rect;
  /** The section's title element and its text extent. */
  title: TitleExtent & { el: HTMLElement };
  /** The title's index, which the route follows. */
  index: number;
  /** The next section's title, if any. */
  next: TitleExtent | undefined;
  /** Where writing under the title ends, and the underline's height. */
  end: Point;
  /** Height under the section where a route crosses back to the rail. */
  back: number;
  /** The right margin's line: the rail mirrored about the content column. */
  right: number;
  railX: number;
  W: number;
  H: number;
  /** Where the previous section's route left off, when it runs on into this one. */
  from: Point | null;
  /** An element's box in page coordinates. */
  rect: (el: Element) => Rect;
}

/** Lays out a section's route, or returns null when the page's layout leaves no room for it. */
export type RouteFn = (c: RouteCtx) => LaidRoute | null;
