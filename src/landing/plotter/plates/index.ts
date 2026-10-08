import { bezier } from './bezier.ts';
import { blueprint } from './blueprint.ts';
import { curve } from './curve.ts';
import { finale } from './finale.ts';
import { frame } from './frame.ts';
import { frustum } from './frustum.ts';
import { hero } from './hero.ts';
import { keyboard } from './keyboard.ts';
import { network } from './network.ts';
import { orbits } from './orbits.ts';
import { pages } from './pages.ts';
import { polar } from './polar.ts';
import { ruler } from './ruler.ts';
import { sphere } from './sphere.ts';
import type { Plate } from './types.ts';
import { waves } from './waves.ts';

/** Plates by the name a section gives in its `data-plate` attribute. */
export const PLATES = {
  hero,
  frustum,
  orbits,
  sphere,
  ruler,
  polar,
  curve,
  pages,
  waves,
  frame,
  network,
  keyboard,
  blueprint,
  bezier,
  finale,
} satisfies Record<string, Plate>;

/** The plate a `data-plate` attribute names, if it is one. */
export const plateNamed = (name: string): Plate | undefined => (PLATES as Record<string, Plate>)[name];

export type { Plate, PlateCtx, Rect } from './types.ts';
