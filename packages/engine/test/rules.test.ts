/**
 * Rule catalogue from docs/07-testing.md §3. Test names start with the catalogue ID.
 */
import { describe, expect, it } from 'vitest';
import { createGame, diceCountFor, legalMoves, scriptedRng, seededRng, validateSetup } from '../src';
import { BASE, bankValues, err, move, position, prog, progressOf, roll, types } from './helpers';

const H = 56; // home

describe('Dice and chains', () => {
  it('D1 1-die: a 6 grants a re-roll, a 5 does not', () => {
    const s = position({ settings: { diceMode: 1 }, pieces: { red: [10], yellow: [] } });
    const six = roll(s, 6);
    expect(types(six.events)).toEqual(['Rolled', 'RerollGranted']);
    expect(six.state.turn.phase).toEqual({ kind: 'awaitRoll', reason: 'reroll', chain: 'main' });
    expect(bankValues(six.state)).toEqual([6]);

    const five = roll(s, 5);
    expect(five.state.turn.phase.kind).toBe('awaitMove');
    expect(bankValues(five.state)).toEqual([5]);
  });

  it('D2 2-dice: (6,6) grants a re-roll, (6,3) does not', () => {
    const s = position({ pieces: { red: [10], yellow: [] } });
    expect(roll(s, 6, 6).state.turn.phase.kind).toBe('awaitRoll');
    const r = roll(s, 6, 3);
    expect(r.state.turn.phase.kind).toBe('awaitMove');
    expect(bankValues(r.state)).toEqual([6, 3]);
  });

  it('D3 re-roll chains stack with no cap', () => {
    let s = position({ pieces: { red: [], yellow: [] } });
    s = roll(s, 6, 6).state;
    s = roll(s, 6, 6).state;
    s = roll(s, 6, 6).state;
    s = roll(s, 2, 3).state;
    expect(bankValues(s)).toEqual([6, 6, 6, 6, 6, 6, 2, 3]);
    expect(s.turn.phase.kind).toBe('awaitMove');
  });

  it('D4 main chain unplayable after a re-roll voids the whole bank', () => {
    let s = position({ pieces: { red: [36, H, H, H], yellow: [] } });
    s = roll(s, 6, 6).state; // 36 + 12 = 48, fine
    const r = roll(s, 6, 5); // 36 + 23 = 59 > 56
    expect(r.events).toContainEqual({ type: 'RollVoided', seat: 'red', scope: 'turn', values: [6, 6, 6, 5] });
    expect(r.state.turn.seat).toBe('yellow');
    expect(r.state.turn.bank).toEqual([]);
    expect(progressOf(r.state, 'red-0')).toBe(36);
  });

  it('D5 an unplayable (6,6) gives no re-roll', () => {
    const r = roll(position({ pieces: { red: [50, H, H, H], yellow: [] } }), 6, 6);
    expect(types(r.events)).not.toContain('RerollGranted');
    expect(types(r.events)).toContain('RollVoided');
    expect(r.state.turn.seat).toBe('yellow');
  });

  it('D6 only one of two dice playable → whole roll void (no partial play)', () => {
    const r = roll(position({ pieces: { red: [53], yellow: [] } }), 3, 4);
    expect(r.events).toContainEqual({ type: 'RollVoided', seat: 'red', scope: 'turn', values: [3, 4] });
    expect(progressOf(r.state, 'red-0')).toBe(53);
  });

  it('D7 no dice playable at all → void', () => {
    const r = roll(position({ pieces: { red: [], yellow: [] } }), 5, 3);
    expect(types(r.events)).toEqual(['Rolled', 'RollVoided', 'TurnStarted']);
  });
});

