import { describe, expect, it } from 'vitest';
import { type Color, type Rng, seededRng } from '@ludo/engine';
import type { Command, CommandResult, RoomView } from '@ludo/protocol';
import { DISPOSE_IDLE_MS, HOST_TRANSFER_MS, RoomController, cleanText } from '../src/controller';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Dice from a queue first, then from a seeded generator. `int` is always 0 (first seat starts). */
function testRng(queue: number[] = [], seed = 1): Rng & { push(...d: number[]): void } {
  const fallback = seededRng(seed);
  return {
    die: () => queue.shift() ?? fallback.die(),
    int: () => 0,
    push: (...d) => queue.push(...d),
  };
}

function setup(dice: number[] = []) {
  let now = 1_000_000;
  let id = 0;
  const rng = testRng(dice);
  const ctrl = new RoomController('K7QX9M', { rng, now: () => now, newId: () => `m${++id}` });
  const join = (name: string, token = `token-${name}`) => {
    const r = ctrl.join({ playerToken: token, name, avatar: '🦊' });
    if (!r.ok) throw new Error(`join failed: ${r.code}`);
    return r.memberId;
  };
  const cmd = (memberId: string, c: Command | Record<string, unknown>): CommandResult => ctrl.command(memberId, c);
  const must = (memberId: string, c: Command) => {
    const r = cmd(memberId, c);
    if (!r.ok) throw new Error(`${c.type} failed: ${r.code} ${r.message}`);
  };
  const view = (): RoomView => ctrl.view();
  const advance = (ms: number) => {
    now += ms;
  };
  return { ctrl, rng, join, cmd, must, view, advance, get now() { return now; } };
}

/** Room with seated, ready players (first name is host). Not started. */
function lobby(seats: Array<[string, Color]>, dice: number[] = []) {
  const h = setup(dice);
  const ids = seats.map(([name]) => h.join(name));
  seats.forEach(([, color], i) => h.must(ids[i]!, { type: 'takeSeat', color }));
  ids.slice(1).forEach((id) => h.must(id, { type: 'setReady', ready: true }));
  return { ...h, ids };
}

function started(seats: Array<[string, Color]>, dice: number[] = []) {
  const h = lobby(seats, dice);
  h.must(h.ids[0]!, { type: 'startGame' });
  h.ctrl.drain();
  return h;
}

const seatMember = (h: ReturnType<typeof setup>, color: Color) => h.view().seats[color]!.memberId!;
const versionOf = (h: ReturnType<typeof setup>) => h.view().game!.version;

