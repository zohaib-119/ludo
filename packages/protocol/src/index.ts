/**
 * Client–server contract. See docs/05-protocol.md.
 * Shared by apps/server and apps/web.
 */
import type {
  Color,
  GameEvent,
  LegalMove,
  Piece,
  RollReason,
  Settings,
} from '@ludo/engine';
import { DEFAULT_SETTINGS } from '@ludo/engine';

export const ROOM_NAME = 'ludo';

// ---------------------------------------------------------------------------
// Settings and presets
// ---------------------------------------------------------------------------

export const TURN_TIMER_OPTIONS = [0, 15, 30, 45, 60] as const; // 0 = off
export const TAKEOVER_OPTIONS = [15, 30, 60, 0] as const; // 0 = never

export interface RoomSettings extends Settings {
  /** Seconds per decision; 0 = off. */
  turnTimer: (typeof TURN_TIMER_OPTIONS)[number];
  /** Seconds before the bot plays for an offline player; 0 = never. */
  disconnectTakeover: (typeof TAKEOVER_OPTIONS)[number];
}

/**
 * What every new room starts with (the host can change it in the lobby):
 * 2 dice, no bonus rolls, two dice to the end, capture before entering the
 * home column, no teams, no turn timer, bot covers offline players after 60 s.
 */
export const DEFAULT_ROOM_SETTINGS: Readonly<RoomSettings> = {
  ...DEFAULT_SETTINGS,
  diceMode: 2,
  extraTurnOnCapture: false,
  extraTurnOnFinish: false,
  singleDieWhenAllInColumn: false,
  killRequiredToEnterColumn: true,
  teamMode: false,
  turnTimer: 0,
  disconnectTakeover: 60,
};

export type PresetId = 'classic' | 'twoDice' | 'hardcore';

/** The rule fields a preset controls. Teams, timers and handover are left alone. */
export type PresetRules = Pick<
  Settings,
  'diceMode' | 'extraTurnOnCapture' | 'extraTurnOnFinish' | 'singleDieWhenAllInColumn' | 'killRequiredToEnterColumn'
>;

export const PRESETS: Readonly<Record<PresetId, PresetRules>> = {
  classic: {
    diceMode: 1,
    extraTurnOnCapture: true,
    extraTurnOnFinish: true,
    singleDieWhenAllInColumn: true,
    killRequiredToEnterColumn: false,
  },
  twoDice: {
    diceMode: 2,
    extraTurnOnCapture: true,
    extraTurnOnFinish: true,
    singleDieWhenAllInColumn: true,
    killRequiredToEnterColumn: false,
  },
  hardcore: {
    diceMode: 2,
    extraTurnOnCapture: false,
    extraTurnOnFinish: false,
    singleDieWhenAllInColumn: false,
    killRequiredToEnterColumn: true,
  },
};

/** Which preset the settings match, or 'custom'. 1-die mode ignores Rule B. */
export function presetOf(s: Settings): PresetId | 'custom' {
  for (const [id, p] of Object.entries(PRESETS) as Array<[PresetId, PresetRules]>) {
    const same =
      s.diceMode === p.diceMode &&
      s.extraTurnOnCapture === p.extraTurnOnCapture &&
      s.extraTurnOnFinish === p.extraTurnOnFinish &&
      s.killRequiredToEnterColumn === p.killRequiredToEnterColumn &&
      (s.diceMode === 1 || s.singleDieWhenAllInColumn === p.singleDieWhenAllInColumn);
    if (same) return id;
  }
  return 'custom';
}

// ---------------------------------------------------------------------------
// Profiles, chat, limits
// ---------------------------------------------------------------------------

export const AVATARS = [
  '🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🦄', '🐙',
  '🦉', '🐧', '🐢', '🐝', '🦋', '🐳', '🦖', '🐲',
  '👑', '🚀', '⚡', '🔥', '🌙', '⭐', '🍉', '🎲',
] as const;

