/**
 * The turn state machine: apply(state, action, rng). See docs/04-engine.md §4–§7.
 */
import { type Color, HOME, OPPOSITE, PIECES_PER_PLAYER, TURN_ORDER, YARD } from './board';
import { canPlayAll, diceCountFor, legalMoves, resolveMove, simFromState } from './moves';
import type {
  Action,
  EngineError,
  EngineErrorCode,
  GameEvent,
  GameState,
  Result,
  Rng,
  Settings,
} from './types';

const fail = (code: EngineErrorCode, message: string): Result => ({
  ok: false,
  error: { code, message } satisfies EngineError,
});

const player = (state: GameState, color: Color) => {
  const p = state.players[color];
  if (!p) throw new Error(`No player state for ${color}`);
  return p;
};

const isFinished = (state: GameState, color: Color): boolean => player(state, color).finishedRank !== null;

/** A function (not an inline check) so TypeScript doesn't keep a stale narrowing of turn.phase. */
const isGameOver = (state: GameState): boolean => state.turn.phase.kind === 'gameOver';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function validateSetup(settings: Settings, seats: Color[]): string | null {
  if (settings.diceMode !== 1 && settings.diceMode !== 2) return 'diceMode must be 1 or 2';
  if (
    !Number.isInteger(settings.teamHandoverDelayRounds) ||
    settings.teamHandoverDelayRounds < 1 ||
    settings.teamHandoverDelayRounds > 10
  ) {
    return 'teamHandoverDelayRounds must be an integer 1..10';
  }
  if (new Set(seats).size !== seats.length) return 'duplicate seats';
  if (seats.some((c) => !TURN_ORDER.includes(c))) return 'unknown colour';
  if (seats.length < 2 || seats.length > 4) return 'need 2 to 4 players';
  if (seats.length === 2 && OPPOSITE[seats[0]!] !== seats[1]) return '2 players must sit opposite';
  if (settings.teamMode && seats.length !== 4) return 'team mode needs 4 players';
  return null;
}

export function createGame(settings: Settings, seats: Color[], rng: Rng): Result {
  const error = validateSetup(settings, seats);
  if (error) return fail('INVALID_SETUP', error);
  const ordered = TURN_ORDER.filter((c) => seats.includes(c));
  const first = ordered[rng.int(ordered.length)]!;
  const state: GameState = {
    version: 0,
    settings: { ...settings },
    seats: ordered,
    players: Object.fromEntries(
      ordered.map((color) => [color, { color, hasKilled: false, finishedRank: null, handoverDelayLeft: 0 }]),
    ),
    pieces: ordered.flatMap((color) =>
      Array.from({ length: PIECES_PER_PLAYER }, (_, i) => ({ id: `${color}-${i}`, color, progress: YARD })),
    ),
    turn: {
      seat: first,
      controls: first,
      phase: { kind: 'awaitRoll', reason: 'turn', chain: 'main' },
      bank: [],
      lastRoll: [],
      nextBonusId: 1,
    },
    rankings: [],
    winningTeam: null,
    turnNumber: 1,
  };
  return { ok: true, state, events: [{ type: 'TurnStarted', seat: first, controls: first }] };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function apply(input: GameState, action: Action, rng: Rng): Result {
  if (input.turn.phase.kind === 'gameOver') return fail('GAME_OVER', 'The game is over');
  if (action.seat !== input.turn.seat) return fail('NOT_YOUR_TURN', `It is ${input.turn.seat}'s turn`);

  // GameState is plain JSON data, so a JSON round trip is a complete deep copy.
  const state = JSON.parse(JSON.stringify(input)) as GameState;
  const events: GameEvent[] = [];
  const result = action.type === 'roll' ? doRoll(state, events, rng) : doMove(state, events, action);
  if (result) return result;
  state.version += 1;
  return { ok: true, state, events };
}

function doRoll(state: GameState, events: GameEvent[], rng: Rng): Result | null {
  const { turn, settings } = state;
  if (turn.phase.kind !== 'awaitRoll') return fail('WRONG_PHASE', 'You must move, not roll');
  const { chain, reason } = turn.phase;

  const n = diceCountFor(state, turn.controls);
  const values = Array.from({ length: n }, () => rng.die());
  turn.lastRoll = values;
  events.push({ type: 'Rolled', seat: turn.seat, values, diceCount: n, reason });

  const candidate = [...turn.bank, ...values.map((value) => ({ value, chain }))];
  const playable = canPlayAll(
    settings,
    simFromState(state),
    turn.controls,
    candidate.map((d) => d.value),
  );

  if (playable) {
    turn.bank = candidate;
    const reroll = n === 1 ? values[0] === 6 : values.every((v) => v === 6);
    if (reroll) {
      turn.phase = { kind: 'awaitRoll', reason: chain === 'main' ? 'reroll' : 'bonusReroll', chain };
      events.push({ type: 'RerollGranted', seat: turn.seat });
    } else {
      turn.phase = { kind: 'awaitMove' };
    }
    return null;
  }

  if (chain === 'main') {
    events.push({ type: 'RollVoided', seat: turn.seat, scope: 'turn', values: candidate.map((d) => d.value) });
    endTurn(state, events);
    return null;
  }

  // Bonus chain: drop only this chain's dice (docs §5.3).
  const voided = candidate.filter((d) => d.chain === chain).map((d) => d.value);
  turn.bank = turn.bank.filter((d) => d.chain !== chain);
  events.push({ type: 'RollVoided', seat: turn.seat, scope: 'bonus', values: voided });
  if (turn.bank.length === 0) endTurn(state, events);
  else turn.phase = { kind: 'awaitMove' };
  return null;
}

function doMove(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'move' }>,
): Result | null {
  const { turn, settings } = state;
  if (turn.phase.kind !== 'awaitMove') return fail('WRONG_PHASE', 'You must roll first');
  const piece = state.pieces.find((p) => p.id === action.pieceId);
  if (!piece || piece.color !== turn.controls) return fail('NO_SUCH_PIECE', `You can't move ${action.pieceId}`);
  const dieIndex = turn.bank.findIndex((d) => d.value === action.value);
  if (dieIndex < 0) return fail('VALUE_NOT_IN_BANK', `No ${action.value} in the bank`);
  const legal = legalMoves(state).some((m) => m.pieceId === action.pieceId && m.value === action.value);
  if (!legal) return fail('ILLEGAL_MOVE', `${action.pieceId} can't move ${action.value} now`);

  turn.bank.splice(dieIndex, 1);
  const sim = simFromState(state);
  const outcome = resolveMove(settings, sim, piece.id, action.value);
  state.pieces = sim.pieces;
  for (const [color, killed] of Object.entries(sim.hasKilled)) player(state, color as Color).hasKilled = killed!;

  events.push({
    type: 'Moved',
    seat: turn.seat,
    pieceId: piece.id,
    color: piece.color,
    from: outcome.from,
    to: outcome.to,
    value: action.value,
  });
  for (const c of outcome.captures) events.push({ type: 'Captured', ...c });
  for (const color of outcome.killUnlocked) events.push({ type: 'KillUnlocked', color });
  for (const color of outcome.killReset) events.push({ type: 'KillReset', color });

  let playerDone = false;
  if (outcome.finished) {
    events.push({ type: 'PieceFinished', pieceId: piece.id, color: piece.color });
    const allHome = state.pieces.filter((p) => p.color === piece.color).every((p) => p.progress === HOME);
    if (allHome) {
      playerDone = true;
      finishPlayer(state, events, piece.color);
    }
  }
  if (isGameOver(state)) return null;

  const bonusReason =
    settings.extraTurnOnCapture && outcome.landingCapture
      ? 'capture'
      : settings.extraTurnOnFinish && outcome.finished
        ? 'finish'
        : null;

  if (bonusReason && !playerDone) {
    const chain = `bonus-${turn.nextBonusId}`;
    turn.nextBonusId += 1;
    turn.phase = { kind: 'awaitRoll', reason: 'bonus', chain };
    events.push({ type: 'BonusGranted', seat: turn.seat, reason: bonusReason });
  } else if (turn.bank.length > 0) {
    turn.phase = { kind: 'awaitMove' };
  } else {
    endTurn(state, events);
  }
  return null;
}

