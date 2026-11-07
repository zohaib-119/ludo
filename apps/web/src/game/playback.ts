/**
 * Event playback (docs/02-visual-design.md §6 "Animation queue").
 *
 * The board shows the *displayed* state, which follows the server's events
 * one by one with timing. When playback is idle and caught up, displayed
 * state equals the synced state. If events pile up the queue speeds up, and
 * past a limit (or after a reconnect, or a missed event) it snaps straight to
 * the synced state, so the display is never far behind reality.
 */
import { type Color, pathBetween } from '@ludo/engine';
import type { EventsMessage, GameView, RoomEvent } from '@ludo/protocol';
import { createStore } from 'zustand/vanilla';
import { t } from '../i18n/messages';
import { type LogLine, describe, ordinal } from './log';

export type BannerTone = 'good' | 'bad' | 'info';
export interface Banner {
  id: number;
  text: string;
  tone: BannerTone;
}

export interface PlaybackState {
  /** Game version the display reflects. -1 before the first snap. */
  version: number;
  progress: Record<string, number>;
  /** Dice on the table: the latest roll. */
  dice: { values: number[]; rolling: boolean; void: boolean; seat: Color | null; rollId: number };
  banner: Banner | null;
  /** Piece currently flying home after a capture (for its animation). */
  captured: string[];
  busy: boolean;
  log: LogLine[];
}

export interface Timing {
  roll: number;
  hop: number;
  enter: number;
  capture: number;
  banner: number;
  playerFinished: number;
  turn: number;
}

export const NORMAL_TIMING: Timing = { roll: 700, hop: 110, enter: 300, capture: 480, banner: 900, playerFinished: 1400, turn: 150 };
export const REDUCED_TIMING: Timing = { roll: 120, hop: 0, enter: 0, capture: 120, banner: 700, playerFinished: 1000, turn: 0 };

/** Queue length at which animations run at double speed, and at which we give up and snap. */
const FAST_AT = 3;
const SNAP_AT = 8;
const LOG_LIMIT = 150;

export interface PlaybackOptions {
  timing?: Timing;
  /** Names for log lines and banners. */
  nameOf: (c: Color) => string;
  /** Hooks for sounds and haptics (M6). */
  onEvent?: (e: RoomEvent) => void;
  sleep?: (ms: number) => Promise<void>;
}

export class Playback {
  readonly store = createStore<PlaybackState>(() => ({
    version: -1,
    progress: {},
    dice: { values: [], rolling: false, void: false, seat: null, rollId: 0 },
    banner: null,
    captured: [],
    busy: false,
    log: [],
  }));
  private queue: EventsMessage[] = [];
  private running = false;
  private generation = 0;
  private nextId = 1;
  private latest: GameView | null = null;
  private opts: Required<Omit<PlaybackOptions, 'onEvent'>> & Pick<PlaybackOptions, 'onEvent'>;

  constructor(options: PlaybackOptions) {
    this.opts = {
      timing: NORMAL_TIMING,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...options,
    };
  }

  setTiming(timing: Timing): void {
    this.opts.timing = timing;
  }

  setNames(nameOf: (c: Color) => string): void {
    this.opts.nameOf = nameOf;
  }

  /** The newest synced game view. */
  sync(game: GameView | null): void {
    this.latest = game;
    if (!game) return;
    const shown = this.store.getState().version;
    // First view, or a new game (rematch): nothing to animate, show it.
    if (shown === -1 || game.version < shown) {
      this.snap();
      return;
    }
    // Events are playing; run() reconciles when the queue empties.
    if (this.running || this.queue.length > 0) return;
    this.catchUpLater();
  }

  /**
   * If the synced state is ahead with nothing queued: the events message is
   * normally right behind the state patch, so wait a moment, then snap if it never came.
   */
  private catchUpLater(): void {
    const target = this.latest?.version;
    if (target === undefined || target <= this.store.getState().version) return;
    setTimeout(() => {
      if (!this.running && this.queue.length === 0 && this.store.getState().version < target) this.snap();
    }, 500);
  }

  /** Jump straight to the synced state (reconnects, falling far behind). */
  snap(): void {
    this.generation += 1;
    this.queue = [];
    this.running = false;
    const game = this.latest;
    if (!game) return;
    this.store.setState({
      version: game.version,
      progress: Object.fromEntries(game.pieces.map((p) => [p.id, p.progress])),
      dice: { ...this.store.getState().dice, values: game.turn.lastRoll, rolling: false, void: false },
      banner: null,
      captured: [],
      busy: false,
    });
  }

