/**
 * The printed board (docs/02-visual-design.md §3), drawn in canonical
 * orientation on a 15×15 grid. Shared by the game board and the landing page.
 */
import {
  type Color,
  COLORS,
  COLUMN_CELLS,
  START,
  SAFE_SQUARES,
  TRACK_CELLS,
  YARD_ORIGIN,
  yardSlot,
} from '@ludo/engine';
import { memo } from 'react';

export const BASE: Record<Color, string> = { red: '#E03131', green: '#2B9348', yellow: '#F2B705', blue: '#1C7ED6' };
export const LIGHT: Record<Color, string> = { red: '#FFD3D3', green: '#C3F0CC', yellow: '#FFEDA6', blue: '#C5E3FF' };
export const DARK: Record<Color, string> = { red: '#A61E1E', green: '#1B5E2E', yellow: '#A67C00', blue: '#105A9C' };

const PAPER = '#FFFDF8';
/** Safe squares: a plain soft-gold fill (no star symbol). */
export const SAFE_FILL = '#F4DE9C';
const GRID = '#D9CFBE';
const CELL = '#FFFFFF';

/** Gradients used by the art and by pieces. Render once inside the board's <svg>. */
export function BoardDefs() {
  return (
    <defs>
      {COLORS.map((c) => (
        <radialGradient key={`piece-${c}`} id={`piece-${c}`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="white" stopOpacity="0.7" />
          <stop offset="0.35" stopColor={BASE[c]} />
          <stop offset="1" stopColor={DARK[c]} />
        </radialGradient>
      ))}
      {COLORS.map((c) => (
        <linearGradient key={`yard-${c}`} id={`yard-${c}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BASE[c]} stopOpacity="0.88" />
          <stop offset="1" stopColor={BASE[c]} />
        </linearGradient>
      ))}
      {COLORS.map((c) => (
        <linearGradient key={`tri-${c}`} id={`tri-${c}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BASE[c]} />
          <stop offset="1" stopColor={DARK[c]} />
        </linearGradient>
      ))}
      <radialGradient id="slot-shade" cx="0.5" cy="0.35" r="0.7">
        <stop offset="0.6" stopColor="black" stopOpacity="0" />
        <stop offset="1" stopColor="black" stopOpacity="0.12" />
      </radialGradient>
    </defs>
  );
}

export const BoardArt = memo(function BoardArt({
  rotation = 0,
  activeColor = null,
}: {
  rotation?: number;
  activeColor?: Color | null;
}) {
  return (
    <g transform={`rotate(${rotation} 7.5 7.5)`}>
      {/* Paper with a printed frame */}
      <rect x={-0.25} y={-0.25} width={15.5} height={15.5} rx={0.55} fill={PAPER} />
      <rect x={-0.05} y={-0.05} width={15.1} height={15.1} rx={0.42} fill="none" stroke={GRID} strokeWidth={0.06} />

      {/* Track: printed grid of squares */}
      {TRACK_CELLS.map((c, i) => {
        const start = COLORS.find((col) => START[col] === i);
        const safe = !start && SAFE_SQUARES.has(i);
        return (
          <rect
            key={i}
            x={c.x - 0.5}
            y={c.y - 0.5}
            width={1}
            height={1}
            fill={start ? BASE[start] : safe ? SAFE_FILL : CELL}
            stroke={GRID}
            strokeWidth={0.035}
          >
            {safe && <title>Safe square</title>}
          </rect>
        );
      })}

      {/* Home columns with chevrons pointing to the centre */}
      {COLORS.map((col) =>
        COLUMN_CELLS[col].map((c, i) => {
          const next = COLUMN_CELLS[col][i + 1] ?? { x: 7.5, y: 7.5 };
          const angle = (Math.atan2(next.y - c.y, next.x - c.x) * 180) / Math.PI;
          return (
            <g key={`${col}-col-${i}`}>
              <rect
                x={c.x - 0.5}
                y={c.y - 0.5}
                width={1}
                height={1}
                fill={BASE[col]}
                stroke={GRID}
                strokeWidth={0.035}
              />
              <path
                d="M -0.12 -0.16 L 0.08 0 L -0.12 0.16"
                fill="none"
                stroke="white"
                strokeOpacity={0.55}
                strokeWidth={0.07}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={`translate(${c.x} ${c.y}) rotate(${angle})`}
              />
            </g>
          );
        }),
      )}

      {/* Start arrows (white on the coloured start square) */}
      {COLORS.map((col) => {
        const a = TRACK_CELLS[START[col]]!;
        const b = TRACK_CELLS[(START[col] + 1) % 52]!;
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return (
          <path
            key={`arrow-${col}`}
            d="M -0.2 -0.2 L 0.16 0 L -0.2 0.2"
            fill="none"
            stroke="white"
            strokeWidth={0.11}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${a.x} ${a.y}) rotate(${angle})`}
          />
        );
      })}

      {/* Centre: home triangles */}
      <polygon points="6,9 9,9 7.5,7.5" fill="url(#tri-red)" />
      <polygon points="6,6 6,9 7.5,7.5" fill="url(#tri-green)" />
      <polygon points="6,6 9,6 7.5,7.5" fill="url(#tri-yellow)" />
      <polygon points="9,6 9,9 7.5,7.5" fill="url(#tri-blue)" />
      <path d="M6 6 L9 9 M9 6 L6 9" stroke="white" strokeOpacity={0.6} strokeWidth={0.05} />
      <rect x={6} y={6} width={3} height={3} fill="none" stroke={GRID} strokeWidth={0.035} />

      {/* Yards */}
      {COLORS.map((col) => {
        const o = YARD_ORIGIN[col];
        const active = activeColor === col;
        return (
          <g key={`yard-${col}`}>
            <rect x={o.x} y={o.y} width={6} height={6} fill={`url(#yard-${col})`} stroke={GRID} strokeWidth={0.035} />
            {active && (
              <rect
                x={o.x + 0.12}
                y={o.y + 0.12}
                width={5.76}
                height={5.76}
                rx={0.35}
                fill="none"
                stroke="white"
                strokeWidth={0.16}
                className="animate-pulse"
              />
            )}
            {/* Inner tray with a soft shadow */}
            <rect x={o.x + 0.95} y={o.y + 1.05} width={4.1} height={4.1} rx={0.7} fill="black" opacity={0.12} />
            <rect x={o.x + 0.95} y={o.y + 0.95} width={4.1} height={4.1} rx={0.7} fill={PAPER} />
            {[0, 1, 2, 3].map((i) => {
              const s = yardSlot(col, i);
              return (
                <g key={i}>
                  <circle cx={s.x} cy={s.y} r={0.52} fill={LIGHT[col]} />
                  <circle cx={s.x} cy={s.y} r={0.52} fill="url(#slot-shade)" />
                  <circle cx={s.x} cy={s.y} r={0.52} fill="none" stroke={BASE[col]} strokeWidth={0.06} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
});
