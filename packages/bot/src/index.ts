/**
 * Heuristic bot. See docs/06-bot.md.
 *
 * The bot plans the whole remaining bank: it enumerates complete play
 * sequences, scores each final position, and plays the first move of the best
 * one. After every move (and any bonus roll) it plans again from scratch.
 */
import {
  type Action,
  type Color,
  type GameState,
  HOME,
  LAST_TRACK,
  type LegalMove,
  type Rng,
  type Settings,
  type Sim,
  TEAM,
  YARD,
  isSafeSquare,
  legalMoves,
  resolveMove,
  simFromState,
  singleTarget,
  trackSquare,
} from '@ludo/engine';

/** Tunable weights (docs/06-bot.md §3.1). */
export const WEIGHTS = {
  progress: 1,
  inColumn: 15,
  home: 30,
  outOfYard: 12,
  capture: 40,
  unlockKill: 20,
  safeSquare: 6,
  teamStack: 6,
  dangerBase: 8,
  dangerPerProgress: 0.4,
  stuckWithoutKill: 5,
  teammateFactor: 0.5,
};
export type Weights = typeof WEIGHTS;

/** Upper bound on complete sequences explored per decision. */
const MAX_LEAVES = 2000;

interface Leaf {
  firstMove: LegalMove;
  sim: Sim;
  /** Score from things that happened along the way (captures, unlocks). */
  bonus: number;
}

const cloneSim = (s: Sim): Sim => ({
  pieces: s.pieces.map((p) => ({ ...p })),
  hasKilled: { ...s.hasKilled },
});

const simKey = (s: Sim): string =>
  s.pieces.map((p) => p.progress).join(',') +
  '|' +
  Object.keys(s.hasKilled)
    .filter((c) => s.hasKilled[c as Color])
    .sort()
    .join(',');

const removeOne = (values: number[], v: number): number[] => {
  const i = values.indexOf(v);
  return [...values.slice(0, i), ...values.slice(i + 1)];
};

const isTeamOf = (settings: Settings, me: Color, other: Color): boolean =>
  other === me || (settings.teamMode && TEAM[other] === TEAM[me]);

/** Score gained by one resolved move for the side `me` belongs to. */
function moveBonus(settings: Settings, me: Color, outcome: ReturnType<typeof resolveMove>, w: Weights): number {
  let score = 0;
  for (const c of outcome.captures) {
    const ours = c.creditedTo.some((col) => isTeamOf(settings, me, col));
    const perPiece = ours ? w.capture : -w.capture;
    score += perPiece * c.victims.length;
  }
  for (const col of outcome.killUnlocked) if (isTeamOf(settings, me, col)) score += w.unlockKill;
  return score;
}

/** Enumerate complete sequences for the bank, starting with each legal first move. */
function enumerate(state: GameState, w: Weights): Leaf[] {
  const { settings } = state;
  const { controls, bank } = state.turn;
  const root = simFromState(state);
  const values = bank.map((d) => d.value);
  const leaves: Leaf[] = [];
  const seen = new Set<string>();

  const rec = (sim: Sim, vals: number[], first: LegalMove, bonus: number): void => {
    if (leaves.length >= MAX_LEAVES) return;
    if (vals.length === 0) {
      const key = simKey(sim) + '#' + first.pieceId + ':' + first.value;
      if (!seen.has(key)) {
        seen.add(key);
        leaves.push({ firstMove: first, sim, bonus });
      }
      return;
    }
    for (const v of new Set(vals)) {
      const tried = new Set<number>();
      for (const piece of sim.pieces) {
        if (piece.color !== controls || tried.has(piece.progress)) continue;
        tried.add(piece.progress);
        if (singleTarget(settings, sim, piece, v) === null) continue;
        const next = cloneSim(sim);
        const outcome = resolveMove(settings, next, piece.id, v);
        rec(next, removeOne(vals, v), first, bonus + moveBonus(settings, controls, outcome, w));
      }
    }
    // Branches that cannot use every die simply produce no leaf.
  };

  for (const m of legalMoves(state)) {
    const sim = cloneSim(root);
    const outcome = resolveMove(settings, sim, m.pieceId, m.value);
    rec(sim, removeOne(values, m.value), m, moveBonus(settings, controls, outcome, w));
  }
  return leaves;
}

