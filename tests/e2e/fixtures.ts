import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

// CI's WebKit composites in software and freezes (or crashes) while a reveal's blur still runs: the "rise"
// transition and the "stagger" rise keyframes. No test is about that blur, so WebKit runs without it.
const NO_REVEAL_BLUR = `addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style');
  s.textContent = "[data-reveal='rise'], [data-reveal='stagger'] > * { filter: none !important; }";
  document.head.append(s);
});`;

export const test = base.extend<{ noRevealBlur: void }>({
  noRevealBlur: [
    async ({ page, browserName }, use) => {
      if (browserName === 'webkit') await page.addInitScript({ content: NO_REVEAL_BLUR });
      await use();
    },
    { auto: true },
  ],
});
