/**
 * Screen geometry for the board (docs/02-visual-design.md §3–§4).
 * The engine works in the canonical orientation (red bottom-left). The client
 * rotates everything so the local player's colour sits bottom-left.
 */
import { type Color, type Piece, type Point, pointFor } from '@ludo/engine';

export const BOARD_SIZE = 15;
const CENTER = BOARD_SIZE / 2;

/** Clockwise rotation (degrees) that brings each colour's corner to the bottom-left. */
export const ROTATION: Readonly<Record<Color, number>> = { red: 0, blue: 90, yellow: 180, green: 270 };

export function rotationFor(color: Color | null | undefined): number {
  return color ? ROTATION[color] : 0;
}

/** Rotate a point clockwise around the board centre (screen coordinates, y down). */
export function rotatePoint(p: Point, degrees: number): Point {
  const turns = (((degrees / 90) % 4) + 4) % 4;
  let dx = p.x - CENTER;
  let dy = p.y - CENTER;
  for (let i = 0; i < turns; i++) [dx, dy] = [-dy, dx];
  return { x: CENTER + dx, y: CENTER + dy };
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CANONICAL_CORNER: Record<Color, Corner> = {
  green: 'top-left',
  yellow: 'top-right',
  red: 'bottom-left',
  blue: 'bottom-right',
};
const CLOCKWISE: Corner[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/** Where a colour's yard appears on screen after rotation. */
export function cornerOf(color: Color, degrees: number): Corner {
  const start = CLOCKWISE.indexOf(CANONICAL_CORNER[color]);
  return CLOCKWISE[(start + Math.round(degrees / 90)) % 4]!;
}

export interface PlacedPiece {
  piece: Piece;
  x: number;
  y: number;
  /** 1 alone, smaller when sharing a square. */
  scale: number;
  /** Pieces on the same square (for stack badges / pickers). */
  stackSize: number;
}

/** Screen positions for all pieces, with small offsets so stacked pieces stay visible. */
export function placePieces(pieces: Piece[], progress: Record<string, number>, degrees: number): PlacedPiece[] {
  const base = pieces.map((piece) => {
    const p = progress[piece.id] ?? piece.progress;
    const index = Number(piece.id.split('-')[1] ?? 0);
    return { piece: { ...piece, progress: p }, point: rotatePoint(pointFor(piece.color, p, index), degrees) };
  });
  const groups = new Map<string, number[]>();
  base.forEach((b, i) => {
    // Yard slots never overlap; everything else can stack.
    const key = b.piece.progress === -1 ? `yard-${b.piece.id}` : `${b.point.x.toFixed(2)},${b.point.y.toFixed(2)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const out: PlacedPiece[] = new Array(base.length);
  for (const members of groups.values()) {
    const n = members.length;
    members.forEach((idx, k) => {
      const b = base[idx]!;
      const [ox, oy] = stackOffset(n, k);
      out[idx] = { piece: b.piece, x: b.point.x + ox, y: b.point.y + oy, scale: n === 1 ? 1 : n === 2 ? 0.78 : 0.62, stackSize: n };
    });
  }
  return out;
}

function stackOffset(n: number, k: number): [number, number] {
  if (n <= 1) return [0, 0];
  if (n === 2) return [k === 0 ? -0.17 : 0.17, 0];
  const d = 0.19;
  const grid: Array<[number, number]> = [
    [-d, -d],
    [d, -d],
    [-d, d],
    [d, d],
  ];
  return grid[k % 4]!;
}