/** Probability that an enemy piece `d` squares behind lands exactly on us next turn. */
export function hitChance(d: number, diceMode: 1 | 2): number {
  if (d < 1) return 0;
  if (diceMode === 1) return d <= 6 ? 1 / 6 : 0;
  let p = 0;
  if (d <= 6) p += 11 / 36; // either die shows d
  if (d >= 2 && d <= 12) p += (6 - Math.abs(7 - d)) / 36; // both dice on one piece
  return Math.min(p, 1);
}

/** How much danger a piece is in: the chance some enemy hits it next turn. */
function danger(settings: Settings, sim: Sim, me: Color, pieceIdx: number): number {
  const piece = sim.pieces[pieceIdx]!;
  const sq = trackSquare(piece.color, piece.progress);
  if (sq === null || isSafeSquare(sq)) return 0;
  const here = sim.pieces.filter((p) => trackSquare(p.color, p.progress) === sq);
  // A mixed team-mate stack can't be hit by a single enemy.
  if (settings.teamMode && new Set(here.filter((p) => isTeamOf(settings, me, p.color)).map((p) => p.color)).size >= 2) {
    return 0;
  }
  const reach = settings.diceMode === 1 ? 6 : 12;
  let safe = 1;
  for (const enemy of sim.pieces) {
    if (isTeamOf(settings, me, enemy.color)) continue;
    const esq = trackSquare(enemy.color, enemy.progress);
    if (esq === null) continue;
    const d = (sq - esq + 52) % 52;
    if (d < 1 || d > reach) continue;
    if (enemy.progress + d > LAST_TRACK) continue; // it turns into its column first
    safe *= 1 - hitChance(d, settings.diceMode);
  }
  return 1 - safe;
}

/** Static evaluation of a position from the point of view of `me` (and team-mate). */
export function evaluate(settings: Settings, sim: Sim, me: Color, w: Weights = WEIGHTS): number {
  let score = 0;
  sim.pieces.forEach((p, idx) => {
    if (!isTeamOf(settings, me, p.color)) return;
    const factor = p.color === me ? 1 : w.teammateFactor;
    let v = 0;
    if (p.progress === YARD) {
      v = 0;
    } else {
      v += w.outOfYard + w.progress * p.progress;
      if (p.progress > LAST_TRACK && p.progress < HOME) v += w.inColumn;
      if (p.progress === HOME) v += w.inColumn + w.home;
      const sq = trackSquare(p.color, p.progress);
      if (sq !== null) {
        if (isSafeSquare(sq)) v += w.safeSquare;
        else if (
          settings.teamMode &&
          sim.pieces.some(
            (o) => o.color !== p.color && isTeamOf(settings, me, o.color) && trackSquare(o.color, o.progress) === sq,
          )
        ) {
          v += w.teamStack;
        }
        v -= (w.dangerBase + w.dangerPerProgress * p.progress) * danger(settings, sim, me, idx);
      }
      if (
        settings.killRequiredToEnterColumn &&
        !sim.hasKilled[p.color] &&
        p.progress >= LAST_TRACK - 6 &&
        p.progress <= LAST_TRACK
      ) {
        v -= w.stuckWithoutKill;
      }
    }
    score += v * factor;
  });
  return score;
}

/** Best first move for the current bank, or null if there is nothing to move. */
export function chooseMove(state: GameState, rng: Rng, w: Weights = WEIGHTS): LegalMove | null {
  const leaves = enumerate(state, w);
  if (leaves.length === 0) return legalMoves(state)[0] ?? null;
  const me = state.turn.controls;
  let best: Leaf[] = [];
  let bestScore = -Infinity;
  for (const leaf of leaves) {
    const s = leaf.bonus + evaluate(state.settings, leaf.sim, me, w);
    if (s > bestScore + 1e-9) {
      bestScore = s;
      best = [leaf];
    } else if (Math.abs(s - bestScore) <= 1e-9) {
      best.push(leaf);
    }
  }
  return best[rng.int(best.length)]!.firstMove;
}

/** The bot's next action for the acting seat. */
export function chooseAction(state: GameState, rng: Rng, w: Weights = WEIGHTS): Action | null {
  const { phase, seat } = state.turn;
  if (phase.kind === 'awaitRoll') return { type: 'roll', seat };
  if (phase.kind !== 'awaitMove') return null;
  const m = chooseMove(state, rng, w);
  return m ? { type: 'move', seat, pieceId: m.pieceId, value: m.value } : null;
}
