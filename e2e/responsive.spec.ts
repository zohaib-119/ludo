import { type Page, expect, test } from '@playwright/test';

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

/** Nothing may stick out past the right edge: the page must never scroll sideways. */
async function noSidewaysScroll(page: Page, where: string) {
  await page.waitForTimeout(300); // let sheets and layout animations settle
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${where} is wider than the screen`).toBeLessThanOrEqual(clientWidth);
}

for (const width of [320, 360])
  test(`fits a ${width}px phone on every screen, with the Share button real phones have`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 760 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Muhammad Zohaib', avatar: 'toonHead:Rayan' }));
      // Real phones have the system share sheet, which adds a fourth share button.
      (navigator as unknown as { share: unknown }).share = async () => {};
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await noSidewaysScroll(page, 'home');
    await page.getByTestId('open-create').click();
    await noSidewaysScroll(page, 'create dialog');
    await page.getByTestId('create-submit').click();
    await expect(page.getByTestId('seat-board')).toBeVisible();
    await expect(page.getByTestId('share-actions').getByRole('button')).toHaveCount(4);
    await noSidewaysScroll(page, 'lobby');
    await page
      .getByTestId('seat-red')
      .getByRole('button', { name: /Tap to sit/ })
      .click();
    for (const c of ['green', 'yellow', 'blue']) await page.getByTestId(`add-bot-${c}`).click();
    await noSidewaysScroll(page, 'full lobby');
    await page.getByTestId('appearance-button').click();
    await noSidewaysScroll(page, 'themes');
    await page.keyboard.press('Escape');
    await page.getByTestId('chat-button').click();
    await noSidewaysScroll(page, 'chat');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.getByTestId('action-area')).toBeVisible();
    await noSidewaysScroll(page, 'game');
    await page.getByTestId('game-menu').click();
    await noSidewaysScroll(page, 'game menu');
    await page.goto('/how-to-play');
    await noSidewaysScroll(page, 'how to play');
  });
