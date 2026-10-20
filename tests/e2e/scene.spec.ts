import { readFileSync } from 'node:fs';
import type { TutorialData } from '../../src/plugin/tutorial.ts';
import { expect, type Page, test } from './fixtures.ts';

// The plugin's tutorial as the site ships it, so the checks follow its wording.
const TUTORIAL_TASKS = (
  JSON.parse(readFileSync(new URL('../../src/plugin/generated/tutorial.json', import.meta.url), 'utf8')) as TutorialData
).chapters.flatMap((c) => c.tasks);

let errors: string[] = [];

// The view needs WebGL, which only Chromium's headless build has everywhere CI runs.
test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Scene view: Chromium only');

async function openScene(page: Page, still = true) {
  await page.locator('#try').scrollIntoViewIfNeeded();
  const view = page.locator('#try [role=application]');
  // three.js, the engine and the window data load on demand; a busy machine takes a while.
  await expect(view.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  // The host is attached once the scene is built.
  await expect.poll(() => view.evaluate((el: unknown) => !!(el as Partial<HostElement>).sceneHost)).toBe(true);
  // The dock starts centred, as the first touch would leave it, so no scroll moves it under a test's clicks.
  await view.evaluate((el: unknown) =>
    (el as { closest(s: string): { scrollIntoView(o: object): void } })
      .closest('[data-playground]')
      .scrollIntoView({ behavior: 'instant', block: 'center' }),
  );
  // Focusing the view ends the idle orbit, so every test starts from a camera that holds still.
  if (still) await view.evaluate((el: unknown) => (el as { focus(o: object): void }).focus({ preventScroll: true }));
  return view;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface HostElement {
  sceneHost: {
    root: { getBoundingClientRect(): { left: number; top: number } };
    selectionNames: string[];
    scene: { allObjects(): Iterable<{ name: string; transform: { position: Vec3 } }> };
    view: {
      rotation: Vec3 & { w: number };
      pixelsPerPoint: number;
      camera: { pixelHeight: number; worldToScreenPoint(p: Vec3): Vec3 };
      drawMode: number;
      highlight: { selects: unknown[]; deselects: unknown[] } | null;
    };
  };
}

/** The named object's world position, read from the running scene. */
function positionOf(page: Page, name: string) {
  return page.locator('#try [role=application]').evaluate((el: unknown, n) => {
    const go = [...(el as HostElement).sceneHost.scene.allObjects()].find((o) => o.name === n);
    return go ? { x: go.transform.position.x, y: go.transform.position.y, z: go.transform.position.z } : null;
  }, name);
}

function viewRotation(page: Page) {
  return page.locator('#try [role=application]').evaluate((el: unknown) => {
    const r = (el as HostElement).sceneHost.view.rotation;
    return [r.x, r.y, r.z, r.w];
  });
}

/** Where the named object's pivot is on the page; the camera viewport starts under the top toolbar. */
function pagePointOf(page: Page, name: string) {
  return page.locator('#try [role=application]').evaluate((el: unknown, n) => {
    const h = (el as HostElement).sceneHost;
    const v = h.view;
    const go = [...h.scene.allObjects()].find((o) => o.name === n)!;
    const s = v.camera.worldToScreenPoint(go.transform.position);
    const r = h.root.getBoundingClientRect();
    return { x: r.left + s.x / v.pixelsPerPoint, y: r.top + (v.camera.pixelHeight - s.y) / v.pixelsPerPoint };
  }, name);
}

/**
 * A point on the X arrow of the named object's handle, `out` pixels from its pivot. Unity's Move handle has nothing
 * in its middle, so at the pivot itself its arrows tie and float noise picks the one a drag takes.
 */
function xArrowPointOf(page: Page, name: string, out = 35) {
  return page.locator('#try [role=application]').evaluate(
    (el: unknown, [n, out]) => {
      const h = (el as HostElement).sceneHost;
      const v = h.view;
      const go = [...h.scene.allObjects()].find((o) => o.name === n)!;
      const p = go.transform.position as Vec3 & { withX(x: number): Vec3 };
      const r = h.root.getBoundingClientRect();
      const onPage = (w: Vec3) => {
        const s = v.camera.worldToScreenPoint(w);
        return { x: r.left + s.x / v.pixelsPerPoint, y: r.top + (v.camera.pixelHeight - s.y) / v.pixelsPerPoint };
      };
      const a = onPage(p);
      const b = onPage(p.withX(p.x + 1));
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: a.x + ((b.x - a.x) / len) * out, y: a.y + ((b.y - a.y) / len) * out };
    },
    [name, out] as const,
  );
}

/** What Box Select's highlight marks right now: [to select, to deselect]. */
function highlighted(page: Page) {
  return page.locator('#try [role=application]').evaluate((el: unknown) => {
    const h = (el as HostElement).sceneHost.view.highlight;
    return [h?.selects.length ?? 0, h?.deselects.length ?? 0];
  });
}

const selectionNames = (page: Page) =>
  page.locator('#try [role=application]').evaluate((el: unknown) => (el as HostElement).sceneHost.selectionNames);

const drawMode = (page: Page) =>
  page.locator('#try [role=application]').evaluate((el: unknown) => (el as HostElement).sceneHost.view.drawMode);

/** The Tool Contexts overlay's switch for the Editor's own context. */
const gameObjectContext = (page: Page) =>
  page.locator('#try [role=application]').getByRole('button', { name: 'Game Object (Default)', exact: true });

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('');
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test('loads the Scene view with the tutorial badge', async ({ page }) => {
  const view = await openScene(page);
  await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toBeVisible();
  await expect(view.getByLabel('Orientation gizmo')).toBeVisible();
});

test("the badge opens the checklist, then names the next task with the task's own picture", async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Blendon Tutorial' }).click();
  const win = page.locator('#try .uw');
  await expect(win.locator('.htitle')).toHaveText('Tutorial');
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  const line = view.getByRole('button', { name: 'Orbit the view' });
  await line.hover();
  const tip = view.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('img')).toHaveAttribute('src', /Tutorial_OrbitView\.webp$/);
  await expect(tip.locator('video')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
});

test('a gesture ticks its task, the badge flashes it and the checklist shows it done', async ({ page }) => {
  const view = await openScene(page);
  await view.focus();
  // The demo opens with the cube selected; End rests it on the floor.
  await page.keyboard.press('End');
  await expect(view.getByRole('button', { name: 'Drop it back onto the floor' })).toBeVisible();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const row = page.locator('#try .uw .tutr', { hasText: 'Drop it back onto the floor' });
  await expect(row.locator('.tutbox.done')).toBeVisible();
  await expect(page.locator('#try .uw .tutstat')).toContainText(/1 of \d+ tasks done/);
});