describe('Single die in 2-dice mode', () => {
  it('S1 Rule A: one unfinished piece in the column → 1 die', () => {
    const s = position({ pieces: { red: [52, H, H, H], yellow: [] } });
    expect(diceCountFor(s, 'red')).toBe(1);
    const r = roll(s, 4);
    expect(r.events[0]).toMatchObject({ type: 'Rolled', diceCount: 1, values: [4] });
    expect(bankValues(r.state)).toEqual([4]);
  });

  it('S2 Rule A does not apply when the last piece is on the track', () => {
    expect(diceCountFor(position({ pieces: { red: [30, H, H, H], yellow: [] } }), 'red')).toBe(2);
  });

  it('S3 Rule B on: all unfinished pieces in the column → 1 die', () => {
    const s = position({ settings: { singleDieWhenAllInColumn: true }, pieces: { red: [52, 53, H, H], yellow: [] } });
    expect(diceCountFor(s, 'red')).toBe(1);
  });

  it('S3b Rule B ignores a piece still in the yard or on the track', () => {
    const settings = { singleDieWhenAllInColumn: true };
    expect(diceCountFor(position({ settings, pieces: { red: [52, 53, -1, H], yellow: [] } }), 'red')).toBe(2);
    expect(diceCountFor(position({ settings, pieces: { red: [52, 53, 40, H], yellow: [] } }), 'red')).toBe(2);
  });

  it('S4 Rule B off: two pieces needing 1 each need exactly (1,1)', () => {
    const s = position({ pieces: { red: [55, 55, H, H], yellow: [] } });
    expect(diceCountFor(s, 'red')).toBe(2);
    expect(roll(s, 1, 1).state.turn.phase.kind).toBe('awaitMove');
    expect(types(roll(s, 1, 2).events)).toContain('RollVoided');
  });

  it('S5 a single die of 6 can never be used from the column, so it is void (no re-roll)', () => {
    const r = roll(position({ pieces: { red: [51, H, H, H], yellow: [] } }), 6);
    expect(types(r.events)).toEqual(['Rolled', 'RollVoided', 'TurnStarted']);
  });

  it('S6 1-die mode always rolls one die', () => {
    expect(diceCountFor(position({ settings: { diceMode: 1 }, pieces: { red: [], yellow: [] } }), 'red')).toBe(1);
  });
});

describe('Movement', () => {
  it('M1 a piece leaves the yard only on a 6 and lands on its start square', () => {
    const s = position({ pieces: { red: [], yellow: [] }, bank: [6, 2] });
    const moves = legalMoves(s);
    expect(moves.every((m) => m.value === 6 && m.to === 0)).toBe(true);
    expect(moves).toHaveLength(4);
    const r = move(s, 'red-0', 6);
    expect(progressOf(r.state, 'red-0')).toBe(0);
  });

  it('M2 finishing needs an exact roll', () => {
    const s = position({ pieces: { red: [53, 10], yellow: [] }, bank: [4] });
    expect(legalMoves(s).map((m) => m.pieceId)).toEqual(['red-1']);
    expect(err(s, { type: 'move', seat: 'red', pieceId: 'red-0', value: 4 })).toBe('ILLEGAL_MOVE');
    const done = move(position({ pieces: { red: [53, 10], yellow: [] }, bank: [3] }), 'red-0', 3);
    expect(progressOf(done.state, 'red-0')).toBe(H);
    expect(types(done.events)).toContain('PieceFinished');
  });

  it('M3 no blocks: pieces pass over stacks', () => {
    const y = prog('yellow', 12);
    const s = position({ pieces: { red: [10], yellow: [y, y] }, bank: [5] });
    const r = move(s, 'red-0', 5);
    expect(progressOf(r.state, 'red-0')).toBe(15);
    expect(progressOf(r.state, 'yellow-0')).toBe(y);
  });

  it('M4 order matters: (6,3) from the yard is playable (6 first)', () => {
    let s = roll(position({ pieces: { red: [], yellow: [] } }), 6, 3).state;
    expect(legalMoves(s).every((m) => m.value === 6)).toBe(true);
    s = move(s, 'red-0', 6).state;
    expect(legalMoves(s).map((m) => [m.pieceId, m.value])).toEqual([['red-0', 3]]);
    s = move(s, 'red-0', 3).state;
    expect(progressOf(s, 'red-0')).toBe(3);
    expect(s.turn.seat).toBe('yellow');
  });

  it('M5 the search finds the order where a capture unlocks the column', () => {
    const s = position({
      settings: { killRequiredToEnterColumn: true },
      pieces: { red: [48], yellow: [prog('yellow', 50)] },
    });
    let r = roll(s, 2, 5);
    expect(r.state.turn.phase.kind).toBe('awaitMove');
    expect(legalMoves(r.state).map((m) => [m.pieceId, m.value])).toEqual([['red-0', 2]]);
    r = move(r.state, 'red-0', 2);
    expect(types(r.events)).toEqual(expect.arrayContaining(['Captured', 'KillUnlocked']));
    r = move(r.state, 'red-0', 5);
    expect(progressOf(r.state, 'red-0')).toBe(55);
  });

  it('M6 a move is refused if it would leave the rest of the bank unplayable', () => {
    // With a free piece on the track, every single-legal move keeps the bank playable.
    const s = position({ pieces: { red: [50, 40, H, H], yellow: [] }, bank: [6, 1] });
    expect(legalMoves(s).map((m) => [m.pieceId, m.value]).sort()).toEqual([
      ['red-0', 1],
      ['red-0', 6],
      ['red-1', 1],
      ['red-1', 6],
    ]);
    // Pieces at 50 and 55 with (6,1): only 6 → red-0 and 1 → red-1 work together.
    // red-0 taking the 1 (→ 51) would leave a 6 nobody can use.
    const t = position({ pieces: { red: [50, 55, H, H], yellow: [] }, bank: [6, 1] });
    expect(legalMoves(t).map((m) => [m.pieceId, m.value]).sort()).toEqual([
      ['red-0', 6],
      ['red-1', 1],
    ]);
    expect(err(t, { type: 'move', seat: 'red', pieceId: 'red-0', value: 1 })).toBe('ILLEGAL_MOVE');
  });
});

