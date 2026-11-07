/**
 * Colyseus adapter around RoomController. Maps connections (sessions) to
 * members, syncs the public view, forwards messages and handles reconnection.
 * See docs/03-architecture.md §4.3.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { schema, t } from '@colyseus/schema';
import { type Client, CloseCode, type Deferred, Room, ServerError } from '@colyseus/core';
import type { Rng } from '@ludo/engine';
import {
  JOIN_REFUSED_CLOSE_CODE,
  LIMITS,
  type KickReason,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@ludo/protocol';
import { RoomController } from './controller';

/** Synced state: a revision number and the JSON public view (docs/05-protocol.md §2). */
export const LudoState = schema(
  {
    revision: t.number().default(0),
    view: t.string().default(''),
  },
  'LudoState',
);
export type LudoStateType = InstanceType<typeof LudoState>;

/** Seconds a dropped connection keeps its transport-level reconnection slot (layer 1). */
export const RECONNECT_WINDOW_SECONDS = 120;

export const cryptoRng: Rng = {
  die: () => randomInt(1, 7),
  int: (n) => randomInt(0, n),
};

const activeCodes = new Set<string>();

/** Server-side only (environment), never from clients: speeds bots up for end-to-end tests. */
const BOT_PACE = (() => {
  const v = Number(process.env.LUDO_BOT_PACE);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
})();

export function generateRoomCode(isTaken: (code: string) => boolean = (c) => activeCodes.has(c)): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a free room code');
}

interface Session {
  memberId: string;
  client: Client;
  /** Pending transport reconnection while the connection is dropped. */
  pending?: Deferred<Client>;
}

export class LudoRoom extends Room<{ state: LudoStateType }> {
  override maxClients = LIMITS.maxMembers;
  override autoDispose = false;
  // Hard abuse cap; the controller applies the softer per-command limit.
  override maxMessagesPerSecond = LIMITS.commandsPerSecond * 3;
  override state = new LudoState();

  controller!: RoomController;
  private sessions = new Map<string, Session>();
  /** Precise wake-up for bot pacing, decision timers and takeovers. */
  private wakeTimer: { clear(): void } | null = null;
  private wakeAt: number | null = null;

  // Create options come from the client, so nothing in them is trusted here.
  override onCreate() {
    const code = generateRoomCode();
    activeCodes.add(code);
    this.roomId = code;
    this.controller = new RoomController(code, {
      rng: cryptoRng,
      now: () => Date.now(),
      newId: () => randomUUID().slice(0, 8),
      botPace: BOT_PACE,
    });

    this.onMessage('cmd', (client, payload) => {
      const session = this.sessions.get(client.sessionId);
      if (!session) return { ok: false, code: 'BAD_PAYLOAD', message: 'Not joined' };
      const result = this.controller.command(session.memberId, payload);
      const leaving = result.ok && (payload as { type?: string } | null)?.type === 'leaveRoom';
      if (leaving) this.sessions.delete(client.sessionId);
      this.flush();
      if (leaving) this.clock.setTimeout(() => client.leave(CloseCode.CONSENTED), 50);
      return result;
    });

    this.clock.setInterval(() => {
      this.controller.tick();
      this.flush();
      if (this.controller.shouldDispose()) void this.disconnect();
    }, 1000);

    this.flush();
  }

  override onJoin(client: Client, options: unknown) {
    const result = this.controller.join(options);
    if (!result.ok) throw new ServerError(JOIN_REFUSED_CLOSE_CODE, result.code);
    // One live session per member: drop any older tab or pending reconnection.
    for (const [sessionId, s] of this.sessions) {
      if (s.memberId !== result.memberId) continue;
      this.sessions.delete(sessionId);
      if (s.pending) {
        s.pending.reject(new Error('Replaced by a newer connection'));
      } else {
        this.sendKick(s.client, 'otherTab');
      }
    }
    this.sessions.set(client.sessionId, { memberId: result.memberId, client });
    client.send('welcome', { memberId: result.memberId });
    this.flush();
  }

  override async onDrop(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    this.controller.setConnected(session.memberId, false);
    this.flush();
    session.pending = this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
    try {
      await session.pending;
    } catch {
      // Window expired or replaced: onLeave follows. The seat stays (layer 2 rejoin).
    }
  }

  override onReconnect(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    session.pending = undefined;
    session.client = client;
    client.send('welcome', { memberId: session.memberId });
    this.controller.setConnected(session.memberId, true);
    this.flush();
  }

  override onLeave(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    this.sessions.delete(client.sessionId);
    const stillConnected = [...this.sessions.values()].some((s) => s.memberId === session.memberId && !s.pending);
    if (!stillConnected) this.controller.setConnected(session.memberId, false);
    this.flush();
  }

  override onDispose() {
    activeCodes.delete(this.roomId);
  }

  /** Push view changes into the synced state, send queued messages, and re-arm the wake-up. */
  private flush(): void {
    this.syncAndSend();
    this.scheduleWake();
  }

  private scheduleWake(): void {
    const at = this.controller.nextWakeAt();
    if (at === this.wakeAt) return;
    this.wakeTimer?.clear();
    this.wakeTimer = null;
    this.wakeAt = at;
    if (at === null) return;
    this.wakeTimer = this.clock.setTimeout(() => {
      this.wakeTimer = null;
      this.wakeAt = null;
      this.controller.tick();
      this.flush();
    }, Math.max(0, at - Date.now()));
  }

  private syncAndSend(): void {
    const revision = this.controller.currentRevision;
    if (revision !== this.state.revision) {
      this.state.view = JSON.stringify(this.controller.view());
      this.state.revision = revision;
    }
    for (const out of this.controller.drain()) {
      if (out.kind === 'kick') {
        for (const [sessionId, s] of this.sessions) {
          if (s.memberId !== out.memberId) continue;
          this.sessions.delete(sessionId);
          this.sendKick(s.client, out.reason);
        }
      } else {
        this.broadcast(out.kind, out.payload, { afterNextPatch: true });
      }
    }
  }

  private sendKick(client: Client, reason: KickReason): void {
    client.send('kicked', { reason });
    client.leave(CloseCode.CONSENTED);
  }
}
