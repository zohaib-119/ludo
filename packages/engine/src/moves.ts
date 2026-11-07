/**
 * Single-move rules, capture resolution and the playability search.
 * See docs/04-engine.md §6 and §8.
 */
import {
  type Color,
  COLUMN_FIRST,
  COLUMN_LAST,
  HOME,
  LAST_TRACK,
  START_PROGRESS,
  TEAM,
  YARD,
  isSafeSquare,
  trackSquare,
} from './board';
import type { Capture, GameState, LegalMove, Piece, Settings } from './types';

/**
 * The part of the game state that moves read and change. Kept separate from
 * GameState so the search can clone it cheaply.
 */
export interface Sim {
  pieces: Piece[];
  hasKilled: Partial<Record<Color, boolean>>;
}

export interface MoveOutcome {
  from: number;
  to: number;
  captures: Capture[];
  /** True when the destination captured something (only this earns a bonus). */
  landingCapture: boolean;
  finished: boolean;
  killUnlocked: Color[];
  killReset: Color[];
}

export const simFromState = (state: GameState): Sim => ({
  pieces: state.pieces.map((p) => ({ ...p })),
  hasKilled: Object.fromEntries(Object.values(state.players).map((p) => [p!.color, p!.hasKilled])) as Partial<
    Record<Color, boolean>
  >,
});

const cloneSim = (sim: Sim): Sim => ({
  pieces: sim.pieces.map((p) => ({ ...p })),
  hasKilled: { ...sim.hasKilled },
});

export const isTeammate = (settings: Settings, a: Color, b: Color): boolean =>
  settings.teamMode && a !== b && TEAM[a] === TEAM[b];

export const isEnemy = (settings: Settings, a: Color, b: Color): boolean => a !== b && !isTeammate(settings, a, b);

export const canEnterColumn = (settings: Settings, sim: Sim, color: Color): boolean =>
  !settings.killRequiredToEnterColumn || sim.hasKilled[color] === true;

/**
 * Destination progress if piece can move by `value` ignoring the rest of the
 * bank (docs §6.1), otherwise null.
 */
export function singleTarget(settings: Settings, sim: Sim, piece: Piece, value: number): number | null {
  const { progress } = piece;
  if (progress === HOME) return null;
  if (progress === YARD) return value === 6 ? START_PROGRESS : null;
  const to = progress + value;
  if (to > HOME) return null;
  if (progress <= LAST_TRACK && to > LAST_TRACK && !canEnterColumn(settings, sim, piece.color)) {
    return null;
  }
  return to;
}

const piecesOnSquare = (sim: Sim, square: number): Piece[] =>
  sim.pieces.filter((p) => trackSquare(p.color, p.progress) === square);

const uniqueColors = (pieces: Piece[]): Color[] => [...new Set(pieces.map((p) => p.color))];

/**
 * Applies a move to `sim` in place: moves the piece, resolves captures at the
 * destination and the departure square, updates kill credit. The caller must
 * have checked `singleTarget` first.
 */
export function resolveMove(settings: Settings, sim: Sim, pieceId: string, value: number): MoveOutcome {
  const piece = sim.pieces.find((p) => p.id === pieceId);
  if (!piece) throw new Error(`resolveMove: no piece ${pieceId}`);
  const to = singleTarget(settings, sim, piece, value);
  if (to === null) throw new Error(`resolveMove: ${pieceId} cannot move ${value}`);

  const from = piece.progress;
  const fromSquare = trackSquare(piece.color, from);
  piece.progress = to;
  const mover = piece.color;

  const captures: Capture[] = [];
  let landingCapture = false;

  // --- Destination (docs §6.4) ---
  const toSquare = trackSquare(mover, to);
  if (toSquare !== null && !isSafeSquare(toSquare)) {
    const here = piecesOnSquare(sim, toSquare);
    const enemies = here.filter((p) => isEnemy(settings, mover, p.color));
    if (enemies.length > 0) {
      const enemyOwners = uniqueColors(enemies);
      let creditedTo: Color[] | null = null;
      if (!settings.teamMode || enemyOwners.length === 1) {
        creditedTo = [mover];
      } else {
        // Mixed enemy stack: needs pieces of both attacking teammates on the square.
        const attackers = here.filter((p) => !isEnemy(settings, mover, p.color));
        const attackerOwners = uniqueColors(attackers);
        if (attackerOwners.length >= 2) creditedTo = attackerOwners;
      }
      if (creditedTo) {
        captures.push({ victims: enemies.map((p) => p.id), at: toSquare, creditedTo, kind: 'landing' });
        landingCapture = true;
      }
    }
  }

  // --- Departure leftover (team mode, docs §6.5) ---
  if (settings.teamMode && fromSquare !== null && !isSafeSquare(fromSquare)) {
    const here = piecesOnSquare(sim, fromSquare);
    const team = here.filter((p) => !isEnemy(settings, mover, p.color));
    const enemies = here.filter((p) => isEnemy(settings, mover, p.color));
    if (team.length > 0 && enemies.length > 0 && uniqueColors(team).length === 1) {
      captures.push({
        victims: team.map((p) => p.id),
        at: fromSquare,
        creditedTo: uniqueColors(enemies),
        kind: 'leftover',
      });
    }
  }

  // --- Apply captures, credit and resets ---
  const killUnlocked: Color[] = [];
  const killReset: Color[] = [];
  const victimColors = new Set<Color>();
  for (const c of captures) {
    for (const id of c.victims) {
      const v = sim.pieces.find((p) => p.id === id)!;
      v.progress = YARD;
      victimColors.add(v.color);
    }
  }
  for (const c of captures) {
    for (const color of c.creditedTo) {
      if (!sim.hasKilled[color]) {
        sim.hasKilled[color] = true;
        killUnlocked.push(color);
      }
    }
  }
  for (const color of victimColors) {
    const all = sim.pieces.filter((p) => p.color === color);
    if (all.every((p) => p.progress === YARD) && sim.hasKilled[color]) {
      sim.hasKilled[color] = false;
      killReset.push(color);
    }
  }

  return { from, to, captures, landingCapture, finished: to === HOME, killUnlocked, killReset };
}

