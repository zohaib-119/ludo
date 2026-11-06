import { describe, expect, it } from 'vitest';
import {
  COLORS,
  COLUMN_CELLS,
  HOME,
  SAFE_SQUARES,
  START,
  TRACK_CELLS,
  YARD_ORIGIN,
  pathBetween,
  pointFor,
  trackSquare,
} from '../src';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('board geometry', () => {
  it('has 52 unique track cells inside the 15×15 grid', () => {
    expect(TRACK_CELLS).toHaveLength(52);
    const keys = new Set(TRACK_CELLS.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(52);
    for (const c of TRACK_CELLS) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(15);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(15);
    }
  });

  it('track is a closed loop of adjacent cells, cutting diagonally only at the 4 inner corners', () => {
    let diagonals = 0;
    for (let i = 0; i < 52; i++) {
      const a = TRACK_CELLS[i]!;
      const b = TRACK_CELLS[(i + 1) % 52]!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      expect(Math.max(dx, dy), `cells ${i} → ${i + 1}`).toBe(1);
      if (dx === 1 && dy === 1) diagonals++;
    }
    expect(diagonals).toBe(4);
  });

  it('start squares are 13 apart and safe, plus 4 stars', () => {
    expect(Object.values(START)).toEqual([0, 13, 26, 39]);
    expect([...SAFE_SQUARES].sort((a, b) => a - b)).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });

  it.each(COLORS)('%s: start square touches its own yard', (color) => {
    const start = TRACK_CELLS[START[color]]!;
    const o = YARD_ORIGIN[color];
    const insideX = start.x > o.x && start.x < o.x + 6;
    const insideY = start.y > o.y && start.y < o.y + 6;
    // The start square is just outside the yard, adjacent along one axis.
    expect(insideX || insideY).toBe(true);
  });

  it.each(COLORS)('%s: column starts next to progress 50 and runs to the centre', (color) => {
    const entry = pointFor(color, 50);
    const column = COLUMN_CELLS[color];
    expect(column).toHaveLength(5);
    expect(dist(entry, column[0]!)).toBe(1);
    for (let i = 0; i < 4; i++) expect(dist(column[i]!, column[i + 1]!)).toBe(1);
    expect(dist(column[4]!, { x: 7.5, y: 7.5 })).toBe(2);
  });

  it('trackSquare wraps around and is null off the track', () => {
    expect(trackSquare('red', 0)).toBe(0);
    expect(trackSquare('blue', 13)).toBe(0);
    expect(trackSquare('green', 50)).toBe(11);
    expect(trackSquare('red', -1)).toBeNull();
    expect(trackSquare('red', 51)).toBeNull();
    expect(trackSquare('red', HOME)).toBeNull();
  });

  it('every colour visits each track square at most once', () => {
    for (const color of COLORS) {
      const squares = Array.from({ length: 51 }, (_, p) => trackSquare(color, p));
      expect(new Set(squares).size).toBe(51);
    }
  });

  it('pathBetween lists each square passed', () => {
    expect(pathBetween(-1, 0)).toEqual([0]);
    expect(pathBetween(3, 7)).toEqual([4, 5, 6, 7]);
    expect(pathBetween(50, 56)).toEqual([51, 52, 53, 54, 55, 56]);
  });
});
