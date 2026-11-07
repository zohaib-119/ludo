/**
 * Chat UI: a full chat panel (right-hand column on desktop) and, on phones, a
 * header button that opens the same panel in a sheet. Reactions are quick
 * emoji messages sent from the row above the input.
 */
import { LIMITS, REACTIONS } from '@ludo/protocol';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/messages';
import { showChatView, useChat } from '../net/chat';
import { sendCommand } from '../net/commands';
import { Avatar, IconButton, Sheet, cx, pieceColor } from './kit';

/** True on wide screens, where chat is a permanent column. */
export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return Boolean(match);
}

/** The conversation, quick reactions and the input. Fills its container. */
export function ChatPanel({ className, title = true }: { className?: string; title?: boolean }) {
  const lines = useChat((s) => s.lines);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => showChatView(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await sendCommand({ type: 'chat', text: value })) setText('');
  };

  return (
    <div className={cx('flex min-h-0 flex-col', className)} data-testid="chat-panel">
      {title && (
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <MessageCircle className="size-5 text-accent" /> {t('chat.title')}
        </h2>
      )}
      <ol
        ref={listRef}
        className="min-h-24 flex-1 space-y-2.5 overflow-y-auto pr-1"
        data-testid="chat-log"
        aria-live="polite"
      >
        {lines.length === 0 && <li className="py-8 text-center text-sm text-muted">{t('chat.empty')}</li>}
        {lines.map((l) => (
          <li key={l.id} className={cx('flex items-end gap-2', l.mine && 'flex-row-reverse')}>
            <Avatar emoji={l.avatar} color={l.color ?? undefined} size={28} />
            {l.kind === 'reaction' ? (
              <div className={cx('flex flex-col', l.mine ? 'items-end' : 'items-start')}>
                {!l.mine && <Name line={l} />}
                <span className="text-4xl leading-none" role="img" aria-label={l.text} data-testid="chat-reaction">
                  {l.text}
                </span>
              </div>
            ) : (
              <div
                className={cx(
                  'max-w-[78%] rounded-2xl px-3 py-2 text-sm',
                  l.mine ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md bg-surface-2',
                )}
              >
                {!l.mine && <Name line={l} />}
                <p className="break-words whitespace-pre-wrap">{l.text}</p>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex justify-between gap-1" role="group" aria-label={t('chat.react')}>
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex size-9 items-center justify-center rounded-xl text-xl transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
            onClick={() => void sendCommand({ type: 'react', emoji })}
            aria-label={`${t('chat.sendReaction')} ${emoji}`}
            data-testid={`react-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="mt-2 flex gap-2">
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
    </div>
  );
}

function Name({ line }: { line: { name: string; color: string | null } }) {
  return (
    <p
      className="mb-0.5 text-xs font-bold"
      style={{ color: line.color ? pieceColor(line.color as never) : 'var(--text-muted)' }}
    >
      {line.name}
    </p>
  );
}

/** Phones: a header button with an unread count that opens the chat in a sheet. */
export function ChatButton() {
  const unread = useChat((s) => s.unread);
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label={t('chat.title')} onClick={() => setOpen(true)} className="relative" data-testid="chat-button">
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
            data-testid="chat-unread"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('chat.title')}>
        {open && <ChatPanel title={false} className="h-[60vh]" />}
      </Sheet>
    </>
  );
}