const removeOne = (values: number[], v: number): number[] => {
  const i = values.indexOf(v);
  return [...values.slice(0, i), ...values.slice(i + 1)];
};

const simKey = (sim: Sim): string =>
  sim.pieces.map((p) => p.progress).join(',') +
  '|' +
  Object.entries(sim.hasKilled)
    .filter(([, k]) => k)
    .map(([c]) => c)
    .sort()
    .join(',');

/**
 * Can every value in `values` be played, in some order, by `controls`' pieces?
 * Moves along the way are fully resolved (captures can unlock the column for a
 * later die). docs §8.
 */
export function canPlayAll(settings: Settings, sim: Sim, controls: Color, values: number[]): boolean {
  const memo = new Map<string, boolean>();
  const rec = (s: Sim, vals: number[]): boolean => {
    if (vals.length === 0) return true;
    const key = simKey(s) + '#' + [...vals].sort().join('');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result = false;
    outer: for (const v of new Set(vals)) {
      const seen = new Set<number>();
      for (const piece of s.pieces) {
        if (piece.color !== controls || seen.has(piece.progress)) continue;
        seen.add(piece.progress);
        if (singleTarget(settings, s, piece, v) === null) continue;
        const next = cloneSim(s);
        resolveMove(settings, next, piece.id, v);
        if (rec(next, removeOne(vals, v))) {
          result = true;
          break outer;
        }
      }
    }
    memo.set(key, result);
    return result;
  };
  return rec(sim, values);
}

/**
 * Every complete legal move for the current bank: single-legal and leaves the
 * rest of the bank playable. Empty unless the phase is awaitMove.
 */
export function legalMoves(state: GameState): LegalMove[] {
  if (state.turn.phase.kind !== 'awaitMove') return [];
  const { settings } = state;
  const { controls, bank } = state.turn;
  const sim = simFromState(state);
  const values = bank.map((d) => d.value);
  const moves: LegalMove[] = [];
  // Identical pieces (same colour, same progress) give identical outcomes.
  const verdicts = new Map<string, boolean>();
  for (const v of new Set(values)) {
    for (const piece of sim.pieces) {
      if (piece.color !== controls) continue;
      const to = singleTarget(settings, sim, piece, v);
      if (to === null) continue;
      const next = cloneSim(sim);
      const outcome = resolveMove(settings, next, piece.id, v);
      const key = `${v}:${piece.progress}`;
      let ok = verdicts.get(key);
      if (ok === undefined) {
        ok = canPlayAll(settings, next, controls, removeOne(values, v));
        verdicts.set(key, ok);
      }
      if (!ok) continue;
      moves.push({
        pieceId: piece.id,
        value: v,
        from: piece.progress,
        to,
        captures: outcome.captures.flatMap((c) => c.victims),
        finishes: outcome.finished,
      });
    }
  }
  return moves;
}

/** Number of dice for the next roll (docs §4.2). */
export function diceCountFor(state: GameState, controls: Color): 1 | 2 {
  if (state.settings.diceMode === 1) return 1;
  const unfinished = state.pieces.filter((p) => p.color === controls && p.progress < HOME);
  const inColumn = (p: Piece): boolean => p.progress >= COLUMN_FIRST && p.progress <= COLUMN_LAST;
  if (unfinished.length === 1 && inColumn(unfinished[0]!)) return 1; // Rule A
  if (state.settings.singleDieWhenAllInColumn && unfinished.length > 0 && unfinished.every(inColumn)) {
    return 1; // Rule B
  }
  return 2;
}