/** Plays the current game to the end with the first legal move each time. */
function playToEnd(h: ReturnType<typeof setup>, maxActions = 5000) {
  for (let i = 0; i < maxActions; i++) {
    const g = h.view().game!;
    if (h.view().phase !== 'playing') return i;
    h.advance(100); // a realistic pace; the per-member rate limit is 20 commands/s
    const actor = seatMember(h, g.turn.seat);
    if (g.turn.phase === 'awaitRoll') h.must(actor, { type: 'roll', stateVersion: g.version });
    else {
      const m = g.legalMoves[0]!;
      h.must(actor, { type: 'move', stateVersion: g.version, pieceId: m.pieceId, value: m.value });
    }
  }
  throw new Error('game did not finish');
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

describe('joining', () => {
  it('J1 the first member becomes host', () => {
    const h = setup();
    const a = h.join('Ali');
    const b = h.join('Sara');
    const v = h.view();
    expect(v.hostId).toBe(a);
    expect(v.members.map((m) => [m.id, m.name, m.isHost, m.connected])).toEqual([
      [a, 'Ali', true, true],
      [b, 'Sara', false, true],
    ]);
    expect(v.phase).toBe('lobby');
    expect(v.code).toBe('K7QX9M');
  });

  it('J2 validates token and name; unknown avatars fall back', () => {
    const h = setup();
    expect(h.ctrl.join({ name: 'Ali' })).toMatchObject({ ok: false, code: 'BAD_PAYLOAD' });
    expect(h.ctrl.join({ playerToken: 'short', name: 'Ali' })).toMatchObject({ ok: false, code: 'BAD_PAYLOAD' });
    expect(h.ctrl.join({ playerToken: 'token-123', name: 'A' })).toMatchObject({ ok: false, code: 'NAME_INVALID' });
    expect(h.ctrl.join({ playerToken: 'token-123', name: 'x'.repeat(17) })).toMatchObject({
      ok: false,
      code: 'NAME_INVALID',
    });
    expect(h.ctrl.join({ playerToken: 'token-123', name: ' \u0000‮ ' })).toMatchObject({ code: 'NAME_INVALID' });
    const r = h.ctrl.join({ playerToken: 'token-123', name: '  Ali   Khan ', avatar: '<script>' });
    expect(r.ok).toBe(true);
    expect(h.view().members[0]).toMatchObject({ name: 'Ali Khan', avatar: '🦁' });
  });

  it('J3 duplicate names get a number, ignoring case', () => {
    const h = setup();
    h.join('Ali', 'token-aaaa1');
    h.join('ali', 'token-aaaa2');
    h.join('ALI', 'token-aaaa3');
    expect(h.view().members.map((m) => m.name)).toEqual(['Ali', 'ali 2', 'ALI 3']);
  });

  it('J4 rejoining with the same token reclaims the same member', () => {
    const h = setup();
    const a = h.join('Ali');
    h.ctrl.setConnected(a, false);
    h.ctrl.drain();
    const again = h.ctrl.join({ playerToken: 'token-Ali', name: 'Different' });
    expect(again).toEqual({ ok: true, memberId: a, replaced: false });
    expect(h.view().members).toHaveLength(1);
    expect(h.view().members[0]).toMatchObject({ name: 'Ali', connected: true });
    expect(h.ctrl.drain()).toContainEqual({ kind: 'notice', payload: { code: 'memberReconnected', memberId: a } });
    // Joining again while connected (second tab) reports a replacement.
    expect(h.ctrl.join({ playerToken: 'token-Ali', name: 'Ali' })).toEqual({ ok: true, memberId: a, replaced: true });
  });

  it('J5 new players cannot join a started game; seated players can rejoin', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    expect(h.ctrl.join({ playerToken: 'token-new', name: 'Zara' })).toMatchObject({ code: 'GAME_IN_PROGRESS' });
    h.ctrl.setConnected(h.ids[1]!, false);
    expect(h.ctrl.join({ playerToken: 'token-Sara', name: 'Sara' })).toMatchObject({ ok: true, memberId: h.ids[1] });
  });

  it('J6 a room holds at most 8 members', () => {
    const h = setup();
    for (let i = 0; i < 8; i++) h.join(`P${i}x`);
    expect(h.ctrl.join({ playerToken: 'token-9th', name: 'Ninth' })).toMatchObject({ code: 'ROOM_FULL' });
  });
});

// ---------------------------------------------------------------------------
// Seats and readiness
// ---------------------------------------------------------------------------