describe('Captures and bonuses', () => {
  const y14 = prog('yellow', 14);

  it('C1 landing on a single enemy captures it and credits the mover', () => {
    const r = move(position({ pieces: { red: [10], yellow: [y14] }, bank: [4] }), 'red-0', 4);
    expect(progressOf(r.state, 'yellow-0')).toBe(-1);
    expect(r.events).toContainEqual({
      type: 'Captured',
      victims: ['yellow-0'],
      at: 14,
      creditedTo: ['red'],
      kind: 'landing',
    });
    expect(r.state.players.red!.hasKilled).toBe(true);
  });

  it('C2 a same-owner stack is captured together by one piece', () => {
    const r = move(position({ pieces: { red: [10], yellow: [y14, y14] }, bank: [4] }), 'red-0', 4);
    expect(progressOf(r.state, 'yellow-0')).toBe(-1);
    expect(progressOf(r.state, 'yellow-1')).toBe(-1);
  });

  it('C3 no captures on safe squares; different colours share them', () => {
    const y8 = prog('yellow', 8);
    const r = move(position({ pieces: { red: [4], yellow: [y8] }, bank: [4] }), 'red-0', 4);
    expect(progressOf(r.state, 'yellow-0')).toBe(y8);
    expect(types(r.events)).not.toContain('Captured');
  });

  it('C3b start squares are safe too', () => {
    const y13 = prog('yellow', 13); // green's start square
    const r = move(position({ pieces: { red: [9], yellow: [y13] }, bank: [4] }), 'red-0', 4);
    expect(progressOf(r.state, 'yellow-0')).toBe(y13);
  });

  it('C4 capture bonus only when the toggle is on', () => {
    const base = { pieces: { red: [10], yellow: [y14] }, bank: [4] };
    const off = move(position(base), 'red-0', 4);
    expect(off.state.turn.seat).toBe('yellow');
    const on = move(position({ ...base, settings: { extraTurnOnCapture: true } }), 'red-0', 4);
    expect(on.events).toContainEqual({ type: 'BonusGranted', seat: 'red', reason: 'capture' });
    expect(on.state.turn.phase).toEqual({ kind: 'awaitRoll', reason: 'bonus', chain: 'bonus-1' });
  });

  it('C4b finish bonus only when the toggle is on', () => {
    const base = { pieces: { red: [54, 10], yellow: [] }, bank: [2] };
    expect(move(position(base), 'red-0', 2).state.turn.seat).toBe('yellow');
    const on = move(position({ ...base, settings: { extraTurnOnFinish: true } }), 'red-0', 2);
    expect(on.events).toContainEqual({ type: 'BonusGranted', seat: 'red', reason: 'finish' });
  });

  it('C5 the bonus is rolled immediately; bonus dice join the remaining bank', () => {
    const s = position({
      settings: { extraTurnOnCapture: true },
      pieces: { red: [10, 20], yellow: [y14] },
      bank: [4, 3],
    });
    let r = move(s, 'red-0', 4);
    expect(r.state.turn.phase.kind).toBe('awaitRoll');
    expect(bankValues(r.state)).toEqual([3]);
    expect(err(r.state, { type: 'move', seat: 'red', pieceId: 'red-1', value: 3 })).toBe('WRONG_PHASE');
    r = roll(r.state, 2, 5);
    expect(bankValues(r.state)).toEqual([3, 2, 5]);
    expect(r.state.turn.phase.kind).toBe('awaitMove');
  });

  it('C6 an unplayable bonus roll voids only the bonus dice', () => {
    const s = position({
      settings: { extraTurnOnCapture: true },
      pieces: { red: [46, H, H, H], yellow: [prog('yellow', 50)] },
      bank: [4, 3],
    });
    let r = move(s, 'red-0', 4); // captures at 50
    expect(r.state.turn.phase.kind).toBe('awaitRoll');
    r = roll(r.state, 5, 6); // 50 + 3 + 5 + 6 > 56
    expect(r.events).toContainEqual({ type: 'RollVoided', seat: 'red', scope: 'bonus', values: [5, 6] });
    expect(bankValues(r.state)).toEqual([3]);
    expect(r.state.turn.phase.kind).toBe('awaitMove');
    r = move(r.state, 'red-0', 3);
    expect(progressOf(r.state, 'red-0')).toBe(53);
    expect(r.state.turn.seat).toBe('yellow');
  });

  it('C7 a bonus (6,6) followed by an unplayable re-roll voids the entire bonus chain', () => {
    const s = position({
      settings: { extraTurnOnCapture: true },
      pieces: { red: [31, H, H, H], yellow: [prog('yellow', 35)] },
      bank: [4, 1],
    });
    let r = move(s, 'red-0', 4); // 35, capture
    r = roll(r.state, 6, 6); // 35 + 1 + 12 = 48: playable → bonus re-roll
    expect(r.state.turn.phase).toEqual({ kind: 'awaitRoll', reason: 'bonusReroll', chain: 'bonus-1' });
    r = roll(r.state, 6, 5); // 35 + 1 + 23 > 56
    expect(r.events).toContainEqual({ type: 'RollVoided', seat: 'red', scope: 'bonus', values: [6, 6, 6, 5] });
    expect(bankValues(r.state)).toEqual([1]);
  });

  it('C8 capturing a stack of two is one bonus', () => {
    const r = move(
      position({ settings: { extraTurnOnCapture: true }, pieces: { red: [10], yellow: [y14, y14] }, bank: [4] }),
      'red-0',
      4,
    );
    expect(types(r.events).filter((t) => t === 'BonusGranted')).toHaveLength(1);
  });

  it('C9 a void bonus with no other dice left ends the turn', () => {
    const s = position({
      settings: { extraTurnOnCapture: true },
      pieces: { red: [46, H, H, H], yellow: [prog('yellow', 50)] },
      bank: [4],
    });
    let r = move(s, 'red-0', 4);
    r = roll(r.state, 6, 6); // 50 + 12 > 56
    expect(types(r.events)).toEqual(['Rolled', 'RollVoided', 'TurnStarted']);
    expect(r.state.turn.seat).toBe('yellow');
  });

  it('C10 bonus dice are tagged by chain; a second bonus is a separate chain', () => {
    const y = prog('yellow', 20);
    const y2 = prog('yellow', 23);
    const s = position({
      settings: { extraTurnOnCapture: true, diceMode: 1 },
      pieces: { red: [16, 30], yellow: [y, y2] },
      bank: [4],
    });
    let r = move(s, 'red-0', 4); // capture at 20 → bonus-1
    r = roll(r.state, 3);
    expect(r.state.turn.bank).toEqual([{ value: 3, chain: 'bonus-1' }]);
    r = move(r.state, 'red-0', 3); // capture at 23 → bonus-2
    expect(r.state.turn.phase).toEqual({ kind: 'awaitRoll', reason: 'bonus', chain: 'bonus-2' });
  });
});

