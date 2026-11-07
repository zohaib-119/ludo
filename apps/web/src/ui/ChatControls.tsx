import { REACTIONS, LIMITS } from '@ludo/protocol';
import { MessageCircle, SendHorizontal, Smile } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/messages';
import { useChat } from '../net/chat';
import { sendCommand } from '../net/commands';
import { Avatar, IconButton, Sheet, cx, pieceColor } from './kit';

/** Header buttons: reactions picker and chat (with unread count). */
export function ChatControls() {
  const unread = useChat((s) => s.unread);
  const setOpen = useChat((s) => s.setOpen);
  const open = useChat((s) => s.open);
  const [picker, setPicker] = useState(false);

  return (
    <div className="relative flex items-center gap-1">
      <IconButton
        label={t('chat.react')}
        onClick={() => setPicker((v) => !v)}
        aria-expanded={picker}
        data-testid="react-button"
      >
        <Smile className="size-5" />
      </IconButton>
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            className="absolute right-0 top-12 z-30 flex gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
            role="menu"
            aria-label={t('chat.react')}
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                className="flex size-10 items-center justify-center rounded-xl text-2xl transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
                onClick={() => {
                  void sendCommand({ type: 'react', emoji });
                  setPicker(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <IconButton label={t('chat.title')} onClick={() => setOpen(true)} className="relative" data-testid="chat-button">
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
            data-testid="chat-unread"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>
      <ChatSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lines = useChat((s) => s.lines);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length, open]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await sendCommand({ type: 'chat', text: value })) setText('');
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('chat.title')}>
      <ol
        ref={listRef}
        className="mb-3 max-h-[45vh] min-h-24 space-y-2 overflow-y-auto pr-1"
        data-testid="chat-log"
        aria-live="polite"
      >
        {lines.length === 0 && <li className="py-6 text-center text-sm text-muted">{t('chat.empty')}</li>}
        {lines.map((l) => (
          <li key={l.id} className={cx('flex items-end gap-2', l.mine && 'flex-row-reverse')}>
            <Avatar emoji={l.avatar} color={l.color ?? undefined} size={28} />
            <div
              className={cx(
                'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                l.mine ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md bg-surface-2',
              )}
            >
              {!l.mine && (
                <p className="text-xs font-bold" style={{ color: l.color ? pieceColor(l.color) : 'var(--text-muted)' }}>
                  {l.name}
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">{l.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <form onSubmit={send} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{t('chat.placeholder')}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.chatMax}
            placeholder={t('chat.placeholder')}
            className="h-11 w-full rounded-xl border border-transparent bg-surface-2 px-4 outline-none focus:border-accent focus:bg-surface"
            data-testid="chat-input"
          />
        </label>
        <IconButton
          label={t('chat.send')}
          type="submit"
          className="bg-accent text-on-accent hover:bg-accent hover:text-on-accent"
        >
          <SendHorizontal className="size-5" />
        </IconButton>
      </form>
    </Sheet>
  );
}

/** Emoji floating up from a point (used on player panels and in the lobby). */
export function FloatingEmojis({ emojis }: { emojis: Array<{ id: number; emoji: string }> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 flex justify-center" aria-hidden>
      <AnimatePresence>
        {emojis.map((r, i) => (
          <motion.span
            key={r.id}
            className="absolute text-3xl"
            style={{ left: `${45 + ((i * 17) % 20) - 10}%` }}
            initial={{ y: 20, opacity: 0, scale: 0.6 }}
            animate={{ y: -50, opacity: [0, 1, 1, 0], scale: 1.1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, ease: 'easeOut' }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