/** Names and avatars for bot seats, by colour. */
export const BOTS: Readonly<Record<Color, { name: string; avatar: string }>> = {
  red: { name: 'Bot Rustam', avatar: '🤖' },
  green: { name: 'Bot Gul', avatar: '🤖' },
  yellow: { name: 'Bot Zara', avatar: '🤖' },
  blue: { name: 'Bot Bilal', avatar: '🤖' },
};

export const REACTIONS = ['👍', '😂', '😮', '😡', '🔥', '😭', '👏', '🙏'] as const;

export const LIMITS = {
  nameMin: 2,
  nameMax: 16,
  chatMax: 120,
  chatPerSecond: 1,
  reactionsPerSecond: 2,
  commandsPerSecond: 20,
  maxMembers: 8,
} as const;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** Normalises user input like "k7q-x9m" or a pasted link into a room code, or null. */
export function parseRoomCode(input: string): string | null {
  const fromLink = /\/r\/([A-Za-z0-9-]+)/i.exec(input)?.[1] ?? input;
  const code = fromLink.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  if ([...code].some((ch) => !ROOM_CODE_ALPHABET.includes(ch))) return null;
  return code;
}

// ---------------------------------------------------------------------------
// Join options
// ---------------------------------------------------------------------------

export interface JoinOptions {
  playerToken: string;
  name: string;
  avatar: string;
}

// ---------------------------------------------------------------------------
// Commands (client → server). Sent with room.request('cmd', command).
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'setProfile'; name: string; avatar: string }
  | { type: 'takeSeat'; color: Color }
  | { type: 'leaveSeat' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'updateSettings'; settings: Partial<RoomSettings> }
  | { type: 'applyPreset'; preset: PresetId }
  | { type: 'removeSeat'; color: Color }
  | { type: 'addBot'; color: Color }
  | { type: 'setAutoplay'; on: boolean }
  | { type: 'hostBotTakeover'; color: Color }
  | { type: 'startGame' }
  | { type: 'roll'; stateVersion: number }
  | { type: 'move'; stateVersion: number; pieceId: string; value: number }
  | { type: 'endGame' }
  | { type: 'rematchVote'; yes: boolean }
  | { type: 'backToLobby' }
  | { type: 'leaveRoom' }
  | { type: 'chat'; text: string }
  | { type: 'react'; emoji: string };

export type CommandType = Command['type'];

export type ErrorCode =
  // engine
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'NO_SUCH_PIECE'
  | 'VALUE_NOT_IN_BANK'
  | 'ILLEGAL_MOVE'
  | 'GAME_OVER'
  | 'INVALID_SETUP'
  // room
  | 'STALE_STATE'
  | 'NOT_HOST'
  | 'NOT_SEATED'
  | 'SEAT_TAKEN'
  | 'CANNOT_START'
  | 'WRONG_ROOM_PHASE'
  | 'NAME_INVALID'
  | 'RATE_LIMITED'
  | 'BAD_PAYLOAD'
  // join
  | 'ROOM_NOT_FOUND'
  | 'GAME_IN_PROGRESS'
  | 'ROOM_FULL';

export type CommandResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

// ---------------------------------------------------------------------------
// Public view (synced state). Everything here is visible to every client.
// ---------------------------------------------------------------------------

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface MemberView {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  ready: boolean;
  seat: Color | null;
  isHost: boolean;
}

export interface SeatView {
  color: Color;
  memberId: string | null;
  name: string;
  avatar: string;
  isBot: boolean;
  connected: boolean;
  /** Server timestamp when the seat went offline; 0 when online. */
  offlineSince: number;
  /** The player asked the bot to play (or timed out twice). */
  autoplay: boolean;
  /** The bot is playing because the player is offline. */
  botControlled: boolean;
  /** Consecutive turn-timer expiries. */
  timeouts: number;
}

export interface PlayerStats {
  captures: number;
  lost: number;
  sixes: number;
  voids: number;
  botTurns: number;
}