describe('Kill-to-enter', () => {
  const settings = { killRequiredToEnterColumn: true };

  it('K1 without a kill, a piece cannot pass progress 50', () => {
    const s = position({ settings, pieces: { red: [48, H, H, H], yellow: [] }, bank: [2] });
    expect(legalMoves(s)).toHaveLength(1); // 48 → 50 is fine
    const r = roll(position({ settings: { ...settings, diceMode: 1 }, pieces: { red: [48], yellow: [] } }), 3);
    expect(types(r.events)).toContain('RollVoided');
    const stuck = position({ settings: { ...settings, diceMode: 1 }, pieces: { red: [50], yellow: [] } });
    for (const d of [1, 2, 3, 4, 5]) expect(types(roll(stuck, d).events)).toContain('RollVoided');
  });

  it('K1b with a kill, the column is open', () => {
    const r = roll(
      position({ settings: { ...settings, diceMode: 1 }, pieces: { red: [48], yellow: [] }, hasKilled: { red: true } }),
      3,
    );
    expect(r.state.turn.phase.kind).toBe('awaitMove');
  });

  it('K3 losing all four pieces to the yard resets the requirement', () => {
    const s = position({
      settings,
      pieces: { red: [10], yellow: [prog('yellow', 6)] },
      hasKilled: { red: true },
      seat: 'yellow',
      bank: [4],
    });
    const r = move(s, 'yellow-0', 4);
    expect(r.state.players.red!.hasKilled).toBe(false);
    expect(r.events).toContainEqual({ type: 'KillReset', color: 'red' });
  });

  it('K4 a piece in the column (or home) keeps the requirement satisfied', () => {
    for (const safePiece of [52, H]) {
      const s = position({
        settings,
        pieces: { red: [10, safePiece], yellow: [prog('yellow', 6)] },
        hasKilled: { red: true },
        seat: 'yellow',
        bank: [4],
      });
      const r = move(s, 'yellow-0', 4);
      expect(r.state.players.red!.hasKilled).toBe(true);
    }
  });

  it('K5 a reset is not triggered while some pieces are still out', () => {
    const s = position({
      settings,
      pieces: { red: [10, 30], yellow: [prog('yellow', 6)] },
      hasKilled: { red: true },
      seat: 'yellow',
      bank: [4],
    });
    expect(move(s, 'yellow-0', 4).state.players.red!.hasKilled).toBe(true);
  });
});

