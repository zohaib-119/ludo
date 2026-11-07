import { describe, expect, it } from 'vitest';
import { type Color, type LegalMove, type Piece, TRACK_CELLS, pointFor } from '@ludo/engine';
import type { EventsMessage, GameView } from '@ludo/protocol';
import { movablePieceIds, onlyMove, valuesForPiece } from '../src/game/choices';
import { ROTATION, cornerOf, placePieces, rotatePoint, rotationFor } from '../src/game/geometry';
import { describe as describeEvent } from '../src/game/log';
import { Playback } from '../src/game/playback';

describe('geometry', () => {
  it('rotates each colour’s yard to the bottom-left', () => {
    for (const c of ['red', 'green', 'yellow', 'blue'] as Color[]) {
      expect(cornerOf(c, ROTATION[c])).toBe('bottom-left');
      const yard = rotatePoint(pointFor(c, -1, 0), ROTATION[c]);
      expect(yard.x).toBeLessThan(7.5);
      expect(yard.y).toBeGreaterThan(7.5);
    }
    expect(rotationFor(null)).toBe(0);
  });

  it('keeps the other corners in clockwise order', () => {
    // Blue at the bottom-left: red (next clockwise before blue) sits top-left... check all four are distinct.
    const corners = (['red', 'green', 'yellow', 'blue'] as Color[]).map((c) => cornerOf(c, ROTATION.blue));
    expect(new Set(corners).size).toBe(4);
    expect(cornerOf('blue', 90)).toBe('bottom-left');
    expect(cornerOf('yellow', 90)).toBe('bottom-right');
  });

  it('rotation keeps the track a connected loop', () => {
    for (const deg of [0, 90, 180, 270]) {
      for (let i = 0; i < 52; i++) {
        const a = rotatePoint(TRACK_CELLS[i]!, deg);
        const b = rotatePoint(TRACK_CELLS[(i + 1) % 52]!, deg);
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeCloseTo(1);
      }
    }
  });

  it('spreads stacked pieces and shrinks them; yard pieces stay apart', () => {
    const pieces: Piece[] = [
      { id: 'red-0', color: 'red', progress: 5 },
      { id: 'red-1', color: 'red', progress: 5 },
      { id: 'red-2', color: 'red', progress: -1 },
      { id: 'red-3', color: 'red', progress: -1 },
    ];
    const placed = placePieces(pieces, {}, 0);
    expect(placed[0]!.stackSize).toBe(2);
    expect(placed[0]!.scale).toBeLessThan(1);
    expect(placed[0]!.x).not.toBe(placed[1]!.x);
    expect(placed[2]!.stackSize).toBe(1);
    expect(placed[2]!.x !== placed[3]!.x || placed[2]!.y !== placed[3]!.y).toBe(true);
  });

  it('uses the displayed progress, not the piece’s own', () => {
    const pieces: Piece[] = [{ id: 'red-0', color: 'red', progress: 9 }];
    const placed = placePieces(pieces, { 'red-0': 2 }, 0);
    expect({ x: placed[0]!.x, y: placed[0]!.y }).toEqual(pointFor('red', 2));
  });
});

