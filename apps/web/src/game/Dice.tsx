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
  value,
  rollId,
  rolling,
  color,
  size = 56,
  voided = false,
  reducedMotion = false,
  index = 0,
}: {
  value: number;
  rollId: number;
  rolling: boolean;
  color: Color | null;
  size?: number;
  voided?: boolean;
  reducedMotion?: boolean;
  index?: number;
}) {
  // Accumulate spins so every roll tumbles forward instead of snapping back.
  const spin = useRef({ rollId: -1, x: 0, y: 0 });
  if (spin.current.rollId !== rollId) {
    const [fx, fy] = FACE_ROTATION[value] ?? [0, 0];
    const turnsX = 2 + ((rollId + index) % 2);
    const turnsY = 1 + ((rollId + index * 2) % 2);
    const baseX = Math.ceil(spin.current.x / 360) * 360 + turnsX * 360;
    const baseY = Math.ceil(spin.current.y / 360) * 360 + turnsY * 360;
    spin.current = { rollId, x: baseX + fx, y: baseY + fy };
  }
  const half = size / 2;
  const face = color ? FACE_TINT[color] : '#fbf8f2';
  const pip = color ? PIP_COLOR[color] : '#1d1b18';
  return (
    <div
      className={cx('relative transition-[filter,opacity] duration-300', voided && 'opacity-50 grayscale')}
      style={{ width: size, height: size, perspective: size * 6 }}
      role="img"
      aria-label={rolling ? 'Rolling' : `Die showing ${value}`}
      data-testid="die"
      data-value={rolling ? undefined : value}
    >
      <motion.div
        className="relative size-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateX: spin.current.x, rotateY: spin.current.y }}
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
                {PIPS[f.value]!.includes(i) && <span className="block rounded-full" style={{ width: size * 0.16, height: size * 0.16, background: pip }} />}
              </span>
            ))}
          </div>
        ))}
      </motion.div>
      {voided && <span className="absolute left-[-10%] top-1/2 h-[3px] w-[120%] -rotate-12 rounded-full bg-danger" aria-hidden />}
    </div>
  );
}
