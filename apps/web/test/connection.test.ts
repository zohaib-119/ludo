/**
 * The client connection manager against a real game server (Node, real WebSockets).
 */
import { type Server, matchMaker } from '@colyseus/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { EventsMessage, JoinOptions } from '@ludo/protocol';
import { createServer } from '../../server/src/app';
import type { LudoRoom } from '../../server/src/room';
import { Connection, type ConnectionState, joinFailure } from '../src/net/connection';

// Our own port (the @colyseus/testing boot() helper always uses 2568 for a ready-made server).
const PORT = 2622;
let server: Server;
const connections: Connection[] = [];

beforeAll(async () => {
  server = createServer();
  await server.listen(PORT);
});
afterEach(async () => {
  for (const c of connections.splice(0)) await c.destroy();
});
afterAll(async () => server.gracefullyShutdown(false));

const opts = (name: string, token = `token-${name}-web`): JoinOptions => ({ playerToken: token, name, avatar: '🦊' });

function conn(): Connection {
  const c = new Connection({ endpoint: `http://localhost:${PORT}`, rejoinDelays: [50, 100, 200] });
  connections.push(c);
  return c;
}

async function until(c: Connection, predicate: (s: ConnectionState) => boolean, ms = 5000): Promise<ConnectionState> {
  const start = Date.now();
  while (!predicate(c.state)) {
    if (Date.now() - start > ms) throw new Error(`Timed out; status=${c.state.status} failure=${c.state.failure}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  return c.state;
}

/** Reach into the private SDK room to simulate network trouble. */
const sdkRoom = (c: Connection) => (c as unknown as { room: { connection: { close(code: number): void } } }).room;

describe('Connection', () => {
  it('creates a room, learns its own member id and receives the view', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    const s = await until(a, (x) => x.view !== null && x.memberId !== null);
    expect(s.status).toBe('connected');
    expect(s.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(s.view!.members[0]).toMatchObject({ id: s.memberId, name: 'Ali', isHost: true });
  });

  it('joins by code and sends commands', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    const b = conn();
    await b.connect(a.state.code, opts('Sara'));
    await until(b, (x) => x.view?.members.length === 2);
    expect(await b.send({ type: 'takeSeat', color: 'yellow' })).toEqual({ ok: true });
    await until(a, (x) => x.view?.seats.yellow?.name === 'Sara');
  });

  it('reports why a join failed', async () => {
    const missing = conn();
    await missing.connect('ZZZZZZ', opts('Lost'));
    expect(missing.state).toMatchObject({ status: 'failed', failure: 'ROOM_NOT_FOUND' });

    const a = conn();
    await a.connect(null, opts('Ali'));
    const bad = conn();
    await bad.connect(a.state.code, { ...opts('X'), name: 'X' });
    expect(bad.state).toMatchObject({ status: 'failed', failure: 'NAME_INVALID' });

    await a.send({ type: 'takeSeat', color: 'red' });
    await a.send({ type: 'addBot', color: 'yellow' });
    expect(await a.send({ type: 'startGame' })).toEqual({ ok: true });
    const late = conn();
    await late.connect(a.state.code, opts('Late'));
    expect(late.state).toMatchObject({ status: 'failed', failure: 'GAME_IN_PROGRESS' });
  });

  it('refuses to send while not connected', async () => {
    const a = conn();
    expect(await a.send({ type: 'chat', text: 'hi' })).toMatchObject({ ok: false, code: 'OFFLINE' });
  });

  it('layer 1: a network drop reconnects automatically', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    await until(a, (x) => x.view !== null);
    await new Promise((r) => setTimeout(r, 1100)); // past minUptime
    let backOnline = 0;
    a.on('backOnline', () => backOnline++);
    const history: string[] = [];
    const off = a.store.subscribe((st) => history.push(st.status));
    sdkRoom(a).connection.close(4010);
    // While reconnecting, clicks are refused rather than queued.
    expect(await a.send({ type: 'chat', text: 'queued?' })).toMatchObject({ code: 'OFFLINE' });
    await until(a, () => history.includes('reconnecting'));
    off();
    await until(a, (x) => x.status === 'connected');
    expect(backOnline).toBe(1);
  });

  it('layer 2: when the socket closes for good, it rejoins with the token and keeps the seat', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    await until(a, (x) => x.memberId !== null);
    const memberId = a.state.memberId;
    await a.send({ type: 'takeSeat', color: 'red' });
    // Record every status: the rejoin can be fast enough that polling would miss 'reconnecting'.
    const history: string[] = [];
    const off = a.store.subscribe((st) => history.push(st.status));
    sdkRoom(a).connection.close(4999); // not a reconnectable close code
    await until(a, () => history.includes('reconnecting'));
    const s = await until(a, (x) => x.status === 'connected' && x.view?.seats.red?.connected === true);
    off();
    expect(history.indexOf('reconnecting')).toBeLessThan(history.lastIndexOf('connected'));
    expect(s.memberId).toBe(memberId);
    expect(s.view!.members).toHaveLength(1);
  });

  it('a second tab takes over; "Use here" takes the seat back', async () => {
    const first = conn();
    await first.connect(null, opts('Ali'));
    await until(first, (x) => x.view !== null);
    const second = conn();
    await second.connect(first.state.code, opts('Ali'));
    await until(first, (x) => x.status === 'kicked');
    expect(first.state.kicked).toBe('otherTab');
    expect(second.state.status).toBe('connected');
    await first.useHere();
    await until(second, (x) => x.status === 'kicked');
    expect(first.state.status).toBe('connected');
  });

  it('a room that closes ends in a clear failure, not endless retries', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    await until(a, (x) => x.view !== null);
    await (matchMaker.getLocalRoomById(a.state.code!) as unknown as LudoRoom).disconnect();
    const s = await until(a, (x) => x.status === 'failed');
    expect(s.failure).toBe('ROOM_CLOSED');
  });

  it('leaving on purpose resets the state and removes the member', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    const b = conn();
    await b.connect(a.state.code, opts('Sara'));
    await until(a, (x) => x.view?.members.length === 2);
    await b.leave();
    expect(b.state.status).toBe('idle');
    await until(a, (x) => x.view?.members.length === 1);
  });

  it('delivers game events to listeners', async () => {
    const a = conn();
    await a.connect(null, opts('Ali'));
    await until(a, (x) => x.view !== null);
    const events: EventsMessage[] = [];
    a.on('events', (e) => events.push(e));
    await a.send({ type: 'takeSeat', color: 'red' });
    await a.send({ type: 'addBot', color: 'yellow' });
    await a.send({ type: 'startGame' });
    const s = await until(a, (x) => x.view?.game !== null && x.view?.game !== undefined);
    const turn = s.view!.game!.turn;
    if (turn.seat === 'red') await a.send({ type: 'roll', stateVersion: s.view!.game!.version });
    await new Promise((r) => setTimeout(r, 1500));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.events[0]).toMatchObject({ type: 'TurnStarted' });
  });
});

describe('joinFailure', () => {
  it('maps server and SDK messages', () => {
    expect(joinFailure(new Error('GAME_IN_PROGRESS'))).toBe('GAME_IN_PROGRESS');
    expect(joinFailure(new Error('room "ZZZZZZ" not found'))).toBe('ROOM_NOT_FOUND');
    expect(joinFailure(new Error('socket hang up'))).toBe('NETWORK');
    expect(joinFailure('weird')).toBe('NETWORK');
  });
});
