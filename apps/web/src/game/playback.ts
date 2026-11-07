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
import { ANIMATION_TIMING, type AnimationTiming, type EventsMessage, type GameView, type RoomEvent } from '@ludo/protocol';
import { createStore } from 'zustand/vanilla';
import { t } from '../i18n/messages';
import { type LogLine, describe, ordinal } from './log';

export interface TrayDie {
  id: number;
  value: number;
  /** Tumbling right now (just rolled). */
  rolling: boolean;
  /** About to be discarded because the roll was void. */
  void: boolean;
}

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
  /**
   * The dice tray: rolled dice not yet played, in roll order. A die leaves the
   * tray when the move that uses it starts, so everyone sees which die paid for
   * which move, bots included.
   */
  tray: TrayDie[];
  /** Whose dice are on the tray (for colour). */
  traySeat: Color | null;
  banner: Banner | null;
  /** Piece currently flying home after a capture (for its animation). */
  captured: string[];
  busy: boolean;
  log: LogLine[];
}

export type Timing = AnimationTiming;

/** Normal timing is shared with the server, which paces bots to it. */
export const NORMAL_TIMING: Timing = ANIMATION_TIMING;
export const REDUCED_TIMING: Timing = {
  roll: 120,
  useDie: 0,
  void: 500,
  hop: 0,
  enter: 0,
  capture: 120,
  banner: 700,
  playerFinished: 1000,
  turn: 0,
};

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
    tray: [],
    traySeat: null,
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
  /** Dice in the most recent roll (1 or 2), for the right re-roll banner. */
  private lastRollCount = 2;
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
      tray: game.turn.bank.map((value) => ({ id: this.nextId++, value, rolling: false, void: false })),
      traySeat: game.turn.seat,
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
      case 'TurnStarted':
        this.store.setState({ tray: [], traySeat: e.seat });
        await this.wait(T.turn, gen);
        return;
      case 'Rolled': {
        this.lastRollCount = e.values.length;
        const fresh = e.values.map((value) => ({ id: this.nextId++, value, rolling: true, void: false }));
        this.store.setState((s) => ({ tray: [...s.tray, ...fresh], traySeat: e.seat, banner: null }));
        await this.wait(T.roll, gen);
        this.store.setState((s) => ({ tray: s.tray.map((d) => (d.rolling ? { ...d, rolling: false } : d)) }));
        return;
      }
      case 'RerollGranted': {
        this.showBanner(t(this.lastRollCount === 1 ? 'game.banner.six' : 'game.banner.doubleSix'), 'good');
        await this.wait(T.banner * 0.6, gen);
        return;
      }
      case 'RollVoided': {
        // No message: the dice dim for a moment, then leave the tray.
        // A void bonus chain is always the most recently rolled dice.
        const count = e.scope === 'turn' ? this.store.getState().tray.length : e.values.length;
        const tray = this.store.getState().tray;
        const doomed = new Set(tray.slice(tray.length - count).map((d) => d.id));
        this.store.setState({ tray: tray.map((d) => (doomed.has(d.id) ? { ...d, void: true } : d)) });
        await this.wait(T.void, gen);
        this.store.setState((s) => ({ tray: s.tray.filter((d) => !doomed.has(d.id)) }));
        return;
      }
      case 'Moved': {
        // The die this move uses leaves the tray first, then the piece moves.
        this.store.setState((s) => {
          const i = s.tray.findIndex((d) => d.value === e.value && !d.void);
          return i < 0 ? {} : { tray: [...s.tray.slice(0, i), ...s.tray.slice(i + 1)] };
        });
        await this.wait(T.useDie, gen);
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
      case 'PlayerEliminated': {
        // Their pieces leave the board, like a capture.
        const gone = Object.keys(this.store.getState().progress).filter((id) => id.startsWith(`${e.color}-`));
        this.store.setState((s) => ({
          captured: gone,
          progress: { ...s.progress, ...Object.fromEntries(gone.map((id) => [id, -1])) },
        }));
        this.showBanner(t('game.banner.eliminated', { name: name(e.color) }), 'bad');
        await this.wait(T.playerFinished, gen);
        return;
      }
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
