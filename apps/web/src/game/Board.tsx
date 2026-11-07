/**
 * The board (docs/02-visual-design.md §3–§4): one SVG on a 15×15 grid.
 * Static art is drawn in canonical orientation inside a rotated group; pieces
 * and overlays use rotated coordinates so numbers and bubbles stay upright.
 */
import {
  type Color,
  COLORS,
  COLUMN_CELLS,
  type LegalMove,
  type Piece,
  START,
  SAFE_SQUARES,
  TRACK_CELLS,
  YARD_ORIGIN,
  pathBetween,
  pointFor,
  yardSlot,
} from '@ludo/engine';
import { motion } from 'motion/react';
import { memo, useMemo } from 'react';
import { placePieces, rotatePoint } from './geometry';

const BASE: Record<Color, string> = {
  red: 'var(--red)',
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  blue: 'var(--blue)',
};
const LIGHT: Record<Color, string> = {
  red: 'var(--red-light)',
  green: 'var(--green-light)',
  yellow: 'var(--yellow-light)',
  blue: 'var(--blue-light)',
};
const DARK: Record<Color, string> = {
  red: 'var(--red-dark)',
  green: 'var(--green-dark)',
  yellow: 'var(--yellow-dark)',
  blue: 'var(--blue-dark)',
};
const GLYPH: Record<Color, string> = { red: '●', green: '▲', yellow: '■', blue: '◆' };

export interface BoardProps {
  pieces: Piece[];
  /** Displayed progress per piece (from playback). */
  progress: Record<string, number>;
  rotation: number;
  /** Colours whose yard should glow (whose turn it is). */
  activeColor: Color | null;
  /** Pieces the local player can move right now. */
  movable: Set<string>;
  selected: string | null;
  /** Options for the selected piece (bubbles when more than one). */
  options: LegalMove[];
  /** Destination preview. */
  preview: LegalMove | null;
  /** Colours that still need a capture before entering their column. */
  locked: Color[];
  colorBlind: boolean;
  reducedMotion: boolean;
  onPieceTap: (pieceId: string) => void;
  onChoose: (move: LegalMove) => void;
  onBackgroundTap: () => void;
}

