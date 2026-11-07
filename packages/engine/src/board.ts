/**
 * Board geometry. See docs/04-engine.md §1 and RULES.md §11.
 *
 * Canonical orientation (before the client rotates the board for the local player):
 *   green  top-left    | yellow top-right
 *   red    bottom-left | blue   bottom-right
 * Play goes clockwise: red → green → yellow → blue.
 */

export type Color = 'red' | 'green' | 'yellow' | 'blue';

export const COLORS: readonly Color[] = ['red', 'green', 'yellow', 'blue'];
/** Clockwise turn order. */
export const TURN_ORDER: readonly Color[] = COLORS;

export const OPPOSITE: Readonly<Record<Color, Color>> = {
  red: 'yellow',
  yellow: 'red',
  green: 'blue',
  blue: 'green',
};

/** Team index: red+yellow = 0, green+blue = 1. */
export const TEAM: Readonly<Record<Color, 0 | 1>> = { red: 0, yellow: 0, green: 1, blue: 1 };

export const TRACK_LENGTH = 52;
export const YARD = -1;
export const START_PROGRESS = 0;
/** Last progress value on the shared track (the square before the column entrance). */
export const LAST_TRACK = 50;
export const COLUMN_FIRST = 51;
export const COLUMN_LAST = 55;
export const HOME = 56;
export const PIECES_PER_PLAYER = 4;

/** Absolute track index of each colour's start square. */
export const START: Readonly<Record<Color, number>> = { red: 0, green: 13, yellow: 26, blue: 39 };

/** Safe squares: the four start squares and the four stars 8 squares past each start. */
export const SAFE_SQUARES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const isInYard = (progress: number): boolean => progress === YARD;
export const isOnTrack = (progress: number): boolean => progress >= 0 && progress <= LAST_TRACK;
export const isInColumn = (progress: number): boolean => progress >= COLUMN_FIRST && progress <= COLUMN_LAST;
export const isHome = (progress: number): boolean => progress === HOME;

/** Absolute track index for a piece on the shared track, or null when it is not on the track. */
export function trackSquare(color: Color, progress: number): number | null {
  if (!isOnTrack(progress)) return null;
  return (START[color] + progress) % TRACK_LENGTH;
}

export const isSafeSquare = (square: number): boolean => SAFE_SQUARES.has(square);

// ---------------------------------------------------------------------------
// Screen coordinates (15 × 15 grid, x to the right, y down). Values are cell
// CENTRES in cell units, so the client can scale them directly.
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

const cell = (x: number, y: number): Point => ({ x: x + 0.5, y: y + 0.5 });

/** Track cells in absolute order, index 0 = red's start square. */
export const TRACK_CELLS: readonly Point[] = (() => {
  const cells: Array<[number, number]> = [];
  // Bottom arm, left column, going up (red start is (6,13)).
  for (let y = 13; y >= 9; y--) cells.push([6, y]);
  // Left arm, bottom row, going left.
  for (let x = 5; x >= 0; x--) cells.push([x, 8]);
  cells.push([0, 7]);
  // Left arm, top row, going right (green start is (1,6)).
  for (let x = 0; x <= 5; x++) cells.push([x, 6]);
  // Top arm, left column, going up.
  for (let y = 5; y >= 0; y--) cells.push([6, y]);
  cells.push([7, 0]);
  // Top arm, right column, going down (yellow start is (8,1)).
  for (let y = 0; y <= 5; y++) cells.push([8, y]);
  // Right arm, top row, going right.
  for (let x = 9; x <= 14; x++) cells.push([x, 6]);
  cells.push([14, 7]);
  // Right arm, bottom row, going left (blue start is (13,8)).
  for (let x = 14; x >= 9; x--) cells.push([x, 8]);
  // Bottom arm, right column, going down.
  for (let y = 9; y <= 14; y++) cells.push([8, y]);
  cells.push([7, 14]);
  cells.push([6, 14]);
  return cells.map(([x, y]) => cell(x, y));
})();

/** Finishing column cells for each colour, progress 51..55 in order. */
export const COLUMN_CELLS: Readonly<Record<Color, readonly Point[]>> = {
  red: [13, 12, 11, 10, 9].map((y) => cell(7, y)),
  green: [1, 2, 3, 4, 5].map((x) => cell(x, 7)),
  yellow: [1, 2, 3, 4, 5].map((y) => cell(7, y)),
  blue: [13, 12, 11, 10, 9].map((x) => cell(x, 7)),
};

/** Where finished pieces sit: the centroid of each colour's home triangle. */
export const HOME_POINTS: Readonly<Record<Color, Point>> = {
  red: { x: 7.5, y: 8.5 },
  green: { x: 6.5, y: 7.5 },
  yellow: { x: 7.5, y: 6.5 },
  blue: { x: 8.5, y: 7.5 },
};

/** Top-left cell of each 6×6 yard. */
export const YARD_ORIGIN: Readonly<Record<Color, Point>> = {
  red: { x: 0, y: 9 },
  green: { x: 0, y: 0 },
  yellow: { x: 9, y: 0 },
  blue: { x: 9, y: 9 },
};

/** Centre of each of the four yard slots for a colour. */
export function yardSlot(color: Color, index: number): Point {
  const o = YARD_ORIGIN[color];
  const dx = index % 2 === 0 ? 2 : 4;
  const dy = index < 2 ? 2 : 4;
  return { x: o.x + dx, y: o.y + dy };
}

/** Screen point for a piece. `index` (0..3) is only used for yard slots. */
export function pointFor(color: Color, progress: number, index = 0): Point {
  if (progress === YARD) return yardSlot(color, index);
  if (progress === HOME) return HOME_POINTS[color];
  if (isInColumn(progress)) return COLUMN_CELLS[color][progress - COLUMN_FIRST]!;
  return TRACK_CELLS[trackSquare(color, progress)!]!;
}

/**
 * Progress values a piece passes through when moving, excluding the start and
 * including the destination. Used by the client to animate square by square.
 */
export function pathBetween(from: number, to: number): number[] {
  if (from === YARD) return [START_PROGRESS];
  const path: number[] = [];
  for (let p = from + 1; p <= to; p++) path.push(p);
  return path;
}