  /** Queue an events message from the server. */
  push(message: EventsMessage): void {
    const s = this.store.getState();
    if (message.version <= s.version) return; // already shown (e.g. after a snap)
    this.queue.push(message);
    if (this.queue.length > SNAP_AT) {
      // Too far behind: keep the log, skip the animations.
      for (const m of this.queue) for (const e of m.events) this.appendLog(e);
      this.snap();
      return;
    }
    if (!this.running) void this.run();
  }

  showBanner(text: string, tone: BannerTone): void {
    this.store.setState({ banner: { id: this.nextId++, text, tone } });
  }

  dispose(): void {
    this.generation += 1;
    this.queue = [];
  }

  // -------------------------------------------------------------------------

  private async run(): Promise<void> {
    const gen = this.generation;
    this.running = true;
    this.store.setState({ busy: true });
    while (this.queue.length > 0 && gen === this.generation) {
      const message = this.queue.shift()!;
      for (const e of message.events) {
        if (gen !== this.generation) return;
        this.appendLog(e);
        this.opts.onEvent?.(e);
        await this.play(e, gen);
      }
      if (gen !== this.generation) return;
      this.store.setState({ version: message.version });
    }
    if (gen !== this.generation) return;
    this.running = false;
    this.store.setState({ busy: false, captured: [] });
    // Settle anything that changed without events (never backwards: the patch may still be in flight).
    this.catchUpLater();
  }

  private speed(): number {
    return this.queue.length >= FAST_AT ? 0.5 : 1;
  }

  private wait(ms: number, gen: number): Promise<void> {
    if (gen !== this.generation || ms <= 0) return Promise.resolve();
    return this.opts.sleep(ms * this.speed());
  }

  private setProgress(id: string, p: number): void {
    this.store.setState((s) => ({ progress: { ...s.progress, [id]: p } }));
  }

  private async play(e: RoomEvent, gen: number): Promise<void> {
    const T = this.opts.timing;
    const name = (c: Color) => this.opts.nameOf(c);
    switch (e.type) {
      case 'Rolled': {
        const dice = this.store.getState().dice;
        this.store.setState({ dice: { values: e.values, rolling: true, void: false, seat: e.seat, rollId: dice.rollId + 1 }, banner: null });
        await this.wait(T.roll, gen);
        this.store.setState((s) => ({ dice: { ...s.dice, rolling: false } }));
        return;
      }
      case 'RerollGranted': {
        const single = this.store.getState().dice.values.length === 1;
        this.showBanner(t(single ? 'game.banner.six' : 'game.banner.doubleSix'), 'good');
        await this.wait(T.banner * 0.6, gen);
        return;
      }
      case 'RollVoided':
        this.store.setState((s) => ({ dice: { ...s.dice, void: true } }));
        this.showBanner(t(e.scope === 'bonus' ? 'game.banner.bonusVoid' : 'game.banner.void'), 'bad');
        await this.wait(T.banner, gen);
        return;
      case 'Moved': {
        if (e.from === -1) {
          this.setProgress(e.pieceId, 0);
          await this.wait(T.enter, gen);
          return;
        }
        for (const p of pathBetween(e.from, e.to)) {
          if (gen !== this.generation) return;
          this.setProgress(e.pieceId, p);
          await this.wait(T.hop, gen);
        }
        return;
      }
      case 'Captured':
        this.store.setState((s) => ({
          captured: e.victims,
          progress: { ...s.progress, ...Object.fromEntries(e.victims.map((v) => [v, -1])) },
        }));
        await this.wait(T.capture, gen);
        return;
      case 'BonusGranted':
        this.showBanner(t(e.reason === 'capture' ? 'game.banner.captureBonus' : 'game.banner.finishBonus'), 'good');
        await this.wait(T.banner * 0.6, gen);
        return;
      case 'PlayerFinished':
        this.showBanner(t('game.banner.finished', { name: name(e.color), rank: ordinal(e.rank) }), 'good');
        await this.wait(T.playerFinished, gen);
        return;
      case 'TurnStarted':
        await this.wait(T.turn, gen);
        return;
      default:
        return;
    }
  }

  private appendLog(e: RoomEvent): void {
    const line = describe(e, this.opts.nameOf);
    if (!line) return;
    this.store.setState((s) => ({ log: [{ id: this.nextId++, ...line }, ...s.log].slice(0, LOG_LIMIT) }));
  }
}
