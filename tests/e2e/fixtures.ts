import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

// CI's WebKit composites in software and freezes on a click once the "rise" reveal's blur can still
// transition; no test is about that blur, so WebKit runs without it.
const NO_RISE_BLUR = `addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style');
  s.textContent = "[data-reveal='rise'] { filter: none !important; }";
  document.head.append(s);
});`;

export const test = base.extend<{ noRiseBlur: void }>({
  noRiseBlur: [
    async ({ page, browserName }, use) => {
      if (browserName === 'webkit') await page.addInitScript({ content: NO_RISE_BLUR });
      await use();
    },
    { auto: true },
  ],
});
