/**
 * Room chat (docs/01-product-and-ux.md §4.6). Reactions are instant chat
 * messages: they appear in the conversation like any other message.
 * Collected for the whole room session, so the conversation survives
 * lobby → game → results.
 */
import type { Color } from '@ludo/engine';
import type { ChatMessage, ReactMessage } from '@ludo/protocol';
import { create } from 'zustand';
import { sound } from '../audio/sound';
import { getConnection } from './session';

export interface ChatLine {
  id: number;
  kind: 'text' | 'reaction';
  from: string;
  name: string;
  avatar: string;
  color: Color | null;
  /** The message text, or the emoji for a reaction. */
  text: string;
  mine: boolean;
}

interface ChatStore {
  lines: ChatLine[];
  unread: number;
  /** How many chat views are on screen (desktop sidebar, open sheet). */
  visible: number;
  /** Latest text message per member, shown briefly as a bubble on their panel (phones). */
  bubbles: Record<string, { id: number; text: string }>;
  reset(): void;
}

let nextId = 1;
const LIMIT = 150;

export const useChat = create<ChatStore>((set) => ({
  lines: [],
  unread: 0,
  visible: 0,
  bubbles: {},
  reset: () => set({ lines: [], unread: 0, bubbles: {} }),
}));

/** Mark a chat view as on screen while mounted; clears the unread count. Returns a cleanup. */
export function showChatView(): () => void {
  useChat.setState((s) => ({ visible: s.visible + 1, unread: 0 }));
  return () => useChat.setState((s) => ({ visible: Math.max(0, s.visible - 1) }));
}

function who(memberId: string) {
  const state = getConnection().state;
  const m = state.view?.members.find((x) => x.id === memberId);
  return { name: m?.name ?? '…', avatar: m?.avatar ?? '🙂', color: m?.seat ?? null, mine: memberId === state.memberId };
}

function addLine(kind: ChatLine['kind'], from: string, text: string): ChatLine {
  const line: ChatLine = { id: nextId++, kind, from, text, ...who(from) };
  useChat.setState((s) => ({
    lines: [...s.lines, line].slice(-LIMIT),
    unread: s.visible > 0 || line.mine ? 0 : s.unread + 1,
  }));
  if (!line.mine) sound.play(kind === 'reaction' ? 'reaction' : 'message');
  return line;
}

/** Subscribe to the room's chat and reactions. Returns an unsubscribe function. */
export function listenToChat(): () => void {
  const conn = getConnection();
  const offChat = conn.on('chat', (m: ChatMessage) => {
    const line = addLine('text', m.from, m.text);
    useChat.setState((s) => ({ bubbles: { ...s.bubbles, [m.from]: { id: line.id, text: m.text } } }));
    setTimeout(() => {
      useChat.setState((s) => (s.bubbles[m.from]?.id === line.id ? { bubbles: omit(s.bubbles, m.from) } : {}));
    }, 4500);
  });
  const offReact = conn.on('react', (r: ReactMessage) => {
    addLine('reaction', r.from, r.emoji);
  });
  return () => {
    offChat();
    offReact();
  };
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = obj;
  return rest;
}
