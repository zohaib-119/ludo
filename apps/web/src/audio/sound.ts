/**
 * Game sounds (docs/02-visual-design.md §7), synthesised with the Web Audio API:
 * no audio files to download or license, instant start, one volume control.
 * Every player hears every move, not just the player making it.
 */

export type SoundName =
  | 'shake'
  | 'land'
  | 'hop'
  | 'enter'
  | 'capture'
  | 'finish'
  | 'unlock'
  | 'reroll'
  | 'void'
  | 'turn'
  | 'tick'
  | 'win'
  | 'out'
  | 'pop'
  | 'message';

type Ctx = AudioContext;

class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume * 0.6;
  }

  /** Browsers only allow audio after a user gesture: call this on the first tap/key. */
  unlock(): void {
    const AC =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Play a sound now (or `delayMs` from now). `pitch` nudges tonal sounds (e.g. rising hops). */
  play(name: SoundName, opts: { delayMs?: number; pitch?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume === 0 || ctx.state !== 'running') return;
    const t = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    const p = opts.pitch ?? 1;
    switch (name) {
      case 'shake':
        for (let i = 0; i < 5; i++)
          this.knock(t + i * 0.055 + Math.random() * 0.02, 2400 + Math.random() * 1200, 0.035, 0.25);
        break;
      case 'land':
        this.knock(t, 1400, 0.06, 0.55);
        this.tone(t, 170, 0.09, 0.35, 'sine');
        this.knock(t + 0.07, 1900, 0.04, 0.3);
        break;
      case 'hop':
        this.tone(t, 520 * p, 0.05, 0.16, 'triangle', 640 * p);
        break;
      case 'enter':
        this.tone(t, 300, 0.11, 0.3, 'sine', 720);
        break;
      case 'capture':
        this.tone(t, 110, 0.22, 0.55, 'sine', 55);
        this.whoosh(t + 0.03, 0.28, 0.25);
        break;
      case 'finish':
        this.tone(t, 659.25, 0.18, 0.28, 'triangle');
        this.tone(t + 0.12, 987.77, 0.3, 0.28, 'triangle');
        break;
      case 'unlock':
        this.knock(t, 3200, 0.02, 0.4);
        this.knock(t + 0.06, 2600, 0.03, 0.35);
        break;
      case 'reroll':
        [1046.5, 1318.5, 1568].forEach((f, i) => this.tone(t + i * 0.06, f, 0.16, 0.16, 'sine'));
        break;
      case 'void':
        this.tone(t, 180, 0.16, 0.3, 'sine', 110);
        break;
      case 'turn':
        this.tone(t, 880, 0.35, 0.22, 'sine');
        this.tone(t + 0.09, 1318.5, 0.35, 0.14, 'sine');
        break;
      case 'tick':
        this.knock(t, 2800, 0.015, 0.3);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(t + i * 0.12, f, i === 3 ? 0.6 : 0.2, 0.25, 'triangle'),
        );
        break;
      case 'out':
        [392, 329.63, 261.63].forEach((f, i) => this.tone(t + i * 0.14, f, 0.25, 0.22, 'triangle'));
        break;
      case 'pop':
        this.tone(t, 660, 0.08, 0.18, 'sine', 990);
        break;
      case 'message':
        this.tone(t, 740, 0.12, 0.14, 'sine');
        this.tone(t + 0.07, 988, 0.14, 0.12, 'sine');
        break;
    }
  }

  private tone(t: number, freq: number, dur: number, gain: number, type: OscillatorType, endFreq?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short filtered noise burst: dice on wood, clicks. */
  private knock(t: number, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  /** A swept noise: a piece flying back to its yard. */
  private whoosh(t: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.Q.value = 1.2;
    hp.frequency.setValueAtTime(600, t);
    hp.frequency.exponentialRampToValueAtTime(3200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const sound = new SoundEngine();

/** Unlock audio on the first user gesture anywhere on the page. */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/** Short vibration on phones that support it (respects the haptics setting at the call site). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
