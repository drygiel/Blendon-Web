import { expect, test } from '@playwright/test';

test('page renders', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blendon');
});
