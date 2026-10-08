import type { RouteKind } from '../contract.ts';
import { camera } from './camera.ts';
import { chart } from './chart.ts';
import { middle } from './middle.ts';
import { net } from './net.ts';
import { right } from './right.ts';
import { split } from './split.ts';
import { tiles } from './tiles.ts';
import { touch } from './touch.ts';
import type { RouteFn } from './types.ts';

/**
 * The pen's ways past a section, by the name a section gives in its `data-plot-route` attribute. Sections
 * without one, and routes that find no room, cross back to the rail under the section.
 */
export const ROUTES: Record<RouteKind, RouteFn> = { right, camera, split, chart, touch, tiles, net, middle };

/** The route a `data-plot-route` attribute names, if it is one. */
export const routeNamed = (name: string): RouteFn | undefined => (ROUTES as Record<string, RouteFn>)[name];

export type { LaidRoute, RouteCtx, RouteFn } from './types.ts';
