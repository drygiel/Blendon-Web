import { test as base, type Page } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

/**
 * Off Chromium, CI's WebGL is missing (Firefox) or software-rendered slow enough to stall the page (WebKit).
 * For tests about the settings window: the Scene view falls back to its poster there.
 */
export async function noWebGlOffChromium(page: Page, browserName: string) {
  if (browserName === 'chromium') return;
  await page.addInitScript(() => {
    type Canvas = { prototype: { getContext: (this: unknown, id: string, ...rest: unknown[]) => unknown } };
    const proto = (globalThis as unknown as { HTMLCanvasElement: Canvas }).HTMLCanvasElement.prototype;
    const getContext = proto.getContext;
    proto.getContext = function (id, ...rest) {
      return id.startsWith('webgl') ? null : getContext.call(this, id, ...rest);
    };
  });
}

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
