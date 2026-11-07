/**
 * End-to-end through a real Colyseus server and real SDK clients over WebSockets.
 * Covers docs/07-testing.md §6 server scenarios (without browsers).
 */
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Room as SdkRoom } from '@colyseus/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type Command,
  type CommandResult,
  type EventsMessage,
  type JoinOptions,
  ROOM_CODE_ALPHABET,
  ROOM_NAME,
  type RoomView,
} from '@ludo/protocol';
import { createServer } from '../src/app';
import type { LudoRoom } from '../src/room';

// boot() with a ready-made Server always listens on 2568 (its default test port).
let colyseus: ColyseusTestServer;
const open: SdkRoom[] = [];

beforeAll(async () => {
  colyseus = await boot(createServer());
});
afterEach(async () => {
  for (const r of open.splice(0)) {
    r.reconnection.enabled = false;
    await r.leave().catch(() => {});
  }
  await colyseus.cleanup();
});
afterAll(async () => colyseus.shutdown());

const opts = (name: string): JoinOptions => ({ playerToken: `token-${name}-xyz`, name, avatar: '🦊' });

function track(room: SdkRoom): SdkRoom {
  room.reconnection.minUptime = 0;
  open.push(room);
  return room;
}

const viewOf = (room: SdkRoom): RoomView => JSON.parse((room.state as { view: string }).view);