export function Board(props: BoardProps) {
  const { pieces, progress, rotation, movable, selected, options, preview } = props;
  const placed = useMemo(() => placePieces(pieces, progress, rotation), [pieces, progress, rotation]);
  const selectedPlaced = placed.find((p) => p.piece.id === selected);

  return (
    <svg
      viewBox="-0.25 -0.25 15.5 15.5"
      className="block size-full select-none"
      role="img"
      aria-label="Ludo board"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onBackgroundTap();
      }}
    >
      <defs>
        {COLORS.map((c) => (
          <radialGradient key={c} id={`piece-${c}`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="white" stopOpacity="0.65" />
            <stop offset="0.35" stopColor={BASE[c]} />
            <stop offset="1" stopColor={DARK[c]} />
          </radialGradient>
        ))}
      </defs>

      <StaticBoard rotation={rotation} activeColor={props.activeColor} />

      {/* Kill-to-enter padlocks at the column entrances. */}
      {props.locked.map((c) => {
        const p = rotatePoint(COLUMN_CELLS[c][0]!, rotation);
        return <Padlock key={c} x={p.x} y={p.y} color={DARK[c]} />;
      })}

      {/* Preview: path trail and ghost at the destination. */}
      {preview && selectedPlaced && <Preview move={preview} piece={selectedPlaced.piece} rotation={rotation} />}

      {/* Pieces, in a stable order so stacks overlap consistently. */}
      {placed.map((p) => (
        <PieceView
          key={p.piece.id}
          piece={p.piece}
          x={p.x}
          y={p.y}
          scale={p.scale}
          movable={movable.has(p.piece.id)}
          selected={selected === p.piece.id}
          colorBlind={props.colorBlind}
          reducedMotion={props.reducedMotion}
          onTap={props.onPieceTap}
        />
      ))}

      {/* Choice bubbles above the selected piece. */}
      {selectedPlaced && options.length > 1 && (
        <g>
          {options.map((m, i) => {
            const n = options.length;
            const bx = selectedPlaced.x + (i - (n - 1) / 2) * 0.95;
            const by = Math.max(0.6, selectedPlaced.y - 1.05);
            return (
              <motion.g
                key={m.value}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 26, delay: i * 0.03 }}
                style={{ originX: `${bx}px`, originY: `${by}px` }}
                role="button"
                tabIndex={0}
                aria-label={`Move ${m.value}`}
                className="cursor-pointer outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onChoose(m);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') props.onChoose(m);
                }}
                data-testid={`choice-${m.value}`}
              >
                <circle cx={bx} cy={by} r={0.42} fill="var(--text)" />
                <text
                  x={bx}
                  y={by + 0.15}
                  textAnchor="middle"
                  fontSize={0.48}
                  fontWeight={800}
                  fill="var(--bg)"
                  fontFamily="var(--font-display)"
                >
                  {m.value}
                </text>
              </motion.g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Static art (memoised: only changes with rotation / active colour)
// ---------------------------------------------------------------------------

const StaticBoard = memo(function StaticBoard({
  rotation,
  activeColor,
}: {
  rotation: number;
  activeColor: Color | null;
}) {
  return (
    <g transform={`rotate(${rotation} 7.5 7.5)`}>
      <rect x={-0.25} y={-0.25} width={15.5} height={15.5} rx={0.6} fill="var(--surface)" />
      {/* Track squares */}
      {TRACK_CELLS.map((c, i) => {
        const start = COLORS.find((col) => START[col] === i);
        return (
          <rect
            key={i}
            x={c.x - 0.5 + 0.03}
            y={c.y - 0.5 + 0.03}
            width={0.94}
            height={0.94}
            rx={0.14}
            fill={start ? LIGHT[start] : 'var(--surface-2)'}
          />
        );
      })}
      {/* Start arrows */}
      {COLORS.map((col) => {
        const a = TRACK_CELLS[START[col]]!;
        const b = TRACK_CELLS[(START[col] + 1) % 52]!;
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return (
          <path
            key={`arrow-${col}`}
            d="M -0.22 -0.18 L 0.18 0 L -0.22 0.18"
            fill="none"
            stroke={BASE[col]}
            strokeWidth={0.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${a.x} ${a.y}) rotate(${angle})`}
          />
        );
      })}
      {/* Safe stars (not on start squares) */}
      {[...SAFE_SQUARES]
        .filter((i) => !COLORS.some((col) => START[col] === i))
        .map((i) => {
          const c = TRACK_CELLS[i]!;
          return <Star key={`star-${i}`} x={c.x} y={c.y} />;
        })}
      {/* Home columns */}
      {COLORS.map((col) =>
        COLUMN_CELLS[col].map((c, i) => (
          <rect
            key={`${col}-col-${i}`}
            x={c.x - 0.47}
            y={c.y - 0.47}
            width={0.94}
            height={0.94}
            rx={0.14}
            fill={BASE[col]}
            opacity={0.88}
          />
        )),
      )}
      {/* Centre: home triangles */}
      <polygon points="6,9 9,9 7.5,7.5" fill={BASE.red} />
      <polygon points="6,6 6,9 7.5,7.5" fill={BASE.green} />
      <polygon points="6,6 9,6 7.5,7.5" fill={BASE.yellow} />
      <polygon points="9,6 9,9 7.5,7.5" fill={BASE.blue} />
      <polygon points="6,6 9,6 9,9 6,9" fill="none" stroke="var(--surface)" strokeWidth={0.08} />
      {/* Yards */}
      {COLORS.map((col) => {
        const o = YARD_ORIGIN[col];
        const active = activeColor === col;
        return (
          <g key={`yard-${col}`}>
            <rect x={o.x + 0.06} y={o.y + 0.06} width={5.88} height={5.88} rx={0.7} fill={BASE[col]} />
            {active && (
              <rect
                x={o.x + 0.06}
                y={o.y + 0.06}
                width={5.88}
                height={5.88}
                rx={0.7}
                fill="none"
                stroke="white"
                strokeWidth={0.14}
                className="animate-pulse"
                opacity={0.8}
              />
            )}
            <rect x={o.x + 0.9} y={o.y + 0.9} width={4.2} height={4.2} rx={0.6} fill="var(--surface)" />
            {[0, 1, 2, 3].map((i) => {
              const s = yardSlot(col, i);
              return (
                <circle key={i} cx={s.x} cy={s.y} r={0.5} fill={LIGHT[col]} stroke={BASE[col]} strokeWidth={0.06} />
              );
            })}
          </g>
        );
      })}
    </g>
  );
});

function Star({ x, y }: { x: number; y: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.36 : 0.15;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${x + r * Math.cos(a)},${y + r * Math.sin(a)}`);
  }
  return (
    <polygon points={pts.join(' ')} fill="var(--text-muted)" opacity={0.55}>
      <title>Safe square</title>
    </polygon>
  );
}

function Padlock({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={0.36} fill="var(--surface)" opacity={0.92} />
      <path
        d="M -0.11 -0.02 L -0.11 -0.12 A 0.11 0.11 0 0 1 0.11 -0.12 L 0.11 -0.02"
        fill="none"
        stroke={color}
        strokeWidth={0.05}
      />
      <rect x={-0.16} y={-0.03} width={0.32} height={0.22} rx={0.04} fill={color} />
      <title>Needs a capture to enter</title>
    </g>
  );
}

function Preview({ move, piece, rotation }: { move: LegalMove; piece: Piece; rotation: number }) {
  const trail = pathBetween(move.from, move.to).slice(0, -1);
  const dest = rotatePoint(pointFor(piece.color, move.to, 0), rotation);
  return (
    <g pointerEvents="none">
      {trail.map((p) => {
        const c = rotatePoint(pointFor(piece.color, p, 0), rotation);
        return <circle key={p} cx={c.x} cy={c.y} r={0.12} fill={BASE[piece.color]} opacity={0.45} />;
      })}
      <circle
        cx={dest.x}
        cy={dest.y}
        r={0.36}
        fill={BASE[piece.color]}
        opacity={0.35}
        stroke={DARK[piece.color]}
        strokeWidth={0.05}
        strokeDasharray="0.12 0.08"
      />
      {move.captures.length > 0 && (
        <text x={dest.x} y={dest.y + 0.14} textAnchor="middle" fontSize={0.4}>
          ⚔
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const PieceView = memo(function PieceView({
  piece,
  x,
  y,
  scale,
  movable,
  selected,
  colorBlind,
  reducedMotion,
  onTap,
}: {
  piece: Piece;
  x: number;
  y: number;
  scale: number;
  movable: boolean;
  selected: boolean;
  colorBlind: boolean;
  reducedMotion: boolean;
  onTap: (id: string) => void;
}) {
  const home = piece.progress === 56;
  const r = 0.36 * scale * (home ? 0.7 : 1);
  const toYard = piece.progress === -1;
  const transition = reducedMotion
    ? { duration: 0 }
    : toYard
      ? { duration: 0.45, ease: [0.3, 0, 0.2, 1] as const }
      : { type: 'spring' as const, stiffness: 700, damping: 34 };
  const label = `${piece.color} piece ${Number(piece.id.split('-')[1]) + 1}${movable ? ', can move' : ''}`;
  return (
    <motion.g
      initial={false}
      animate={{ x, y }}
      transition={transition}
      role={movable ? 'button' : undefined}
      tabIndex={movable ? 0 : undefined}
      aria-label={label}
      aria-pressed={movable ? selected : undefined}
      className={movable ? 'cursor-pointer outline-none' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (movable) onTap(piece.id);
      }}
      onKeyDown={(e) => {
        if (movable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onTap(piece.id);
        }
      }}
      data-testid={`piece-${piece.id}`}
      data-movable={movable || undefined}
    >
      {/* Hop: a small squash-and-lift each time the piece lands on a new square. */}
      <motion.g
        key={piece.progress}
        initial={reducedMotion ? false : { scale: 1.18, y: -0.12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 800, damping: 22 }}
      >
        <ellipse cx={0.03} cy={r * 0.75} rx={r * 0.9} ry={r * 0.35} fill="black" opacity={0.2} />
        {movable && (
          <circle
            r={r + 0.12}
            fill="none"
            stroke={selected ? 'var(--text)' : 'white'}
            strokeWidth={0.07}
            className={selected ? undefined : 'animate-pulse'}
          />
        )}
        <circle r={r} fill={`url(#piece-${piece.color})`} stroke={DARK[piece.color]} strokeWidth={0.05} />
        <circle r={r * 0.42} fill="white" opacity={0.28} />
        {colorBlind && (
          <text y={r * 0.32} textAnchor="middle" fontSize={r * 0.9} fill="white" opacity={0.9}>
            {GLYPH[piece.color]}
          </text>
        )}
        {/* Generous invisible hit area (44px-ish on phones). */}
        <circle r={0.55} fill="transparent" />
      </motion.g>
    </motion.g>
  );
});
