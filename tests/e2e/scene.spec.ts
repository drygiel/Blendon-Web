import { expect, type Page, test } from './fixtures.ts';

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

test('loads the Scene view with the tutorial card', async ({ page }) => {
  const view = await openScene(page);
  await expect(view.getByText('Navigating the View')).toBeVisible();
  await expect(view.getByLabel('Orientation gizmo')).toBeVisible();
});

test("a tutorial row's hover card shows the feature's clip", async ({ page }) => {
  const view = await openScene(page);
  await view.getByText('Orbit around your selection').hover();
  const tip = view.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('video')).toHaveAttribute('src', /OrbitSelected\.mp4$/);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
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
  await view.getByRole('button', { name: 'Skip Tutorial' }).click();
  await expect(view.getByText('Navigating the View')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset the scene and every setting' }).click();
  await expect(view.getByText('Navigating the View')).toBeVisible();
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
  await view.getByRole('button', { name: 'Skip Tutorial' }).click();
  await page.getByRole('tab', { name: 'Blendon', exact: true }).click();
  const win = page.locator('#try .uw');
  await win.getByRole('button', { name: /Start Over/ }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Start Over', exact: true }).click();
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  await expect(view.getByText('Navigating the View')).toBeVisible();
});

test('the first press of a key the Editor gave up explains it once', async ({ page }) => {
  const view = await openScene(page);
  await view.getByRole('button', { name: 'Skip the tutorial' }).click();
  await view.getByRole('button', { name: 'Skip Tutorial' }).click();
  await view.focus();
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  const card = view.getByText('Blendon owns this shortcut now');
  await expect(card).toBeVisible();
  await expect(view.getByText('Cycle Tool Modes')).toBeVisible();
  await view.getByRole('button', { name: 'Open in Blendon' }).click();
  await expect(page.locator('#try .uw [data-hl="true"]')).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Scene', exact: true }).click();
  for (const key of ['g', 'x', '1', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(800);
  await expect(card).toHaveCount(0);
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
