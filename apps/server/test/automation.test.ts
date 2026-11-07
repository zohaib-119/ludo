/**
 * Bots, turn timer, autoplay and disconnect takeover in the room controller
 * (docs/06-bot.md §5–§6), driven by a fake clock.
 */
import { describe, expect, it } from 'vitest';
import { type Color, type Rng, seededRng } from '@ludo/engine';
import type { Command, RoomEvent, RoomSettings, RoomView } from '@ludo/protocol';
import { BOT_MOVE_DELAY_MS, BOT_ROLL_DELAY_MS, type Out, RoomController } from '../src/controller';

function harness(dice: number[] = [], seed = 7) {
  let now = 5_000_000;
  let id = 0;
  const fallback = seededRng(seed);
  const rng: Rng = { die: () => dice.shift() ?? fallback.die(), int: () => 0 };
  const ctrl = new RoomController('BOTS22', { rng, now: () => now, newId: () => `m${++id}` });
  const log: Out[] = [];
  const h = {
    ctrl,
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
    advanceTo(t: number) {
      now = Math.max(now, t);
    },
    join(name: string) {
      const r = ctrl.join({ playerToken: `token-${name}`, name });
      if (!r.ok) throw new Error(r.code);
      return r.memberId;
    },
    must(memberId: string, c: Command) {
      const r = ctrl.command(memberId, c);
      if (!r.ok) throw new Error(`${c.type}: ${r.code} ${r.message}`);
    },
    view: (): RoomView => ctrl.view(),
    /** Collected room events since the last call. */
    events(): RoomEvent[] {
      log.push(...ctrl.drain());
      const out = log.flatMap((o) => (o.kind === 'events' ? o.payload.events : []));
      log.length = 0;
      return out;
    },
    /** Jump to the next automatic wake-up and run it. */
    wake() {
      const at = ctrl.nextWakeAt();
      if (at === null) throw new Error('nothing scheduled');
      now = Math.max(now, at);
      ctrl.tick();
    },
  };
  return h;
}

/** Host Ali seated at red; the other seats as given ('bot' or a human name). */
function game(others: Partial<Record<Color, string>>, settings: Partial<RoomSettings> = {}, dice: number[] = []) {
  const h = harness(dice);
  const ali = h.join('Ali');
  h.must(ali, { type: 'takeSeat', color: 'red' });
  if (Object.keys(settings).length) h.must(ali, { type: 'updateSettings', settings });
  const humans: Record<string, string> = { Ali: ali };
  for (const [color, who] of Object.entries(others) as Array<[Color, string]>) {
    if (who === 'bot') h.must(ali, { type: 'addBot', color });
    else {
      humans[who] = h.join(who);
      h.must(humans[who]!, { type: 'takeSeat', color });
      h.must(humans[who]!, { type: 'setReady', ready: true });
    }
  }
  h.must(ali, { type: 'startGame' });
  h.events();
  // Object.assign keeps h's live `now` getter (a spread would freeze its value).
  return Object.assign(h, { humans });
}

const turn = (h: ReturnType<typeof harness>) => h.view().game!.turn;
const version = (h: ReturnType<typeof harness>) => h.view().game!.version;