test("the badge's card spells a task's keys out, never their tokens", async ({ page }) => {
  const plane = TUTORIAL_TASKS.find((t) => t.id === 'scene.add-plane')!;
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  await page.locator('#try .uw .tutr', { hasText: plane.title }).locator('.tutt').click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await view.getByRole('button', { name: plane.title }).hover();
  const tip = view.getByRole('tooltip');
  // The landing's copy is the same hint filled for the Blendon preset, which the demo starts on.
  await expect(tip).toContainText(plane.hint);
  await expect(tip).not.toContainText('{key:');
  await expect(tip.locator('b').first()).toBeVisible();
});

test("the gizmo's Show Background and the page's row switch the same setting", async ({ page }) => {
  const view = await openScene(page);
  const gizmo = view.getByLabel('Orientation gizmo');
  // The overlay window around the gizmo's canvas carries the panel.
  const panel = gizmo.locator('..');
  const none = 'rgba(0, 0, 0, 0)';
  const toggle = () => view.getByRole('menu').getByRole('menuitemcheckbox', { name: 'Show Background' });
  const openMenu = async () => {
    const box = (await gizmo.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  };
  await expect(panel).toHaveCSS('background-color', none);

  await openMenu();
  await expect(toggle()).toHaveAttribute('aria-checked', 'false');
  await toggle().click();
  await expect(panel).not.toHaveCSS('background-color', none);

  await openMenu();
  await expect(toggle()).toHaveAttribute('aria-checked', 'true');
  await view.getByRole('menu').getByRole('menuitem', { name: 'Settings' }).click();
  const win = page.locator('#try .uw');
  await expect(win.locator('.htitle')).toHaveText('Orientation Gizmo');
  const row = win.getByRole('button', { name: 'Show Background', exact: true });
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(panel).toHaveCSS('background-color', none);
});

test('grabs the selection by a typed distance and undoes it', async ({ page }) => {
  const view = await openScene(page);
  const before = await positionOf(page, 'Cube');
  await view.focus();
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before!.x + 2, 4);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before!.x, 4);
});

test('the click that confirms a grab selects nothing', async ({ page }) => {
  await openScene(page);
  expect(await selectionNames(page)).toEqual(['Cube']);
  const before = (await positionOf(page, 'Cube'))!;
  const from = await pagePointOf(page, 'Cube');
  const to = await pagePointOf(page, 'Tilted Cube');
  await page.mouse.move(from.x, from.y);
  await page.keyboard.press('g');
  // Held to Y, the Cube only rises, so the cursor ends up over the other cube.
  await page.keyboard.press('y');
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.y).not.toBeCloseTo(before.y, 2);
  expect(await selectionNames(page)).toEqual(['Cube']);
  // Confirmed, so the cursor no longer carries the Cube.
  const placed = await positionOf(page, 'Cube');
  await page.mouse.move(from.x, from.y);
  expect(await positionOf(page, 'Cube')).toEqual(placed);
});

test('opens the context menu on a right click and closes it with Escape', async ({ page }) => {
  const view = await openScene(page);
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3, { button: 'right' });
  const search = view.getByLabel('Search the menu');
  await expect(search).toBeVisible();
  await search.fill('dupl');
  await expect(view.getByText('Duplicate', { exact: true })).toBeVisible();
  await search.press('Escape');
  await search.press('Escape');
  await expect(search).toHaveCount(0);
});

test('follows a feature switched off in the settings window', async ({ page }) => {
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.getByRole('button', { name: 'Move', exact: true }).click();
  const enable = win.getByRole('button', { name: 'Enable Move' });
  await enable.click();
  await expect(enable).toHaveAttribute('aria-pressed', 'false');

  const before = (await positionOf(page, 'Cube'))!.x;
  // Picking the Scene tab hands the keyboard to the view.
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(view).toBeFocused();
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(1500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
});

test('orbits with the middle mouse button', async ({ page }) => {
  const view = await openScene(page);
  const box = (await view.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const before = await viewRotation(page);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 12, y + i * 3);
  await page.mouse.up({ button: 'middle' });
  await expect.poll(() => viewRotation(page)).not.toEqual(before);
});

test('orbit and pan on the middle button never raise a tip card, Quick Roll still does', async ({ page }) => {
  const view = await openScene(page);
  const box = (await view.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const drag = async (modifier?: string) => {
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 12, y + i * 3);
    await page.mouse.up({ button: 'middle' });
    if (modifier) await page.keyboard.up(modifier);
  };
  const card = view.getByRole('status');
  await drag();
  await drag('Shift');
  await page.waitForTimeout(800);
  await expect(card).toHaveCount(0);
  await drag('Alt');
  await expect(card).toBeVisible();
});

test('cancels a handle drag with the right mouse button', async ({ page }) => {
  await openScene(page);
  const before = (await positionOf(page, 'Cube'))!;
  const at = await pagePointOf(page, 'Cube');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
  // Pressed while the left button is held, so the browser reports it only as a move.
  await page.mouse.down({ button: 'right' });
  await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
});

const isFullScreen = (page: Page) =>
  page.evaluate(
    () => !!(globalThis as unknown as { document: { fullscreenElement: unknown } }).document.fullscreenElement,
  );

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('shows the Scene view and the settings window side by side, or as tabs', async ({ page }) => {
    await openScene(page);
    const win = page.locator('#try .uw');
    await expect(win).toBeVisible();
    await expect(page.locator('#try [role=application]')).toBeVisible();
    await page.getByRole('button', { name: 'Show as tabs' }).click();
    await expect(win).toBeHidden();
    await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
    await expect(win).toBeVisible();
    await expect(page.locator('#try [role=application]')).toBeHidden();
    await page.getByRole('button', { name: 'Show side by side' }).click();
    await expect(page.locator('#try [role=application]')).toBeVisible();
  });

  test('fills the screen and leaves it', async ({ page }) => {
    await openScene(page);
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(() => isFullScreen(page)).toBe(true);
    await page.getByRole('button', { name: 'Exit full screen' }).click();
    await expect.poll(() => isFullScreen(page)).toBe(false);
  });
});

test('box selects with a dashed box, a names readout and a red mark for Ctrl', async ({ page }) => {
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.getByRole('button', { name: 'Box Select', exact: true }).click();
  // On in the captured Editor's settings, so on here from the start.
  await expect(win.getByRole('button', { name: 'Enable Box Select' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(view).toBeFocused();

  const sphere = await pagePointOf(page, 'Sphere');
  const cube1 = await pagePointOf(page, 'Cube (1)');
  const from = { x: sphere.x - 60, y: sphere.y - 60 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((cube1.x - from.x) * i) / 6, from.y + 120 * (i / 6));
  await expect.poll(async () => (await highlighted(page))[0]).toBeGreaterThan(0);
  await page.mouse.up();
  await expect.poll(() => selectionNames(page)).toContain('Sphere');

  // Ctrl over a selected object marks it to drop out.
  await page.keyboard.down('Control');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(sphere.x + 20, sphere.y + 20);
  await expect.poll(async () => (await highlighted(page))[1]).toBeGreaterThan(0);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect.poll(() => selectionNames(page)).not.toContain('Sphere');
});

test('the toolbars switch the draw mode and hide overlays; demo-only buttons say so', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Wireframe Draw Mode', exact: true }).click();
  await expect.poll(() => drawMode(page)).toBe(1);
  await view.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Move Tool' })).toHaveCount(0);
  const search = view.getByRole('button', { name: 'Search', exact: true });
  await expect(search).toHaveCSS('cursor', 'not-allowed');
});

test('resets the scene and every setting', async ({ page }) => {
  const view = await openScene(page);
  const before = (await positionOf(page, 'Cube'))!;
  await view.focus();
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x + 2, 4);
  await page.getByRole('button', { name: 'Reset the scene and every setting' }).click();
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x, 4);
});

