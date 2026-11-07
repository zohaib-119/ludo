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

  // Lobby: the guest clicks somewhere else, then just types — it goes into the chat column.
  await guest.page.getByTestId('seat-board').click({ position: { x: 5, y: 5 } });
  await guest.page.keyboard.type('salam! ready?');
  await expect(guest.page.getByTestId('chat-input')).toHaveValue('salam! ready?');
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
  // Names, not avatars, head each run of messages: Sara's message, then Zohaib's reaction.
  await expect(guest.page.getByTestId('chat-log').getByTestId('chat-name')).toHaveText(['Sara', 'Zohaib']);
  await host.page.getByTestId('react-👍').click();
  await expect(guest.page.getByTestId('chat-log').getByTestId('chat-reaction')).toHaveCount(2);
  await expect(guest.page.getByTestId('chat-log').getByTestId('chat-name')).toHaveText(['Sara', 'Zohaib']);
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

test('the room page fits one screen on desktop', async ({ browser }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(() =>
      localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Zohaib', avatar: '🦊' })),
    );
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByTestId('open-create').click();
    await page.getByTestId('create-submit').click();
    await expect(page.getByTestId('seat-board')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow, `no page scroll at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(0);
    for (const id of ['seat-board', 'rules-panel', 'chat-panel']) await expect(page.getByTestId(id)).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Start game' })).toBeInViewport();
    // The share buttons sit on one line, and the rules never scroll sideways (even with team options).
    await page.getByRole('switch', { name: 'Team mode' }).click();
    await page.getByRole('radio', { name: 'Wait first' }).click();
    const layout = await page.evaluate(() => {
      const share = [...document.querySelectorAll('button')].filter((b) =>
        /Copy code|Copy link|QR code/.test(b.textContent ?? ''),
      );
      const rules = document.querySelector('[data-testid=rules-panel] .overflow-y-auto')!;
      return {
        shareRows: new Set(share.map((b) => Math.round(b.getBoundingClientRect().top))).size,
        sideways: rules.scrollWidth - rules.clientWidth,
      };
    });
    expect(layout).toEqual({ shareRows: 1, sideways: 0 });
    await ctx.close();
  }
});

test('themes are personal: chosen on one device, saved there, and the other player keeps theirs', async ({
  browser,
}) => {
  const host = await player(browser, 'Zohaib');
  await host.page.goto('/');
  await host.page.getByTestId('appearance-button').click();
  await host.page.getByTestId('look-board-night').click();
  await host.page.getByTestId('look-pieces-coin').click();
  await host.page.getByTestId('look-dice-casino').click();
  await host.page.keyboard.press('Escape');
  await host.page.getByTestId('open-create').click();
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('seat-board')).toBeVisible();
  const code = host.page.url().split('/r/')[1]!;
  const guest = await player(browser, 'Sara');
  await guest.page.goto(`/r/${code}`);
  await guest.page
    .getByTestId('seat-yellow')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  // In the lobby, my own seat has an ✕ to stand up, like a bot's.
  await host.page
    .getByTestId('seat-red')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await host.page.getByTestId('seat-x-red').click();
  await expect(host.page.getByTestId('seat-red').getByRole('button', { name: /Tap to sit/ })).toBeVisible();
  await host.page
    .getByTestId('seat-red')
    .getByRole('button', { name: /Tap to sit/ })
    .click();
  await expect(guest.page.getByTestId('seat-x-red')).toHaveCount(0); // not the guest's seat to clear
  await guest.page.getByTestId('ready-button').click();
  await host.page.getByRole('button', { name: 'Start game' }).click();

  // Same game, two looks: the host's night board vs the guest's classic one.
  const paper = (p: typeof host.page) => p.locator('[aria-label="Ludo board"] rect').first().getAttribute('fill');
  await expect(host.page.getByTestId('action-area')).toBeVisible();
  await expect(guest.page.getByTestId('action-area')).toBeVisible();
  expect(await paper(host.page)).toBe('#1B1F2E');
  expect(await paper(guest.page)).toBe('#FFFDF8');
  // Survives a reload.
  await host.page.reload();
  await expect(host.page.getByTestId('action-area')).toBeVisible();
  expect(await paper(host.page)).toBe('#1B1F2E');
  expect(await host.page.evaluate(() => JSON.parse(localStorage.getItem('dodice.settings')!))).toMatchObject({
    boardTheme: 'night',
    pieceStyle: 'coin',
    diceStyle: 'casino',
  });
});
