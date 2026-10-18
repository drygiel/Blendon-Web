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

test("the badge opens the checklist, then names the next task with the feature's clip", async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Blendon Tutorial' }).click();
  const win = page.locator('#try .uw');
  await expect(win.locator('.htitle')).toHaveText('Tutorial');
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  const line = view.getByRole('button', { name: 'Orbit the view' });
  await line.hover();
  const tip = view.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('video')).toHaveAttribute('src', /OrbitSelected\.mp4$/);
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

test('grabs the selection by a typed distance and undoes it', async ({ page }) => {
  const view = await openScene(page);
  const before = await positionOf(page, 'Cube');
  await view.focus();
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before!.x + 2, 4);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before!.x, 4);
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
  await view.focus();
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

test("with Move switched off, G is the Editor's Cycle Tool Modes again", async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  const win = await openOverview(page);
  const grab = contestedRow(page, 'Grab');
  await expect(grab.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  await win.locator('.si[aria-label="Move"]').click();
  await win.getByRole('button', { name: 'Enable Move' }).click();
  await win.locator('.si[aria-label="Blendon"]').click();
  // Free: nothing is covered, so there is nothing to move.
  await expect(grab.getByRole('button')).toHaveCount(0);
  await grab.hover();
  await expect(win.locator('.rtip')).toContainText('or switched off, so the Editor keeps G');

  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(800);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
  await expect(view.getByText('Blendon answers this key here')).toHaveCount(0);
});

test('Move puts Cycle Tool Modes on Shift+G, and Reset gives it G back', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  await openOverview(page);
  const grab = contestedRow(page, 'Grab');
  const editorKey = grab.locator('.ctk').nth(1);
  await expect(editorKey).toHaveText('G');
  await grab.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(editorKey).toHaveText('ShiftG');
  await expect(grab.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();

  // Shift+G is the Editor's command now, G still Blendon's grab, and the tip says where the command went.
  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['Shift+g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  await expect.poll(async () => (await positionOf(page, 'Cube'))!.x).toBeCloseTo(before + 1, 4);
  await expect(view.getByText('Blendon owns this shortcut now')).toBeVisible();
  await expect(view.getByText("The Editor's own command moved to another key.")).toBeVisible();

  await openOverview(page);
  await grab.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(editorKey).toHaveText('G');
  await expect(grab.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
});

test('the Unity preset puts Grab on Shift+G and the menu on Alt+right-click', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  const win = await openOverview(page);
  await win.locator('.it-kbPreset').getByRole('button', { name: 'Unity', exact: true }).click();
  await expect(win.locator('.it-kbPreset .seg.sel')).toHaveText('Unity');
  const grab = contestedRow(page, 'Grab');
  await expect(grab.locator('.ctk').first()).toHaveText('ShiftG');
  await expect(grab.locator('.ctk').nth(1)).toHaveText('G');
  await expect(grab.getByRole('button')).toHaveCount(0);

  const before = (await positionOf(page, 'Cube'))!.x;
  await toScene(page);
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
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

test("Vertex Snap's tooltip spells the key the keyboard preset gives it", async ({ page }) => {
  await openScene(page);
  const win = await openOverview(page);
  const hold = async () => {
    await win.locator('.si[aria-label="All Tools"]').click();
    const row = win.locator('.it-sc', { has: page.getByRole('button', { name: 'Shortcut for Hold' }) });
    await page.mouse.move(0, 0);
    await row.locator('.lbl').hover();
    return win.locator('.rtip');
  };
  await expect(await hold()).toContainText('Hold V - the gizmo');
  await win.locator('.si[aria-label="Blendon"]').click();
  await win.locator('.it-kbPreset').getByRole('button', { name: 'Unity', exact: true }).click();
  await expect(await hold()).toContainText('Hold Alt+V - the gizmo');
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

  // R is the Editor's Scale tool again, not Blendon's rotate grab.
  await page.keyboard.press('r');
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
  const gameObject = (page: Page) =>
    page.locator('#try [role=application]').getByRole('button', { name: 'Game Object (Default)', exact: true });
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

    // G is not a grab here.
    const before = (await positionOf(page, 'Cube'))!;
    for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
    await page.waitForTimeout(800);
    expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x, 4);

    // R, E and W pick Unity's own tools, each with Unity's Tool Settings.
    for (const [key, name] of [
      ['r', 'Scale Tool'],
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
    // The Tools pie on Q, Hide Gizmo its sixth item.
    await page.keyboard.press('q');
    await page.keyboard.press('6');
    const before = (await positionOf(page, 'Cube'))!;
    const dragFromPivot = async () => {
      const at = await pagePointOf(page, 'Cube');
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(at.x - i * 8, at.y + i * 2);
      await page.mouse.up();
    };
    await dragFromPivot();
    await page.waitForTimeout(300);
    expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before.x, 4);

    // Unity's own Move handle stays in Game Object.
    await page.keyboard.press('b');
    await expect(gameObject(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => selectionNames(page)).toEqual(['Cube']);
    await dragFromPivot();
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
    await note.getByText('Toggle Blendon', { exact: true }).click();
    await expect(win.locator('.htitle')).toHaveText('Blendon');
    await page.keyboard.press('b');
    await backToScene(page);
    await expect(view.getByRole('button', { name: 'Blendon Tutorial' })).toBeVisible();
  });
});