describe('move choices', () => {
  const pieces: Piece[] = [
    { id: 'red-0', color: 'red', progress: 10 },
    { id: 'red-1', color: 'red', progress: 10 },
    { id: 'red-2', color: 'red', progress: 20 },
  ];
  const m = (pieceId: string, value: number, from: number): LegalMove => ({
    pieceId,
    value,
    from,
    to: from + value,
    captures: [],
    finishes: false,
  });

  it('lists distinct values for a piece, shared by identical stacked pieces', () => {
    const moves = [m('red-0', 3, 10), m('red-1', 3, 10), m('red-0', 5, 10), m('red-1', 5, 10), m('red-2', 3, 20)];
    expect(valuesForPiece(moves, pieces, 'red-1').map((x) => [x.pieceId, x.value])).toEqual([
      ['red-1', 3],
      ['red-1', 5],
    ]);
    expect(valuesForPiece(moves, pieces, 'red-2').map((x) => x.value)).toEqual([3]);
    expect(valuesForPiece(moves, pieces, 'nope')).toEqual([]);
  });

  it('filters movable pieces by a chosen die', () => {
    const moves = [m('red-0', 3, 10), m('red-2', 5, 20)];
    expect([...movablePieceIds(moves)]).toEqual(['red-0', 'red-2']);
    expect([...movablePieceIds(moves, 5)]).toEqual(['red-2']);
  });

  it('auto-moves only when every option is the same move', () => {
    expect(onlyMove([])).toBeNull();
    expect(onlyMove([m('red-0', 3, 10), m('red-1', 3, 10)])?.value).toBe(3); // twins: same outcome
    expect(onlyMove([m('red-0', 3, 10), m('red-2', 3, 20)])).toBeNull();
    expect(onlyMove([m('red-0', 3, 10), m('red-0', 5, 10)])).toBeNull();
  });
});

describe('log lines', () => {
  const names = (c: Color) => ({ red: 'Ali', yellow: 'Sara', green: 'Bo', blue: 'Di' })[c];
  it('describes events in words', () => {
    expect(
      describeEvent({ type: 'Rolled', seat: 'red', values: [6, 3], diceCount: 2, reason: 'turn' }, names)?.text,
    ).toBe('Ali rolled 6 · 3');
    expect(
      describeEvent(
        { type: 'Captured', victims: ['yellow-0', 'yellow-1'], at: 5, creditedTo: ['red'], kind: 'landing' },
        names,
      )?.text,
    ).toBe('Ali captured Sara');
    expect(describeEvent({ type: 'BotActed', seat: 'red', cause: 'timeout' }, names)?.text).toBe(
      'Time ran out — bot played for Ali',
    );
    expect(describeEvent({ type: 'BotActed', seat: 'red', cause: 'bot' }, names)).toBeNull();
    expect(describeEvent({ type: 'PlayerFinished', color: 'yellow', rank: 2 }, names)?.text).toBe('Sara finished 2nd');
  });
});

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

function view(version: number, pieces: Record<string, number>, lastRoll: number[] = []): GameView {
  return {
    version,
    seats: ['red', 'yellow'],
    pieces: Object.entries(pieces).map(([id, progress]) => ({ id, color: id.split('-')[0] as Color, progress })),
    players: {},
    turn: {
      seat: 'red',
      controls: 'red',
      phase: 'awaitMove',
      rollReason: null,
      bank: [],
      lastRoll,
      deadline: 0,
      takeoverAt: 0,
    },
    legalMoves: [],
    rankings: [],
    winningTeam: null,
    stats: {},
    endedByHost: false,
  };
}

function harness() {
  const progressTrace: Array<Record<string, number>> = [];
  const pb = new Playback({ nameOf: (c) => c, sleep: async () => {} });
  pb.store.subscribe((s) => progressTrace.push({ ...s.progress }));
  const settle = () => new Promise((r) => setTimeout(r, 10));
  return { pb, progressTrace, settle };
}

const msg = (version: number, events: EventsMessage['events']): EventsMessage => ({ version, events });

