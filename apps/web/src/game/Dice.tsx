/**
 * 3D CSS dice (docs/02-visual-design.md §5). Each roll tumbles forward a few
 * turns and lands on the server's value. Opposite faces sum to 7.
 */
import type { Color } from '@ludo/engine';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { cx } from '../ui/kit';

/** Rotation that brings each value's face to the front. */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};
/** Which value sits on each face, and that face's own transform. */
const FACES: Array<{ value: number; transform: string }> = [
  { value: 1, transform: 'rotateY(0deg)' },
  { value: 2, transform: 'rotateY(90deg)' },
  { value: 3, transform: 'rotateX(90deg)' },
  { value: 4, transform: 'rotateX(-90deg)' },
  { value: 5, transform: 'rotateY(-90deg)' },
  { value: 6, transform: 'rotateY(180deg)' },
];
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Dice are physical objects: the same bright palette in light and dark themes.
const FACE_TINT: Record<Color, string> = { red: '#ffd8d8', green: '#c9f5d1', yellow: '#fff1b3', blue: '#c4e3ff' };
const PIP_COLOR: Record<Color, string> = { red: '#a61e1e', green: '#1b5e2e', yellow: '#8a6700', blue: '#105a9c' };

export function Die({
  id,
  value,
  rolling,
  color,
  size = 56,
  voided = false,
  reducedMotion = false,
}: {
  /** Unique per rolled die: a new id means a new roll. */
  id: number;
  value: number;
  rolling: boolean;
  color: Color | null;
  size?: number;
  voided?: boolean;
  reducedMotion?: boolean;
}) {
  // A freshly rolled die tumbles a few turns and lands on its value.
  const [fx, fy] = FACE_ROTATION[value] ?? [0, 0];
  const target = { x: (2 + (id % 2)) * 360 + fx, y: (1 + (id % 3 === 0 ? 1 : 0)) * 360 + fy };
  const startedRolling = useRef(rolling);
  const half = size / 2;
  const face = color ? FACE_TINT[color] : '#fbf8f2';
  const pip = color ? PIP_COLOR[color] : '#1d1b18';
  return (
    <div
      className={cx('relative transition-[filter,opacity] duration-300', voided && 'opacity-40 grayscale')}
      style={{ width: size, height: size, perspective: size * 6 }}
      role="img"
      aria-label={rolling ? 'Rolling' : `Die showing ${value}`}
      data-testid="die"
      data-value={rolling ? undefined : value}
    >
      <motion.div
        className="relative size-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={startedRolling.current && !reducedMotion ? { rotateX: 0, rotateY: 0 } : false}
        animate={{ rotateX: target.x, rotateY: target.y }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.7, ease: [0.2, 0.8, 0.25, 1] }}
      >
        {FACES.map((f) => (
          <div
            key={f.value}
            className="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-[22%] p-[14%]"
            style={{
              transform: `${f.transform} translateZ(${half}px)`,
              background: face,
              boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / 0.12), inset 0 0 0 1px rgb(0 0 0 / 0.08)',
              backfaceVisibility: 'hidden',
            }}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="flex items-center justify-center">
                {PIPS[f.value]!.includes(i) && (
                  <span
                    className="block rounded-full"
                    style={{ width: size * 0.16, height: size * 0.16, background: pip }}
                  />
                )}
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