test('opens the Playground on a page of its own, without scrolling', async ({ page }) => {
  await page.goto('playground/');
  await expect(page.locator('[role=application] canvas').first()).toBeVisible({ timeout: 20_000 });
  const overflow = await page.evaluate(() => {
    const d = (
      globalThis as unknown as { document: { documentElement: { scrollHeight: number; clientHeight: number } } }
    ).document.documentElement;
    return d.scrollHeight - d.clientHeight;
  });
  expect(overflow).toBe(0);
  await page.getByRole('button', { name: 'Hide this bar' }).click();
  await expect(page.getByRole('link', { name: 'Back to the Blendon page' })).toHaveCount(0);
});

test('a key pressed mid-drag goes to the drag, not to a shortcut', async ({ page }) => {
  const view = await openScene(page);
  const before = (await positionOf(page, 'Cube'))!;
  const at = await pagePointOf(page, 'Cube');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
  // Y is the Transform tool's key, Z a pie menu's; mid-drag they pick an axis.
  await page.keyboard.press('y');
  for (let i = 5; i <= 10; i++) await page.mouse.move(at.x - i * 8, at.y - i * 6);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.y).not.toBeCloseTo(before.y, 2);
  const p = (await positionOf(page, 'Cube'))!;
  expect(p.x).toBeCloseTo(before.x, 4);
  expect(p.z).toBeCloseTo(before.z, 4);
  await page.keyboard.press('z');
  await page.mouse.up();
  await expect(view.getByRole('button', { name: 'Move Tool' })).toHaveAttribute('aria-pressed', 'true');
  await expect(view.getByText('Draw Mode')).toHaveCount(0);
});

test('the reset button starts the tutorial over', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset the scene and every setting' }).click();
  await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toBeVisible();
});

test('renames the selection from the context menu', async ({ page }) => {
  const view = await openScene(page);
  const at = await pagePointOf(page, 'Cube');
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await view.getByLabel('Rename', { exact: true }).click();
  const field = view.getByLabel('New name');
  await expect(field).toBeFocused();
  await field.fill('Crate');
  await field.press('Enter');
  await expect.poll(() => selectionNames(page)).toEqual(['Crate']);
});

test('the menu search box follows its setting', async ({ page }) => {
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.getByRole('button', { name: 'Context Menu', exact: true }).click();
  await win.getByRole('button', { name: 'Search Field', exact: true }).click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3, { button: 'right' });
  const search = view.getByLabel('Search the menu');
  await expect(search).toBeFocused();
  await expect(search).not.toBeVisible();
  // What is typed goes nowhere: the menu stays unfiltered.
  await page.keyboard.type('snap');
  await expect(view.getByText('Copy Transform', { exact: true })).toBeVisible();
});

test("the window's Start Over brings the tutorial back", async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  // Skipping switches the badge off, and the page says the checklist waits for it.
  await expect(win.locator('.tutstat')).toContainText('paused while the badge is off');
  await win.getByRole('button', { name: /Start Over/ }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Start Over', exact: true }).click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toBeVisible();
});

/** The settings window on its Overview page, where the keyboard presets and the covered commands are. */
async function openOverview(page: Page) {
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.locator('.si[aria-label="Blendon"]').click();
  return win;
}

/** One row of the Overview's covered-commands table, found by Blendon's side. */
const contestedRow = (page: Page, name: string) =>
  page.locator('#try .uw .ct').filter({ has: page.locator('.ctn', { hasText: new RegExp(`^${name}$`) }) });

async function toScene(page: Page) {
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(page.locator('#try [role=application]')).toBeFocused();
}

test('the first press of a key that covers an Editor command explains it once', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  // The page starts with the command moved aside; Reset gives it G back, so G covers it.
  await openOverview(page);
  await contestedRow(page, 'Grab').getByRole('button', { name: 'Reset', exact: true }).click();
  await toScene(page);
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  const card = view.getByText('Blendon answers this key here');
  await expect(card).toBeVisible();
  await expect(view.getByText("Outside Blendon's tool context the Editor's command answers again.")).toBeVisible();
  await expect(view.getByText('Cycle Tool Modes')).toBeVisible();
  await view.getByRole('button', { name: 'Open in Blendon' }).click();
  await expect(page.locator('#try .uw [data-hl="true"]')).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(800);
  await expect(card).toHaveCount(0);
});

test('with the tutorial on, the tip card sits just above the badge and makes way for its hover card', async ({
  page,
}) => {
  const view = await openScene(page);
  // Started, so the badge's line names a task and has a hover card.
  await view.getByRole('button', { name: 'Blendon Tutorial' }).click();
  await openOverview(page);
  await contestedRow(page, 'Grab').getByRole('button', { name: 'Reset', exact: true }).click();
  await toScene(page);
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  const card = view.getByRole('status').filter({ hasText: 'Blendon answers this key here' });
  await expect(card).toBeVisible();
  const badge = view.getByRole('button', { name: 'Skip the tutorial' }).locator('..');
  // Docked: right edges aligned, the card's bottom 6 px above the badge.
  await expect
    .poll(async () => {
      const c = (await card.boundingBox())!;
      const b = (await badge.boundingBox())!;
      return [Math.round(c.x + c.width - b.x - b.width), Math.round(b.y - c.y - c.height)];
    })
    .toEqual([0, 6]);
  // A ticked task's flash has no hover card, so wait for the line to name the next one.
  await expect(view.getByText('✓')).toHaveCount(0);
  await badge.getByRole('button').first().hover();
  await expect(view.getByRole('tooltip')).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("with Move switched off, G is the Editor's Cycle Tool Modes again", async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  const win = await openOverview(page);
  const grab = contestedRow(page, 'Grab');
  await grab.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(grab.getByRole('button', { name: 'Move aside', exact: true })).toBeVisible();
  await win.locator('.si[aria-label="Move"]').click();
  await win.getByRole('button', { name: 'Enable Move' }).click();
  await win.locator('.si[aria-label="Blendon"]').click();
  // Free: nothing is covered, so there is nothing to move and the row goes.
  await expect(contestedRow(page, 'Grab Rotate')).toBeVisible();
  await expect(grab).toHaveCount(0);

  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(800);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
  await expect(view.getByText('Blendon answers this key here')).toHaveCount(0);
  // The command steps on to the next tool context.
  await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the page starts with Cycle Tool Modes on Shift+G, Reset gives it G back and Move moves it again', async ({
  page,
}) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  await openOverview(page);
  const grab = contestedRow(page, 'Grab');
  const editorKey = grab.locator('.ctk').nth(1);
  await expect(editorKey).toHaveText('ShiftG');
  await expect(grab.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  await expect(grab.getByRole('button', { name: 'Move aside', exact: true })).toHaveCount(0);

  // Shift+G is the Editor's command now, G still Blendon's grab, and the tip says where the command went.
  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['Shift+g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
  // Cycle Tool Modes stepped on to Game Object, where G is no grab.
  await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before + 1, 4);
  await expect(view.getByText('Blendon owns this shortcut now')).toBeVisible();
  await expect(view.getByText("The Editor's own command moved to another key.")).toBeVisible();

  await openOverview(page);
  await grab.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(editorKey).toHaveText('G');
  await grab.getByRole('button', { name: 'Move aside', exact: true }).click();
  await expect(editorKey).toHaveText('ShiftG');
});