describe('bot seats', () => {
  it('A1 the host adds and removes bots in the lobby; bots need no ready', () => {
    const h = harness();
    const ali = h.join('Ali');
    const sara = h.join('Sara');
    expect(h.ctrl.command(sara, { type: 'addBot', color: 'yellow' })).toMatchObject({ code: 'NOT_HOST' });
    h.must(ali, { type: 'addBot', color: 'yellow' });
    expect(h.view().seats.yellow).toMatchObject({ isBot: true, memberId: null, name: 'Bot Zara', connected: true });
    expect(h.ctrl.command(sara, { type: 'takeSeat', color: 'yellow' })).toMatchObject({ code: 'SEAT_TAKEN' });
    expect(h.ctrl.command(ali, { type: 'addBot', color: 'yellow' })).toMatchObject({ code: 'SEAT_TAKEN' });
    h.must(ali, { type: 'removeSeat', color: 'yellow' });
    expect(h.view().seats.yellow).toBeUndefined();
    h.must(ali, { type: 'addBot', color: 'yellow' });
    h.must(ali, { type: 'takeSeat', color: 'red' });
    h.must(ali, { type: 'startGame' });
    expect(h.view().game!.seats).toEqual(['red', 'yellow']);
  });

  it('A2 a bot seat plays its whole turn by itself, paced', () => {
    const h = game({ yellow: 'bot' }, {}, [1, 2]); // Ali voids, then the bot plays
    h.must(h.humans.Ali!, { type: 'roll', stateVersion: 0 });
    expect(turn(h).seat).toBe('yellow');
    const start = h.now;
    expect(h.ctrl.nextWakeAt()).toBe(start + BOT_ROLL_DELAY_MS);
    h.advance(BOT_ROLL_DELAY_MS - 1);
    h.ctrl.tick();
    expect(turn(h).seat).toBe('yellow'); // not yet
    h.events();
    while (turn(h).seat === 'yellow') h.wake();
    const events = h.events();
    const bot = events.filter((e) => e.type === 'BotActed');
    expect(bot.length).toBeGreaterThan(0);
    expect(bot.every((e) => e.type === 'BotActed' && e.seat === 'yellow' && e.cause === 'bot')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'TurnStarted', seat: 'red' });
    expect(h.view().game!.stats.yellow!.botTurns).toBe(0); // bot seats don't count: only turns played for humans
    expect(h.ctrl.nextWakeAt()).toBeNull(); // Ali's turn, no timer
  });

  it('A3 bots wait while no human is connected', () => {
    const h = game({ yellow: 'bot' }, {}, [1, 2]);
    h.must(h.humans.Ali!, { type: 'roll', stateVersion: 0 });
    h.ctrl.setConnected(h.humans.Ali!, false);
    expect(h.ctrl.nextWakeAt()).toBeNull();
    h.advance(60_000);
    h.ctrl.tick();
    expect(turn(h).seat).toBe('yellow');
    h.ctrl.setConnected(h.humans.Ali!, true);
    expect(h.ctrl.nextWakeAt()).not.toBeNull();
  });

  it('A4 four bots (and one watching host) play a full game to the end', () => {
    const h = harness();
    const host = h.join('Host');
    for (const color of ['red', 'green', 'yellow', 'blue'] as Color[]) h.must(host, { type: 'addBot', color });
    h.must(host, { type: 'updateSettings', settings: { teamMode: true, killRequiredToEnterColumn: true } });
    h.must(host, { type: 'startGame' });
    for (let i = 0; i < 5000 && h.view().phase === 'playing'; i++) h.wake();
    expect(h.view().phase).toBe('finished');
    expect(h.view().game!.winningTeam).toHaveLength(2);
  });
});

describe('turn timer and autoplay', () => {
  it('T1 a decision times out: the bot makes that one decision, with a fresh deadline after', () => {
    const h = game({ yellow: 'Sara' }, { turnTimer: 15 }, [6, 3]);
    const start = h.now;
    expect(turn(h)).toMatchObject({ seat: 'red', deadline: start + 15_000, takeoverAt: 0 });
    h.advance(14_999);
    h.ctrl.tick();
    expect(version(h)).toBe(0);
    h.advance(1);
    h.ctrl.tick();
    expect(h.events()[0]).toEqual({ type: 'BotActed', seat: 'red', cause: 'timeout' });
    expect(turn(h)).toMatchObject({ phase: 'awaitMove', deadline: h.now + 15_000 });
    expect(h.view().seats.red).toMatchObject({ timeouts: 1, autoplay: false });
  });

  it('T2 two timeouts in a row switch on autoplay; "I\'m back" switches it off at once', () => {
    const h = game({ yellow: 'Sara' }, { turnTimer: 15 }, [6, 3]);
    h.wake(); // timeout 1: roll
    h.wake(); // timeout 2: move
    expect(h.view().seats.red).toMatchObject({ timeouts: 2, autoplay: true });
    expect(turn(h).deadline).toBe(0);
    // Autoplay plays at bot pace.
    expect(h.ctrl.nextWakeAt()).toBe(h.now + BOT_MOVE_DELAY_MS);
    h.must(h.humans.Ali!, { type: 'setAutoplay', on: false });
    expect(h.view().seats.red).toMatchObject({ autoplay: false, timeouts: 0 });
    expect(turn(h).deadline).toBe(h.now + 15_000);
  });

  it('T3 acting yourself resets the timeout count', () => {
    const h = game({ yellow: 'Sara' }, { turnTimer: 15 }, [6, 3]);
    h.wake(); // timeout: roll
    expect(h.view().seats.red!.timeouts).toBe(1);
    const move = h.view().game!.legalMoves[0]!;
    h.must(h.humans.Ali!, { type: 'move', stateVersion: version(h), pieceId: move.pieceId, value: move.value });
    expect(h.view().seats.red!.timeouts).toBe(0);
  });

  it('T4 players can turn on autoplay themselves', () => {
    const h = game({ yellow: 'Sara' });
    h.must(h.humans.Ali!, { type: 'setAutoplay', on: true });
    expect(h.view().seats.red!.autoplay).toBe(true);
    h.wake();
    expect(h.events()[0]).toEqual({ type: 'BotActed', seat: 'red', cause: 'autoplay' });
    expect(h.ctrl.command(h.humans.Ali!, { type: 'setAutoplay', on: 'yes' as never })).toMatchObject({
      code: 'BAD_PAYLOAD',
    });
  });

  it('T5 with the timer off and a connected player, nothing happens automatically', () => {
    const h = game({ yellow: 'Sara' });
    expect(turn(h).deadline).toBe(0);
    expect(h.ctrl.nextWakeAt()).toBeNull();
  });
});

