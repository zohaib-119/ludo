import type { Rng } from './types';

/** Deterministic PRNG (mulberry32). For tests, simulations and bot rollouts. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    die: () => 1 + Math.floor(next() * 6),
    int: (n) => Math.floor(next() * n),
  };
}

/**
 * Rng that returns scripted die values in order. Throws when it runs out so a
 * test never silently rolls an unexpected value. `int` always returns 0.
 */
export function scriptedRng(values: number[]): Rng & { remaining(): number } {
  const queue = [...values];
  return {
    die: () => {
      const v = queue.shift();
      if (v === undefined) throw new Error('scriptedRng: no more scripted dice');
      if (!Number.isInteger(v) || v < 1 || v > 6) throw new Error(`scriptedRng: bad die ${v}`);
      return v;
    },
    int: () => 0,
    remaining: () => queue.length,
  };
}

/** Rng from any uniform [0,1) source, e.g. a crypto-backed one on the server. */
export function rngFrom(random: () => number): Rng {
  return {
    die: () => 1 + Math.floor(random() * 6),
    int: (n) => Math.floor(random() * n),
  };
}
