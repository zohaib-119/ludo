import { type Browser, type Page, expect, test } from '@playwright/test';

async function player(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((n) => {
    if (!localStorage.getItem('dodice.profile'))
      localStorage.setItem('dodice.profile', JSON.stringify({ name: n, avatar: '🦊' }));
  }, name);
  return { ctx, page: await ctx.newPage() };
}

async function hostWithBots(browser: Browser, mySeat: string, bots: string[], rules?: (p: Page) => Promise<void>) {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('seat-board')).toBeVisible();
  await host.page
    .getByTestId(`seat-${mySeat}`)
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  for (const c of bots) await host.page.getByTestId(`add-bot-${c}`).click();
  if (rules) await rules(host.page);
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByTestId('action-area')).toBeVisible();
  return host;
}

/** Play whatever the local player can do right now; returns true if it did something. */
async function actOnce(page: Page): Promise<boolean> {
  const roll = page.getByTestId('roll-button');
  if (await roll.isVisible().catch(() => false)) {
    await roll.click();
    return true;
  }
  const movable = page.locator('[data-movable=true]');
  if ((await movable.count()) > 0) {
    await movable.first().click();
    const choice = page.locator('[data-testid^=choice-]');
    if ((await choice.count()) > 0) await choice.first().click();
    return true;
  }
  return false;
}

test('playing turns against bots: roll, dice, move', async ({ browser }) => {
  test.setTimeout(150_000);
  const host = await hostWithBots(browser, 'red', ['green', 'yellow', 'blue']);
  const page = host.page;
  // Wait for our turn (the first player is random), then roll.
  await expect(page.getByTestId('roll-button')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('roll-button').click();
  await expect(page.getByTestId('die').first()).toHaveAttribute('data-value', /[1-6]/);
  // Record every change of turn inside the page (bots are fast in tests; polling could miss them).
  await page.evaluate(() => {
    const w = window as unknown as { __seats: string[] };
    w.__seats = [];
    const area = document.querySelector('[data-testid=action-area]')!;
    new MutationObserver(() => w.__seats.push(area.getAttribute('data-seat') ?? '')).observe(area, {
      attributes: true,
      attributeFilter: ['data-seat'],
    });
  });
  // Keep playing our turns until one of our pieces is on the board and a bot has taken a turn.
  await expect(async () => {
    await actOnce(page);
    const progresses = await page
      .locator('[data-testid^=piece-red-]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-progress'))));
    expect(progresses.some((p) => p >= 0)).toBe(true);
    const seats = await page.evaluate(() => (window as unknown as { __seats: string[] }).__seats);
    expect(seats.some((s) => s !== 'red')).toBe(true);
  }).toPass({ timeout: 120_000, intervals: [400] });
  // Bots really took turns and the turn came back to us.
  await expect(page.getByTestId('panel-red')).toBeVisible();
});

test('a full game on autoplay ends in results; play again starts a new game', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await hostWithBots(browser, 'yellow', ['red', 'green', 'blue']);
  const page = host.page;
  await page.getByTestId('game-menu').click();
  await page.getByRole('switch', { name: 'Auto mode' }).click();
  // Turning it on closes the menu; no bar appears, and the menu shows it on.
  await expect(page.getByRole('switch', { name: 'Auto mode' })).toBeHidden();
  await expect(page.getByTestId('im-back')).toHaveCount(0);
  await page.getByTestId('game-menu').click();
  await expect(page.getByRole('switch', { name: 'Auto mode' })).toBeChecked();
  await page.keyboard.press('Escape');
  const results = page.getByTestId('results');
  await expect(results).toBeVisible({ timeout: 180_000 });
  await expect(results).toContainText('wins!');
  await expect(results.getByRole('table')).toContainText('Zohaib');
  await page.getByTestId('play-again').click();
  await expect(results).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('action-area')).toBeVisible();
  // Control is ours again in the new game (autoplay resets).
  await page.getByTestId('game-menu').click();
  await expect(page.getByRole('switch', { name: 'Auto mode' })).not.toBeChecked();
});

test('the host can end a game early and go back to the lobby', async ({ browser }) => {
  const host = await hostWithBots(browser, 'red', ['yellow']);
  const page = host.page;
  await page.getByTestId('game-menu').click();
  await page.getByRole('button', { name: 'End game for everyone' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  const results = page.getByTestId('results');
  await expect(results).toContainText('The host ended the game early.');
  await results.getByRole('button', { name: 'Back to lobby' }).click();
  await expect(page.getByTestId('seat-board')).toBeVisible();
  await expect(page.getByTestId('seat-yellow')).toContainText('Bot');
});

test('when a player drops, others see who we wait for, and the host can let the bot play', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('seat-board')).toBeVisible();
  const code = host.page.url().split('/r/')[1]!;
  await host.page
    .getByTestId('seat-red')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  // Takeover "never": the game must wait for Sara until the host steps in.
  await host.page
    .getByRole('radiogroup', { name: 'Bot for offline players' })
    .getByRole('radio', { name: 'Never' })
    .click();
  const guest = await player(browser, 'Sara');
  await guest.page.goto(`/r/${code}`);
  await guest.page
    .getByTestId('seat-yellow')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await guest.page.getByTestId('ready-button').click();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(guest.page.getByTestId('action-area')).toBeVisible();
  await guest.ctx.close(); // Sara's browser goes away

  // Play our turns until it's Sara's; then the game waits for her.
  const notice = host.page.getByText('Waiting for Sara (offline)');
  await expect(async () => {
    await actOnce(host.page);
    await expect(notice).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 60_000, intervals: [500] });
  await host.page.getByRole('button', { name: 'Let bot play' }).first().click();
  await expect(notice).toBeHidden();
  await expect(host.page.getByTestId('panel-yellow')).toContainText('Bot');
});
