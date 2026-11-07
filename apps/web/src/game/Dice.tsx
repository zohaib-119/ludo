/**
 * 3D CSS dice (docs/02-visual-design.md §5). Each roll tumbles forward a few
 * turns and lands on the server's value. Opposite faces sum to 7.
 */
import type { Color } from '@ludo/engine';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { useSettings } from '../lib/settings';
import { type DiceStyleId, diceLook } from '../lib/themes';
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

export function Die({
  id,
  value,
  rolling,
  color,
  size = 56,
  voided = false,
  reducedMotion = false,
  diceStyle,
}: {
  /** Unique per rolled die: a new id means a new roll. */
  id: number;
  value: number;
  rolling: boolean;
  color: Color | null;
  size?: number;
  voided?: boolean;
  reducedMotion?: boolean;
  /** Override the player's chosen dice style (used by previews). */
  diceStyle?: DiceStyleId;
}) {
  // A freshly rolled die tumbles a few turns and lands on its value.
  const [fx, fy] = FACE_ROTATION[value] ?? [0, 0];
  const target = { x: (2 + (id % 2)) * 360 + fx, y: (1 + (id % 3 === 0 ? 1 : 0)) * 360 + fy };
  const startedRolling = useRef(rolling);
  const half = size / 2;
  const chosen = useSettings((st) => st.diceStyle);
  const look = diceLook(diceStyle ?? chosen, color);
  const face = look.face;
  const pip = look.pip;
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
              boxShadow: `inset 0 -3px 0 ${look.edge}, inset 0 0 0 1px ${look.edge}`,
              backfaceVisibility: 'hidden',
            }}
          >
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="flex items-center justify-center">
                {PIPS[f.value]!.includes(i) && (
                  <span
                    className="block rounded-full"
                    style={{
                      width: size * 0.16,
                      height: size * 0.16,
                      background: pip,
                      boxShadow: look.glow ? `0 0 ${size * 0.12}px ${look.glow}` : undefined,
                    }}
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

/**
 * A die waiting to be rolled: same size and style as a real one, with a "?" face.
 * While `shaking`, it rattles as if in a cup (the roll is on its way).
 */
export function ReadyDie({
  color,
  size = 54,
  shaking = false,
  reducedMotion = false,
}: {
  color: Color | null;
  size?: number;
  shaking?: boolean;
  reducedMotion?: boolean;
}) {
  const chosen = useSettings((s) => s.diceStyle);
  const look = diceLook(chosen, color);
  return (
    <motion.span
      className="relative flex items-center justify-center rounded-[22%] font-display font-extrabold select-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: look.face,
        color: look.pip,
        boxShadow: `inset 0 -3px 0 ${look.edge}, inset 0 0 0 1px ${look.edge}, 0 3px 8px rgb(0 0 0 / 0.25)`,
        textShadow: look.glow ? `0 0 ${size * 0.12}px ${look.glow}` : undefined,
      }}
      animate={
        reducedMotion
          ? undefined
          : shaking
            ? { rotate: [0, -14, 12, -10, 8, 0], x: [0, -3, 3, -2, 2, 0] }
            : { y: [0, -4, 0], rotate: [0, -4, 0] }
      }
      transition={
        shaking
          ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
      }
      aria-hidden
      data-testid="ready-die"
    >
      ?
    </motion.span>
  );
}