describe('seats', () => {
  it('S1 taking, switching and conflicting seats', () => {
    const h = setup();
    const a = h.join('Ali');
    const b = h.join('Sara');
    h.must(a, { type: 'takeSeat', color: 'red' });
    expect(h.cmd(b, { type: 'takeSeat', color: 'red' })).toMatchObject({ code: 'SEAT_TAKEN' });
    h.must(b, { type: 'takeSeat', color: 'yellow' });
    h.must(b, { type: 'setReady', ready: true });
    h.must(b, { type: 'takeSeat', color: 'green' });
    const v = h.view();
    expect(Object.keys(v.seats).sort()).toEqual(['green', 'red']);
    expect(v.members.find((m) => m.id === b)).toMatchObject({ seat: 'green', ready: false });
    expect(h.cmd(a, { type: 'takeSeat', color: 'purple' as Color })).toMatchObject({ code: 'BAD_PAYLOAD' });
  });

  it('S2 leaving a seat; seats are fixed once playing', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    expect(h.cmd(h.ids[0]!, { type: 'leaveSeat' })).toMatchObject({ code: 'WRONG_ROOM_PHASE' });
    expect(h.cmd(h.ids[0]!, { type: 'takeSeat', color: 'blue' })).toMatchObject({ code: 'WRONG_ROOM_PHASE' });
    const l = setup();
    const a = l.join('Ali');
    l.must(a, { type: 'takeSeat', color: 'red' });
    l.must(a, { type: 'leaveSeat' });
    expect(l.view().seats).toEqual({});
  });

  it('S3 ready needs a seat', () => {
    const h = setup();
    const a = h.join('Ali');
    expect(h.cmd(a, { type: 'setReady', ready: true })).toMatchObject({ code: 'NOT_SEATED' });
    h.must(a, { type: 'takeSeat', color: 'red' });
    expect(h.cmd(a, { type: 'setReady', ready: 'yes' as never })).toMatchObject({ code: 'BAD_PAYLOAD' });
  });

  it('S4 the host can clear a seat in the lobby', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    expect(h.cmd(h.ids[1]!, { type: 'removeSeat', color: 'red' })).toMatchObject({ code: 'NOT_HOST' });
    h.must(h.ids[0]!, { type: 'removeSeat', color: 'yellow' });
    expect(h.view().members[1]).toMatchObject({ seat: null, ready: false });
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe('settings', () => {
  it('R1 only the host changes rules, and every value is validated', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    const [host, guest] = h.ids as [string, string];
    expect(h.cmd(guest, { type: 'updateSettings', settings: { diceMode: 1 } })).toMatchObject({ code: 'NOT_HOST' });
    const bad: Array<Record<string, unknown>> = [
      { diceMode: 3 },
      { extraTurnOnCapture: 'yes' },
      { teamHandover: 'later' },
      { teamHandoverDelayRounds: 0 },
      { teamHandoverDelayRounds: 2.5 },
      { turnTimer: 20 },
      { disconnectTakeover: -1 },
      { hacked: true },
    ];
    for (const settings of bad) {
      expect(h.cmd(host, { type: 'updateSettings', settings }), JSON.stringify(settings)).toMatchObject({
        code: 'BAD_PAYLOAD',
      });
    }
    expect(h.view().settings.diceMode).toBe(2); // nothing partially applied
    h.must(host, {
      type: 'updateSettings',
      settings: { killRequiredToEnterColumn: true, turnTimer: 30, disconnectTakeover: 0, teamHandoverDelayRounds: 3 },
    });
    expect(h.view().settings).toMatchObject({
      killRequiredToEnterColumn: true,
      turnTimer: 30,
      disconnectTakeover: 0,
      teamHandoverDelayRounds: 3,
    });
  });

  it('R2 a rule change un-readies everyone and is announced; a no-op is not', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    h.ctrl.drain();
    h.must(h.ids[0]!, { type: 'updateSettings', settings: { diceMode: 2 } }); // already 2
    expect(h.view().members[1]!.ready).toBe(true);
    h.must(h.ids[0]!, { type: 'updateSettings', settings: { diceMode: 1 } });
    expect(h.view().members[1]!.ready).toBe(false);
    expect(h.ctrl.drain()).toContainEqual({ kind: 'notice', payload: { code: 'settingsChanged' } });
  });

  it('R3 presets set the rule fields and are detected', () => {
    const h = setup();
    const a = h.join('Ali');
    // New rooms start on Hardcore: 2 dice, no bonuses, two dice to the end, capture to enter, takeover 60 s.
    expect(h.view().preset).toBe('hardcore');
    expect(h.view().settings).toMatchObject({
      diceMode: 2,
      extraTurnOnCapture: false,
      extraTurnOnFinish: false,
      singleDieWhenAllInColumn: false,
      killRequiredToEnterColumn: true,
      teamMode: false,
      turnTimer: 0,
      disconnectTakeover: 60,
    });
    h.must(a, { type: 'applyPreset', preset: 'twoDice' });
    expect(h.view().preset).toBe('twoDice');
    expect(h.view().settings).toMatchObject({ killRequiredToEnterColumn: false, extraTurnOnCapture: true });
    h.must(a, { type: 'updateSettings', settings: { extraTurnOnCapture: false } });
    expect(h.view().preset).toBe('custom');
    h.must(a, { type: 'applyPreset', preset: 'classic' });
    expect(h.view().preset).toBe('classic');
    expect(h.cmd(a, { type: 'applyPreset', preset: 'toString' as never })).toMatchObject({ code: 'BAD_PAYLOAD' });
  });
});

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

