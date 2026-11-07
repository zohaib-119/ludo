import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function player(browser: Browser, name: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(mobile ? phone : {});
  await ctx.addInitScript((n) => {
    if (!localStorage.getItem('dodice.profile'))
      localStorage.setItem('dodice.profile', JSON.stringify({ name: n, avatar: '🦊' }));
  }, name);
  return { ctx, page: await ctx.newPage() };
}

async function createRoom(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByTestId('open-create').click();
  await page.getByTestId('create-submit').click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  return page.url().split('/r/')[1]!;
}

const seat = (page: Page, color: string) => page.getByTestId(`seat-${color}`);
const sit = (page: Page, color: string) =>
  seat(page, color)
    .getByRole('button', { name: /Tap to sit/ })
    .click();

test('four players: create, join by link, seats, rules un-ready everyone, start', async ({ browser }) => {
  const host = await player(browser, 'Zohaib', true);
  const code = await createRoom(host.page);
  await sit(host.page, 'red');

  const guests = await Promise.all(['Sara', 'Bilal', 'Gul'].map((n) => player(browser, n)));
  const colors = ['green', 'yellow', 'blue'];
  for (const [i, g] of guests.entries()) {
    await g.page.goto(`/r/${code}`);
    await sit(g.page, colors[i]!);
    await g.page.getByTestId('ready-button').click();
  }
  for (const c of ['green', 'yellow', 'blue']) await expect(seat(host.page, c)).toContainText('Ready');
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeEnabled();
  // Four people in the room: the members row scrolls inside itself; the phone page never scrolls sideways.
  await expect(host.page.getByTestId('room-members')).toContainText('Gul');
  expect(
    await host.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);

  // Host changes a rule: everyone is un-readied and told.
  await host.page.getByRole('switch', { name: 'Team mode' }).click();
  await expect(guests[0]!.page.getByText('Rules changed — check them and get ready again.')).toBeVisible();
  await expect(guests[0]!.page.getByRole('switch', { name: 'Team mode' })).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByRole('button', { name: 'Start game' })).toBeDisabled();
  await expect(host.page.getByTestId('lobby-status')).toContainText('Waiting for');

  for (const g of guests) await g.page.getByTestId('ready-button').click();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  for (const p of [host.page, ...guests.map((g) => g.page)]) await expect(p.getByTestId('action-area')).toBeVisible();
});

test('refreshing keeps your seat, in the lobby and in a game', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  const code = await createRoom(host.page);
  await sit(host.page, 'red');
  const guest = await player(browser, 'Sara', true);
  await guest.page.goto(`/r/${code}`);
  await sit(guest.page, 'yellow');
  await guest.page.getByTestId('ready-button').click();

  await guest.page.reload();
  await expect(seat(guest.page, 'yellow')).toContainText('Sara');
  await expect(seat(guest.page, 'yellow')).toContainText('You');
  await expect(seat(host.page, 'yellow')).toContainText('Ready');

  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(guest.page.getByTestId('action-area')).toBeVisible();
  await guest.page.reload();
  await expect(guest.page.getByTestId('action-area')).toBeVisible();
  await expect(guest.page.getByTestId('panel-yellow')).toContainText('Sara');
  await expect(guest.page.getByTestId('panel-yellow')).toContainText('(You)');
});

test('a second tab takes over; "Use here" takes it back', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  const code = await createRoom(host.page);
  const second = await host.ctx.newPage(); // same browser profile = same player token
  await second.goto(`/r/${code}`);
  await expect(second.getByTestId('room-code')).toHaveText(code);
  await expect(host.page.getByRole('heading', { name: 'Open in another tab' })).toBeVisible();
  await host.page.getByRole('button', { name: 'Use here' }).click();
  await expect(host.page.getByTestId('room-code')).toHaveText(code);
  await expect(second.getByRole('heading', { name: 'Open in another tab' })).toBeVisible();
});

test('clear messages for unknown rooms and started games', async ({ browser }) => {
  const lost = await player(browser, 'Lost');
  await lost.page.goto('/r/ZZZZZZ');
  await expect(lost.page.getByText('Room not found')).toBeVisible();

  const host = await player(browser, 'Zohaib');
  const code = await createRoom(host.page);
  await sit(host.page, 'red');
  await seat(host.page, 'yellow')
    .getByRole('button', { name: /Add bot/ })
    .click();
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(host.page.getByTestId('action-area')).toBeVisible();
  const late = await player(browser, 'Late');
  await late.page.goto(`/r/${code}`);
  await expect(late.page.getByText('Game already started')).toBeVisible();
});

test('leaving returns home and frees the seat', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  const code = await createRoom(host.page);
  const guest = await player(browser, 'Sara');
  await guest.page.goto(`/r/${code}`);
  await sit(guest.page, 'yellow');
  await expect(seat(host.page, 'yellow')).toContainText('Sara');
  await guest.page.getByRole('button', { name: 'Leave' }).click();
  await guest.page.getByTestId('confirm-leave').click();
  await expect(guest.page).toHaveURL(/\/$/);
  await expect(seat(host.page, 'yellow')).toContainText('Tap to sit');
  await expect(host.page.getByText('Sara left')).toBeVisible();
});

test('going offline shows reconnecting, coming back restores the room', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  const code = await createRoom(host.page);
  await sit(host.page, 'red');
  await host.page.waitForTimeout(1200); // past the SDK's minimum uptime for auto-reconnect
  await host.ctx.setOffline(true);
  await expect(host.page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible();
  await host.ctx.setOffline(false);
  await expect(host.page.getByText('Back online')).toBeVisible({ timeout: 20_000 });
  await expect(seat(host.page, 'red')).toContainText('Zohaib');
  await expect(host.page.getByTestId('room-code')).toHaveText(code);
});

test('the seat board keeps its size, place and four equal tiles as seats fill and empty', async ({ browser }) => {
  const host = await player(browser, 'Zohaib');
  await createRoom(host.page);
  const sizes = () =>
    Promise.all(
      ['green', 'yellow', 'red', 'blue', 'board'].map(async (c) => {
        const b = (await host.page.getByTestId(c === 'board' ? 'seat-board' : `seat-${c}`).boundingBox())!;
        return `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.x)},${Math.round(b.y)}`;
      }),
    );
  const settled = async () => {
    await host.page.waitForTimeout(600); // let layout animations finish
    return sizes();
  };
  const empty = await settled();
  expect(new Set(empty.slice(0, 4).map((x) => x.split('@')[0])).size).toBe(1); // four equal tiles
  await host.page.getByTestId('add-bot-green').click();
  await host.page.getByTestId('add-bot-yellow').click();
  expect(await settled()).toEqual(empty); // two filled, two empty: nothing moves
  await sit(host.page, 'red');
  await host.page.getByTestId('add-bot-blue').click();
  expect(await settled()).toEqual(empty);
  await host.page.getByTestId('seat-x-red').click();
  expect(await settled()).toEqual(empty);
  // Everyone sat down or stood up: the members row under the board is always there.
  await expect(host.page.getByTestId('room-members')).toContainText('Zohaib');
});
