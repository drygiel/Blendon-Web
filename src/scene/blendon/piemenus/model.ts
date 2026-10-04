// Pie content: Blender's eight slots, one item per slot, and the menu holding them.
import { Mathf, Vector2 } from '../../unity/math.ts';

/** Numbered as Blender's own enum, so the tables below transcribe verbatim. */
export const RadialDirection = {
  North: 0,
  NorthEast: 1,
  East: 2,
  SouthEast: 3,
  South: 4,
  SouthWest: 5,
  West: 6,
  NorthWest: 7,
} as const;
export type RadialDirection = (typeof RadialDirection)[keyof typeof RadialDirection];

// Blender's radial_dir_to_angle: Y up, degrees counter-clockwise from +X.
const Angles = [90, 45, 0, 315, 270, 225, 180, 135];

export const RadialDirections = {
  Count: 8,

  /** Blender's radial_dir_order: four items land on the cardinals, a fifth reaches a diagonal. */
  FillOrder: [
    RadialDirection.West,
    RadialDirection.North,
    RadialDirection.East,
    RadialDirection.South,
    RadialDirection.NorthEast,
    RadialDirection.SouthEast,
    RadialDirection.SouthWest,
    RadialDirection.NorthWest,
  ] as readonly RadialDirection[],

  /** Unit vector in Blender's Y-up space. */
  vector(d: RadialDirection) {
    const r = Angles[d] * Mathf.Deg2Rad;
    return new Vector2(Math.cos(r), Math.sin(r));
  },
  next: (d: RadialDirection) => ((d + 1) % 8) as RadialDirection,
  prev: (d: RadialDirection) => ((d + 7) % 8) as RadialDirection,
  toGui: (v: Vector2) => new Vector2(v.x, -v.y),
  toMath: (v: Vector2) => new Vector2(v.x, -v.y),
};

/** One slot's content; the live queries are re-asked every repaint. */
export class PieItem {
  readonly label: string;
  readonly iconName: string;
  readonly action: () => void;
  private readonly current: (() => boolean) | null;
  private readonly enabled: (() => boolean) | null;

  constructor(
    label: string,
    iconName: string,
    action: () => void,
    isCurrent: (() => boolean) | null = null,
    isEnabled: (() => boolean) | null = null,
  ) {
    this.label = label;
    this.iconName = iconName;
    this.action = action;
    this.current = isCurrent;
    this.enabled = isEnabled;
  }

  get isCurrent() {
    return !!this.current && this.current();
  }

  get isEnabled() {
    return !this.enabled || this.enabled();
  }
}

/** A title and up to eight items; a null entry leaves its slot empty. */
export class PieMenuData {
  static readonly MaxItems = 8;
  readonly title: string;
  readonly items: readonly (PieItem | null)[];
  /** Bit per occupied direction; Blender's pie_dir_mask. */
  readonly directionMask: number;

  constructor(title: string, items: (PieItem | null)[]) {
    this.title = title;
    this.items = items.slice(0, PieMenuData.MaxItems);
    let mask = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i]) mask |= 1 << this.directionOf(i);
    this.directionMask = mask;
  }

  get count() {
    return this.items.length;
  }

  directionOf(index: number) {
    return RadialDirections.FillOrder[index];
  }

  static acceleratorOf(index: number) {
    return index + 1;
  }
}
