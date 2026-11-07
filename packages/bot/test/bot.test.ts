import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Color,
  type GameState,
  type Settings,
  DEFAULT_SETTINGS,
  apply,
  createGame,
  legalMoves,
  seededRng,
} from '@ludo/engine';
import { chooseAction, chooseMove, evaluate, hitChance } from '../src';
import { position, prog } from '../../engine/test/helpers';
import { playMatch } from '../scripts/match';

const rng = () => seededRng(42);
const pick = (s: GameState) => {
  const m = chooseMove(s, rng());
  return m && [m.pieceId, m.value];
};

describe('bot decisions', () => {
  it('B1 rolls when it must roll', () => {
    const s = position({ pieces: { red: [10], yellow: [] } });
    expect(chooseAction(s, rng())).toEqual({ type: 'roll', seat: 'red' });
  });

  it('B2 takes a capture over a plain move', () => {
    const s = position({
      pieces: { red: [10, 30], yellow: [prog('yellow', 14)] },
      bank: [4],
    });
    expect(pick(s)).toEqual(['red-0', 4]);
  });

  it('B3 moves a threatened piece to a safe square', () => {
    // red-0 at 6 has a yellow piece 2 behind it; 2 more lands on the star at 8.
    const s = position({
      pieces: { red: [6, 20], yellow: [prog('yellow', 4)] },
      bank: [2],
    });
    expect(pick(s)).toEqual(['red-0', 2]);
  });

  it('B4 does not step just in front of an enemy when it has a choice', () => {
    // red-1 moving 3 (12 → 15) lands 1 square ahead of a yellow piece; red-0 moving 3 is harmless.
    const s = position({
      pieces: { red: [30, 12], yellow: [prog('yellow', 14)] },
      bank: [3],
    });
    expect(pick(s)).toEqual(['red-0', 3]);
  });

  it('B5 finishes a piece when it can', () => {
    const s = position({ pieces: { red: [53, 20], yellow: [] }, bank: [3] });
    expect(pick(s)).toEqual(['red-0', 3]);
  });

  it('B6 plans the whole bank: uses the order where a capture unlocks the column', () => {
    const s = position({
      settings: { killRequiredToEnterColumn: true },
      pieces: { red: [48, 10], yellow: [prog('yellow', 50)] },
      bank: [2, 5],
    });
    expect(pick(s)).toEqual(['red-0', 2]);
  });

  it('B7 in team mode, does not abandon a team-mate to a sitting enemy', () => {
    const S = 30;
    const s = position({
      settings: { teamMode: true },
      pieces: {
        red: [prog('red', S), 5],
        green: [prog('green', S)],
        yellow: [prog('yellow', S)],
        blue: [],
      },
      bank: [2],
    });
    expect(pick(s)).toEqual(['red-1', 2]);
  });

  it('B8 hit chances match dice arithmetic', () => {
    expect(hitChance(3, 1)).toBeCloseTo(1 / 6);
    expect(hitChance(7, 1)).toBe(0);
    expect(hitChance(1, 2)).toBeCloseTo(11 / 36);
    expect(hitChance(6, 2)).toBeCloseTo(11 / 36 + 5 / 36);
    expect(hitChance(7, 2)).toBeCloseTo(6 / 36);
    expect(hitChance(12, 2)).toBeCloseTo(1 / 36);
    expect(hitChance(13, 2)).toBe(0);
    expect(hitChance(0, 2)).toBe(0);
  });

  it('B9 evaluation prefers progress and home', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const at = (p: number) => position({ pieces: { red: [p], yellow: [] } });
    const sim = (s: GameState) => ({ pieces: s.pieces, hasKilled: {} });
    expect(evaluate(settings, sim(at(20)), 'red')).toBeGreaterThan(evaluate(settings, sim(at(10)), 'red'));
    expect(evaluate(settings, sim(at(56)), 'red')).toBeGreaterThan(evaluate(settings, sim(at(55)), 'red'));
    expect(evaluate(settings, sim(at(0)), 'red')).toBeGreaterThan(evaluate(settings, sim(at(-1)), 'red'));
  });
});

const settingsArb: fc.Arbitrary<Settings> = fc.record({
  diceMode: fc.constantFrom(1 as const, 2 as const),
  extraTurnOnCapture: fc.boolean(),
  extraTurnOnFinish: fc.boolean(),
  singleDieWhenAllInColumn: fc.boolean(),
  killRequiredToEnterColumn: fc.boolean(),
  teamMode: fc.boolean(),
  teamHandover: fc.constantFrom('immediate' as const, 'delayed' as const),
  teamHandoverDelayRounds: fc.integer({ min: 1, max: 4 }),
});

describe('bot properties', () => {
  it('BP1 every action the bot chooses is legal, in random games with any rules', () => {
    fc.assert(
      fc.property(settingsArb, fc.integer(), (settings, seed) => {
        const seats: Color[] = ['red', 'green', 'yellow', 'blue'];
        const dice = seededRng(seed);
        const created = createGame(settings, seats, dice);
        if (!created.ok) throw new Error(created.error.message);
        let state = created.state;
        for (let i = 0; i < 3000 && state.turn.phase.kind !== 'gameOver'; i++) {
          const action = chooseAction(state, dice);
          expect(action).not.toBeNull();
          if (action!.type === 'move') {
            const listed = legalMoves(state).some((m) => m.pieceId === action!.pieceId && m.value === action!.value);
            expect(listed).toBe(true);
          }
          const r = apply(state, action!, dice);
          expect(r.ok).toBe(true);
          if (r.ok) state = r.state;
        }
        expect(state.turn.phase.kind).toBe('gameOver');
      }),
      { numRuns: 40 },
    );
  }, 120_000);

  it('BP2 beats random players clearly (docs/07-testing §5)', () => {
    const seats: Color[] = ['red', 'green', 'yellow', 'blue'];
    let wins = 0;
    const games = 60;
    for (let g = 0; g < games; g++) {
      const { state } = playMatch({ ...DEFAULT_SETTINGS }, seats, { red: 'bot' }, 1000 + g);
      if (state.rankings[0] === 'red') wins++;
    }
    expect(wins / games).toBeGreaterThanOrEqual(0.6);
  }, 120_000);
});
