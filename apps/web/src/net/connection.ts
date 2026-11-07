/**
 * Connection manager (docs/03-architecture.md §4.3, docs/01-product-and-ux.md §5).
 *
 * Layer 1: the Colyseus SDK reconnects by itself after network-style drops.
 * Layer 2: if that fails (or the page was reloaded) we rejoin with the player
 *          token, which reclaims the same seat, retrying with backoff forever
 *          until the room is known to be gone.
 * Layer 3: rooms live in server memory, so a server restart loses them. If the
 *          room vanished during a short outage, we bring it back under the same
 *          code (the old host first), retake our seat, and the new host restores
 *          the rules and bots. Everyone is told; a game in progress is lost.
 * Waking:  connecting while the server is asleep or restarting keeps retrying
 *          for a while (with `waking` set for the UI) instead of failing at once.
 * The UI reads one status from the store and never queues clicks while offline.
 */
import { Client, type Room } from '@colyseus/sdk';
import { TURN_ORDER } from '@ludo/engine';
import { createStore } from 'zustand/vanilla';
import {
  type ChatMessage,
  type Command,
  type CommandResult,
  type ErrorCode,
  type EventsMessage,
  type JoinOptions,
  type KickReason,
  type NoticeMessage,
  ROOM_NAME,
  type ReactMessage,
  ROOM_EXISTS,
  type RoomView,
  type WelcomeMessage,
} from '@ludo/protocol';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'kicked';
export type FailReason =
  | 'ROOM_NOT_FOUND'
  | 'GAME_IN_PROGRESS'
  | 'ROOM_FULL'
  | 'NAME_INVALID'
  | 'ROOM_CLOSED'
  | 'NETWORK';

export interface ConnectionState {
  status: ConnStatus;
  code: string | null;
  memberId: string | null;
  view: RoomView | null;
  revision: number;
  failure: FailReason | null;
  kicked: KickReason | null;
  /** When the current outage started (ms), for "still trying" messaging. */
  reconnectingSince: number | null;
  /** serverTime − Date.now(), estimated from view updates. */
  clockOffset: number;
  /** Connecting keeps failing to reach the server: it is probably asleep or restarting. */
  waking: boolean;
  /** When the next rejoin attempt is due (ms), for "next try in 4 s". */
  nextRetryAt: number | null;
  /** The room was lost in a server restart and is being brought back. */
  restoring: boolean;
}

/** After a server restart: the room is back under the same code. */
export interface RestoredInfo {
  gameLost: boolean;
  reopenedByMe: boolean;
}

export type ClientResult = CommandResult | { ok: false; code: 'OFFLINE'; message: string };

type Listener<T> = (payload: T) => void;
interface Channels {
  events: EventsMessage;
  chat: ChatMessage;
  react: ReactMessage;
  notice: NoticeMessage;
  backOnline: null;
  restored: RestoredInfo;
}

const INITIAL: ConnectionState = {
  status: 'idle',
  code: null,
  memberId: null,
  view: null,
  revision: -1,
  failure: null,
  kicked: null,
  reconnectingSince: null,
  clockOffset: 0,
  waking: false,
  nextRetryAt: null,
  restoring: false,
};

const KNOWN_JOIN_ERRORS: FailReason[] = ['ROOM_NOT_FOUND', 'GAME_IN_PROGRESS', 'ROOM_FULL', 'NAME_INVALID'];

/** Map an SDK join error to a reason. Unknown room IDs surface as matchmaking errors. */
export function joinFailure(error: unknown): FailReason {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const known = KNOWN_JOIN_ERRORS.find((code) => message.includes(code));
  if (known) return known;
  if (/not found|no rooms|invalid room|roomId/i.test(message)) return 'ROOM_NOT_FOUND';
  return 'NETWORK';
}

export interface ConnectionOptions {
  endpoint: string;
  /** Backoff for token rejoin attempts (layer 2), in ms. */
  rejoinDelays?: number[];
  /** How long to keep trying to reach a sleeping/restarting server when connecting, in ms. */
  wakeTimeoutMs?: number;
  /** A room lost within this long after the drop is reopened (a restart); later, it has closed. */
  restoreWindowMs?: number;
  /** Non-hosts wait this long before reopening, so the old host gets to reopen (and stay host). */
  reopenGraceMs?: number;
  now?: () => number;
}

export class Connection {
  readonly store = createStore<ConnectionState>(() => ({ ...INITIAL }));
  private client: Client;
  private room: Room | null = null;
  private joinOptions: JoinOptions | null = null;
  private intentionalLeave = false;
  private kickReason: KickReason | null = null;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private rejoinAttempt = 0;
  private rejoining = false;
  private listeners: { [K in keyof Channels]: Set<Listener<Channels[K]>> } = {
    events: new Set(),
    chat: new Set(),
    react: new Set(),
    notice: new Set(),
    backOnline: new Set(),
    restored: new Set(),
  };
  /** Bumped by every connect/leave so an outdated attempt stops quietly. */
  private connectSeq = 0;
  private readonly wakeTimeoutMs: number;
  private readonly restoreWindowMs: number;
  private readonly reopenGraceMs: number;
  private readonly rejoinDelays: number[];
  private readonly now: () => number;
  private detachWindow: (() => void) | null = null;