describe('Teams', () => {
  const settings = { teamMode: true };
  // Square 30 is a normal (not safe) square.
  const S = 30;
  const at = (c: 'red' | 'green' | 'yellow' | 'blue') => prog(c, S);

  it('T1 teammates never capture each other and share a square', () => {
    const s = position({
      settings,
      pieces: { red: [at('red') - 4], green: [], yellow: [at('yellow')], blue: [] },
      bank: [4],
    });
    const r = move(s, 'red-0', 4);
    expect(progressOf(r.state, 'yellow-0')).toBe(at('yellow'));
    expect(types(r.events)).not.toContain('Captured');
  });

  it('T2 a single enemy cannot capture a mixed stack and sits on it', () => {
    const s = position({
      settings,
      pieces: { red: [at('red')], green: [at('green') - 4], yellow: [at('yellow')], blue: [] },
      seat: 'green',
      bank: [4],
    });
    const r = move(s, 'green-0', 4);
    expect(types(r.events)).not.toContain('Captured');
    expect(progressOf(r.state, 'red-0')).toBe(at('red'));
    expect(progressOf(r.state, 'yellow-0')).toBe(at('yellow'));
    expect(progressOf(r.state, 'green-0')).toBe(at('green'));
  });

  it('T3 the second enemy team-mate landing captures the whole mixed stack', () => {
    const s = position({
      settings: { ...settings, extraTurnOnCapture: true },
      pieces: {
        red: [at('red')],
        green: [at('green')],
        yellow: [at('yellow')],
        blue: [at('blue') - 3],
      },
      seat: 'blue',
      bank: [3],
    });
    const r = move(s, 'blue-0', 3);
    const cap = r.events.find((e) => e.type === 'Captured');
    expect(cap).toMatchObject({ victims: ['red-0', 'yellow-0'], creditedTo: ['green', 'blue'], kind: 'landing' });
    expect(r.state.players.green!.hasKilled).toBe(true);
    expect(r.state.players.blue!.hasKilled).toBe(true);
    expect(r.events).toContainEqual({ type: 'BonusGranted', seat: 'blue', reason: 'capture' });
    expect(types(r.events).filter((t) => t === 'BonusGranted')).toHaveLength(1);
  });

  it('T4 two pieces of the same enemy cannot capture a mixed stack', () => {
    const s = position({
      settings,
      pieces: { red: [at('red')], green: [at('green'), at('green') - 2], yellow: [at('yellow')], blue: [] },
      seat: 'green',
      bank: [2],
    });
    const r = move(s, 'green-1', 2);
    expect(types(r.events)).not.toContain('Captured');
  });

  it('T5 a team-mate leaving exposes the piece left behind (credit, no bonus)', () => {
    const s = position({
      settings: { ...settings, extraTurnOnCapture: true },
      pieces: { red: [at('red')], green: [at('green')], yellow: [at('yellow')], blue: [] },
      seat: 'red',
      bank: [2],
    });
    const r = move(s, 'red-0', 2);
    expect(r.events).toContainEqual({
      type: 'Captured',
      victims: ['yellow-0'],
      at: S,
      creditedTo: ['green'],
      kind: 'leftover',
    });
    expect(progressOf(r.state, 'yellow-0')).toBe(-1);
    expect(r.state.players.green!.hasKilled).toBe(true);
    expect(types(r.events)).not.toContain('BonusGranted');
  });

  it('T5b leaving a stack of three keeps the remaining mixed pair safe', () => {
    const s = position({
      settings,
      pieces: { red: [at('red'), at('red')], green: [at('green')], yellow: [at('yellow')], blue: [] },
      seat: 'red',
      bank: [2],
    });
    expect(types(move(s, 'red-0', 2).events)).not.toContain('Captured');
  });

  it('T6 a defender landing on the sitting enemy captures it', () => {
    const s = position({
      settings,
      pieces: { red: [at('red'), at('red') - 4], green: [at('green')], yellow: [at('yellow')], blue: [] },
      seat: 'red',
      bank: [4],
    });
    const r = move(s, 'red-1', 4);
    expect(r.events.find((e) => e.type === 'Captured')).toMatchObject({ victims: ['green-0'], creditedTo: ['red'] });
  });

  it('T6b in team mode a single enemy piece is captured normally', () => {
    const s = position({
      settings,
      pieces: { red: [at('red') - 4], green: [at('green')], yellow: [], blue: [] },
      bank: [4],
    });
    expect(progressOf(move(s, 'red-0', 4).state, 'green-0')).toBe(-1);
  });

  it('T7 immediate handover: the finished player then plays the team-mate’s pieces', () => {
    // Red finishes its last piece.
    let r = move(
      position({ settings, pieces: { red: [55, H, H, H], green: [], yellow: [52, H, H, H], blue: [] }, bank: [1] }),
      'red-0',
      1,
    );
    expect(r.events).toContainEqual({ type: 'PlayerFinished', color: 'red', rank: 1 });
    expect(r.events).toContainEqual({ type: 'HandoverStarted', seat: 'red', controls: 'yellow', delay: 0 });
    expect(r.state.turn.seat).toBe('green');
    // Green, yellow and blue all void.
    r = roll(r.state, 1, 2); // green: nothing out
    r = roll(r.state, 6); // yellow: Rule A, 52 + 6 > 56 → void
    r = roll(r.state, 1, 2); // blue: nothing out
    expect(r.state.turn).toMatchObject({ seat: 'red', controls: 'yellow' });
    // Dice count follows yellow's pieces (Rule A → 1 die).
    r = roll(r.state, 4);
    expect(r.events[0]).toMatchObject({ type: 'Rolled', seat: 'red', diceCount: 1 });
    expect(legalMoves(r.state).map((m) => m.pieceId)).toEqual(['yellow-0']);
    expect(err(r.state, { type: 'move', seat: 'yellow', pieceId: 'yellow-0', value: 4 })).toBe('NOT_YOUR_TURN');
    r = move(r.state, 'yellow-0', 4);
    expect(r.state.winningTeam).toEqual(['red', 'yellow']);
    expect(r.state.turn.phase.kind).toBe('gameOver');
  });

  it('T7b while handing over, kill credit goes to the team-mate', () => {
    const s = position({
      settings,
      pieces: { red: [H, H, H, H], green: [prog('green', 14)], yellow: [prog('yellow', 10)], blue: [] },
      finished: ['red'],
      seat: 'red',
      controls: 'yellow',
      bank: [4],
    });
    const r = move(s, 'yellow-0', 4);
    expect(r.state.players.yellow!.hasKilled).toBe(true);
    expect(r.state.players.red!.hasKilled).toBe(false);
  });

  it('T8 delayed handover skips the finished player’s turns first', () => {
    let s = position({
      settings: { ...settings, teamHandover: 'delayed', teamHandoverDelayRounds: 2 },
      pieces: { red: [H, H, H, H], green: [], yellow: [], blue: [] },
      finished: ['red'],
      handoverDelay: { red: 2 },
      seat: 'blue',
    });
    let r = roll(s, 1, 2); // blue void → red skipped (2 → 1) → green
    expect(r.events).toContainEqual({ type: 'TurnSkipped', seat: 'red', reason: 'handoverDelay' });
    expect(r.state.turn.seat).toBe('green');
    s = r.state;
    s = roll(s, 1, 2).state; // green
    s = roll(s, 1, 2).state; // yellow
    r = roll(s, 1, 2); // blue → red skipped (1 → 0) → green
    expect(r.state.turn.seat).toBe('green');
    expect(r.state.players.red!.handoverDelayLeft).toBe(0);
    s = roll(r.state, 1, 2).state; // green
    s = roll(s, 1, 2).state; // yellow
    s = roll(s, 1, 2).state; // blue → red now plays for yellow
    expect(s.turn).toMatchObject({ seat: 'red', controls: 'yellow' });
  });

  it('T9 a team wins when both players have finished', () => {
    const s = position({
      settings,
      pieces: { red: [55, H, H, H], green: [], yellow: [H, H, H, H], blue: [] },
      finished: ['yellow'],
      bank: [1],
    });
    const r = move(s, 'red-0', 1);
    expect(r.state.winningTeam).toEqual(['yellow', 'red']);
    expect(r.events.at(-1)).toMatchObject({ type: 'GameOver' });
    expect(err(r.state, { type: 'roll', seat: 'green' }, [1, 1])).toBe('GAME_OVER');
  });
});