describe('starting a game', () => {
  it('ST1 waits for everyone to be ready, naming them', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    h.must(h.ids[1]!, { type: 'setReady', ready: false });
    expect(h.cmd(h.ids[0]!, { type: 'startGame' })).toMatchObject({
      code: 'CANNOT_START',
      message: 'Waiting for Sara to get ready',
    });
  });

  it('ST2 checks the seat arrangement against the rules', () => {
    const adjacent = lobby([['Ali', 'red'], ['Sara', 'green']]);
    expect(adjacent.cmd(adjacent.ids[0]!, { type: 'startGame' })).toMatchObject({ code: 'CANNOT_START' });
    const alone = lobby([['Ali', 'red']]);
    expect(alone.cmd(alone.ids[0]!, { type: 'startGame' })).toMatchObject({ code: 'CANNOT_START' });
    const teams = lobby([['Ali', 'red'], ['Sara', 'green'], ['Zed', 'yellow']]);
    teams.must(teams.ids[0]!, { type: 'updateSettings', settings: { teamMode: true } });
    teams.ids.slice(1).forEach((id) => teams.must(id, { type: 'setReady', ready: true }));
    expect(teams.cmd(teams.ids[0]!, { type: 'startGame' })).toMatchObject({ code: 'CANNOT_START' });
  });

  it('ST3 starts the game: phase, view, stats and events', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    expect(h.cmd(h.ids[1]!, { type: 'startGame' })).toMatchObject({ code: 'NOT_HOST' });
    h.ctrl.drain();
    h.must(h.ids[0]!, { type: 'startGame' });
    const v = h.view();
    expect(v.phase).toBe('playing');
    expect(v.game).toMatchObject({ version: 0, seats: ['red', 'yellow'], legalMoves: [], endedByHost: false });
    expect(v.game!.turn).toMatchObject({ seat: 'red', phase: 'awaitRoll', rollReason: 'turn' });
    expect(v.game!.stats.red).toEqual({ captures: 0, lost: 0, sixes: 0, voids: 0, botTurns: 0 });
    const out = h.ctrl.drain();
    expect(out).toContainEqual({ kind: 'notice', payload: { code: 'gameStarted' } });
    expect(out).toContainEqual({
      kind: 'events',
      payload: { version: 0, events: [{ type: 'TurnStarted', seat: 'red', controls: 'red' }] },
    });
  });

  it('ST4 a host who is not seated can still start', () => {
    const h = setup();
    const host = h.join('Host');
    const a = h.join('Ali');
    const b = h.join('Sara');
    h.must(a, { type: 'takeSeat', color: 'green' });
    h.must(b, { type: 'takeSeat', color: 'blue' });
    h.must(a, { type: 'setReady', ready: true });
    h.must(b, { type: 'setReady', ready: true });
    h.must(host, { type: 'startGame' });
    expect(h.view().game!.seats).toEqual(['green', 'blue']);
  });
});

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