async function until(room: SdkRoom, predicate: (v: RoomView) => boolean, ms = 3000): Promise<RoomView> {
  const start = Date.now();
  for (;;) {
    const raw = (room.state as { view?: string } | undefined)?.view;
    if (raw) {
      const v = JSON.parse(raw) as RoomView;
      if (predicate(v)) return v;
    }
    if (Date.now() - start > ms) throw new Error('Timed out waiting for view condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const send = (room: SdkRoom, c: Command) => room.request('cmd', c) as Promise<CommandResult>;

async function must(room: SdkRoom, c: Command): Promise<void> {
  const r = await send(room, c);
  if (!r.ok) throw new Error(`${c.type}: ${r.code} ${r.message}`);
}

async function twoPlayerGame() {
  const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
  const sara = track(await colyseus.sdk.joinById(ali.roomId, opts('Sara')));
  await must(ali, { type: 'takeSeat', color: 'red' });
  await must(sara, { type: 'takeSeat', color: 'yellow' });
  await must(sara, { type: 'setReady', ready: true });
  await must(ali, { type: 'startGame' });
  await until(ali, (v) => v.phase === 'playing');
  await until(sara, (v) => v.phase === 'playing');
  return { ali, sara };
}

/** The room whose turn it is, and the current game version. */
function actor(rooms: { ali: SdkRoom; sara: SdkRoom }) {
  const v = viewOf(rooms.ali);
  const room = v.game!.turn.seat === 'red' ? rooms.ali : rooms.sara;
  return { room, view: v };
}

describe('rooms over the network', () => {
  it('creates a room with a 6-character code and makes the creator host', async () => {
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    expect(ali.roomId).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    const welcome = new Promise<{ memberId: string }>((r) => ali.onMessage('welcome', r));
    const v = await until(ali, (x) => x.members.length === 1);
    expect(v.code).toBe(ali.roomId);
    expect((await welcome).memberId).toBe(v.members[0]!.id);
    expect(v.members[0]).toMatchObject({ name: 'Ali', isHost: true, connected: true });
  });

  it('joins by code and refuses newcomers once the game has started', async () => {
    const { ali } = await twoPlayerGame();
    await expect(colyseus.sdk.joinById(ali.roomId, opts('Late'))).rejects.toThrow(/GAME_IN_PROGRESS/);
    await expect(colyseus.sdk.joinById('ZZZZZZ', opts('Lost'))).rejects.toThrow();
  });

  it('refuses joins with an invalid name', async () => {
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    await expect(colyseus.sdk.joinById(ali.roomId, { ...opts('x'), name: 'x' })).rejects.toThrow(/NAME_INVALID/);
  });

  it('delivers events after the state they describe, in order', async () => {
    const rooms = await twoPlayerGame();
    const received: Array<{ msg: EventsMessage; stateVersion: number }> = [];
    rooms.sara.onMessage('events', (msg: EventsMessage) => {
      received.push({ msg, stateVersion: viewOf(rooms.sara).game!.version });
    });
    for (let i = 0; i < 12; i++) {
      const { room, view } = actor(rooms);
      const g = view.game!;
      if (g.turn.phase === 'awaitRoll') await must(room, { type: 'roll', stateVersion: g.version });
      else {
        const m = g.legalMoves[0]!;
        await must(room, { type: 'move', stateVersion: g.version, pieceId: m.pieceId, value: m.value });
      }
      await until(rooms.ali, (v) => v.game!.version === g.version + 1);
    }
    await until(rooms.sara, (v) => v.game!.version === 12);
    await new Promise((r) => setTimeout(r, 50));
    expect(received.map((r) => r.msg.version)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // The state patch always arrives before (or with) the events for that version.
    for (const r of received) expect(r.stateVersion).toBeGreaterThanOrEqual(r.msg.version);
  });

  it('rejects stale and out-of-turn actions over the wire', async () => {
    const rooms = await twoPlayerGame();
    const { room, view } = actor(rooms);
    const other = room === rooms.ali ? rooms.sara : rooms.ali;
    expect(await send(other, { type: 'roll', stateVersion: 0 })).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(await send(room, { type: 'roll', stateVersion: 99 })).toMatchObject({ ok: false, code: 'STALE_STATE' });
    expect(await send(room, { type: 'roll', stateVersion: view.game!.version })).toEqual({ ok: true });
  });
});

describe('connection problems', () => {
  it('a network drop mid-game reconnects automatically and keeps the seat', async () => {
    const rooms = await twoPlayerGame();
    const server = colyseus.getRoomById<LudoRoom>(rooms.ali.roomId);
    const reconnected = new Promise<void>((r) => rooms.sara.onReconnect(() => r()));
    rooms.sara.connection.close(4010, 'simulated drop');
    await until(rooms.ali, (v) => v.seats.yellow?.connected === false);
    await reconnected;
    const v = await until(rooms.ali, (x) => x.seats.yellow?.connected === true);
    expect(v.seats.yellow!.offlineSince).toBe(0);
    expect(server.controller.view().members).toHaveLength(2);
    // Sara can act normally after reconnecting.
    expect(await send(rooms.sara, { type: 'chat', text: 'back!' })).toEqual({ ok: true });
  });

  it('a page refresh (new connection, same token) reclaims the seat', async () => {
    const rooms = await twoPlayerGame();
    rooms.sara.reconnection.enabled = false;
    rooms.sara.connection.close(4010, 'tab closed');
    await until(rooms.ali, (v) => v.seats.yellow?.connected === false);
    const fresh = track(await colyseus.sdk.joinById(rooms.ali.roomId, opts('Sara')));
    const v = await until(fresh, (x) => x.seats.yellow?.connected === true);
    expect(v.members).toHaveLength(2);
    expect(v.seats.yellow!.name).toBe('Sara');
    // The abandoned reconnection slot was released: one session per member, Sara stays online.
    const server = colyseus.getRoomById<LudoRoom>(rooms.ali.roomId);
    expect((server as unknown as { sessions: Map<string, unknown> }).sessions.size).toBe(2);
    await new Promise((r) => setTimeout(r, 200));
    expect(viewOf(rooms.ali).seats.yellow!.connected).toBe(true);
    const { room, view } = actor({ ali: rooms.ali, sara: fresh });
    expect(await send(room, { type: 'roll', stateVersion: view.game!.version })).toEqual({ ok: true });
  });

  it('opening the room in a second tab kicks the first', async () => {
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    const kicked = new Promise<unknown>((r) => ali.onMessage('kicked', r));
    const left = new Promise<number>((r) => ali.onLeave((code) => r(code)));
    const second = track(await colyseus.sdk.joinById(ali.roomId, opts('Ali')));
    expect(await kicked).toEqual({ reason: 'otherTab' });
    await left;
    const v = await until(second, (x) => x.members.length === 1);
    expect(v.members[0]).toMatchObject({ name: 'Ali', connected: true, isHost: true });
  });

  it('leaving the lobby removes the member and closes their connection', async () => {
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    const sara = track(await colyseus.sdk.joinById(ali.roomId, opts('Sara')));
    await until(ali, (v) => v.members.length === 2);
    const left = new Promise<void>((r) => sara.onLeave(() => r()));
    expect(await send(sara, { type: 'leaveRoom' })).toEqual({ ok: true });
    await left;
    const v = await until(ali, (x) => x.members.length === 1);
    expect(v.members[0]!.name).toBe('Ali');
  });
});

describe('bots over the network', () => {
  it('a bot seat plays on the real clock and its moves reach the client', async () => {
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    await must(ali, { type: 'takeSeat', color: 'red' });
    await must(ali, { type: 'addBot', color: 'yellow' });
    await must(ali, { type: 'startGame' });
    await until(ali, (v) => v.game !== null);
    const botEvents: string[] = [];
    ali.onMessage('events', (msg: EventsMessage) => {
      for (const e of msg.events) if (e.type === 'BotActed') botEvents.push(`${e.seat}:${e.cause}`);
    });
    // Ali plays until the bot has had at least one full turn and it is Ali's turn again.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const v = viewOf(ali);
      const g = v.game!;
      if (botEvents.length > 0 && g.turn.seat === 'red') break;
      if (g.turn.seat === 'red') {
        if (g.turn.phase === 'awaitRoll') await send(ali, { type: 'roll', stateVersion: g.version });
        else {
          const m = g.legalMoves[0]!;
          await send(ali, { type: 'move', stateVersion: g.version, pieceId: m.pieceId, value: m.value });
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(botEvents.length).toBeGreaterThan(0);
    expect(new Set(botEvents)).toEqual(new Set(['yellow:bot']));
    expect(viewOf(ali).game!.turn.seat).toBe('red');
  }, 30_000);
});

describe('http endpoints', () => {
  it('health check and room lookup', async () => {
    const health = await colyseus.http.get('/healthz');
    expect(health.data).toEqual({ ok: true });
    const ali = track(await colyseus.sdk.create(ROOM_NAME, opts('Ali')));
    const found = await colyseus.http.get(`/api/rooms/${ali.roomId.toLowerCase()}`);
    expect(found.headers['access-control-allow-origin']).toBe('*');
    expect(found.data).toMatchObject({ exists: true, phase: 'lobby', members: 1, seatsTaken: 0 });
    const missing = await colyseus.http.get('/api/rooms/ZZZZZZ');
    expect(missing.data).toEqual({ exists: false });
    const junk = await colyseus.http.get('/api/rooms/not-a-code');
    expect(junk.data).toEqual({ exists: false });
  });
});