function finishPlayer(state: GameState, events: GameEvent[], color: Color): void {
  const rank = state.rankings.length + 1;
  state.rankings.push(color);
  player(state, color).finishedRank = rank;
  events.push({ type: 'PlayerFinished', color, rank });

  if (state.settings.teamMode) {
    const mate = OPPOSITE[color];
    if (isFinished(state, mate)) {
      state.winningTeam = [mate, color];
      gameOver(state, events);
    } else {
      const delay = state.settings.teamHandover === 'delayed' ? state.settings.teamHandoverDelayRounds : 0;
      player(state, color).handoverDelayLeft = delay;
      events.push({ type: 'HandoverStarted', seat: color, controls: mate, delay });
    }
    return;
  }

  const remaining = state.seats.filter((c) => !isFinished(state, c));
  if (remaining.length === 1) {
    const last = remaining[0]!;
    state.rankings.push(last);
    player(state, last).finishedRank = state.rankings.length;
    gameOver(state, events);
  }
}

function gameOver(state: GameState, events: GameEvent[]): void {
  state.turn.phase = { kind: 'gameOver' };
  state.turn.bank = [];
  events.push({ type: 'GameOver', rankings: [...state.rankings], winningTeam: state.winningTeam });
}

function endTurn(state: GameState, events: GameEvent[]): void {
  const { turn, seats } = state;
  turn.bank = [];
  const start = seats.indexOf(turn.seat);
  // Bounded: each full lap decrements every pending handover delay.
  for (let step = 1; step <= seats.length * 12; step++) {
    const color = seats[(start + step) % seats.length]!;
    const p = player(state, color);
    if (p.finishedRank === null) {
      return startTurn(state, events, color, color);
    }
    if (!state.settings.teamMode) continue;
    const mate = OPPOSITE[color];
    if (isFinished(state, mate)) continue;
    if (p.handoverDelayLeft > 0) {
      p.handoverDelayLeft -= 1;
      events.push({ type: 'TurnSkipped', seat: color, reason: 'handoverDelay' });
      continue;
    }
    return startTurn(state, events, color, mate);
  }
  throw new Error('endTurn: no player can take a turn');
}

function startTurn(state: GameState, events: GameEvent[], seat: Color, controls: Color): void {
  state.turnNumber += 1;
  state.turn = {
    ...state.turn,
    seat,
    controls,
    phase: { kind: 'awaitRoll', reason: 'turn', chain: 'main' },
    bank: [],
    nextBonusId: 1,
  };
  events.push({ type: 'TurnStarted', seat, controls });
}
