/**
 * Property tests from docs/07-testing.md §4: random games with random settings,
 * checking invariants after every action.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Color,
  type GameState,
  type Settings,
  COLORS,
  HOME,
  TEAM,
  apply,
  canPlayAll,
  isEnemy,
  isSafeSquare,
  legalMoves,
  resolveMove,
  seededRng,
  simFromState,
  singleTarget,
  trackSquare,
  type Sim,
} from '../src';
import { VALID_SEATINGS, playRandomGame } from './random-play';

const settingsArb: fc.Arbitrary<Settings> = fc.record({
  diceMode: fc.constantFrom(1 as const, 2 as const),
  extraTurnOnCapture: fc.boolean(),
  extraTurnOnFinish: fc.boolean(),
  singleDieWhenAllInColumn: fc.boolean(),
  killRequiredToEnterColumn: fc.boolean(),
  teamMode: fc.boolean(),
  teamHandover: fc.constantFrom('immediate' as const, 'delayed' as const),
  teamHandoverDelayRounds: fc.integer({ min: 1, max: 6 }),
});

const gameArb = fc.record({
  settings: settingsArb,
  seating: fc.integer({ min: 0, max: VALID_SEATINGS.length - 1 }),
  diceSeed: fc.integer(),
  choiceSeed: fc.integer(),
});

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Invariant failed: ${message}`);
}

/** Checks every invariant that must hold after any action. Plain asserts: this runs ~100k times. */
function checkInvariants(before: GameState, after: GameState): void {
  assert(after.version === before.version + 1, 'version increments by one');

  // P3/P4: piece counts and ranges.
  for (const color of after.seats) {
    const mine = after.pieces.filter((p) => p.color === color);
    assert(mine.length === 4, `${color} has 4 pieces`);
    for (const p of mine) assert(p.progress >= -1 && p.progress <= HOME, `${p.id} progress in range`);
  }

  // P3: who can share a non-safe track square.
  const bySquare = new Map<number, Color[]>();
  for (const p of after.pieces) {
    const sq = trackSquare(p.color, p.progress);
    if (sq === null || isSafeSquare(sq)) continue;
    bySquare.set(sq, [...(bySquare.get(sq) ?? []), p.color]);
  }
  for (const [sq, colors] of bySquare) {
    const owners = [...new Set(colors)];
    if (owners.length <= 1) continue;
    assert(after.settings.teamMode, `FFA: different colours share non-safe square ${sq}`);
    const teams = new Set(owners.map((c) => TEAM[c]));
    if (teams.size === 1) continue; // team-mates only
    // Both teams present: exactly one side is a mixed stack (both team-mates).
    const sideMixed = (t: 0 | 1) => owners.filter((c) => TEAM[c] === t).length === 2;
    assert(Number(sideMixed(0)) + Number(sideMixed(1)) === 1, `square ${sq} holds ${colors.join(',')}`);
  }

  const { turn } = after;
  if (turn.phase.kind === 'awaitMove') {
    // P2: the bank is always fully playable.
    assert(turn.bank.length > 0, 'awaitMove has dice');
    assert(
      canPlayAll(after.settings, simFromState(after), turn.controls, turn.bank.map((d) => d.value)),
      'bank is fully playable',
    );
    // P7: legal moves exist.
    assert(legalMoves(after).length > 0, 'legal moves exist');
  }
  if (turn.phase.kind === 'awaitRoll' && turn.phase.reason === 'turn') {
    assert(turn.bank.length === 0, 'a new turn starts with an empty bank');
  }
  if (turn.phase.kind !== 'gameOver') {
    assert(after.players[turn.seat] !== undefined, 'acting seat is in the game');
    assert(
      after.pieces.some((p) => p.color === turn.controls && p.progress !== HOME),
      'controlled colour has pieces left',
    );
    if (!after.settings.teamMode) assert(turn.controls === turn.seat, 'FFA controls own pieces');
  }

  // Kill-to-enter: nobody without credit has a piece past the track.
  if (after.settings.killRequiredToEnterColumn) {
    for (const color of after.seats) {
      const anyPast = after.pieces.some((p) => p.color === color && p.progress > 50);
      if (anyPast) assert(after.players[color]!.hasKilled, `${color} is past the track only with a kill`);
    }
  }

  // Elimination (no capture left): out players are off the board and never act;
  // anyone still in who needs a capture must still have something to capture.
  for (const color of after.seats) {
    const pl = after.players[color]!;
    if (pl.eliminated) {
      assert(after.pieces.every((p) => p.color !== color || p.progress === -1), `${color} is out: pieces in the yard`);
      if (after.turn.phase.kind !== 'gameOver') assert(after.turn.seat !== color && after.turn.controls !== color, `${color} is out: never acts`);
    } else if (after.settings.killRequiredToEnterColumn && pl.finishedRank === null && !pl.hasKilled && after.turn.phase.kind !== 'gameOver') {
      const target = after.pieces.some(
        (p) => isEnemy(after.settings, color, p.color) && !after.players[p.color]!.eliminated && p.progress <= 50,
      );
      assert(target, `${color} needs a capture and still has a target`);
    }
  }

  assert(new Set(after.rankings).size === after.rankings.length, 'rankings are unique');
}

