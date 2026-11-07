/**
 * All room logic, independent of Colyseus: members, seats, host, lobby rules,
 * game actions, rematch, chat. The Colyseus room (room.ts) is a thin adapter
 * around this class, so everything here is tested without a network.
 * See docs/03-architecture.md §4 and docs/05-protocol.md.
 */
import {
  type Color,
  type GameEvent,
  type GameState,
  type Rng,
  COLORS,
  apply,
  createGame,
  legalMoves,
  validateSetup,
} from '@ludo/engine';
import {
  AVATARS,
  type ChatMessage,
  type Command,
  type CommandResult,
  DEFAULT_ROOM_SETTINGS,
  type ErrorCode,
  type EventsMessage,
  type GameView,
  type JoinOptions,
  type KickReason,
  LIMITS,
  type NoticeMessage,
  PRESETS,
  type PlayerStats,
  type PresetId,
  REACTIONS,
  type ReactMessage,
  type RoomPhase,
  type RoomSettings,
  type RoomView,
  TAKEOVER_OPTIONS,
  TURN_TIMER_OPTIONS,
  presetOf,
} from '@ludo/protocol';

export const HOST_TRANSFER_MS = 60_000;
export const DISPOSE_IDLE_MS: Record<RoomPhase, number> = {
  lobby: 5 * 60_000,
  playing: 30 * 60_000,
  finished: 5 * 60_000,
};

export type Out =
  | { kind: 'events'; payload: EventsMessage }
  | { kind: 'chat'; payload: ChatMessage }
  | { kind: 'react'; payload: ReactMessage }
  | { kind: 'notice'; payload: NoticeMessage }
  | { kind: 'kick'; memberId: string; reason: KickReason };

interface Member {
  id: string;
  token: string;
  name: string;
  avatar: string;
  connected: boolean;
  /** When the current connection started (for host transfer: longest connected wins). */
  connectedSince: number;
  /** When the member last went offline; 0 while connected. */
  offlineSince: number;
  ready: boolean;
  seat: Color | null;
  /** Timestamps of recent commands / chat / reactions, for rate limiting. */
  recentCommands: number[];
  lastChatAt: number;
  recentReactions: number[];
}

export type JoinResult =
  | { ok: true; memberId: string; replaced: boolean }
  | { ok: false; code: ErrorCode; message: string };

export interface ControllerDeps {
  rng: Rng;
  now: () => number;
  newId: () => string;
}

const fail = (code: ErrorCode, message: string): CommandResult => ({ ok: false, code, message });
const OK: CommandResult = { ok: true };

const emptyStats = (): PlayerStats => ({ captures: 0, lost: 0, sixes: 0, voids: 0, botTurns: 0 });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isColor = (v: unknown): v is Color => typeof v === 'string' && (COLORS as readonly string[]).includes(v);
// Control characters (C0 + DEL + C1) and bidi-override / zero-width formatting characters.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

