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
  TURN_ORDER,
  YARD_ORIGIN,
  yardSlot,
} from '@ludo/engine';
import { memo } from 'react';
import { BOARD_THEMES, type BoardTheme, type PieceStyleId } from '../lib/themes';

/**
 * Safe squares are tinted with the colour of the home column next to them: the
 * safe square 8 past a colour's start sits on the arm of the next colour clockwise.
 */
export function safeSquareColor(index: number): Color | null {
  if (!SAFE_SQUARES.has(index) || COLORS.some((c) => START[c] === index)) return null;
  const owner = COLORS.find((c) => (START[c] + 8) % 52 === index)!;
  return TURN_ORDER[(TURN_ORDER.indexOf(owner) + 1) % 4]!;
}

/** Gradients used by the art and by pieces. Render once inside the board's <svg>. */
export function BoardDefs({ theme = BOARD_THEMES.classic }: { theme?: BoardTheme }) {
  const { base, dark } = theme;
  return (
    <defs>
      {COLORS.map((c) => (
        <radialGradient key={`piece-${c}`} id={`piece-${c}`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="white" stopOpacity="0.7" />
          <stop offset="0.35" stopColor={base[c]} />
          <stop offset="1" stopColor={dark[c]} />
        </radialGradient>
      ))}
      {COLORS.map((c) => (
        <linearGradient key={`yard-${c}`} id={`yard-${c}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={base[c]} stopOpacity="0.88" />
          <stop offset="1" stopColor={base[c]} />
        </linearGradient>
      ))}
      {COLORS.map((c) => (
        <linearGradient key={`tri-${c}`} id={`tri-${c}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={base[c]} />
          <stop offset="1" stopColor={dark[c]} />
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
  theme = BOARD_THEMES.classic,
}: {
  rotation?: number;
  activeColor?: Color | null;
  theme?: BoardTheme;
}) {
  const { paper, tray, cell: CELL, grid: GRID, base: BASE, light: LIGHT } = theme;
  return (
    <g transform={`rotate(${rotation} 7.5 7.5)`}>
      {/* Paper with a printed frame */}
      <rect x={-0.25} y={-0.25} width={15.5} height={15.5} rx={0.55} fill={paper} />
      <rect x={-0.05} y={-0.05} width={15.1} height={15.1} rx={0.42} fill="none" stroke={GRID} strokeWidth={0.06} />

      {/* Track: printed grid of squares */}
      {TRACK_CELLS.map((c, i) => {
        const start = COLORS.find((col) => START[col] === i);
        const safe = safeSquareColor(i);
        return (
          <rect
            key={i}
            x={c.x - 0.5}
            y={c.y - 0.5}
            width={1}
            height={1}
            fill={start ? BASE[start] : safe ? BASE[safe] : CELL}
            fillOpacity={safe ? 0.72 : 1}
            stroke={GRID}
            strokeWidth={0.035}
            data-safe={safe ?? undefined}
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
            {/* Rounded on all four corners, like the frame and the trays. */}
            <rect
              x={o.x + 0.04}
              y={o.y + 0.04}
              width={5.92}
              height={5.92}
              rx={0.5}
              fill={`url(#yard-${col})`}
              stroke={GRID}
              strokeWidth={0.035}
            />
            {active && (
              <rect
                x={o.x + 0.12}
                y={o.y + 0.12}
                width={5.76}
                height={5.76}
                rx={0.4}
                fill="none"
                stroke="white"
                strokeWidth={0.16}
                className="animate-pulse"
              />
            )}
            {/* Inner tray with a soft shadow */}
            <rect x={o.x + 0.95} y={o.y + 1.05} width={4.1} height={4.1} rx={0.7} fill="black" opacity={0.12} />
            <rect x={o.x + 0.95} y={o.y + 0.95} width={4.1} height={4.1} rx={0.7} fill={tray} />
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

const GLYPH: Record<Color, string> = { red: '●', green: '▲', yellow: '■', blue: '◆' };

/**
 * One piece, drawn at the origin in a given style (radius `r`). Uses the
 * piece gradients from <BoardDefs>, so render it inside a board's <svg>.
 */
export function PieceShape({
  color,
  r,
  style,
  theme = BOARD_THEMES.classic,
  colorBlind = false,
}: {
  color: Color;
  r: number;
  style: PieceStyleId;
  theme?: BoardTheme;
  colorBlind?: boolean;
}) {
  const base = theme.base[color];
  const dark = theme.dark[color];
  const shadow = <ellipse cx={0.03} cy={r * 0.75} rx={r * 0.9} ry={r * 0.35} fill="black" opacity={0.2} />;
  let body;
  switch (style) {
    case 'flat':
      body = (
        <>
          <circle r={r} fill={base} stroke={dark} strokeWidth={0.05} />
          <circle r={r * 0.62} fill="none" stroke="white" strokeOpacity={0.85} strokeWidth={0.06} />
        </>
      );
      break;
    case 'pawn':
      // A pawn seen from above: wide base, raised collar, round head.
      body = (
        <>
          <circle r={r} fill={dark} />
          <circle r={r * 0.82} fill={base} />
          <circle r={r * 0.5} fill={dark} opacity={0.55} />
          <circle r={r * 0.4} fill={`url(#piece-${color})`} />
          <circle cx={-r * 0.12} cy={-r * 0.14} r={r * 0.12} fill="white" opacity={0.6} />
        </>
      );
      break;
    case 'gem': {
      const pts = (k: number) =>
        Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i + Math.PI / 8;
          return `${(Math.cos(a) * r * k).toFixed(3)},${(Math.sin(a) * r * k).toFixed(3)}`;
        }).join(' ');
      body = (
        <>
          <polygon points={pts(1)} fill={dark} />
          <polygon points={pts(0.86)} fill={`url(#piece-${color})`} />
          <polygon points={pts(0.45)} fill="white" opacity={0.28} />
          <path
            d={`M0 ${-r * 0.86} L0 ${-r * 0.45} M0 ${r * 0.86} L0 ${r * 0.45}`}
            stroke="white"
            strokeOpacity={0.35}
            strokeWidth={0.03}
          />
        </>
      );
      break;
    }
    case 'coin':
      body = (
        <>
          <circle r={r} fill={dark} />
          <circle r={r * 0.9} fill={`url(#piece-${color})`} />
          <circle r={r * 0.68} fill="none" stroke={dark} strokeOpacity={0.6} strokeWidth={0.04} />
          <circle r={r * 0.6} fill="none" stroke="white" strokeOpacity={0.45} strokeWidth={0.03} />
          <circle r={r * 0.16} fill={dark} opacity={0.5} />
        </>
      );
      break;
    case 'glossy':
    default:
      body = (
        <>
          <circle r={r} fill={`url(#piece-${color})`} stroke={dark} strokeWidth={0.05} />
          <circle r={r * 0.42} fill="white" opacity={0.28} />
        </>
      );
  }
  return (
    <g>
      {shadow}
      {body}
      {colorBlind && (
        <text y={r * 0.32} textAnchor="middle" fontSize={r * 0.9} fill="white" opacity={0.9}>
          {GLYPH[color]}
        </text>
      )}
    </g>
  );
}