describe('Playback', () => {
  it('snaps to the first view', () => {
    const { pb } = harness();
    pb.sync(view(4, { 'red-0': 7 }, [6, 1]));
    expect(pb.store.getState()).toMatchObject({ version: 4, progress: { 'red-0': 7 }, busy: false });
  });

  it('hops a piece square by square, then settles on the event version', async () => {
    const { pb, progressTrace, settle } = harness();
    pb.sync(view(0, { 'red-0': 3 }));
    pb.sync(view(1, { 'red-0': 7 })); // state patch arrives first…
    expect(pb.store.getState().progress['red-0']).toBe(3); // …but the display waits for the events
    pb.push(msg(1, [{ type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 3, to: 7, value: 4 }]));
    await settle();
    const steps = progressTrace.map((p) => p['red-0']).filter((v, i, a) => v !== a[i - 1]);
    expect(steps).toEqual([3, 4, 5, 6, 7]);
    expect(pb.store.getState()).toMatchObject({ version: 1, busy: false });
  });

  it('sends captured pieces home and logs the capture', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, { 'red-0': 3, 'yellow-0': 33 }));
    pb.push(
      msg(1, [
        { type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 3, to: 7, value: 4 },
        { type: 'Captured', victims: ['yellow-0'], at: 7, creditedTo: ['red'], kind: 'landing' },
      ]),
    );
    await settle();
    expect(pb.store.getState().progress).toEqual({ 'red-0': 7, 'yellow-0': -1 });
    expect(pb.store.getState().log[0]!.text).toBe('red captured yellow');
  });

  it('fills the tray with rolled dice and removes one die per move, before the piece moves', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, { 'red-0': 0, 'red-1': 0 }));
    const trace: Array<{ tray: number[]; p0: number }> = [];
    pb.store.subscribe((s) => trace.push({ tray: s.tray.map((d) => d.value), p0: s.progress['red-0']! }));
    pb.push(msg(1, [{ type: 'Rolled', seat: 'red', values: [3, 5], diceCount: 2, reason: 'turn' }]));
    await settle();
    expect(pb.store.getState().tray.map((d) => [d.value, d.rolling])).toEqual([
      [3, false],
      [5, false],
    ]);
    pb.push(msg(2, [{ type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 0, to: 3, value: 3 }]));
    await settle();
    expect(pb.store.getState().tray.map((d) => d.value)).toEqual([5]);
    // The 3 left the tray while the piece was still on its old square.
    const used = trace.findIndex((x) => x.tray.length === 1);
    expect(trace[used]!.p0).toBe(0);
    pb.push(msg(3, [{ type: 'Moved', seat: 'red', pieceId: 'red-1', color: 'red', from: 0, to: 5, value: 5 }]));
    await settle();
    expect(pb.store.getState().tray).toEqual([]);
  });

  it('a void roll dims the dice and clears them, with no message', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, {}));
    const dimmed: boolean[] = [];
    pb.store.subscribe((s) => s.tray.length && dimmed.push(s.tray.every((d) => d.void)));
    pb.push(
      msg(1, [
        { type: 'Rolled', seat: 'red', values: [1, 2], diceCount: 2, reason: 'turn' },
        { type: 'RollVoided', seat: 'red', scope: 'turn', values: [1, 2] },
      ]),
    );
    await settle();
    expect(dimmed).toContain(true);
    expect(pb.store.getState().tray).toEqual([]);
    expect(pb.store.getState().banner).toBeNull();
  });

  it('a void bonus roll only removes the bonus dice', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, {}));
    pb.push(
      msg(1, [
        { type: 'Rolled', seat: 'red', values: [4, 3], diceCount: 2, reason: 'turn' },
        { type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 10, to: 14, value: 4 },
        { type: 'BonusGranted', seat: 'red', reason: 'capture' },
        { type: 'Rolled', seat: 'red', values: [6, 5], diceCount: 2, reason: 'bonus' },
        { type: 'RollVoided', seat: 'red', scope: 'bonus', values: [6, 5] },
      ]),
    );
    await settle();
    expect(pb.store.getState().tray.map((d) => d.value)).toEqual([3]);
  });

  it('re-rolls and bonus rolls show no banner; the tray clears when a turn starts', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, {}));
    pb.push(
      msg(1, [
        { type: 'Rolled', seat: 'red', values: [6, 6], diceCount: 2, reason: 'turn' },
        { type: 'RerollGranted', seat: 'red' },
        { type: 'Rolled', seat: 'red', values: [6], diceCount: 1, reason: 'reroll' },
        { type: 'RerollGranted', seat: 'red' },
        { type: 'BonusGranted', seat: 'red', reason: 'capture' },
      ]),
    );
    await settle();
    expect(pb.store.getState().banner).toBeNull();
    expect(pb.store.getState().tray).toHaveLength(3);
    // They still appear in the game log.
    expect(pb.store.getState().log.map((l) => l.text)).toContain('red rolls again');
    expect(pb.store.getState().log.map((l) => l.text)).toContain('red earned a bonus roll');
    pb.push(msg(2, [{ type: 'TurnStarted', seat: 'yellow', controls: 'yellow' }]));
    await settle();
    expect(pb.store.getState()).toMatchObject({ tray: [], traySeat: 'yellow' });
  });

  it('a player going out: pieces leave the board, a banner and a log line', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, { 'red-0': 12, 'red-1': 30, 'yellow-0': 52 }));
    pb.push(msg(1, [{ type: 'PlayerEliminated', color: 'red', rank: 2, reason: 'noCaptureLeft' }]));
    await settle();
    expect(pb.store.getState().progress).toEqual({ 'red-0': -1, 'red-1': -1, 'yellow-0': 52 });
    expect(pb.store.getState().banner).toMatchObject({ text: 'red is out — nothing left to capture', tone: 'bad' });
    expect(pb.store.getState().log[0]!.text).toBe('red is out — nothing left to capture');
  });

  it('calls the step hook on every square (for hop sounds)', async () => {
    const steps: Array<[number, number]> = [];
    const pb = new Playback({
      nameOf: (c) => c,
      sleep: async () => {},
      onStep: (_id, step, total) => steps.push([step, total]),
    });
    pb.sync(view(0, { 'red-0': 4 }));
    pb.push(msg(1, [{ type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 4, to: 7, value: 3 }]));
    await new Promise((r) => setTimeout(r, 10));
    expect(steps).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('a snap rebuilds the tray from the bank', () => {
    const { pb } = harness();
    const v = view(7, {});
    v.turn.bank = [6, 2];
    pb.sync(v);
    expect(pb.store.getState().tray.map((d) => d.value)).toEqual([6, 2]);
  });

  it('ignores events it has already shown (after a snap)', async () => {
    const { pb, settle } = harness();
    pb.sync(view(5, { 'red-0': 9 }));
    pb.push(msg(5, [{ type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: 3, to: 9, value: 6 }]));
    await settle();
    expect(pb.store.getState().log).toHaveLength(0);
    expect(pb.store.getState().progress['red-0']).toBe(9);
  });

  it('snaps when far behind, keeping the log', async () => {
    const { pb, settle } = harness();
    pb.sync(view(0, { 'red-0': 0 }));
    // 12 messages arrive in one burst, faster than they can be animated.
    for (let v = 1; v <= 12; v++) {
      pb.sync(view(v, { 'red-0': v }));
      pb.push(msg(v, [{ type: 'Moved', seat: 'red', pieceId: 'red-0', color: 'red', from: v - 1, to: v, value: 1 }]));
    }
    await settle();
    expect(pb.store.getState()).toMatchObject({ version: 12, progress: { 'red-0': 12 }, busy: false });
    expect(pb.store.getState().log).toHaveLength(12); // nothing lost from the log
  });

  it('snaps when the state moves on without events', async () => {
    const { pb } = harness();
    pb.sync(view(0, { 'red-0': 0 }));
    pb.sync(view(3, { 'red-0': 9 }));
    expect(pb.store.getState().version).toBe(0);
    await new Promise((r) => setTimeout(r, 600));
    expect(pb.store.getState()).toMatchObject({ version: 3, progress: { 'red-0': 9 } });
  });

  it('a rematch (lower version) resets the display', () => {
    const { pb } = harness();
    pb.sync(view(40, { 'red-0': 56 }));
    pb.sync(view(0, { 'red-0': -1 }));
    expect(pb.store.getState()).toMatchObject({ version: 0, progress: { 'red-0': -1 } });
  });
});