test('the Unity preset puts Grab on Shift+G and the menu on Alt+right-click', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  const win = await openOverview(page);
  await win.locator('.it-kbPreset').getByRole('button', { name: 'Unity', exact: true }).click();
  await expect(win.locator('.it-kbPreset .seg.sel')).toHaveText('Unity');
  // Every contested key is the Editor's again, so the table has nothing to offer. Its Keyboard link stays.
  await expect(win.locator('.ct')).toHaveCount(0);
  await win.locator('.plb', { hasText: 'Open' }).first().click();
  await expect(win.locator('.htitle')).toHaveText('Keyboard');

  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
  // G is Cycle Tool Modes, which stepped on to Game Object.
  await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('b');
  for (const key of ['Shift+g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before + 1, 4);

  const box = (await view.boundingBox())!;
  const [x, y] = [box.x + box.width * 0.3, box.y + box.height * 0.3];
  await page.mouse.click(x, y, { button: 'right' });
  await expect(view.getByText('Grid', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view.getByText('Grid', { exact: true })).toHaveCount(0);
  await page.keyboard.down('Alt');
  await page.mouse.click(x, y, { button: 'right' });
  await page.keyboard.up('Alt');
  await expect(view.getByLabel('Search the menu')).toBeVisible();
});

test("Grab's tooltip spells the key the keyboard preset gives it", async ({ page }) => {
  await openScene(page);
  const win = await openOverview(page);
  const card = async (pageName: string, label: string) => {
    await win.locator(`.si[aria-label="${pageName}"]`).click();
    const row = win.locator('.it-sc', { has: page.getByRole('button', { name: 'Shortcut for ' + label }) });
    await page.mouse.move(0, 0);
    await row.locator('.lbl').hover();
    return win.locator('.rtip');
  };
  await expect(await card('Move', 'Shortcut')).toContainText('Press G in the Scene View');
  await win.locator('.si[aria-label="Blendon"]').click();
  await win.locator('.it-kbPreset').getByRole('button', { name: 'Unity', exact: true }).click();
  await expect(await card('Move', 'Shortcut')).toContainText('Press Shift+G in the Scene View');
  // Vertex snap keeps V on both presets.
  await expect(await card('All Tools', 'Hold')).toContainText('Hold V - the gizmo');
});

test('says the Playground is a demo', async ({ page }) => {
  await expect(page.locator('#try').getByRole('note')).toContainText('Demo only');
  await page.goto('playground/');
  await expect(page.getByRole('banner').getByRole('note')).toContainText('Demo only');
});

test("with Blendon off, the Editor's own navigation, keys, menu and gizmo come back", async ({ page }) => {
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  // The window opens on the Tutorial page; the master switch is on the Overview.
  await win.locator('.si[aria-label="Blendon"]').click();
  await win.getByRole('button', { name: 'Enable Blendon', exact: true }).click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(view.getByLabel('Scene gizmo')).toBeVisible();
  await expect(view.getByLabel('Orientation gizmo')).toHaveCount(0);

  // Alt + left drag orbits the pivot.
  const box = (await view.boundingBox())!;
  const x = box.x + box.width * 0.4,
    y = box.y + box.height * 0.35;
  const before = await viewRotation(page);
  await page.keyboard.down('Alt');
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 10, y);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await viewRotation(page)).not.toEqual(before);

  // The Editor's Scale tool answers on Shift+R, where the page starts it, not Blendon's rotate grab.
  await page.keyboard.press('Shift+r');
  await expect(view.getByRole('button', { name: 'Scale Tool' })).toHaveAttribute('aria-pressed', 'true');

  // A right click opens the Editor's own menu.
  await page.mouse.click(x, y, { button: 'right' });
  await expect(view.getByText('Grid', { exact: true })).toBeVisible();
  await expect(view.getByLabel('Search the menu')).toHaveCount(0);
});

test("with the Context Menu off, a right click opens the Editor's menu", async ({ page }) => {
  const view = await openScene(page);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.getByRole('button', { name: 'Context Menu', exact: true }).click();
  await win.getByRole('button', { name: 'Enable Context Menu', exact: true }).click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  const box = (await view.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3, { button: 'right' });
  await expect(view.getByText('Grid', { exact: true })).toBeVisible();
  await expect(view.getByLabel('Search the menu')).toHaveCount(0);
});

test('the camera orbits the cube until the playground is touched', async ({ page }) => {
  const view = await openScene(page, false);
  const a = await viewRotation(page);
  await expect.poll(() => viewRotation(page)).not.toEqual(a);
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  await page.waitForTimeout(100);
  const b = await viewRotation(page);
  await page.waitForTimeout(600);
  expect(await viewRotation(page)).toEqual(b);
  await expect(view).toBeAttached();
});

