/** Shared random-game driver for property tests and the simulation script. */
import { type Color, type GameState, type Rng, type Settings, apply, createGame, legalMoves } from '../src';

export const VALID_SEATINGS: Color[][] = [
  ['red', 'yellow'],
  ['green', 'blue'],
  ['red', 'green', 'yellow'],
  ['red', 'green', 'blue'],
  ['red', 'yellow', 'blue'],
  ['green', 'yellow', 'blue'],
  ['red', 'green', 'yellow', 'blue'],
  // Side by side is allowed too. (Appended: scripts pick seatings by index.)
  ['red', 'green'],
  ['green', 'yellow'],
  ['yellow', 'blue'],
  ['red', 'blue'],
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export interface StepHook {
  (before: GameState, after: GameState): void;
}

/**
 * Plays a game with random legal choices. Returns the final state and the
 * number of actions. Throws if an action the engine itself listed is refused.
 */
export function playRandomGame(
  settings: Settings,
  seats: Color[],
  dice: Rng,
  choices: Rng,
  maxActions: number,
  onStep?: StepHook,
  options: { freeze?: boolean } = {},
): { state: GameState; actions: number } {
  const created = createGame(settings, seats, dice);
  if (!created.ok) throw new Error(created.error.message);
  let state = created.state;
  let actions = 0;
  while (state.turn.phase.kind !== 'gameOver' && actions < maxActions) {
    if (options.freeze) deepFreeze(state);
    const seat = state.turn.seat;
    let result;
    if (state.turn.phase.kind === 'awaitRoll') {
      result = apply(state, { type: 'roll', seat }, dice);
    } else {
      const moves = legalMoves(state);
      if (moves.length === 0) throw new Error('awaitMove with no legal moves');
      const m = moves[choices.int(moves.length)]!;
      result = apply(state, { type: 'move', seat, pieceId: m.pieceId, value: m.value }, dice);
    }
    if (!result.ok) throw new Error(`Engine refused its own action: ${result.error.code} ${result.error.message}`);
    onStep?.(state, result.state);
    state = result.state;
    actions++;
  }
  return { state, actions };
}