describe('Game flow and setup', () => {
  it('G1 2-player games must use opposite corners', () => {
    expect(validateSetup(BASE, ['red', 'green'])).toMatch(/opposite/);
    expect(validateSetup(BASE, ['red', 'yellow'])).toBeNull();
    expect(validateSetup(BASE, ['green', 'blue'])).toBeNull();
    expect(validateSetup({ ...BASE, teamMode: true }, ['red', 'green', 'yellow'])).toMatch(/team/);
    expect(validateSetup(BASE, ['red'])).not.toBeNull();
    expect(validateSetup(BASE, ['red', 'green', 'green'])).not.toBeNull();
    expect(validateSetup({ ...BASE, teamHandoverDelayRounds: 0 }, ['red', 'yellow'])).not.toBeNull();
  });

  it('G1b createGame orders seats clockwise and picks the first player with the rng', () => {
    const r = createGame(BASE, ['blue', 'red', 'yellow'], scriptedRng([]));
    if (!r.ok) throw new Error('setup failed');
    expect(r.state.seats).toEqual(['red', 'yellow', 'blue']);
    expect(r.state.turn.seat).toBe('red');
    expect(r.state.pieces).toHaveLength(12);
    expect(r.state.pieces.every((p) => p.progress === -1)).toBe(true);
    const seeded = createGame(BASE, ['red', 'green', 'yellow', 'blue'], seededRng(7));
    expect(seeded.ok).toBe(true);
  });

  it('G2 FFA: rankings and the game ends when one player is left', () => {
    let r = move(
      position({ pieces: { red: [55, H, H, H], green: [54, H, H, H], yellow: [] }, bank: [1] }),
      'red-0',
      1,
    );
    expect(r.events).toContainEqual({ type: 'PlayerFinished', color: 'red', rank: 1 });
    expect(r.state.turn.seat).toBe('green');
    r = roll(r.state, 2); // Rule A: 1 die
    r = move(r.state, 'green-0', 2);
    expect(r.state.rankings).toEqual(['red', 'green', 'yellow']);
    expect(r.state.players.yellow!.finishedRank).toBe(3);
    expect(r.state.turn.phase.kind).toBe('gameOver');
  });

  it('G3 FFA: finished players are skipped', () => {
    const s = position({
      pieces: { red: [H, H, H, H], green: [], yellow: [] },
      finished: ['red'],
      seat: 'yellow',
    });
    expect(roll(s, 1, 2).state.turn.seat).toBe('green');
  });

  it('G4 finishing the last piece earns no bonus', () => {
    const r = move(
      position({
        settings: { extraTurnOnFinish: true },
        pieces: { red: [55, H, H, H], green: [], yellow: [] },
        bank: [1],
      }),
      'red-0',
      1,
    );
    expect(types(r.events)).not.toContain('BonusGranted');
    expect(r.state.turn.seat).toBe('green');
  });
});