test.describe("Blendon's tool context", () => {
  const blendonContext = (page: Page) =>
    page.locator('#try [role=application]').getByRole('button', { name: 'Game Object (Blendon)', exact: true });
  const gameObject = gameObjectContext;
  // Tool Settings follows the tool in the slot: Blendon's Pivot Point or Unity's Pivot / Center.
  const blendonPivot = (page: Page) => page.locator('#try [role=application] button[title^="Pivot Point:"]');
  const unityPivot = (page: Page) => page.locator('#try [role=application] button[title="Tool Handle Position"]');

  async function openWindowPage(page: Page, button: string) {
    await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
    const win = page.locator('#try .uw');
    if (button === 'Blendon') await win.locator('.si[aria-label="Blendon"]').click();
    else await win.getByRole('button', { name: button, exact: true }).click();
    return win;
  }

  async function backToScene(page: Page) {
    await page.getByRole('tab', { name: 'Scene', exact: true }).click();
    await expect(page.locator('#try [role=application]')).toBeFocused();
  }

  test('starts in it, and B switches to Game Object and back, from the window too', async ({ page }) => {
    const view = await openScene(page);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(blendonPivot(page)).toBeVisible();
    await view.focus();
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(unityPivot(page)).toBeVisible();
    await page.keyboard.press('b');
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');

    // Toggle Blendon answers in every window, the settings window too.
    const win = await openWindowPage(page, 'Blendon');
    await win.locator('.si[aria-label="Tutorial"]').focus();
    await page.keyboard.press('b');
    await backToScene(page);
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    // The overlay is a switch of its own.
    await blendonContext(page).click();
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test("in Game Object the gizmo keys and the selection drag are Unity's", async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');

    // Shift+G, where the page starts it, is the Editor's Cycle Tool Modes here, not a grab: it steps on to the
    // next context, Blendon's.
    const before = (await positionOf(page, 'Cube'))!;
    const at = await pagePointOf(page, 'Cube');
    await page.mouse.move(at.x, at.y);
    await page.keyboard.press('Shift+g');
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x + i * 10, at.y);
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(before);
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');

    // Shift+R, E and W pick Unity's own tools, each with Unity's Tool Settings.
    for (const [key, name] of [
      ['Shift+r', 'Scale Tool'],
      ['e', 'Rotate Tool'],
      ['w', 'Move Tool'],
    ]) {
      await page.keyboard.press(key);
      await expect(view.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(unityPivot(page)).toBeVisible();
    }

    // A drag draws the Editor's own box: Blendon's highlight never shows, the selection still changes.
    const sphere = await pagePointOf(page, 'Sphere');
    const cube1 = await pagePointOf(page, 'Cube (1)');
    const from = { x: sphere.x - 60, y: sphere.y - 60 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(from.x + ((cube1.x - from.x) * i) / 6, from.y + 120 * (i / 6));
      expect(await highlighted(page)).toEqual([0, 0]);
    }
    await page.mouse.up();
    await expect.poll(() => selectionNames(page)).toContain('Sphere');

    // Back in Blendon's context the same G grabs.
    await page.keyboard.press('b');
    const start = (await positionOf(page, 'Sphere'))!;
    for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
    await expect.poll(async () => (await positionOf(page, 'Sphere'))!.x).toBeCloseTo(start.x + 2, 4);
  });

  test('leaving the context ends a running grab', async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const at = await pagePointOf(page, 'Cube');
    await page.mouse.move(at.x, at.y);
    await view.focus();
    await page.keyboard.press('g');
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x + i * 10, at.y);
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    // Nothing is left following the cursor.
    await page.mouse.move(at.x + 120, at.y + 40);
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(before);
  });

  test('Esc keeps the context, unless Esc Keeps Context is off', async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');

    const win = await openWindowPage(page, 'Blendon');
    const esc = win.getByRole('button', { name: 'Esc Keeps Context', exact: true });
    await esc.scrollIntoViewIfNeeded();
    await esc.click();
    await expect(esc).toHaveAttribute('aria-pressed', 'false');
    await backToScene(page);
    await page.keyboard.press('Escape');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test("a switched-off gizmo leaves Unity's tool in its slot, all of them off leave the context", async ({ page }) => {
    const view = await openScene(page);
    let win = await openWindowPage(page, 'Move');
    await win.getByRole('button', { name: 'Enable Move', exact: true }).click();
    await backToScene(page);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(view.getByRole('button', { name: 'Move Tool' })).toHaveAttribute('aria-pressed', 'true');
    await expect(unityPivot(page)).toBeVisible();
    await page.keyboard.press('e');
    await expect(blendonPivot(page)).toBeVisible();

    // With one tool off the page's switch reads off, so the first click turns all four on.
    win = await openWindowPage(page, 'All Tools');
    const all = win.getByRole('button', { name: 'Enable All Tools', exact: true });
    await all.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await all.click();
    await backToScene(page);
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    // Back on from all off brings the context back.
    win = await openWindowPage(page, 'All Tools');
    await win.getByRole('button', { name: 'Enable All Tools', exact: true }).click();
    await backToScene(page);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test("Tool Settings has Blendon's Pivot Point for its tools and Unity's Pivot / Center outside", async ({ page }) => {
    const view = await openScene(page);
    const items = view.getByRole('menuitemradio');
    await blendonPivot(page).click();
    // Each item after its tick column.
    await expect(items).toHaveText([
      /Center \(Bounding Box\)$/,
      /Median Point$/,
      /Pivot \(Individual Origins\)$/,
      /Active Object$/,
    ]);
    await items.filter({ hasText: 'Pivot (Individual Origins)' }).click();
    await expect(blendonPivot(page)).toHaveAttribute('title', 'Pivot Point: Pivot (Individual Origins)');

    // With the menu off, Blendon's dropdown keeps Unity's two sides.
    const win = await openWindowPage(page, 'All Tools');
    await win.getByRole('button', { name: 'Pivot Point Menu', exact: true }).click();
    await backToScene(page);
    await blendonPivot(page).click();
    await expect(items).toHaveText([/Center$/, /Pivot$/]);

    await view.focus();
    await page.keyboard.press('b');
    await unityPivot(page).click();
    await expect(items).toHaveText([/Pivot$/, /Center$/]);
  });

  test("Hide Gizmo hides Blendon's gizmos in its context and nothing in Game Object", async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    // The Tools pie on Q, Hide Gizmo its sixth item, picked while Q is held. A tap latches the menu only when its
    // first frame comes within the tap timeout, which a software-rendered view can miss.
    await page.keyboard.down('q');
    await page.waitForTimeout(200);
    await page.keyboard.press('6');
    await page.keyboard.up('q');
    const before = (await positionOf(page, 'Cube'))!;
    const dragFrom = async (at: { x: number; y: number }) => {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
      await page.mouse.up();
    };
    await dragFrom(await pagePointOf(page, 'Cube'));
    await page.waitForTimeout(300);
    expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x, 4);

    // Unity's own Move handle stays in Game Object.
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
    await dragFrom(await xArrowPointOf(page, 'Cube'));
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
  });

  test('outside it the tutorial badge asks to switch, and the Tutorial page says why', async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('b');
    const line = view.getByRole('button', { name: 'Switch to Blendon' });
    await expect(line).toBeVisible();
    await line.click();
    const win = page.locator('#try .uw');
    await expect(win.locator('.htitle')).toHaveText('Blendon');
    await expect(win.locator('[data-hl="true"]')).toContainText('Toggle Blendon');
    await win.locator('.si[aria-label="Tutorial"]').click();
    const note = win.getByText('The tasks need the Blendon tool context.', { exact: false });
    await expect(note).toBeVisible();
    // The tasks wait for the context, none is skipped for a key that only rests outside it.
    await expect(win.locator('.tutstat')).toContainText(/^0 of \d+ tasks done/);
    await expect(win.locator('.tutr', { hasText: 'Grab the cube and drop it' })).toContainText('G');
    await note.getByText('Toggle Blendon', { exact: true }).click();
    await expect(win.locator('.htitle')).toHaveText('Blendon');
    await page.keyboard.press('b');
    await backToScene(page);
    await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toBeVisible();
  });
});