describe('disconnect takeover', () => {
  it('O1 an offline player is taken over after the grace period, then gets control back next turn', () => {
    const h = game({ yellow: 'Sara' }, { disconnectTakeover: 15 }, [1, 2]);
    const ali = h.humans.Ali!;
    h.advance(5_000);
    h.ctrl.setConnected(ali, false);
    expect(turn(h).takeoverAt).toBe(h.now + 15_000);
    h.advance(14_999);
    h.ctrl.tick();
    expect(h.view().seats.red!.botControlled).toBe(false);
    h.advance(1);
    h.ctrl.tick(); // takeover, then the bot rolls (1,2) → void → Sara's turn
    expect(h.view().seats.red!.botControlled).toBe(true);
    expect(h.events()).toContainEqual({ type: 'BotActed', seat: 'red', cause: 'offline' });
    expect(turn(h).seat).toBe('yellow');
    // Ali comes back during Sara's turn: still bot-controlled until his next turn starts.
    h.ctrl.setConnected(ali, true);
    expect(h.view().seats.red!.botControlled).toBe(true);
    const sara = h.humans.Sara!;
    h.must(sara, { type: 'roll', stateVersion: version(h) });
    while (turn(h).seat === 'yellow') {
      const m = h.view().game!.legalMoves[0]!;
      h.must(sara, { type: 'move', stateVersion: version(h), pieceId: m.pieceId, value: m.value });
    }
    expect(turn(h).seat).toBe('red');
    expect(h.view().seats.red!.botControlled).toBe(false);
    expect(h.ctrl.nextWakeAt()).toBeNull();
  });

  it('O2 the grace period starts when the turn reaches an already-offline player', () => {
    const h = game({ yellow: 'Sara' }, { disconnectTakeover: 30 }, [1, 2]);
    h.ctrl.setConnected(h.humans.Sara!, false);
    h.advance(100_000); // long offline, but not her turn yet
    h.must(h.humans.Ali!, { type: 'roll', stateVersion: 0 }); // void → Sara's turn
    expect(turn(h)).toMatchObject({ seat: 'yellow', takeoverAt: h.now + 30_000 });
  });

  it('O3 with takeover set to never the game waits, but the host can step in', () => {
    const h = game({ yellow: 'Sara' }, { disconnectTakeover: 0 }, [1, 2]);
    h.must(h.humans.Ali!, { type: 'roll', stateVersion: 0 });
    const sara = h.humans.Sara!;
    expect(h.ctrl.command(h.humans.Ali!, { type: 'hostBotTakeover', color: 'yellow' })).toMatchObject({
      code: 'BAD_PAYLOAD', // Sara is online
    });
    h.ctrl.setConnected(sara, false);
    expect(turn(h).takeoverAt).toBe(0);
    expect(h.ctrl.nextWakeAt()).toBeNull();
    expect(h.ctrl.command(sara, { type: 'hostBotTakeover', color: 'yellow' })).toMatchObject({ code: 'NOT_HOST' });
    h.must(h.humans.Ali!, { type: 'hostBotTakeover', color: 'yellow' });
    expect(h.view().seats.yellow!.botControlled).toBe(true);
    h.events();
    h.wake();
    expect(h.events()[0]).toEqual({ type: 'BotActed', seat: 'yellow', cause: 'offline' });
  });

  it('O4 the turn timer still applies to an offline player when it comes first', () => {
    const h = game({ yellow: 'Sara' }, { turnTimer: 15, disconnectTakeover: 60 });
    h.ctrl.setConnected(h.humans.Ali!, false);
    expect(h.ctrl.nextWakeAt()).toBe(turn(h).deadline);
    h.wake();
    expect(h.events()[0]).toEqual({ type: 'BotActed', seat: 'red', cause: 'timeout' });
  });

  it('O5 leaving mid-game hands the seat to the bot straight away', () => {
    const h = game({ yellow: 'Sara' });
    h.must(h.humans.Ali!, { type: 'leaveRoom' });
    expect(h.view().seats.red).toMatchObject({ connected: false, botControlled: true });
    h.wake();
    expect(h.events()[0]).toEqual({ type: 'BotActed', seat: 'red', cause: 'offline' });
    expect(h.view().game!.stats.red!.botTurns).toBe(1); // a human's turn played by the bot
  });

  it('O6 a human-vs-bot game finishes with the human on autoplay', () => {
    const h = game({ green: 'bot', yellow: 'bot', blue: 'bot' }, { diceMode: 1 });
    h.must(h.humans.Ali!, { type: 'setAutoplay', on: true });
    for (let i = 0; i < 6000 && h.view().phase === 'playing'; i++) h.wake();
    expect(h.view().phase).toBe('finished');
    expect(h.view().game!.rankings).toHaveLength(4);
  });
});
