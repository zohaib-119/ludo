import { type Browser, expect, test } from '@playwright/test';

async function player(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((n) => {
    if (!localStorage.getItem('dodice.profile'))
      localStorage.setItem('dodice.profile', JSON.stringify({ name: n, avatar: '🦊' }));
  }, name);
  return { ctx, page: await ctx.newPage() };
}

test('chat and reactions reach the other players, in the lobby and in the game', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByRole('button', { name: 'Create game' }).click();
  await expect(host.page.getByTestId('seat-board')).toBeVisible();
  const code = host.page.url().split('/r/')[1]!;
  const guest = await player(browser, 'Sara');
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByTestId('seat-board')).toBeVisible();

  // Lobby chat: unread badge for the host, message in the sheet.
  await guest.page.getByTestId('chat-button').click();
  await guest.page.getByTestId('chat-input').fill('salam! ready?');
  await guest.page.keyboard.press('Enter');
  await expect(guest.page.getByTestId('chat-log')).toContainText('salam! ready?');
  await expect(host.page.getByTestId('chat-unread')).toHaveText('1');
  await host.page.getByTestId('chat-button').click();
  await expect(host.page.getByTestId('chat-log')).toContainText('Sara');
  await expect(host.page.getByTestId('chat-log')).toContainText('salam! ready?');
  await expect(host.page.getByTestId('chat-unread')).toBeHidden();
  await host.page.keyboard.press('Escape');
  await guest.page.keyboard.press('Escape');

  // Start a game and chat again: the message shows as a bubble on the sender's panel.
  await host.page
    .getByTestId('seat-red')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await guest.page
    .getByTestId('seat-yellow')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await guest.page.getByTestId('ready-button').click();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(guest.page.getByTestId('action-area')).toBeVisible();
  await guest.page.getByTestId('chat-button').click();
  await guest.page.getByTestId('chat-input').fill('good luck');
  await guest.page.keyboard.press('Enter');
  // (the previous bubble may still be fading out, so look for the new text)
  await expect(host.page.getByTestId('bubble-yellow').filter({ hasText: 'good luck' })).toBeVisible();
  await guest.page.keyboard.press('Escape');

  // Reactions float on the sender's panel for everyone.
  await host.page.getByTestId('react-button').click();
  await host.page.getByRole('menuitem', { name: '🔥' }).click();
  await expect(guest.page.getByTestId('panel-red').getByText('🔥')).toBeVisible();
});

test('the QR code renders when the share sheet opens', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByRole('button', { name: 'Create game' }).click();
  await host.page.getByRole('button', { name: 'QR code' }).click();
  const img = host.page.getByRole('dialog', { name: 'Scan to join' }).getByRole('img');
  await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('how to play opens from home and its sections link correctly', async ({ browser }) => {
  const { page } = await player(browser, 'Zohaib');
  await page.goto('/');
  await page.getByRole('link', { name: 'How to play' }).click();
  await expect(page.getByRole('heading', { name: 'How to play', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Capture before entering home' }).click();
  await expect(page).toHaveURL(/#kill$/);
  await expect(page.getByRole('heading', { name: 'Capture before entering home', level: 2 })).toBeInViewport();
});

test('the app can be installed: manifest and icons are served', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'DoDice Ludo', display: 'standalone' });
  for (const icon of manifest.icons as Array<{ src: string }>) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test('screen readers hear when it is your turn', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByRole('button', { name: 'Create game' }).click();
  await host.page
    .getByTestId('seat-red')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await host.page.getByTestId('add-bot-yellow').click();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  // The first player is random; once it is our turn (by the start or after the bot), we hear it.
  await expect(host.page.getByTestId('roll-button')).toBeVisible({ timeout: 30_000 });
  const announcer = host.page.getByTestId('announcer');
  if (!(await announcer.textContent())?.includes('Your turn')) {
    // We started: roll through one turn and wait for the next.
    await expect(async () => {
      const roll = host.page.getByTestId('roll-button');
      if (await roll.isVisible()) await roll.click();
      const movable = host.page.locator('[data-movable=true]');
      if (await movable.count()) await movable.first().click();
      await expect(announcer).toContainText(/Your turn|You rolled/, { timeout: 500 });
    }).toPass({ timeout: 40_000, intervals: [600] });
  } else {
    await expect(announcer).toContainText('Your turn');
  }
});