test.describe('Undo and Redo', () => {
  interface VisibilityHost {
    sceneHost: { scene: { allObjects(): Iterable<{ name: string; visible: boolean }>; isolation: unknown } };
  }

  const hiddenNames = (page: Page) =>
    page
      .locator('#try [role=application]')
      .evaluate((el: unknown) =>
        [...(el as VisibilityHost).sceneHost.scene.allObjects()].filter((o) => !o.visible).map((o) => o.name),
      );

  const isolated = (page: Page) =>
    page
      .locator('#try [role=application]')
      .evaluate((el: unknown) => !!(el as VisibilityHost).sceneHost.scene.isolation);

  /** Runs an entry of the menu opened over the cube; Shift opens the Editor's own one. */
  async function fromMenu(page: Page, label: string, classic = false) {
    const at = await pagePointOf(page, 'Cube');
    if (classic) await page.keyboard.down('Shift');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    if (classic) await page.keyboard.up('Shift');
    await page.locator('#try [role=application]').getByText(label, { exact: true }).first().click();
  }

  /** Every object but the Cube, in Hierarchy order: what hiding or isolating the Cube leaves hidden. */
  const othersThanCube = (page: Page) =>
    page
      .locator('#try [role=application]')
      .evaluate((el: unknown) =>
        [...(el as VisibilityHost).sceneHost.scene.allObjects()].map((o) => o.name).filter((n) => n !== 'Cube'),
      );

  test('Ctrl+Z shows an object hidden from the context menu, Ctrl+Y hides it again', async ({ page }) => {
    await openScene(page);
    await fromMenu(page, 'Hide');
    await expect.poll(() => hiddenNames(page)).toEqual(['Cube']);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual([]);
    expect(await selectionNames(page)).toEqual(['Cube']);
    await page.keyboard.press('Control+y');
    await expect.poll(() => hiddenNames(page)).toEqual(['Cube']);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual([]);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => hiddenNames(page)).toEqual(['Cube']);
  });

  test("Hide Others, Show All, Isolate View and the Editor's Isolate are undo steps", async ({ page }) => {
    await openScene(page);
    const others = await othersThanCube(page);
    await fromMenu(page, 'Hide Others');
    await expect.poll(() => hiddenNames(page)).toEqual(others);
    await fromMenu(page, 'Show All');
    await expect.poll(() => hiddenNames(page)).toEqual([]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual(others);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual([]);

    await page.keyboard.press('NumpadDivide');
    await expect.poll(() => isolated(page)).toBe(true);
    await page.keyboard.press('Control+z');
    await expect.poll(() => isolated(page)).toBe(false);
    expect(await hiddenNames(page)).toEqual([]);
    await page.keyboard.press('Control+y');
    await expect.poll(() => hiddenNames(page)).toEqual(others);
    // Leaving is a step too: undoing it isolates again.
    await page.keyboard.press('NumpadDivide');
    await expect.poll(() => isolated(page)).toBe(false);
    await page.keyboard.press('Control+z');
    await expect.poll(() => isolated(page)).toBe(true);
    await page.keyboard.press('NumpadDivide');
    await expect.poll(() => isolated(page)).toBe(false);

    await fromMenu(page, 'Isolate', true);
    await expect.poll(() => hiddenNames(page)).toEqual(others);
    await page.keyboard.press('Control+z');
    await expect.poll(() => isolated(page)).toBe(false);
    expect(await hiddenNames(page)).toEqual([]);
  });

  test('a click after an edit is an undo step of its own', async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    await view.focus();
    for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x + 2, 4);
    // Empty floor: the click clears the selection.
    const box = (await view.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.75);
    await expect.poll(() => selectionNames(page)).toEqual([]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
    expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x + 2, 4);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x, 4);
  });

  test("Ctrl+Z under Unity's held Move handle waits for the release, then undoes the whole drag", async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('b');
    await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
    const before = (await positionOf(page, 'Cube'))!;
    const at = await xArrowPointOf(page, 'Cube');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
    const held = await positionOf(page, 'Cube');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(held);
    for (let i = 7; i <= 10; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
    await page.mouse.up();
    const after = await positionOf(page, 'Cube');
    await page.keyboard.press('Control+z');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    await page.keyboard.press('Control+y');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(after);
  });

  test("the Editor's own box select is one undo step", async ({ page }) => {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('b');
    await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
    const [sphere, tilted, cube1] = await Promise.all(
      ['Sphere', 'Tilted Cube', 'Cube (1)'].map((n) => pagePointOf(page, n)),
    );
    const from = { x: Math.min(sphere.x, tilted.x) - 60, y: Math.min(sphere.y, cube1.y) - 50 };
    const to = { x: cube1.x + 40, y: tilted.y + 50 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
    await page.mouse.up();
    await expect.poll(() => selectionNames(page)).toContain('Cube (1)');
    expect(await selectionNames(page)).not.toContain('Cube');
    await page.keyboard.press('Control+z');
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
  });

  test("H and Shift+H hide and isolate the selection with its children, as Unity's keys do", async ({ page }) => {
    await openScene(page);
    const others = await othersThanCube(page);
    await page.keyboard.press('h');
    await expect.poll(() => hiddenNames(page)).toEqual(['Cube']);
    await page.keyboard.press('h');
    await expect.poll(() => hiddenNames(page)).toEqual([]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual(['Cube']);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hiddenNames(page)).toEqual([]);
    await page.keyboard.press('Shift+h');
    await expect.poll(() => isolated(page)).toBe(true);
    await expect.poll(async () => (await hiddenNames(page)).sort()).toEqual([...others].sort());
    await page.keyboard.press('Shift+h');
    await expect.poll(() => isolated(page)).toBe(false);
    await expect.poll(() => hiddenNames(page)).toEqual([]);
  });
});

