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

export const DEFAULT_ROOM_SETTINGS: Readonly<RoomSettings> = {
  ...DEFAULT_SETTINGS,
  turnTimer: 0,
  disconnectTakeover: 30,
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
  const fromLink = /\/r\/([A-Za-z0-9-]+)/.exec(input)?.[1] ?? input;
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
  players: Partial<Record<Color, { hasKilled: boolean; finishedRank: number | null; handoverDelayLeft: number }>>;
  turn: {
    seat: Color;
    controls: Color;
    phase: 'awaitRoll' | 'awaitMove' | 'gameOver';
    rollReason: RollReason | null;
    bank: number[];
    lastRoll: number[];
    /** Server ms timestamp of the decision deadline; 0 = no timer. */
    deadline: number;
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

export interface EventsMessage {
  version: number;
  events: GameEvent[];
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

export interface ServerMessages {
  events: EventsMessage;
  chat: ChatMessage;
  react: ReactMessage;
  notice: NoticeMessage;
  kicked: KickedMessage;
}

/** Close code the server uses when a join is refused; reason carries the ErrorCode. */
export const JOIN_REFUSED_CLOSE_CODE = 4401;
