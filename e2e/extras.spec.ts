import { type Browser, expect, test } from '@playwright/test';

async function player(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((n) => {
    if (!localStorage.getItem('dodice.profile'))
      localStorage.setItem('dodice.profile', JSON.stringify({ name: n, avatar: '🦊' }));
  }, name);
  return { ctx, page: await ctx.newPage() };
}

test('chat and reactions: a chat column on desktop, a chat sheet with unread count on phones', async ({ browser }) => {
  // Host on a phone (chat opens in a sheet), guest on desktop (chat is a column on the right).
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await hostCtx.addInitScript(() =>
    localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Zohaib', avatar: '🦊' })),
  );
  const host = { ctx: hostCtx, page: await hostCtx.newPage() };
  await host.page.goto('/');
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('seat-board')).toBeVisible();
  const code = host.page.url().split('/r/')[1]!;
  const guest = await player(browser, 'Sara');
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByTestId('chat-panel')).toBeVisible(); // desktop: always on screen
  await expect(guest.page.getByTestId('chat-button')).toBeHidden();

  // Lobby: the guest writes in the column; the phone host gets an unread count.
  await guest.page.getByTestId('chat-input').fill('salam! ready?');
  await guest.page.keyboard.press('Enter');
  await expect(guest.page.getByTestId('chat-log')).toContainText('salam! ready?');
  await expect(host.page.getByTestId('chat-unread')).toHaveText('1');
  await host.page.getByTestId('chat-button').click();
  await expect(host.page.getByTestId('chat-log')).toContainText('Sara');
  await expect(host.page.getByTestId('chat-log')).toContainText('salam! ready?');
  await expect(host.page.getByTestId('chat-unread')).toBeHidden();

  // A reaction is an instant chat message.
  await host.page.getByTestId('react-🔥').click();
  await expect(guest.page.getByTestId('chat-log').getByTestId('chat-reaction')).toHaveText('🔥');
  await host.page.keyboard.press('Escape');

  // In the game, a text message also shows briefly on the sender's panel (phones).
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
  await expect(guest.page.getByTestId('chat-panel')).toBeVisible();
  await guest.page.getByTestId('chat-input').fill('good luck');
  await guest.page.keyboard.press('Enter');
  await expect(host.page.getByTestId('bubble-yellow').filter({ hasText: 'good luck' })).toBeVisible();
  await expect(guest.page.getByTestId('chat-log')).toContainText('🔥'); // the conversation carried over from the lobby
});

test('the QR code renders when the share sheet opens', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
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
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
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

test('the landing page fits one screen and opens create/join dialogs', async ({ browser }) => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1366, height: 768 },
  ]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByTestId('open-create')).toBeInViewport();
    await expect(page.getByTestId('open-join')).toBeInViewport();
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrolls, `no scrolling at ${viewport.width}×${viewport.height}`).toBe(false);
    await page.getByTestId('open-join').click();
    await expect(page.getByRole('dialog', { name: 'Join a game' })).toBeVisible();
    await expect(page.getByTestId('join-code')).toBeVisible();
    await ctx.close();
  }
});
