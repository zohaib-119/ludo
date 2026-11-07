/**
 * Room chat and emoji reactions (docs/01-product-and-ux.md §4.6). Collected for
 * the whole room session, so the conversation survives lobby → game → results.
 */
import type { Color } from '@ludo/engine';
import type { ChatMessage, ReactMessage } from '@ludo/protocol';
import { create } from 'zustand';
import { sound } from '../audio/sound';
import { getConnection } from './session';

export interface ChatLine {
  id: number;
  from: string;
  name: string;
  avatar: string;
  color: Color | null;
  text: string;
  at: number;
  mine: boolean;
}

export interface FloatingReaction {
  id: number;
  from: string;
  color: Color | null;
  emoji: string;
}

interface ChatStore {
  lines: ChatLine[];
  unread: number;
  open: boolean;
  reactions: FloatingReaction[];
  /** Latest message per member, shown briefly as a bubble on their panel. */
  bubbles: Record<string, { id: number; text: string }>;
  setOpen(open: boolean): void;
  reset(): void;
}

let nextId = 1;
const LIMIT = 100;

export const useChat = create<ChatStore>((set) => ({
  lines: [],
  unread: 0,
  open: false,
  reactions: [],
  bubbles: {},
  setOpen: (open) => set((s) => ({ open, unread: open ? 0 : s.unread })),
  reset: () => set({ lines: [], unread: 0, reactions: [], bubbles: {} }),
}));

function who(memberId: string) {
  const state = getConnection().state;
  const m = state.view?.members.find((x) => x.id === memberId);
  return { name: m?.name ?? '…', avatar: m?.avatar ?? '🙂', color: m?.seat ?? null, mine: memberId === state.memberId };
}

/** Subscribe to the room's chat and reactions. Returns an unsubscribe function. */
export function listenToChat(): () => void {
  const conn = getConnection();
  const offChat = conn.on('chat', (m: ChatMessage) => {
    const w = who(m.from);
    const line: ChatLine = { id: nextId++, from: m.from, text: m.text, at: m.at, ...w };
    useChat.setState((s) => ({
      lines: [...s.lines, line].slice(-LIMIT),
      unread: s.open || w.mine ? s.unread : s.unread + 1,
      bubbles: { ...s.bubbles, [m.from]: { id: line.id, text: m.text } },
    }));
    if (!w.mine) sound.play('message');
    setTimeout(() => {
      useChat.setState((s) => (s.bubbles[m.from]?.id === line.id ? { bubbles: omit(s.bubbles, m.from) } : {}));
    }, 4500);
  });
  const offReact = conn.on('react', (r: ReactMessage) => {
    const reaction: FloatingReaction = { id: nextId++, from: r.from, emoji: r.emoji, color: who(r.from).color };
    useChat.setState((s) => ({ reactions: [...s.reactions.slice(-11), reaction] }));
    sound.play('pop');
    setTimeout(() => useChat.setState((s) => ({ reactions: s.reactions.filter((x) => x.id !== reaction.id) })), 2400);
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
