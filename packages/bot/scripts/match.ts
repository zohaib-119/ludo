/** Plays one game where some seats are the bot and the rest choose random legal moves. */
import { type Color, type Rng, type Settings, apply, createGame, legalMoves, seededRng } from '@ludo/engine';
import { chooseAction } from '../src';

export type Player = 'bot' | 'random';

export function playMatch(settings: Settings, seats: Color[], players: Partial<Record<Color, Player>>, seed: number) {
  const dice = seededRng(seed);
  const choice: Rng = seededRng(seed ^ 0x9e3779b9);
  const created = createGame(settings, seats, dice);
  if (!created.ok) throw new Error(created.error.message);
  let state = created.state;
  let botMs = 0;
  let botDecisions = 0;
  for (let i = 0; i < 20000 && state.turn.phase.kind !== 'gameOver'; i++) {
    const seat = state.turn.seat;
    let action;
    if (players[seat] === 'bot' && state.turn.phase.kind === 'awaitMove') {
      const t = performance.now();
      action = chooseAction(state, choice)!;
      botMs += performance.now() - t;
      botDecisions++;
    } else if (state.turn.phase.kind === 'awaitRoll') {
      action = { type: 'roll' as const, seat };
    } else {
      const moves = legalMoves(state);
      const m = moves[choice.int(moves.length)]!;
      action = { type: 'move' as const, seat, pieceId: m.pieceId, value: m.value };
    }
    const r = apply(state, action, dice);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(action)}: ${r.error.code}`);
    state = r.state;
  }
  return { state, botMs, botDecisions };
}