export interface GameView {
  version: number;
  seats: Color[];
  pieces: Piece[];
  players: Partial<Record<Color, { hasKilled: boolean; finishedRank: number | null; handoverDelayLeft: number; eliminated: boolean }>>;
  turn: {
    seat: Color;
    controls: Color;
    phase: 'awaitRoll' | 'awaitMove' | 'gameOver';
    rollReason: RollReason | null;
    bank: number[];
    lastRoll: number[];
    /** Server ms timestamp of the decision deadline; 0 = no timer. */
    deadline: number;
    /** Server ms timestamp when the bot takes over an offline seat; 0 = n/a. */
    takeoverAt: number;
  };
  legalMoves: LegalMove[];
  rankings: Color[];
  winningTeam: Color[] | null;
  stats: Partial<Record<Color, PlayerStats>>;
  endedByHost: boolean;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  settings: RoomSettings;
  preset: PresetId | 'custom';
  members: MemberView[];
  seats: Partial<Record<Color, SeatView>>;
  game: GameView | null;
  rematchVotes: string[];
  /** Server clock when this view was produced (ms), for client clock offset. */
  serverTime: number;
}

// ---------------------------------------------------------------------------
// Server → client messages
// ---------------------------------------------------------------------------

export type BotCause = 'bot' | 'timeout' | 'offline' | 'autoplay';

/** Room-level event: the bot made the next decision for a seat. */
export interface BotActedEvent {
  type: 'BotActed';
  seat: Color;
  cause: BotCause;
}

export type RoomEvent = GameEvent | BotActedEvent;

export interface EventsMessage {
  version: number;
  events: RoomEvent[];
}

export interface ChatMessage {
  from: string;
  text: string;
  at: number;
}

export interface ReactMessage {
  from: string;
  emoji: string;
}

export type NoticeCode =
  | 'memberJoined'
  | 'memberLeft'
  | 'memberReconnected'
  | 'memberDisconnected'
  | 'hostChanged'
  | 'settingsChanged'
  | 'gameStarted'
  | 'serverShutdown';

export interface NoticeMessage {
  code: NoticeCode;
  memberId?: string;
}

export type KickReason = 'otherTab' | 'removedByHost' | 'roomClosed';

export interface KickedMessage {
  reason: KickReason;
}

/** Sent to a client right after it joins: which member it is. */
export interface WelcomeMessage {
  memberId: string;
}

export interface ServerMessages {
  welcome: WelcomeMessage;
  events: EventsMessage;
  chat: ChatMessage;
  react: ReactMessage;
  notice: NoticeMessage;
  kicked: KickedMessage;
}

// ---------------------------------------------------------------------------
// Animation timing, shared so the server can pace bots to what players see
// ---------------------------------------------------------------------------

export interface AnimationTiming {
  roll: number;
  /** Pause after a die leaves the tray, before its piece starts moving. */
  useDie: number;
  /** How long void dice stay dimmed before they are cleared. */
  void: number;
  hop: number;
  enter: number;
  capture: number;
  banner: number;
  playerFinished: number;
  turn: number;
}

export const ANIMATION_TIMING: Readonly<AnimationTiming> = {
  roll: 700,
  useDie: 220,
  void: 800,
  hop: 110,
  enter: 300,
  capture: 480,
  banner: 900,
  playerFinished: 1400,
  turn: 150,
};

/** How long the web client takes to animate these events (mirrors its playback). */
export function estimateAnimationMs(events: RoomEvent[], timing: AnimationTiming = ANIMATION_TIMING): number {
  let ms = 0;
  for (const e of events) {
    switch (e.type) {
      case 'TurnStarted':
        ms += timing.turn;
        break;
      case 'Rolled':
        ms += timing.roll;
        break;
      case 'RollVoided':
        ms += timing.void;
        break;
      case 'Moved':
        ms += timing.useDie + (e.from === -1 ? timing.enter : timing.hop * (e.to - e.from));
        break;
      case 'Captured':
        ms += timing.capture;
        break;
      case 'PlayerFinished':
      case 'PlayerEliminated':
        ms += timing.playerFinished;
        break;
      default:
        break;
    }
  }
  return ms;
}

/** Close code the server uses when a join is refused; reason carries the ErrorCode. */
export const JOIN_REFUSED_CLOSE_CODE = 4401;