test.describe('Escape and vertex snapping', () => {
  const blendonContext = (page: Page) =>
    page.locator('#try [role=application]').getByRole('button', { name: 'Game Object (Blendon)', exact: true });

  interface Corner {
    world: Vec3;
    page: { x: number; y: number };
  }

  interface MeshObject {
    name: string;
    mesh: { vertices: Vec3[] } | null;
    transform: { position: Vec3; localToWorldMatrix: { multiplyPoint3x4(p: Vec3): Vec3 } };
  }

  /** Where a world point is on the page. */
  function pageOf(page: Page, world: Vec3) {
    return page.locator('#try [role=application]').evaluate((el: unknown, w) => {
      const h = (el as HostElement).sceneHost;
      const v = h.view;
      const make = [...h.scene.allObjects()][0].transform.position.constructor as new (
        x: number,
        y: number,
        z: number,
      ) => Vec3;
      const s = v.camera.worldToScreenPoint(new make(w.x, w.y, w.z));
      const r = h.root.getBoundingClientRect();
      return { x: r.left + s.x / v.pixelsPerPoint, y: r.top + (v.camera.pixelHeight - s.y) / v.pixelsPerPoint };
    }, world);
  }

  /** The named object's distinct mesh corners above its pivot, in world space and on the page. */
  async function topCornersOf(page: Page, name: string): Promise<Corner[]> {
    const worlds = await page.locator('#try [role=application]').evaluate((el: unknown, n) => {
      const all = (el as HostElement).sceneHost.scene.allObjects() as unknown as Iterable<MeshObject>;
      const go = [...all].find((o) => o.name === n)!;
      const m = go.transform.localToWorldMatrix;
      const seen = new Map<string, Vec3>();
      for (const v of go.mesh!.vertices) {
        const w = m.multiplyPoint3x4(v);
        if (w.y > go.transform.position.y) seen.set([w.x, w.y, w.z].map((c) => c.toFixed(4)).join(), w);
      }
      return [...seen.values()].map((w) => ({ x: w.x, y: w.y, z: w.z }));
    }, name);
    return Promise.all(worlds.map(async (world) => ({ world, page: await pageOf(page, world) })));
  }

  const nearest = (corners: Corner[], to: { x: number; y: number }) =>
    [...corners].sort(
      (a, b) => Math.hypot(a.page.x - to.x, a.page.y - to.y) - Math.hypot(b.page.x - to.x, b.page.y - to.y),
    )[0];

  test('Esc cancels a Move arrow drag and keeps the context', async ({ page }) => {
    await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const at = await pagePointOf(page, 'Cube');
    const xEnd = await pageOf(page, { ...before, x: before.x + 1 });
    const length = Math.hypot(xEnd.x - at.x, xEnd.y - at.y);
    const dir = { x: (xEnd.x - at.x) / length, y: (xEnd.y - at.y) / length };
    // Past the screen ring, short of the cone: the X arrow's shaft.
    const from = { x: at.x + dir.x * 45, y: at.y + dir.y * 45 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + dir.x * i * 10, from.y + dir.y * i * 10);
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
    const moving = (await positionOf(page, 'Cube'))!;
    expect([moving.y, moving.z]).toEqual([before.y, before.z]);
    await page.keyboard.press('Escape');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    // The rest of the gesture moves nothing.
    await page.mouse.move(from.x + dir.x * 90, from.y + dir.y * 90);
    await page.mouse.up();
    expect(await positionOf(page, 'Cube')).toEqual(before);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Esc cancels a grab', async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const at = await pagePointOf(page, 'Cube');
    await page.mouse.move(at.x + 40, at.y + 40);
    await view.focus();
    await page.keyboard.press('g');
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x + 40 + i * 10, at.y + 40);
    await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).not.toBeCloseTo(before.x, 2);
    await page.keyboard.press('Escape');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    await page.mouse.move(at.x + 160, at.y + 60);
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(before);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Esc cancels a box select and keeps the selection', async ({ page }) => {
    await openScene(page);
    const sphere = await pagePointOf(page, 'Sphere');
    const cube1 = await pagePointOf(page, 'Cube (1)');
    const from = { x: sphere.x - 60, y: sphere.y - 60 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((cube1.x - from.x) * i) / 6, from.y + 120 * (i / 6));
    await expect.poll(async () => (await highlighted(page))[0]).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => highlighted(page)).toEqual([0, 0]);
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await selectionNames(page)).toEqual(['Cube']);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Esc cancels an Orientation Gizmo drag', async ({ page }) => {
    const view = await openScene(page);
    const box = (await view.getByLabel('Orientation gizmo').boundingBox())!;
    const at = { x: box.x + box.width / 2 + 5, y: box.y + box.height / 2 + 5 };
    const before = await viewRotation(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(at.x + i * 6, at.y + i * 2);
    await expect.poll(() => viewRotation(page)).not.toEqual(before);
    await page.keyboard.press('Escape');
    await expect.poll(() => viewRotation(page)).toEqual(before);
    await page.mouse.up();
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test("V carries the Cube's vertex onto a vertex of another object", async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const grab = nearest(await topCornersOf(page, 'Cube'), await pagePointOf(page, 'Cube (1)'));
    const onto = nearest(await topCornersOf(page, 'Cube (1)'), await pagePointOf(page, 'Cube'));
    await view.focus();
    await page.mouse.move(grab.page.x + 4, grab.page.y + 4);
    await page.keyboard.down('v');
    // The gizmo's square stands on the vertex nearest the cursor; the press lands inside it.
    await page.mouse.move(grab.page.x + 2, grab.page.y + 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++)
      await page.mouse.move(
        grab.page.x + ((onto.page.x + 3 - grab.page.x) * i) / 12,
        grab.page.y + ((onto.page.y + 3 - grab.page.y) * i) / 12,
      );
    await page.mouse.up();
    await page.keyboard.up('v');
    const after = (await positionOf(page, 'Cube'))!;
    for (const k of ['x', 'y', 'z'] as const)
      expect(grab.world[k] + after[k] - before[k]).toBeCloseTo(onto.world[k], 4);
  });

  test('a right click leaves pick mode without opening a menu, the next one opens it', async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const corner = nearest(await topCornersOf(page, 'Cube'), await pagePointOf(page, 'Cube (1)'));
    const box = (await view.boundingBox())!;
    const empty = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 };
    await view.focus();
    await page.keyboard.press('Shift+V');
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await page.waitForTimeout(300);
    await expect(view.getByLabel('Search the menu')).toHaveCount(0);
    // Out of the mode, a click near the corner settles nothing and a scale keeps the Cube's own pivot.
    await page.mouse.click(corner.page.x + 4, corner.page.y + 4);
    await page.waitForTimeout(200);
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
    for (const key of ['s', '2', 'Enter']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(before);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await expect(view.getByLabel('Search the menu')).toBeVisible();
  });

  test('Shift+V settles a virtual pivot that a scale turns about, and Esc leaves it', async ({ page }) => {
    const view = await openScene(page);
    const before = (await positionOf(page, 'Cube'))!;
    const corner = nearest(await topCornersOf(page, 'Cube'), await pagePointOf(page, 'Cube (1)'));
    await view.focus();
    await page.keyboard.press('Shift+V');
    await page.mouse.move(corner.page.x + 4, corner.page.y + 4);
    await page.mouse.click(corner.page.x + 4, corner.page.y + 4);
    for (const key of ['s', '2', 'Enter']) await page.keyboard.press(key);
    // Scaled about the settled corner: the corner stays and the centre doubles its distance from it.
    await expect
      .poll(async () => (await positionOf(page, 'Cube'))!.x)
      .toBeCloseTo(corner.world.x + 2 * (before.x - corner.world.x), 3);
    const scaled = (await positionOf(page, 'Cube'))!;
    expect(scaled.z).toBeCloseTo(corner.world.z + 2 * (before.z - corner.world.z), 3);

    // Out of the mode the selection's own pivot is back: halving moves nothing.
    await page.keyboard.press('Escape');
    for (const key of ['s', '.', '5', 'Enter']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect(await positionOf(page, 'Cube')).toEqual(scaled);
    await expect(blendonContext(page)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe("Unity's own tools in Game Object", () => {
  interface MeshObject {
    name: string;
    mesh: { vertices: Vec3[] } | null;
    transform: { position: Vec3; rotation: Vec3 & { w: number }; transformPoint(p: Vec3): Vec3 };
  }
  interface MeshHost {
    sceneHost: {
      root: HostElement['sceneHost']['root'];
      view: HostElement['sceneHost']['view'];
      scene: { allObjects(): Iterable<MeshObject> };
    };
  }

  async function inGameObject(page: Page) {
    const view = await openScene(page);
    await view.focus();
    await page.keyboard.press('b');
    await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
    return view;
  }

  /** A drag of the left button in steps, with a key held through it. */
  async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, key?: string) {
    if (key) await page.keyboard.down(key);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (by.x * i) / 8, from.y + (by.y * i) / 8);
    await page.mouse.up();
    if (key) await page.keyboard.up(key);
  }

  /** Each of the object's corners where it is on the page, with where it is in the world. */
  const cornersOf = (page: Page, name: string) =>
    page.locator('#try [role=application]').evaluate((el: unknown, n) => {
      const h = (el as MeshHost).sceneHost;
      const v = h.view;
      const r = h.root.getBoundingClientRect();
      const go = [...h.scene.allObjects()].find((o) => o.name === n)!;
      return go.mesh!.vertices.map((p) => {
        const w = go.transform.transformPoint(p);
        const s = v.camera.worldToScreenPoint(w);
        const page = { x: r.left + s.x / v.pixelsPerPoint, y: r.top + (v.camera.pixelHeight - s.y) / v.pixelsPerPoint };
        return { page, world: { x: w.x, y: w.y, z: w.z } };
      });
    }, name);

  const unchanged = (a: Vec3, b: Vec3) => ['x', 'y', 'z'].filter((k) => Math.abs(a[k as 'x'] - b[k as 'x']) < 1e-5);

  test('the Move handle has nothing in its middle: a drag from the pivot keeps to an arrow or a plane', async ({
    page,
  }) => {
    await inGameObject(page);
    const before = (await positionOf(page, 'Cube'))!;
    await drag(page, await pagePointOf(page, 'Cube'), { x: -60, y: 30 });
    const after = (await positionOf(page, 'Cube'))!;
    expect(after).not.toEqual(before);
    expect(unchanged(before, after).length).toBeGreaterThan(0);

    // Shift shows the Editor's free-move square there, which slides on the camera's plane.
    await page.keyboard.press('Control+z');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    await drag(page, await pagePointOf(page, 'Cube'), { x: -60, y: 30 }, 'Shift');
    expect(unchanged(before, (await positionOf(page, 'Cube'))!)).toEqual([]);
  });

  test('V, held or toggled with Shift+V, drags a corner onto the nearest corner of another object', async ({
    page,
  }) => {
    await inGameObject(page);
    const target = await cornersOf(page, 'Cube (1)');
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    // The cube's corner nearest Cube (1) on the page, dropped on Cube (1)'s corner nearest to it.
    const snapDrag = async (key?: string) => {
      const own = await cornersOf(page, 'Cube');
      const from = own.reduce((a, b) => (dist(a.page, target[0].page) < dist(b.page, target[0].page) ? a : b));
      const to = target.reduce((a, b) => (dist(a.page, from.page) < dist(b.page, from.page) ? a : b));
      await page.mouse.move(from.page.x + 30, from.page.y + 30);
      if (key) await page.keyboard.down(key);
      await drag(page, from.page, { x: to.page.x - from.page.x, y: to.page.y - from.page.y });
      if (key) await page.keyboard.up(key);
      const moved = await cornersOf(page, 'Cube');
      return Math.min(
        ...moved.map((c) => Math.hypot(c.world.x - to.world.x, c.world.y - to.world.y, c.world.z - to.world.z)),
      );
    };
    expect(await snapDrag('v')).toBeLessThan(1e-4);
    await page.keyboard.press('Control+z');
    // Shift+V keeps it on until pressed again.
    await page.keyboard.press('Shift+V');
    expect(await snapDrag()).toBeLessThan(1e-4);
    await page.keyboard.press('Shift+V');
  });

  test("Escape mid-box puts the selection from before Unity's box back", async ({ page }) => {
    await inGameObject(page);
    expect(await selectionNames(page)).toEqual(['Cube']);
    const sphere = await pagePointOf(page, 'Sphere');
    const from = { x: sphere.x - 60, y: sphere.y - 60 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + i * 20, from.y + i * 20);
    await expect.poll(() => selectionNames(page)).toContain('Sphere');
    await page.keyboard.press('Escape');
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
    await page.mouse.move(from.x + 160, from.y + 160);
    await page.mouse.up();
    expect(await selectionNames(page)).toEqual(['Cube']);
    await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('Escape mid-drag puts a move and a turn back and lets go of the handle', async ({ page }) => {
    const view = await inGameObject(page);
    const before = (await positionOf(page, 'Cube'))!;
    const at = await pagePointOf(page, 'Cube');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x - i * 10, at.y + i * 4);
    await expect.poll(() => positionOf(page, 'Cube')).not.toEqual(before);
    await page.keyboard.press('Escape');
    await expect.poll(() => positionOf(page, 'Cube')).toEqual(before);
    // The handle let go: the rest of the drag moves nothing.
    for (let i = 7; i <= 10; i++) await page.mouse.move(at.x - i * 10, at.y + i * 4);
    await page.mouse.up();
    expect(await positionOf(page, 'Cube')).toEqual(before);
    // The Editor's own context has nothing to step back to on Escape.
    await expect(gameObjectContext(page)).toHaveAttribute('aria-pressed', 'true');

    // The view ring of the Rotate tool, 1.1 handle sizes (88 points) out.
    await page.keyboard.press('e');
    await expect(view.getByRole('button', { name: 'Rotate Tool', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const rotation = () =>
      view.evaluate((el: unknown) => {
        const go = [...(el as MeshHost).sceneHost.scene.allObjects()].find((o) => o.name === 'Cube')!;
        const q = go.transform.rotation;
        return [q.x, q.y, q.z, q.w];
      });
    const turned = await rotation();
    await page.mouse.move(at.x + 88, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(at.x + 88, at.y + i * 10);
    await expect.poll(rotation).not.toEqual(turned);
    await page.keyboard.press('Escape');
    await expect.poll(rotation).toEqual(turned);
    await page.mouse.up();
  });
});
