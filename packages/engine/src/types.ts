import type { Color } from './board';

export interface Settings {
  diceMode: 1 | 2;
  extraTurnOnCapture: boolean;
  extraTurnOnFinish: boolean;
  /** Rule B. Only matters when diceMode = 2. */
  singleDieWhenAllInColumn: boolean;
  killRequiredToEnterColumn: boolean;
  teamMode: boolean;
  teamHandover: 'immediate' | 'delayed';
  /** Number of the finished player's own turns skipped before handover (delayed mode). 1..10. */
  teamHandoverDelayRounds: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  diceMode: 2,
  extraTurnOnCapture: true,
  extraTurnOnFinish: true,
  singleDieWhenAllInColumn: true,
  killRequiredToEnterColumn: false,
  teamMode: false,
  teamHandover: 'immediate',
  teamHandoverDelayRounds: 4,
};

export interface Piece {
  /** e.g. "red-2" */
  id: string;
  color: Color;
  /** -1 yard, 0..50 track, 51..55 column, 56 home. */
  progress: number;
}

export interface PlayerState {
  color: Color;
  hasKilled: boolean;
  finishedRank: number | null;
  handoverDelayLeft: number;
}

/** 'main' for the normal roll chain, 'bonus-N' for each bonus chain. */
export type Chain = string;

export interface Die {
  value: number;
  chain: Chain;
}

export type RollReason = 'turn' | 'reroll' | 'bonus' | 'bonusReroll';

export type Phase =
  | { kind: 'awaitRoll'; reason: RollReason; chain: Chain }
  | { kind: 'awaitMove' }
  | { kind: 'gameOver' };

export interface TurnState {
  /** Whose turn it is (who acts). */
  seat: Color;
  /** Whose pieces are moved. Differs from `seat` during team handover. */
  controls: Color;
  phase: Phase;
  /** Rolled, unplayed dice. */
  bank: Die[];
  /** Values of the most recent roll, for display. */
  lastRoll: number[];
  nextBonusId: number;
}

export interface GameState {
  version: number;
  settings: Settings;
  /** Colours in play, in turn order. */
  seats: Color[];
  players: Partial<Record<Color, PlayerState>>;
  pieces: Piece[];
  turn: TurnState;
  /** Finishing order (FFA ranks; in team mode just the order players finished). */
  rankings: Color[];
  winningTeam: Color[] | null;
  turnNumber: number;
}

export type Action =
  | { type: 'roll'; seat: Color }
  | { type: 'move'; seat: Color; pieceId: string; value: number };

export interface Capture {
  victims: string[];
  at: number;
  creditedTo: Color[];
  kind: 'landing' | 'leftover';
}

export type GameEvent =
  | { type: 'TurnStarted'; seat: Color; controls: Color }
  | { type: 'Rolled'; seat: Color; values: number[]; diceCount: 1 | 2; reason: RollReason }
  | { type: 'RerollGranted'; seat: Color }
  | { type: 'RollVoided'; seat: Color; scope: 'turn' | 'bonus'; values: number[] }
  | { type: 'Moved'; seat: Color; pieceId: string; color: Color; from: number; to: number; value: number }
  | ({ type: 'Captured' } & Capture)
  | { type: 'KillUnlocked'; color: Color }
  | { type: 'KillReset'; color: Color }
  | { type: 'PieceFinished'; pieceId: string; color: Color }
  | { type: 'BonusGranted'; seat: Color; reason: 'capture' | 'finish' }
  | { type: 'PlayerFinished'; color: Color; rank: number }
  | { type: 'HandoverStarted'; seat: Color; controls: Color; delay: number }
  | { type: 'TurnSkipped'; seat: Color; reason: 'handoverDelay' }
  | { type: 'GameOver'; rankings: Color[]; winningTeam: Color[] | null };

export type EngineErrorCode =
  | 'INVALID_SETUP'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'NO_SUCH_PIECE'
  | 'VALUE_NOT_IN_BANK'
  | 'ILLEGAL_MOVE'
  | 'GAME_OVER';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError };

export interface LegalMove {
  pieceId: string;
  value: number;
  from: number;
  to: number;
  /** Piece ids captured by this move (landing and leftover). */
  captures: string[];
  finishes: boolean;
}

/** Randomness source. Injected so tests and simulations are deterministic. */
export interface Rng {
  /** Integer 1..6. */
  die(): number;
  /** Integer 0..n-1. */
  int(n: number): number;
}