export function cleanText(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

export class RoomController {
  readonly code: string;
  private readonly deps: ControllerDeps;

  private phase: RoomPhase = 'lobby';
  private hostId: string | null = null;
  private settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  private members = new Map<string, Member>();
  private game: GameState | null = null;
  private stats: Partial<Record<Color, PlayerStats>> = {};
  private endedByHost = false;
  private rematchVotes = new Set<string>();
  private outbox: Out[] = [];
  /** Increments on every change to the public view. */
  private revision = 0;
  private revisionTime: number;
  /** Last moment any member was connected (for disposal). */
  private lastPresence: number;

  constructor(code: string, deps: ControllerDeps) {
    this.code = code;
    this.deps = deps;
    this.revisionTime = deps.now();
    this.lastPresence = deps.now();
  }

  // -------------------------------------------------------------------------
  // Public surface used by the adapter
  // -------------------------------------------------------------------------

  get currentRevision(): number {
    return this.revision;
  }

  /** Messages produced since the last drain, in order. */
  drain(): Out[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  join(options: unknown): JoinResult {
    if (!isObject(options) || typeof options.playerToken !== 'string') {
      return { ok: false, code: 'BAD_PAYLOAD', message: 'Missing player token' };
    }
    const { playerToken } = options as unknown as JoinOptions;
    if (playerToken.length < 8 || playerToken.length > 64) {
      return { ok: false, code: 'BAD_PAYLOAD', message: 'Invalid player token' };
    }
    const now = this.deps.now();

    const existing = [...this.members.values()].find((m) => m.token === playerToken);
    if (existing) {
      const replaced = existing.connected;
      existing.connected = true;
      existing.connectedSince = now;
      existing.offlineSince = 0;
      this.lastPresence = now;
      if (!replaced) this.notice('memberReconnected', existing.id);
      this.touch();
      return { ok: true, memberId: existing.id, replaced };
    }

    if (this.phase !== 'lobby') {
      return { ok: false, code: 'GAME_IN_PROGRESS', message: 'This game has already started' };
    }
    if (this.members.size >= LIMITS.maxMembers) {
      return { ok: false, code: 'ROOM_FULL', message: 'This room is full' };
    }
    const name = typeof options.name === 'string' ? cleanText(options.name) : '';
    if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
      return { ok: false, code: 'NAME_INVALID', message: `Name must be ${LIMITS.nameMin}–${LIMITS.nameMax} characters` };
    }
    const member: Member = {
      id: this.deps.newId(),
      token: playerToken,
      name: this.uniqueName(name, null),
      avatar: this.validAvatar(options.avatar),
      connected: true,
      connectedSince: now,
      offlineSince: 0,
      ready: false,
      seat: null,
      recentCommands: [],
      lastChatAt: 0,
      recentReactions: [],
    };
    this.members.set(member.id, member);
    this.lastPresence = now;
    if (this.hostId === null) this.hostId = member.id;
    this.notice('memberJoined', member.id);
    this.touch();
    return { ok: true, memberId: member.id, replaced: false };
  }

  setConnected(memberId: string, connected: boolean): void {
    const m = this.members.get(memberId);
    if (!m || m.connected === connected) return;
    const now = this.deps.now();
    m.connected = connected;
    if (connected) {
      m.connectedSince = now;
      m.offlineSince = 0;
      this.notice('memberReconnected', m.id);
    } else {
      m.offlineSince = now;
      this.notice('memberDisconnected', m.id);
    }
    this.lastPresence = now;
    this.touch();
  }

  /** Periodic housekeeping: host transfer. Call about once a second. */
  tick(): void {
    const now = this.deps.now();
    if (this.connectedMembers().length > 0) this.lastPresence = now;
    const host = this.hostId ? this.members.get(this.hostId) : undefined;
    if (!host || (!host.connected && now - host.offlineSince >= HOST_TRANSFER_MS)) {
      this.transferHost();
    }
  }

  shouldDispose(): boolean {
    if (this.connectedMembers().length > 0) return false;
    return this.deps.now() - this.lastPresence >= DISPOSE_IDLE_MS[this.phase];
  }

  command(memberId: string, raw: unknown): CommandResult {
    const member = this.members.get(memberId);
    if (!member) return fail('BAD_PAYLOAD', 'Unknown member');
    if (!isObject(raw) || typeof raw.type !== 'string') return fail('BAD_PAYLOAD', 'Malformed command');
    if (!this.allowCommand(member)) return fail('RATE_LIMITED', 'Too many commands');
    const cmd = raw as Command;
    switch (cmd.type) {
      case 'setProfile':
        return this.setProfile(member, cmd);
      case 'takeSeat':
        return this.takeSeat(member, cmd);
      case 'leaveSeat':
        return this.leaveSeat(member);
      case 'setReady':
        return this.setReady(member, cmd);
      case 'updateSettings':
        return this.updateSettings(member, cmd);
      case 'applyPreset':
        return this.applyPreset(member, cmd);
      case 'removeSeat':
        return this.removeSeat(member, cmd);
      case 'startGame':
        return this.startGame(member);
      case 'roll':
      case 'move':
        return this.gameAction(member, cmd);
      case 'endGame':
        return this.endGame(member);
      case 'rematchVote':
        return this.rematchVote(member, cmd);
      case 'backToLobby':
        return this.backToLobby(member);
      case 'leaveRoom':
        return this.leaveRoom(member);
      case 'chat':
        return this.chat(member, cmd);
      case 'react':
        return this.react(member, cmd);
      default:
        return fail('BAD_PAYLOAD', `Unknown command ${(cmd as { type: string }).type}`);
    }
  }

  view(): RoomView {
    const seats: RoomView['seats'] = {};
    for (const m of this.members.values()) {
      if (!m.seat) continue;
      seats[m.seat] = {
        color: m.seat,
        memberId: m.id,
        name: m.name,
        avatar: m.avatar,
        isBot: false,
        connected: m.connected,
        offlineSince: m.offlineSince,
      };
    }
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      settings: { ...this.settings },
      preset: presetOf(this.settings),
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        connected: m.connected,
        ready: m.ready,
        seat: m.seat,
        isHost: m.id === this.hostId,
      })),
      seats,
      game: this.gameView(),
      rematchVotes: [...this.rematchVotes],
      serverTime: this.revisionTime,
    };
  }

  // -------------------------------------------------------------------------
  // Lobby commands
  // -------------------------------------------------------------------------

  private setProfile(member: Member, cmd: Extract<Command, { type: 'setProfile' }>): CommandResult {
    if (typeof cmd.name !== 'string') return fail('BAD_PAYLOAD', 'Name required');
    const name = cleanText(cmd.name);
    if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
      return fail('NAME_INVALID', `Name must be ${LIMITS.nameMin}–${LIMITS.nameMax} characters`);
    }
    member.name = this.uniqueName(name, member.id);
    member.avatar = this.validAvatar(cmd.avatar, member.avatar);
    this.touch();
    return OK;
  }

  private takeSeat(member: Member, cmd: Extract<Command, { type: 'takeSeat' }>): CommandResult {
    if (this.phase !== 'lobby') return fail('WRONG_ROOM_PHASE', 'Seats can only change in the lobby');
    if (!isColor(cmd.color)) return fail('BAD_PAYLOAD', 'Unknown colour');
    if (member.seat === cmd.color) return OK;
    if (this.seatOwner(cmd.color)) return fail('SEAT_TAKEN', 'That seat is taken');
    member.seat = cmd.color;
    member.ready = false;
    this.touch();
    return OK;
  }

  private leaveSeat(member: Member): CommandResult {
    if (this.phase !== 'lobby') return fail('WRONG_ROOM_PHASE', 'Seats can only change in the lobby');
    member.seat = null;
    member.ready = false;
    this.touch();
    return OK;
  }

  private setReady(member: Member, cmd: Extract<Command, { type: 'setReady' }>): CommandResult {
    if (this.phase !== 'lobby') return fail('WRONG_ROOM_PHASE', 'Not in the lobby');
    if (typeof cmd.ready !== 'boolean') return fail('BAD_PAYLOAD', 'ready must be true or false');
    if (!member.seat) return fail('NOT_SEATED', 'Take a seat first');
    member.ready = cmd.ready;
    this.touch();
    return OK;
  }

  private updateSettings(member: Member, cmd: Extract<Command, { type: 'updateSettings' }>): CommandResult {
    const guard = this.hostLobbyGuard(member);
    if (guard) return guard;
    if (!isObject(cmd.settings)) return fail('BAD_PAYLOAD', 'settings must be an object');
    const next: RoomSettings = { ...this.settings };
    for (const [key, value] of Object.entries(cmd.settings)) {
      const error = assignSetting(next, key, value);
      if (error) return fail('BAD_PAYLOAD', error);
    }
    return this.commitSettings(next);
  }

  private applyPreset(member: Member, cmd: Extract<Command, { type: 'applyPreset' }>): CommandResult {
    const guard = this.hostLobbyGuard(member);
    if (guard) return guard;
    const preset = PRESETS[cmd.preset as PresetId];
    if (!preset || !Object.hasOwn(PRESETS, cmd.preset)) return fail('BAD_PAYLOAD', 'Unknown preset');
    return this.commitSettings({ ...this.settings, ...preset });
  }

  private commitSettings(next: RoomSettings): CommandResult {
    if (JSON.stringify(next) === JSON.stringify(this.settings)) return OK;
    this.settings = next;
    // Nobody starts with rules they haven't seen.
    for (const m of this.members.values()) m.ready = false;
    this.notice('settingsChanged');
    this.touch();
    return OK;
  }

  private removeSeat(member: Member, cmd: Extract<Command, { type: 'removeSeat' }>): CommandResult {
    const guard = this.hostLobbyGuard(member);
    if (guard) return guard;
    if (!isColor(cmd.color)) return fail('BAD_PAYLOAD', 'Unknown colour');
    const owner = this.seatOwner(cmd.color);
    if (!owner) return OK;
    owner.seat = null;
    owner.ready = false;
    this.touch();
    return OK;
  }

  private startGame(member: Member): CommandResult {
    const guard = this.hostLobbyGuard(member);
    if (guard) return guard;
    const seated = [...this.members.values()].filter((m) => m.seat);
    const notReady = seated.filter((m) => m.id !== this.hostId && !m.ready);
    if (notReady.length > 0) {
      return fail('CANNOT_START', `Waiting for ${notReady.map((m) => m.name).join(', ')} to get ready`);
    }
    const colors = seated.map((m) => m.seat!) as Color[];
    const error = validateSetup(this.settings, colors);
    if (error) return fail('CANNOT_START', error);
    return this.beginGame(colors);
  }

  private beginGame(colors: Color[]): CommandResult {
    const created = createGame(engineSettings(this.settings), colors, this.deps.rng);
    if (!created.ok) return fail('CANNOT_START', created.error.message);
    this.game = created.state;
    this.stats = Object.fromEntries(created.state.seats.map((c) => [c, emptyStats()]));
    this.phase = 'playing';
    this.endedByHost = false;
    this.rematchVotes.clear();
    this.notice('gameStarted');
    this.emitEvents(created.events);
    this.touch();
    return OK;
  }

  // -------------------------------------------------------------------------
  // Game commands
  // -------------------------------------------------------------------------

  private gameAction(member: Member, cmd: Extract<Command, { type: 'roll' | 'move' }>): CommandResult {
    if (this.phase !== 'playing' || !this.game) return fail('WRONG_ROOM_PHASE', 'No game in progress');
    if (!member.seat) return fail('NOT_SEATED', 'You are not playing');
    if (typeof cmd.stateVersion !== 'number') return fail('BAD_PAYLOAD', 'stateVersion required');
    if (member.seat !== this.game.turn.seat) return fail('NOT_YOUR_TURN', `It is ${this.game.turn.seat}'s turn`);
    if (cmd.stateVersion !== this.game.version) return fail('STALE_STATE', 'The game has moved on; try again');
    if (cmd.type === 'move' && (typeof cmd.pieceId !== 'string' || typeof cmd.value !== 'number')) {
      return fail('BAD_PAYLOAD', 'pieceId and value required');
    }
    const action =
      cmd.type === 'roll'
        ? { type: 'roll' as const, seat: member.seat }
        : { type: 'move' as const, seat: member.seat, pieceId: cmd.pieceId, value: cmd.value };
    const result = apply(this.game, action, this.deps.rng);
    if (!result.ok) return fail(result.error.code, result.error.message);
    this.game = result.state;
    this.recordStats(result.events);
    this.emitEvents(result.events);
    if (this.game.turn.phase.kind === 'gameOver') this.phase = 'finished';
    this.touch();
    return OK;
  }

  private endGame(member: Member): CommandResult {
    if (member.id !== this.hostId) return fail('NOT_HOST', 'Only the host can end the game');
    if (this.phase !== 'playing') return fail('WRONG_ROOM_PHASE', 'No game in progress');
    this.phase = 'finished';
    this.endedByHost = true;
    this.touch();
    return OK;
  }

  private rematchVote(member: Member, cmd: Extract<Command, { type: 'rematchVote' }>): CommandResult {
    if (this.phase !== 'finished' || !this.game) return fail('WRONG_ROOM_PHASE', 'The game has not finished');
    if (!member.seat) return fail('NOT_SEATED', 'Only players can vote');
    if (typeof cmd.yes !== 'boolean') return fail('BAD_PAYLOAD', 'yes must be true or false');
    if (cmd.yes) this.rematchVotes.add(member.id);
    else this.rematchVotes.delete(member.id);
    const voters = [...this.members.values()].filter((m) => m.seat && m.connected);
    if (voters.length > 0 && voters.every((m) => this.rematchVotes.has(m.id))) {
      return this.beginGame([...this.game.seats]);
    }
    this.touch();
    return OK;
  }

  private backToLobby(member: Member): CommandResult {
    if (member.id !== this.hostId) return fail('NOT_HOST', 'Only the host can do that');
    if (this.phase !== 'finished') return fail('WRONG_ROOM_PHASE', 'The game has not finished');
    this.phase = 'lobby';
    this.game = null;
    this.stats = {};
    this.endedByHost = false;
    this.rematchVotes.clear();
    for (const m of this.members.values()) m.ready = false;
    this.touch();
    return OK;
  }

  private leaveRoom(member: Member): CommandResult {
    if (this.phase === 'lobby') {
      this.members.delete(member.id);
      this.rematchVotes.delete(member.id);
      this.notice('memberLeft', member.id);
      if (member.id === this.hostId) this.transferHost();
    } else {
      // The seat stays in the game; the bot plays it (M3). The member may come back.
      member.connected = false;
      member.offlineSince = this.deps.now();
      this.rematchVotes.delete(member.id);
      this.notice('memberLeft', member.id);
    }
    this.touch();
    return OK;
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  private chat(member: Member, cmd: Extract<Command, { type: 'chat' }>): CommandResult {
    if (typeof cmd.text !== 'string') return fail('BAD_PAYLOAD', 'text required');
    const text = cleanText(cmd.text);
    if (text.length === 0) return fail('BAD_PAYLOAD', 'Message is empty');
    if (text.length > LIMITS.chatMax) return fail('BAD_PAYLOAD', `Messages are limited to ${LIMITS.chatMax} characters`);
    const now = this.deps.now();
    if (now - member.lastChatAt < 1000 / LIMITS.chatPerSecond) return fail('RATE_LIMITED', 'Slow down');
    member.lastChatAt = now;
    this.outbox.push({ kind: 'chat', payload: { from: member.id, text, at: now } });
    return OK;
  }

  private react(member: Member, cmd: Extract<Command, { type: 'react' }>): CommandResult {
    if (!(REACTIONS as readonly string[]).includes(cmd.emoji)) return fail('BAD_PAYLOAD', 'Unknown reaction');
    const now = this.deps.now();
    member.recentReactions = member.recentReactions.filter((t) => now - t < 1000);
    if (member.recentReactions.length >= LIMITS.reactionsPerSecond) return fail('RATE_LIMITED', 'Slow down');
    member.recentReactions.push(now);
    this.outbox.push({ kind: 'react', payload: { from: member.id, emoji: cmd.emoji } });
    return OK;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private touch(): void {
    this.revision += 1;
    this.revisionTime = this.deps.now();
  }

  private notice(code: NoticeMessage['code'], memberId?: string): void {
    this.outbox.push({ kind: 'notice', payload: memberId ? { code, memberId } : { code } });
  }

  private emitEvents(events: GameEvent[]): void {
    if (!this.game || events.length === 0) return;
    this.outbox.push({ kind: 'events', payload: { version: this.game.version, events } });
  }

  private allowCommand(member: Member): boolean {
    const now = this.deps.now();
    member.recentCommands = member.recentCommands.filter((t) => now - t < 1000);
    if (member.recentCommands.length >= LIMITS.commandsPerSecond) return false;
    member.recentCommands.push(now);
    return true;
  }

  private hostLobbyGuard(member: Member): CommandResult | null {
    if (member.id !== this.hostId) return fail('NOT_HOST', 'Only the host can do that');
    if (this.phase !== 'lobby') return fail('WRONG_ROOM_PHASE', 'Only in the lobby');
    return null;
  }

  private seatOwner(color: Color): Member | undefined {
    return [...this.members.values()].find((m) => m.seat === color);
  }

  private connectedMembers(): Member[] {
    return [...this.members.values()].filter((m) => m.connected);
  }

  private transferHost(): void {
    const candidates = this.connectedMembers().sort((a, b) => a.connectedSince - b.connectedSince);
    const next = candidates[0]?.id ?? (this.hostId && this.members.has(this.hostId) ? this.hostId : null);
    if (next === this.hostId) return;
    this.hostId = next;
    if (next) this.notice('hostChanged', next);
    this.touch();
  }

  private uniqueName(name: string, selfId: string | null): string {
    const taken = new Set(
      [...this.members.values()].filter((m) => m.id !== selfId).map((m) => m.name.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, LIMITS.nameMax - String(n).length - 1)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private validAvatar(value: unknown, fallback: string = AVATARS[0]): string {
    return typeof value === 'string' && (AVATARS as readonly string[]).includes(value) ? value : fallback;
  }

  private recordStats(events: GameEvent[]): void {
    const bump = (color: Color, key: keyof PlayerStats, by = 1) => {
      const s = (this.stats[color] ??= emptyStats());
      s[key] += by;
    };
    for (const e of events) {
      if (e.type === 'Rolled') bump(e.seat, 'sixes', e.values.filter((v) => v === 6).length);
      else if (e.type === 'RollVoided') bump(e.seat, 'voids');
      else if (e.type === 'Captured') {
        for (const c of e.creditedTo) bump(c, 'captures', e.victims.length);
        for (const id of e.victims) bump(id.split('-')[0] as Color, 'lost');
      }
    }
  }

  private gameView(): GameView | null {
    const g = this.game;
    if (!g) return null;
    const phase = g.turn.phase;
    return {
      version: g.version,
      seats: [...g.seats],
      pieces: g.pieces.map((p) => ({ ...p })),
      players: JSON.parse(JSON.stringify(g.players)),
      turn: {
        seat: g.turn.seat,
        controls: g.turn.controls,
        phase: phase.kind,
        rollReason: phase.kind === 'awaitRoll' ? phase.reason : null,
        bank: g.turn.bank.map((d) => d.value),
        lastRoll: [...g.turn.lastRoll],
        deadline: 0,
      },
      legalMoves: this.phase === 'playing' ? legalMoves(g) : [],
      rankings: [...g.rankings],
      winningTeam: g.winningTeam ? [...g.winningTeam] : null,
      stats: JSON.parse(JSON.stringify(this.stats)),
      endedByHost: this.endedByHost,
    };
  }
}

/** The engine's part of the room settings. */
export function engineSettings(s: RoomSettings) {
  const { turnTimer: _t, disconnectTakeover: _d, ...engine } = s;
  return engine;
}

/** Validates and assigns one setting. Returns an error message, or null. */
export function assignSetting(target: RoomSettings, key: string, value: unknown): string | null {
  switch (key) {
    case 'diceMode':
      if (value !== 1 && value !== 2) return 'diceMode must be 1 or 2';
      target.diceMode = value;
      return null;
    case 'extraTurnOnCapture':
    case 'extraTurnOnFinish':
    case 'singleDieWhenAllInColumn':
    case 'killRequiredToEnterColumn':
    case 'teamMode':
      if (typeof value !== 'boolean') return `${key} must be true or false`;
      target[key] = value;
      return null;
    case 'teamHandover':
      if (value !== 'immediate' && value !== 'delayed') return 'teamHandover must be immediate or delayed';
      target.teamHandover = value;
      return null;
    case 'teamHandoverDelayRounds':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
        return 'teamHandoverDelayRounds must be 1..10';
      }
      target.teamHandoverDelayRounds = value;
      return null;
    case 'turnTimer':
      if (!(TURN_TIMER_OPTIONS as readonly unknown[]).includes(value)) return 'Unsupported turnTimer';
      target.turnTimer = value as RoomSettings['turnTimer'];
      return null;
    case 'disconnectTakeover':
      if (!(TAKEOVER_OPTIONS as readonly unknown[]).includes(value)) return 'Unsupported disconnectTakeover';
      target.disconnectTakeover = value as RoomSettings['disconnectTakeover'];
      return null;
    default:
      return `Unknown setting ${key}`;
  }
}
