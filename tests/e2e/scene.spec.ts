import { expect, type Page, test } from '@playwright/test';

let errors: string[] = [];

// The view needs WebGL, which only Chromium's headless build has everywhere CI runs.
test.skip(({ browserName }) => browserName !== 'chromium', 'WebGL Scene view: Chromium only');

async function openScene(page: Page) {
  await page.locator('#try').scrollIntoViewIfNeeded();
  const view = page.locator('#try [role=application]');
  await expect(view.locator('canvas').first()).toBeVisible();
  // The host is attached once the scene is built.
  await expect.poll(() => view.evaluate((el: unknown) => !!(el as Partial<HostElement>).sceneHost)).toBe(true);
  return view;
}

interface HostElement {
  sceneHost: {
    scene: { allObjects(): Iterable<{ name: string; transform: { position: { x: number; y: number; z: number } } }> };
  };
}

/** The named object's world position, read from the running scene. */
function positionOf(page: Page, name: string) {
  return page.locator('#try [role=application]').evaluate((el: unknown, n) => {
    const go = [...(el as HostElement).sceneHost.scene.allObjects()].find((o) => o.name === n);
    return go ? { x: go.transform.position.x, y: go.transform.position.y, z: go.transform.position.z } : null;
  }, name);
}

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
  await page.locator('#playground').scrollIntoViewIfNeeded();
  const win = page.locator('#playground .uw');
  await win.getByRole('button', { name: 'Move', exact: true }).click();
  const enable = win.getByRole('button', { name: 'Enable Move' });
  await enable.click();
  await expect(enable).toHaveAttribute('aria-pressed', 'false');

  const before = (await positionOf(page, 'Cube'))!.x;
  await view.focus();
  for (const key of ['g', 'x', '2', 'Enter']) await page.keyboard.press(key);
  await page.waitForTimeout(1500);
  expect((await positionOf(page, 'Cube'))!.x).toBeCloseTo(before, 4);
});
