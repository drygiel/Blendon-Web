// PieLayout: Blender's ui_block_calc_pie_segment / but_isect_pie_seg and the unfold placement,
// kept in Blender's Y-up space so the borderline comparisons stay literally the same.
import { Mathf, Vector2 } from '../../unity/math.ts';
import { RadialDirections, type PieMenuData, type RadialDirection } from './model.ts';

// Blender's eps_bias: near a wedge boundary the adjacent-direction comparison decides.
const EpsilonBias = 1e-4;
const Cos45 = Math.cos(45 * Mathf.Deg2Rad);
const Cos22p5 = Math.cos(22.5 * Mathf.Deg2Rad);

function intersectsSegment(data: PieMenuData, direction: RadialDirection, pieDirection: Vector2) {
  const itemDirection = RadialDirections.vector(direction);
  const itemCosine = Vector2.dot(itemDirection, pieDirection);
  if (itemCosine < Cos45 - EpsilonBias) return false;
  if (itemCosine > Cos22p5 + EpsilonBias) return true;

  // Between 22.5 and 45 degrees off: compare with the neighbour on the cursor's side - the diagonal
  // if occupied, else the cardinal beyond it (which widens a four-item pie's wedges to 90 degrees).
  const perp = itemDirection.y * pieDirection.x - itemDirection.x * pieDirection.y;
  const diagonal = perp < 0 ? RadialDirections.prev(direction) : RadialDirections.next(direction);
  const adjacent =
    (data.directionMask & (1 << diagonal)) !== 0
      ? diagonal
      : perp < 0
        ? RadialDirections.prev(diagonal)
        : RadialDirections.next(diagonal);
  const adjacentCosine = Vector2.dot(RadialDirections.vector(adjacent), pieDirection);
  if (Mathf.Approximately(itemCosine, adjacentCosine)) return direction > adjacent;
  return itemCosine > adjacentCosine;
}

export const PieLayout = {
  /** Blender's PIE_CLICK_THRESHOLD_SQ: about 7 points separate a tap from a flick. */
  ClickThresholdSquared: 50,

  /** The item the cursor points at, or -1; only direction matters past the deadzone. */
  select(data: PieMenuData, pieDirection: Vector2, invalidDirection: boolean) {
    if (invalidDirection) return -1;
    for (let i = 0; i < data.count; i++) {
      const item = data.items[i];
      if (!item || !item.isEnabled) continue;
      if (intersectsSegment(data, data.directionOf(i), pieDirection)) return i;
    }
    return -1;
  },

  /** Pill centre in GUI points; the half-size shift puts pill edges, not centres, on the circle. */
  itemCenter(spawnCenter: Vector2, direction: RadialDirection, size: Vector2, radius: number, unfold: number) {
    const v = RadialDirections.vector(direction);
    const offset = new Vector2(
      (v.x > 0.01 ? 0.5 : v.x < -0.01 ? -0.5 : 0) * size.x,
      (v.y > 0.99 ? 0.5 : v.y < -0.99 ? -0.5 : 0) * size.y,
    );
    const placed = v.mul(radius).add(offset).mul(unfold);
    return spawnCenter.add(RadialDirections.toGui(placed));
  },
};