  constructor(options: ConnectionOptions) {
    this.client = new Client(options.endpoint);
    this.rejoinDelays = options.rejoinDelays ?? [500, 1000, 2000, 4000, 8000, 10000];
    this.wakeTimeoutMs = options.wakeTimeoutMs ?? 75_000;
    this.restoreWindowMs = options.restoreWindowMs ?? 5 * 60_000;
    this.reopenGraceMs = options.reopenGraceMs ?? 2500;
    this.now = options.now ?? Date.now;
    this.attachWindowListeners();
  }

  get state(): ConnectionState {
    return this.store.getState();
  }

  on<K extends keyof Channels>(channel: K, listener: Listener<Channels[K]>): () => void {
    this.listeners[channel].add(listener);
    return () => this.listeners[channel].delete(listener);
  }

  /** Create a new room (code = null) or join one by code. */
  async connect(code: string | null, options: JoinOptions): Promise<void> {
    this.cancelRejoin();
    await this.disposeRoom();
    this.joinOptions = options;
    this.intentionalLeave = false;
    this.kickReason = null;
    const seq = ++this.connectSeq;
    this.store.setState({ ...INITIAL, status: 'connecting', code });
    const started = this.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const room = code ? await this.client.joinById(code, options) : await this.client.create(ROOM_NAME, options);
        if (seq !== this.connectSeq) {
          await room.leave().catch(() => {});
          return;
        }
        this.attach(room);
        return;
      } catch (error) {
        if (seq !== this.connectSeq) return;
        const failure = joinFailure(error);
        // Can't reach the server: it may be asleep or restarting. Keep trying for a while.
        if (failure !== 'NETWORK' || this.now() - started >= this.wakeTimeoutMs) {
          this.store.setState({ status: 'failed', failure, waking: false });
          return;
        }
        this.store.setState({ waking: true });
        await this.wait(this.delayFor(attempt));
        if (seq !== this.connectSeq) return;
      }
    }
  }

  /** Send a command. Refused immediately while not connected (no queued clicks). */
  async send(command: Command): Promise<ClientResult> {
    const room = this.room;
    if (!room || this.state.status !== 'connected') {
      return { ok: false, code: 'OFFLINE', message: 'Not connected' };
    }
    try {
      return (await room.request('cmd', command)) as CommandResult;
    } catch {
      return { ok: false, code: 'OFFLINE', message: 'Connection lost' };
    }
  }

  /** Leave on purpose: tell the server, close, forget the room. */
  async leave(): Promise<void> {
    this.intentionalLeave = true;
    this.connectSeq++;
    this.cancelRejoin();
    if (this.room && this.state.status === 'connected') await this.send({ type: 'leaveRoom' });
    await this.disposeRoom();
    this.store.setState({ ...INITIAL });
  }

  /** Retry a layer-2 rejoin immediately (button, tab visible again, network back). */
  retryNow(): void {
    if (this.state.status !== 'reconnecting' || !this.rejoining) return;
    this.cancelRejoin();
    void this.rejoin();
  }

  /** After "open in another tab": take the seat back here. */
  async useHere(): Promise<void> {
    const { code } = this.state;
    if (code && this.joinOptions) await this.connect(code, this.joinOptions);
  }

  /** Stop everything (tests, page teardown). */
  async destroy(): Promise<void> {
    this.intentionalLeave = true;
    this.connectSeq++;
    this.cancelRejoin();
    this.detachWindow?.();
    await this.disposeRoom();
  }

  // -------------------------------------------------------------------------

  private attach(room: Room): void {
    this.room = room;
    room.reconnection.minUptime = 1000;
    room.reconnection.maxRetries = 20;
    room.reconnection.maxDelay = 4000;
    this.rejoinAttempt = 0;
    this.rejoining = false;
    this.store.setState({
      status: 'connected',
      code: room.roomId,
      failure: null,
      kicked: null,
      reconnectingSince: null,
      waking: false,
      nextRetryAt: null,
      restoring: false,
    });

    room.onStateChange((state: { revision?: number; view?: string }) => this.readState(state));
    room.onMessage('welcome', (m: WelcomeMessage) => this.store.setState({ memberId: m.memberId }));
    room.onMessage('kicked', (m: { reason: KickReason }) => {
      this.kickReason = m.reason;
    });
    for (const channel of ['events', 'chat', 'react', 'notice'] as const) {
      room.onMessage(channel, (payload: never) => this.emit(channel, payload));
    }
    room.onDrop(() => {
      if (room !== this.room) return;
      this.store.setState({ status: 'reconnecting', reconnectingSince: this.now() });
    });
    room.onReconnect(() => {
      if (room !== this.room) return;
      this.store.setState({ status: 'connected', reconnectingSince: null });
      this.emit('backOnline', null);
    });
    room.onLeave(() => {
      if (room !== this.room) return;
      this.room = null;
      this.handleLeave();
    });
  }

  private readState(state: { revision?: number; view?: string }): void {
    if (typeof state.revision !== 'number' || !state.view) return;
    if (state.revision === this.state.revision) return;
    try {
      const view = JSON.parse(state.view) as RoomView;
      this.store.setState({
        view,
        revision: state.revision,
        clockOffset: view.serverTime - this.now(),
      });
    } catch {
      /* ignore a malformed view; the next patch replaces it */
    }
  }

  private handleLeave(): void {
    if (this.intentionalLeave) return;
    if (this.kickReason) {
      this.store.setState({ status: 'kicked', kicked: this.kickReason });
      return;
    }
    // Layer 1 gave up (or the socket closed for good): rejoin with the token.
    this.store.setState({ status: 'reconnecting', reconnectingSince: this.state.reconnectingSince ?? this.now() });
    this.rejoining = true;
    this.rejoinAttempt = 0;
    void this.rejoin();
  }

  private async rejoin(): Promise<void> {
    const { code } = this.state;
    if (!code || !this.joinOptions || this.intentionalLeave) return;
    try {
      const room = await this.client.joinById(code, this.joinOptions);
      if (this.intentionalLeave) {
        await room.leave();
        return;
      }
      this.attach(room);
      this.emit('backOnline', null);
    } catch (error) {
      const reason = joinFailure(error);
      const since = this.state.reconnectingSince;
      const snapshot = this.state.view;
      // Gone during a short outage: the server restarted. Bring the room back.
      if (reason === 'ROOM_NOT_FOUND' && snapshot && since !== null && this.now() - since < this.restoreWindowMs) {
        void this.restore(snapshot, this.state.memberId);
        return;
      }
      if (reason === 'ROOM_NOT_FOUND' || reason === 'GAME_IN_PROGRESS') {
        this.rejoining = false;
        this.store.setState({
          status: 'failed',
          failure: reason === 'ROOM_NOT_FOUND' ? 'ROOM_CLOSED' : reason,
          nextRetryAt: null,
        });
        return;
      }
      this.scheduleRejoin();
    }
  }

  private scheduleRejoin(): void {
    const delay = this.delayFor(this.rejoinAttempt);
    this.rejoinAttempt += 1;
    this.store.setState({ nextRetryAt: this.now() + delay });
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      void this.rejoin();
    }, delay);
  }

  /**
   * Layer 3: the room was lost in a server restart. Join it if someone already
   * reopened it, otherwise reopen it under the same code; then put things back.
   */
  private async restore(snapshot: RoomView, oldMemberId: string | null): Promise<void> {
    const code = this.state.code;
    const options = this.joinOptions;
    if (!code || !options) return;
    this.store.setState({ restoring: true, nextRetryAt: null });
    const wasHost = snapshot.hostId === oldMemberId;
    if (!wasHost) await this.wait(this.reopenGraceMs + Math.random() * 500);
    if (this.intentionalLeave) return;

    let room: Room | null = null;
    let reopenedByMe = false;
    try {
      room = await this.client.joinById(code, options);
    } catch (error) {
      if (joinFailure(error) === 'ROOM_NOT_FOUND') {
        try {
          room = await this.client.create(ROOM_NAME, { ...options, reopen: code });
          reopenedByMe = true;
        } catch (createError) {
          // Someone else reopened it a moment earlier: join theirs.
          if (String((createError as Error)?.message ?? createError).includes(ROOM_EXISTS)) {
            room = await this.client.joinById(code, options).catch(() => null);
          }
        }
      }
    }
    if (this.intentionalLeave) {
      await room?.leave().catch(() => {});
      return;
    }
    if (!room) {
      // Still can't get in (server flapping): keep going with the normal backoff.
      this.store.setState({ restoring: false });
      this.scheduleRejoin();
      return;
    }
    this.attach(room);
    this.rejoining = false;

    // Put back what we can: my seat; and, if I reopened it, the rules and the bots.
    const mySeat = snapshot.members.find((m) => m.id === oldMemberId)?.seat ?? null;
    if (reopenedByMe) {
      await this.send({ type: 'updateSettings', settings: snapshot.settings });
      for (const color of TURN_ORDER) if (snapshot.seats[color]?.isBot) await this.send({ type: 'addBot', color });
    }
    if (mySeat) await this.send({ type: 'takeSeat', color: mySeat });
    this.emit('restored', { gameLost: snapshot.phase !== 'lobby', reopenedByMe });
  }

  private delayFor(attempt: number): number {
    return this.rejoinDelays[Math.min(attempt, this.rejoinDelays.length - 1)]!;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private cancelRejoin(): void {
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
  }

  private async disposeRoom(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (!room) return;
    room.reconnection.enabled = false;
    try {
      await room.leave();
    } catch {
      /* already closed */
    }
  }

  private emit<K extends keyof Channels>(channel: K, payload: Channels[K]): void {
    for (const l of this.listeners[channel]) {
      try {
        l(payload);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private attachWindowListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const wake = () => this.retryNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisible);
    this.detachWindow = () => {
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }
}

export type { ErrorCode };
