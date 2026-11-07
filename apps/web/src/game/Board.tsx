/**
 * The board (docs/02-visual-design.md §3–§4): one SVG on a 15×15 grid.
 * Static art is drawn in canonical orientation inside a rotated group; pieces
 * and overlays use rotated coordinates so numbers and bubbles stay upright.
 */
import { type Color, COLUMN_CELLS, type LegalMove, type Piece, pathBetween, pointFor } from '@ludo/engine';
import { motion } from 'motion/react';
import { type RefObject, memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../lib/settings';
import { BOARD_THEMES, type BoardTheme, type PieceStyleId, diceLook } from '../lib/themes';
import { BoardArt, BoardDefs, PieceShape } from './BoardArt';
import { placePieces, rotatePoint } from './geometry';

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
  /** Personal look (defaults: Classic board, glossy pieces). */
  theme?: BoardTheme;
  pieceStyle?: PieceStyleId;
  reducedMotion: boolean;
  onPieceTap: (pieceId: string) => void;
  onChoose: (move: LegalMove) => void;
  onBackgroundTap: () => void;
}

export function Board(props: BoardProps) {
  const { pieces, progress, rotation, movable, selected, options, preview } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const theme = props.theme ?? BOARD_THEMES.classic;
  const pieceStyle = props.pieceStyle ?? 'glossy';
  const placed = useMemo(() => placePieces(pieces, progress, rotation), [pieces, progress, rotation]);
  const selectedPlaced = placed.find((p) => p.piece.id === selected);
  const choiceSize = useChoiceSize(svgRef);

  return (
    <svg
      ref={svgRef}
      viewBox="-0.25 -0.25 15.5 15.5"
      className="block size-full select-none"
      role="img"
      aria-label="Ludo board"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onBackgroundTap();
      }}
    >
      <BoardDefs theme={theme} />

      <BoardArt rotation={rotation} activeColor={props.activeColor} theme={theme} />

      {/* Kill-to-enter padlocks at the column entrances. */}
      {props.locked.map((c) => {
        const p = rotatePoint(COLUMN_CELLS[c][0]!, rotation);
        return <Padlock key={c} x={p.x} y={p.y} color={theme.dark[c]} />;
      })}

      {/* Preview: path trail and ghost at the destination. */}
      {preview && selectedPlaced && (
        <Preview move={preview} piece={selectedPlaced.piece} rotation={rotation} theme={theme} />
      )}

      {/* Pieces, in a stable order so stacks overlap consistently. */}
      {/* Movable pieces are drawn last so they sit on top of anything sharing their square. */}
      {[...placed]
        .sort((a, b) => Number(movable.has(a.piece.id)) - Number(movable.has(b.piece.id)))
        .map((p) => (
          <PieceView
            key={p.piece.id}
            piece={p.piece}
            x={p.x}
            y={p.y}
            scale={p.scale}
            movable={movable.has(p.piece.id)}
            selected={selected === p.piece.id}
            colorBlind={props.colorBlind}
            theme={theme}
            pieceStyle={pieceStyle}
            reducedMotion={props.reducedMotion}
            onTap={props.onPieceTap}
          />
        ))}

      {/* Which die to play: real dice faces next to the selected piece, big enough to tap safely. */}
      {selectedPlaced && options.length > 1 && (
        <g>
          {options.map((m, i) => {
            const n = options.length;
            const gap = choiceSize + 0.25;
            const half = choiceSize / 2 + 0.1;
            // Centred over the piece, kept on the board; below the piece when it is near the top.
            const rowLeft = Math.min(Math.max(selectedPlaced.x - ((n - 1) * gap) / 2, half), 15 - half - (n - 1) * gap);
            const bx = rowLeft + i * gap;
            const offset = choiceSize / 2 + 0.7; // clear of the piece itself
            const above = selectedPlaced.y - offset;
            const by = above - half < 0 ? selectedPlaced.y + offset : above;
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
                <ChoiceDie x={bx} y={by} value={m.value} color={selectedPlaced.piece.color} size={choiceSize} />
              </motion.g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

/**
 * Size of a "which die?" choice, in board squares (a square is 1): at least about
 * 46 px on screen so a finger can't miss on a phone, and 1.3 squares on bigger boards.
 */
const CHOICE_MIN_PX = 46;
function useChoiceSize(svgRef: RefObject<SVGSVGElement | null>): number {
  const [size, setSize] = useState(1.3);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const pxPerSquare = svg.getBoundingClientRect().width / 15.5;
      if (pxPerSquare > 0) setSize(Math.min(2.4, Math.max(1.3, CHOICE_MIN_PX / pxPerSquare)));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef]);
  return size;
}
/** Pip positions on a 3×3 grid, as for the real dice. */
const CHOICE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** A die face drawn in the board's SVG, in the player's dice style. */
function ChoiceDie({ x, y, value, color, size }: { x: number; y: number; value: number; color: Color; size: number }) {
  const style = useSettings((st) => st.diceStyle);
  const look = diceLook(style, color);
  const s = size;
  const step = s * 0.27;
  return (
    <g>
      {/* A slightly larger, invisible target so near-misses still count. */}
      <rect x={x - s / 2 - 0.12} y={y - s / 2 - 0.12} width={s + 0.24} height={s + 0.24} fill="transparent" />
      <rect x={x - s / 2} y={y - s / 2 + 0.07} width={s} height={s} rx={s * 0.22} fill="black" opacity={0.25} />
      <rect
        x={x - s / 2}
        y={y - s / 2}
        width={s}
        height={s}
        rx={s * 0.22}
        fill={look.face}
        stroke={look.edge}
        strokeWidth={0.05}
      />
      {CHOICE_PIPS[value]?.map(([dx, dy], i) => (
        <circle
          key={i}
          cx={x + dx * step}
          cy={y + dy * step}
          r={s * 0.1}
          fill={look.pip}
          style={look.glow ? { filter: `drop-shadow(0 0 0.06px ${look.glow})` } : undefined}
        />
      ))}
    </g>
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

function Preview({
  move,
  piece,
  rotation,
  theme,
}: {
  move: LegalMove;
  piece: Piece;
  rotation: number;
  theme: BoardTheme;
}) {
  const trail = pathBetween(move.from, move.to).slice(0, -1);
  const dest = rotatePoint(pointFor(piece.color, move.to, 0), rotation);
  return (
    <g pointerEvents="none">
      {trail.map((p) => {
        const c = rotatePoint(pointFor(piece.color, p, 0), rotation);
        return <circle key={p} cx={c.x} cy={c.y} r={0.12} fill={theme.base[piece.color]} opacity={0.45} />;
      })}
      <circle
        cx={dest.x}
        cy={dest.y}
        r={0.36}
        fill={theme.base[piece.color]}
        opacity={0.35}
        stroke={theme.dark[piece.color]}
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
  theme,
  pieceStyle,
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
  theme: BoardTheme;
  pieceStyle: PieceStyleId;
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
      // Only my movable pieces take taps; everything else lets them through to what's underneath.
      // (A class, not style: Motion keeps the first style value it saw for a non-animated key.)
      role={movable ? 'button' : undefined}
      tabIndex={movable ? 0 : undefined}
      aria-label={label}
      aria-pressed={movable ? selected : undefined}
      className={movable ? 'pointer-events-auto cursor-pointer outline-none' : 'pointer-events-none'}
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
      data-progress={piece.progress}
      data-movable={movable || undefined}
    >
      {/* Hop: a small squash-and-lift each time the piece lands on a new square. */}
      <motion.g
        key={piece.progress}
        initial={reducedMotion ? false : { scale: 1.18, y: -0.12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 800, damping: 22 }}
      >
        {movable && (
          <circle
            r={r + 0.12}
            fill="none"
            stroke={selected ? 'var(--text)' : 'white'}
            strokeWidth={0.07}
            className={selected ? undefined : 'animate-pulse'}
          />
        )}
        <PieceShape color={piece.color} r={r} style={pieceStyle} theme={theme} colorBlind={colorBlind} />
        {/* A movable piece answers to a tap anywhere on its square, not just on the piece. */}
        {movable && <rect x={-0.55} y={-0.55} width={1.1} height={1.1} fill="transparent" />}
      </motion.g>
    </motion.g>
  );
});
