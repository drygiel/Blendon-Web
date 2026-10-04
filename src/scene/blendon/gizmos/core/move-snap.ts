// MoveSnap: the lattice a move drag lands on (grid snap, Ctrl increments, or none).
import { EditorSnapSettings } from '../../../unity/editor.ts';
import { Mathf, Quaternion, Vector3 } from '../../../unity/math.ts';
import { SharedGizmoSettings } from '../shared-settings.ts';
import { VertexSnappingUtility } from '../vertex-snapping.ts';

const step = (value: number, size: number) => (size > 0 ? Mathf.Round(value / size) * size : value);

function dominantAxis(local: Vector3) {
  const x = Math.abs(local.x),
    y = Math.abs(local.y),
    z = Math.abs(local.z);
  return x >= y ? (x >= z ? 0 : 2) : y >= z ? 1 : 2;
}

export class MoveSnap {
  readonly valid: boolean;
  readonly active: boolean;
  readonly grid: boolean;
  readonly pickDriven: boolean;
  private readonly rotation: Quaternion;
  private readonly inverse: Quaternion;
  private readonly origin: Vector3;
  private readonly size: Vector3;

  private constructor(
    valid: boolean,
    grid: boolean,
    rotation: Quaternion,
    origin: Vector3,
    size: Vector3,
    pickDriven = false,
  ) {
    this.valid = valid;
    this.active = valid && (size.x > 0 || size.y > 0 || size.z > 0);
    this.grid = grid;
    this.pickDriven = pickDriven;
    this.rotation = rotation;
    this.inverse = Quaternion.inverse(rotation);
    this.origin = origin;
    this.size = size;
  }

  /** C#'s default(MoveSnap): not tracked, the handle's own slider decides. */
  static readonly none = new MoveSnap(false, false, Quaternion.identity, Vector3.zero, Vector3.zero);

  static current(dragStart: Vector3, rotation: Quaternion) {
    // A drag pulled onto one exact vertex leaves nothing for a lattice to quantise.
    if (VertexSnappingUtility.pickSnapDrivesDrag)
      return new MoveSnap(true, false, rotation, dragStart, Vector3.zero, true);
    // Precision refines every mode to half steps, so drawn ticks and landing points stay one set.
    const k = SharedGizmoSettings.PrecisionHeld ? 0.5 : 1;
    if (EditorSnapSettings.gridSnapActive)
      return new MoveSnap(
        true,
        true,
        EditorSnapSettings.gridRotation,
        EditorSnapSettings.gridPosition,
        EditorSnapSettings.gridSize.mul(k),
      );
    if (EditorSnapSettings.incrementalSnapActive)
      return new MoveSnap(true, false, rotation, dragStart, EditorSnapSettings.move.mul(k));
    return new MoveSnap(true, false, rotation, dragStart, Vector3.zero);
  }

  tryLattice(anchor: Vector3, dir: Vector3): { phase: number; spacing: number } | null {
    if (!this.active) return null;
    const local = this.inverse.mulV(dir);
    const axis = dominantAxis(local);
    const s = this.size.get(axis);
    const slope = local.get(axis);
    if (s <= 0 || Math.abs(slope) < 1e-6) return null;
    const offset = this.inverse.mulV(anchor.sub(this.origin)).get(axis);
    return { phase: -offset / slope, spacing: s / Math.abs(slope) };
  }

  snapAlong(anchor: Vector3, dir: Vector3, distance: number) {
    const l = this.tryLattice(anchor, dir);
    return l ? l.phase + Mathf.Round((distance - l.phase) / l.spacing) * l.spacing : distance;
  }

  snapPlane(anchor: Vector3, dir1: Vector3, dir2: Vector3, a: number, b: number): [number, number] {
    if (!this.active) return [a, b];
    a = this.snapAlong(anchor.add(dir2.mul(b)), dir1, a);
    b = this.snapAlong(anchor.add(dir1.mul(a)), dir2, b);
    return [a, b];
  }

  snapPoint(world: Vector3) {
    if (!this.active) return world;
    const local = this.inverse.mulV(world.sub(this.origin));
    const snapped = new Vector3(step(local.x, this.size.x), step(local.y, this.size.y), step(local.z, this.size.z));
    // A correction rather than a rebuild, so an axis with no increment keeps its exact value.
    return world.add(this.rotation.mulV(snapped.sub(local)));
  }
}
