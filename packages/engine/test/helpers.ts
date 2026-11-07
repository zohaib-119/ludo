import { expect } from 'vitest';
import {
  type Action,
  type Color,
  type GameEvent,
  type GameState,
  type Phase,
  type Settings,
  DEFAULT_SETTINGS,
  START,
  TURN_ORDER,
  apply,
  scriptedRng,
} from '../src';

export interface PositionSpec {
  settings?: Partial<Settings>;
  /** Progress of each piece, index = piece number. Missing pieces are in the yard. */
  pieces: Partial<Record<Color, number[]>>;
  seat?: Color;
  controls?: Color;
  /** If given, phase is awaitMove with these dice (chain 'main'). */
  bank?: number[];
  phase?: Phase;
  hasKilled?: Partial<Record<Color, boolean>>;
  finished?: Color[];
  handoverDelay?: Partial<Record<Color, number>>;
}

/** Plain 1-die / 2-dice settings with every optional rule off, for focused tests. */
export const BASE: Settings = {
  ...DEFAULT_SETTINGS,
  diceMode: 2,
  extraTurnOnCapture: false,
  extraTurnOnFinish: false,
  singleDieWhenAllInColumn: false,
  killRequiredToEnterColumn: false,
  teamMode: false,
};

/** Progress a colour needs to stand on absolute track square `abs`. */
export const prog = (color: Color, abs: number): number => {
  const p = (abs - START[color] + 52) % 52;
  if (p > 50) throw new Error(`${color} can never stand on square ${abs}`);
  return p;
};

export function position(spec: PositionSpec): GameState {
  const settings: Settings = { ...BASE, ...spec.settings };
  const seats = TURN_ORDER.filter((c) => spec.pieces[c] !== undefined);
  const seat = spec.seat ?? seats[0]!;
  const phase: Phase =
    spec.phase ?? (spec.bank ? { kind: 'awaitMove' } : { kind: 'awaitRoll', reason: 'turn', chain: 'main' });
  const finished = spec.finished ?? [];
  return {
    version: 0,
    settings,
    seats,
    players: Object.fromEntries(
      seats.map((color) => [
        color,
        {
          color,
          hasKilled: spec.hasKilled?.[color] ?? false,
          finishedRank: finished.includes(color) ? finished.indexOf(color) + 1 : null,
          handoverDelayLeft: spec.handoverDelay?.[color] ?? 0,
          eliminated: false,
        },
      ]),
    ),
    pieces: seats.flatMap((color) =>
      [0, 1, 2, 3].map((i) => ({ id: `${color}-${i}`, color, progress: spec.pieces[color]![i] ?? -1 })),
    ),
    turn: {
      seat,
      controls: spec.controls ?? seat,
      phase,
      bank: (spec.bank ?? []).map((value) => ({ value, chain: 'main' })),
      lastRoll: [],
      nextBonusId: 1,
    },
    rankings: [...finished],
    winningTeam: null,
    turnNumber: 1,
  };
}

export interface Step {
  state: GameState;
  events: GameEvent[];
}

/** Apply an action that must succeed. */
export function ok(state: GameState, action: Action, dice: number[] = []): Step {
  const rng = scriptedRng(dice);
  const result = apply(state, action, rng);
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  expect(rng.remaining(), 'all scripted dice should be used').toBe(0);
  return { state: result.state, events: result.events };
}

export const roll = (state: GameState, ...dice: number[]): Step =>
  ok(state, { type: 'roll', seat: state.turn.seat }, dice);

export const move = (state: GameState, pieceId: string, value: number): Step =>
  ok(state, { type: 'move', seat: state.turn.seat, pieceId, value });

export function err(state: GameState, action: Action, dice: number[] = []): string {
  const result = apply(state, action, scriptedRng(dice));
  if (result.ok) throw new Error('Expected an error');
  return result.error.code;
}

export const progressOf = (state: GameState, id: string): number => state.pieces.find((p) => p.id === id)!.progress;

export const types = (events: GameEvent[]): string[] => events.map((e) => e.type);

export const bankValues = (state: GameState): number[] => state.turn.bank.map((d) => d.value);