describe('game actions', () => {
  it('G1 only the acting seat, with the current version, may act', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']], [6, 6, 2, 3]);
    const [ali, sara] = h.ids as [string, string];
    expect(h.cmd(sara, { type: 'roll', stateVersion: 0 })).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(h.cmd(ali, { type: 'roll', stateVersion: 5 })).toMatchObject({ code: 'STALE_STATE' });
    expect(h.cmd(ali, { type: 'roll' })).toMatchObject({ code: 'BAD_PAYLOAD' });
    h.must(ali, { type: 'roll', stateVersion: 0 });
    // A resent click with the old version is refused, never applied twice.
    expect(h.cmd(ali, { type: 'roll', stateVersion: 0 })).toMatchObject({ code: 'STALE_STATE' });
    expect(h.view().game!.turn).toMatchObject({ phase: 'awaitRoll', rollReason: 'reroll', bank: [6, 6] });
    h.must(ali, { type: 'roll', stateVersion: 1 });
    const g = h.view().game!;
    expect(g.turn).toMatchObject({ phase: 'awaitMove', bank: [6, 6, 2, 3], lastRoll: [2, 3] });
    expect(g.legalMoves.length).toBeGreaterThan(0);
    expect(g.legalMoves.every((m) => m.value === 6)).toBe(true);
    const events = h.ctrl.drain().filter((o) => o.kind === 'events');
    expect(events.map((e) => e.kind === 'events' && e.payload.version)).toEqual([1, 2]);
  });

  it('G2 moves: payload checks and engine errors pass through', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']], [6, 3]);
    const ali = h.ids[0]!;
    h.must(ali, { type: 'roll', stateVersion: 0 });
    expect(h.cmd(ali, { type: 'move', stateVersion: 1, pieceId: 'red-0' })).toMatchObject({ code: 'BAD_PAYLOAD' });
    expect(h.cmd(ali, { type: 'move', stateVersion: 1, pieceId: 'red-0', value: 3 })).toMatchObject({
      code: 'ILLEGAL_MOVE',
    });
    expect(h.cmd(ali, { type: 'move', stateVersion: 1, pieceId: 'red-0', value: 5 })).toMatchObject({
      code: 'VALUE_NOT_IN_BANK',
    });
    h.must(ali, { type: 'move', stateVersion: 1, pieceId: 'red-0', value: 6 });
    h.must(ali, { type: 'move', stateVersion: 2, pieceId: 'red-0', value: 3 });
    const g = h.view().game!;
    expect(g.pieces.find((p) => p.id === 'red-0')!.progress).toBe(3);
    expect(g.turn.seat).toBe('yellow');
  });

  it('G3 statistics follow the events', () => {
    // red: (6,6) then (6,1): out, out... ; yellow voids with (1,2)
    const h = started([['Ali', 'red'], ['Sara', 'yellow']], [6, 6, 6, 1, 1, 2]);
    const [ali, sara] = h.ids as [string, string];
    h.must(ali, { type: 'roll', stateVersion: 0 });
    h.must(ali, { type: 'roll', stateVersion: 1 });
    let v = versionOf(h);
    for (const [pieceId, value] of [['red-0', 6], ['red-1', 6], ['red-2', 6], ['red-0', 1]] as const) {
      h.must(ali, { type: 'move', stateVersion: v++, pieceId, value });
    }
    h.must(sara, { type: 'roll', stateVersion: v });
    const stats = h.view().game!.stats;
    expect(stats.red).toMatchObject({ sixes: 3, voids: 0 });
    expect(stats.yellow).toMatchObject({ sixes: 0, voids: 1 });
  });

  it('G4 a finished game can be replayed by vote, or sent back to the lobby', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    const [ali, sara] = h.ids as [string, string];
    playToEnd(h);
    const v = h.view();
    expect(v.phase).toBe('finished');
    expect(v.game!.rankings).toHaveLength(2);
    expect(v.game!.legalMoves).toEqual([]);
    expect(h.cmd(ali, { type: 'roll', stateVersion: v.game!.version })).toMatchObject({ code: 'WRONG_ROOM_PHASE' });

    h.must(ali, { type: 'rematchVote', yes: true });
    expect(h.view().rematchVotes).toEqual([ali]);
    h.must(sara, { type: 'rematchVote', yes: true });
    expect(h.view().phase).toBe('playing');
    expect(h.view().game!.version).toBe(0);
    expect(h.view().rematchVotes).toEqual([]);

    playToEnd(h);
    expect(h.cmd(sara, { type: 'backToLobby' })).toMatchObject({ code: 'NOT_HOST' });
    h.must(ali, { type: 'backToLobby' });
    expect(h.view()).toMatchObject({ phase: 'lobby', game: null });
    expect(h.view().members.every((m) => !m.ready)).toBe(true);
    expect(h.view().seats.red).toBeDefined(); // seats are kept
  });

  it('G5 only the host may end a game early', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    expect(h.cmd(h.ids[1]!, { type: 'endGame' })).toMatchObject({ code: 'NOT_HOST' });
    h.must(h.ids[0]!, { type: 'endGame' });
    expect(h.view()).toMatchObject({ phase: 'finished', game: { endedByHost: true } });
  });

  it('G6 rematch only needs the connected players', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    h.must(h.ids[0]!, { type: 'endGame' });
    h.ctrl.setConnected(h.ids[1]!, false);
    h.must(h.ids[0]!, { type: 'rematchVote', yes: true });
    expect(h.view().phase).toBe('playing');
  });

  it('G7 full 4-player team games run through the controller', () => {
    const h = lobby([['Ali', 'red'], ['Bo', 'green'], ['Cy', 'yellow'], ['Di', 'blue']]);
    h.must(h.ids[0]!, { type: 'updateSettings', settings: { teamMode: true, killRequiredToEnterColumn: true } });
    h.ids.slice(1).forEach((id) => h.must(id, { type: 'setReady', ready: true }));
    h.must(h.ids[0]!, { type: 'startGame' });
    playToEnd(h);
    expect(h.view().game!.winningTeam).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Host, presence and leaving
// ---------------------------------------------------------------------------

describe('host and presence', () => {
  it('H1 host passes to the longest-connected member after 60 s offline', () => {
    const h = setup();
    const a = h.join('Ali');
    h.advance(1000);
    const b = h.join('Sara');
    h.advance(1000);
    h.join('Zed');
    h.ctrl.setConnected(a, false);
    h.advance(HOST_TRANSFER_MS - 1);
    h.ctrl.tick();
    expect(h.view().hostId).toBe(a);
    h.advance(1);
    h.ctrl.drain();
    h.ctrl.tick();
    expect(h.view().hostId).toBe(b);
    expect(h.ctrl.drain()).toContainEqual({ kind: 'notice', payload: { code: 'hostChanged', memberId: b } });
    // The old host coming back does not take it back.
    h.ctrl.setConnected(a, true);
    h.ctrl.tick();
    expect(h.view().hostId).toBe(b);
  });

  it('H2 a host leaving the lobby hands over immediately; an empty room has no host', () => {
    const h = setup();
    const a = h.join('Ali');
    const b = h.join('Sara');
    h.must(a, { type: 'leaveRoom' });
    expect(h.view().hostId).toBe(b);
    h.must(b, { type: 'leaveRoom' });
    expect(h.view()).toMatchObject({ hostId: null, members: [] });
  });

  it('L1 leaving the lobby frees the seat', () => {
    const h = lobby([['Ali', 'red'], ['Sara', 'yellow']]);
    h.must(h.ids[1]!, { type: 'leaveRoom' });
    expect(h.view().seats.yellow).toBeUndefined();
    expect(h.view().members).toHaveLength(1);
  });

  it('L2 leaving mid-game keeps the seat, offline; the player can return', () => {
    const h = started([['Ali', 'red'], ['Sara', 'yellow']]);
    h.must(h.ids[1]!, { type: 'leaveRoom' });
    expect(h.view().seats.yellow).toMatchObject({ connected: false, offlineSince: h.now });
    expect(h.ctrl.join({ playerToken: 'token-Sara', name: 'Sara' })).toMatchObject({ ok: true, memberId: h.ids[1] });
    expect(h.view().seats.yellow).toMatchObject({ connected: true, offlineSince: 0 });
  });

  it('P1 connection changes show in the view and as notices', () => {
    const h = setup();
    const a = h.join('Ali');
    h.ctrl.drain();
    const rev = h.ctrl.currentRevision;
    h.ctrl.setConnected(a, false);
    h.ctrl.setConnected(a, false); // repeated: no change
    expect(h.ctrl.currentRevision).toBe(rev + 1);
    expect(h.view().members[0]!.connected).toBe(false);
    h.ctrl.setConnected(a, true);
    expect(h.ctrl.drain().map((o) => o.kind === 'notice' && o.payload.code)).toEqual([
      'memberDisconnected',
      'memberReconnected',
    ]);
  });

  it('D1 the room disposes itself only after being empty for long enough', () => {
    const h = setup();
    const a = h.join('Ali');
    expect(h.ctrl.shouldDispose()).toBe(false);
    h.ctrl.setConnected(a, false);
    h.advance(DISPOSE_IDLE_MS.lobby - 1);
    expect(h.ctrl.shouldDispose()).toBe(false);
    h.advance(1);
    expect(h.ctrl.shouldDispose()).toBe(true);

    const g = started([['Ali', 'red'], ['Sara', 'yellow']]);
    g.ids.forEach((id) => g.ctrl.setConnected(id, false));
    g.advance(DISPOSE_IDLE_MS.lobby);
    expect(g.ctrl.shouldDispose()).toBe(false); // a game in progress waits longer
    g.advance(DISPOSE_IDLE_MS.playing - DISPOSE_IDLE_MS.lobby);
    expect(g.ctrl.shouldDispose()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chat, reactions, limits
// ---------------------------------------------------------------------------

describe('chat and limits', () => {
  it('C1 chat is cleaned, length-limited and rate-limited', () => {
    const h = setup();
    const a = h.join('Ali');
    h.ctrl.drain();
    h.must(a, { type: 'chat', text: '  hello\u0000  ‮there  ' });
    expect(h.ctrl.drain()).toEqual([{ kind: 'chat', payload: { from: a, text: 'hello there', at: h.now } }]);
    expect(h.cmd(a, { type: 'chat', text: 'again' })).toMatchObject({ code: 'RATE_LIMITED' });
    h.advance(1000);
    expect(h.cmd(a, { type: 'chat', text: '   ' })).toMatchObject({ code: 'BAD_PAYLOAD' });
    expect(h.cmd(a, { type: 'chat', text: 'x'.repeat(121) })).toMatchObject({ code: 'BAD_PAYLOAD' });
    expect(h.cmd(a, { type: 'chat', text: 42 as never })).toMatchObject({ code: 'BAD_PAYLOAD' });
    h.must(a, { type: 'chat', text: 'x'.repeat(120) });
  });

  it('C2 reactions must be from the list and are rate-limited', () => {
    const h = setup();
    const a = h.join('Ali');
    expect(h.cmd(a, { type: 'react', emoji: '💩' })).toMatchObject({ code: 'BAD_PAYLOAD' });
    h.must(a, { type: 'react', emoji: '🔥' });
    h.must(a, { type: 'react', emoji: '👍' });
    expect(h.cmd(a, { type: 'react', emoji: '👍' })).toMatchObject({ code: 'RATE_LIMITED' });
    h.advance(1000);
    h.must(a, { type: 'react', emoji: '👍' });
  });

  it('C3 chat does not change the synced view', () => {
    const h = setup();
    const a = h.join('Ali');
    const rev = h.ctrl.currentRevision;
    h.must(a, { type: 'chat', text: 'hi' });
    expect(h.ctrl.currentRevision).toBe(rev);
  });

  it('X1 more than 20 commands a second are refused', () => {
    const h = setup();
    const a = h.join('Ali');
    for (let i = 0; i < 20; i++) h.must(a, { type: 'setProfile', name: 'Ali', avatar: '🦊' });
    expect(h.cmd(a, { type: 'setProfile', name: 'Ali', avatar: '🦊' })).toMatchObject({ code: 'RATE_LIMITED' });
    h.advance(1000);
    h.must(a, { type: 'setProfile', name: 'Ali', avatar: '🦊' });
  });

  it('X2 malformed commands never throw', () => {
    const h = setup();
    const a = h.join('Ali');
    const junk: unknown[] = [null, 42, 'roll', [], {}, { type: 7 }, { type: 'nope' }, { type: 'takeSeat' },
      { type: 'updateSettings', settings: null }, { type: 'move', stateVersion: '1' }, { type: 'chat' }];
    for (const j of junk) {
      const r = h.ctrl.command(a, j);
      expect(r.ok, JSON.stringify(j)).toBe(false);
    }
    expect(h.ctrl.command('ghost', { type: 'roll', stateVersion: 0 })).toMatchObject({ code: 'BAD_PAYLOAD' });
  });

  it('X3 setProfile validates and keeps names unique', () => {
    const h = setup();
    const a = h.join('Ali');
    h.join('Sara');
    expect(h.cmd(a, { type: 'setProfile', name: 'S', avatar: '🦊' })).toMatchObject({ code: 'NAME_INVALID' });
    h.must(a, { type: 'setProfile', name: 'sara', avatar: '🐼' });
    expect(h.view().members[0]).toMatchObject({ name: 'sara 2', avatar: '🐼' });
  });

  it('cleanText strips control and bidi characters', () => {
    expect(cleanText('a\u0007b​c⁦d  e\n')).toBe('abcd e');
  });
});