describe('property: random games', () => {
  it('P1–P4, P7: invariants hold after every action of thousands of random games', () => {
    let finished = 0;
    let total = 0;
    fc.assert(
      fc.property(gameArb, ({ settings, seating, diceSeed, choiceSeed }) => {
        let seats = VALID_SEATINGS[seating]!;
        if (settings.teamMode) seats = ['red', 'green', 'yellow', 'blue'];
        const { state } = playRandomGame(
          settings,
          seats,
          seededRng(diceSeed),
          seededRng(choiceSeed),
          4000,
          (before, after) => checkInvariants(before, after),
          { freeze: true }, // P1 purity: any mutation of a frozen input throws
        );
        total++;
        if (state.turn.phase.kind === 'gameOver') {
          finished++;
          if (settings.teamMode) {
            expect(state.winningTeam).toHaveLength(2);
          } else {
            expect(state.rankings).toHaveLength(state.seats.length);
          }
        }
      }),
      { numRuns: 200 },
    );
    // Random play is slow to finish but most games still should within the cap.
    expect(finished / total).toBeGreaterThan(0.8);
  }, 300_000);

  it('P1: apply never throws on arbitrary (even nonsense) actions', () => {
    fc.assert(
      fc.property(
        gameArb,
        fc.array(
          fc.record({
            type: fc.constantFrom('roll' as const, 'move' as const),
            seat: fc.constantFrom(...COLORS),
            piece: fc.integer({ min: 0, max: 4 }),
            value: fc.integer({ min: 0, max: 7 }),
          }),
          { maxLength: 60 },
        ),
        ({ settings, seating, diceSeed }, actions) => {
          const seats = settings.teamMode ? (['red', 'green', 'yellow', 'blue'] as Color[]) : VALID_SEATINGS[seating]!;
          const dice = seededRng(diceSeed);
          let { state } = playRandomGame(settings, seats, dice, seededRng(1), 30);
          for (const a of actions) {
            const action =
              a.type === 'roll'
                ? { type: 'roll' as const, seat: a.seat }
                : { type: 'move' as const, seat: a.seat, pieceId: `${a.seat}-${a.piece}`, value: a.value };
            const r = apply(state, action, dice);
            if (r.ok) state = r.state;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// P5: canPlayAll agrees with a brute-force search over every order and piece.
// ---------------------------------------------------------------------------

function bruteForce(settings: Settings, sim: Sim, controls: Color, values: number[]): boolean {
  if (values.length === 0) return true;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const rest = [...values.slice(0, i), ...values.slice(i + 1)];
    for (const piece of sim.pieces) {
      if (piece.color !== controls) continue;
      if (singleTarget(settings, sim, piece, v) === null) continue;
      const next: Sim = { pieces: sim.pieces.map((p) => ({ ...p })), hasKilled: { ...sim.hasKilled } };
      resolveMove(settings, next, piece.id, v);
      if (bruteForce(settings, next, controls, rest)) return true;
    }
  }
  return false;
}

const progressArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant(-1) },
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 50 }) },
  { weight: 3, arbitrary: fc.integer({ min: 44, max: 56 }) },
);

describe('property: playability search', () => {
  it('P5: canPlayAll matches brute force on random positions', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.array(progressArb, { minLength: 16, maxLength: 16 }),
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 4 }),
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        fc.constantFrom(...COLORS),
        (settings, progresses, values, killed, controls) => {
          const sim: Sim = {
            pieces: COLORS.flatMap((color, ci) =>
              [0, 1, 2, 3].map((i) => ({ id: `${color}-${i}`, color, progress: progresses[ci * 4 + i]! })),
            ),
            hasKilled: Object.fromEntries(COLORS.map((c, i) => [c, killed[i]!])),
          };
          expect(canPlayAll(settings, sim, controls, values)).toBe(bruteForce(settings, sim, controls, values));
        },
      ),
      { numRuns: 3000 },
    );
  });
});
