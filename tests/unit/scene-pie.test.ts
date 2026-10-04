import { afterEach, describe, expect, it, vi } from 'vitest';
import { PieMenuController, PieOutcome } from '../../src/scene/blendon/piemenus/controller.ts';
import { PieLayout } from '../../src/scene/blendon/piemenus/layout.ts';
import { PieItem, PieMenuData, RadialDirections } from '../../src/scene/blendon/piemenus/model.ts';
import { Rect, Vector2 } from '../../src/scene/unity/math.ts';
import type { SceneView } from '../../src/scene/unity/sceneview.ts';

const items = (n: number, run: (i: number) => void = () => {}) =>
  Array.from({ length: n }, (_, i) => new PieItem(`Item ${i + 1}`, '', () => run(i)));

// Cursor offsets in GUI space (y down).
const select = (data: PieMenuData, gui: Vector2) =>
  PieLayout.select(data, RadialDirections.toMath(gui.normalized), false);

const view = { cameraViewport: new Rect(0, 0, 1000, 700) } as unknown as SceneView;

let now = 0;
function clock() {
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
}

afterEach(() => vi.restoreAllMocks());

describe('pie layout', () => {
  it('fills west, north, east, south first', () => {
    const data = new PieMenuData('Four', items(4));
    expect(select(data, new Vector2(-1, 0))).toBe(0);
    expect(select(data, new Vector2(0, -1))).toBe(1);
    expect(select(data, new Vector2(1, 0))).toBe(2);
    expect(select(data, new Vector2(0, 1))).toBe(3);
  });

  it('widens four-item wedges to 90 degrees', () => {
    const data = new PieMenuData('Four', items(4));
    // 40 degrees above west still picks west: no diagonal neighbour narrows it.
    expect(select(data, new Vector2(-Math.cos(0.698), -Math.sin(0.698)))).toBe(0);
  });

  it('narrows wedges once a diagonal is occupied', () => {
    const data = new PieMenuData('Eight', items(8));
    // North-east is the fifth slot.
    expect(select(data, new Vector2(1, -1))).toBe(4);
    expect(select(data, new Vector2(-Math.cos(0.698), -Math.sin(0.698)))).toBe(7);
  });

  it('skips disabled items and empty slots', () => {
    const data = new PieMenuData('Gaps', [
      null,
      new PieItem(
        'Off',
        '',
        () => {},
        null,
        () => false,
      ),
    ]);
    expect(select(data, new Vector2(-1, 0))).toBe(-1);
    expect(select(data, new Vector2(0, -1))).toBe(-1);
  });

  it('puts pill edges, not centres, on the circle', () => {
    const c = PieLayout.itemCenter(Vector2.zero, RadialDirections.FillOrder[2], new Vector2(80, 24), 100, 1);
    expect(c.x).toBeCloseTo(140);
    expect(c.y).toBeCloseTo(0);
  });
});

describe('pie gesture', () => {
  it('latches open on a quick still release, then confirms on click', () => {
    clock();
    now = 10;
    const ran: number[] = [];
    const c = new PieMenuController(
      new PieMenuData(
        'T',
        items(4, (i) => ran.push(i)),
      ),
      view,
      new Vector2(500, 350),
      'id',
    );
    now = 10.05;
    expect(c.onHotkeyReleased()).toBe(PieOutcome.Open);
    expect(c.clickStyle).toBe(true);
    c.track(new Vector2(600, 350));
    expect(c.onConfirmClick()).toBe(PieOutcome.Executed);
    expect(ran).toEqual([2]);
  });

  it('commits on release after a flick and cancels in the deadzone', () => {
    clock();
    now = 20;
    const ran: number[] = [];
    const c = new PieMenuController(
      new PieMenuData(
        'T',
        items(4, (i) => ran.push(i)),
      ),
      view,
      new Vector2(500, 350),
      'id',
    );
    c.track(new Vector2(500, 250));
    expect(c.onHotkeyReleased()).toBe(PieOutcome.Executed);
    expect(ran).toEqual([1]);

    const d = new PieMenuController(new PieMenuData('T', items(4)), view, new Vector2(500, 350), 'id');
    now = 21;
    d.tick();
    expect(d.onHotkeyReleased()).toBe(PieOutcome.Cancelled);
  });

  it('runs a numbered item', () => {
    clock();
    const ran: number[] = [];
    const c = new PieMenuController(
      new PieMenuData(
        'T',
        items(4, (i) => ran.push(i)),
      ),
      view,
      new Vector2(500, 350),
      'id',
    );
    expect(c.tryAccelerator(4)).toBe(PieOutcome.Executed);
    expect(c.tryAccelerator(9)).toBeNull();
    expect(ran).toEqual([3]);
  });

  it('aims at nothing until the cursor moves when nudged off an edge', () => {
    clock();
    const c = new PieMenuController(new PieMenuData('T', items(4)), view, new Vector2(500, 690), 'id');
    expect(c.spawnCenter.y).toBeLessThan(690);
    expect(c.highlighted).toBe(-1);
    c.track(new Vector2(380, c.spawnCenter.y));
    expect(c.highlighted).toBe(0);
  });
});