describe('Errors and purity', () => {
  const s = position({ pieces: { red: [10], yellow: [] }, bank: [3] });

  it('rejects actions from the wrong seat or in the wrong phase', () => {
    expect(err(s, { type: 'move', seat: 'yellow', pieceId: 'yellow-0', value: 3 })).toBe('NOT_YOUR_TURN');
    expect(err(s, { type: 'roll', seat: 'red' })).toBe('WRONG_PHASE');
    const rollPhase = position({ pieces: { red: [10], yellow: [] } });
    expect(err(rollPhase, { type: 'move', seat: 'red', pieceId: 'red-0', value: 3 })).toBe('WRONG_PHASE');
  });

  it('rejects bad pieces and values', () => {
    expect(err(s, { type: 'move', seat: 'red', pieceId: 'yellow-0', value: 3 })).toBe('NO_SUCH_PIECE');
    expect(err(s, { type: 'move', seat: 'red', pieceId: 'nope', value: 3 })).toBe('NO_SUCH_PIECE');
    expect(err(s, { type: 'move', seat: 'red', pieceId: 'red-0', value: 4 })).toBe('VALUE_NOT_IN_BANK');
    expect(err(s, { type: 'move', seat: 'red', pieceId: 'red-1', value: 3 })).toBe('ILLEGAL_MOVE');
  });

  it('never mutates its input and bumps the version', () => {
    const before = JSON.stringify(s);
    const r = move(s, 'red-0', 3);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.state.version).toBe(s.version + 1);
  });
});
