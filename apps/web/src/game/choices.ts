/**
 * What tapping a piece offers (docs/01-product-and-ux.md §4.3 "Moving pieces").
 * Works only from the server's legal-move list, so the client never decides legality.
 */
import type { LegalMove, Piece } from '@ludo/engine';

/** Distinct values a piece can use, sorted. Identical stacked pieces share their options. */
export function valuesForPiece(moves: LegalMove[], pieces: Piece[], pieceId: string): LegalMove[] {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return [];
  const twins = new Set(
    pieces.filter((p) => p.color === piece.color && p.progress === piece.progress).map((p) => p.id),
  );
  const byValue = new Map<number, LegalMove>();
  for (const m of moves) {
    if (!twins.has(m.pieceId) || byValue.has(m.value)) continue;
    // Twins have identical outcomes, so the tapped piece is the one that moves.
    byValue.set(m.value, { ...m, pieceId });
  }
  return [...byValue.values()].sort((a, b) => a.value - b.value);
}

/** Pieces that have at least one legal move (optionally only with a chosen die value). */
export function movablePieceIds(moves: LegalMove[], value: number | null = null): Set<string> {
  return new Set(moves.filter((m) => value === null || m.value === value).map((m) => m.pieceId));
}

/**
 * The single move to play automatically, or null when there is a real choice.
 * Moves of identical pieces (same colour and square) to the same destination count as one.
 */
export function onlyMove(moves: LegalMove[]): LegalMove | null {
  if (moves.length === 0) return null;
  const outcomes = new Set(moves.map((m) => `${m.from}:${m.value}`));
  return outcomes.size === 1 ? moves[0]! : null;
}
