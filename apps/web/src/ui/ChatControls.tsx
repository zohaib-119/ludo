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
import { IconButton, Sheet, cx, pieceColor } from './kit';

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

/**
 * The conversation, quick reactions and the input. Fills its container.
 * With `captureTyping`, typing anywhere on the page goes into the chat box
 * (so the chat stays "active" after clicking elsewhere).
 */
export function ChatPanel({
  className,
  title = true,
  captureTyping = false,
}: {
  className?: string;
  title?: boolean;
  captureTyping?: boolean;
}) {
  const lines = useChat((s) => s.lines);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => showChatView(), []);

  useEffect(() => {
    if (!captureTyping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      // Only printable characters; Space and Enter stay free for the game (rolling the dice).
      if (e.key.length !== 1 || e.key === ' ') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      if (document.querySelector('[role=dialog]')) return; // a sheet or dialog is open
      e.preventDefault();
      setText((v) => (v + e.key).slice(0, LIMITS.chatMax));
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [captureTyping]);
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
        <div className="flex items-center gap-3 border-b border-line pb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MessageCircle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg leading-tight font-bold">{t('chat.title')}</h2>
            {captureTyping && <p className="text-xs text-muted">{t('chat.typeAnywhere')}</p>}
          </div>
        </div>
      )}
      <ol
        ref={listRef}
        className="-mx-1 min-h-24 flex-1 space-y-3 overflow-y-auto px-1 py-3"
        data-testid="chat-log"
        aria-live="polite"
      >
        {lines.length === 0 && (
          <li className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-3xl" aria-hidden>
              👋
            </span>
            <p className="font-display font-bold">{t('chat.empty')}</p>
            <p className="text-sm text-muted">{t('chat.emptyHint')}</p>
          </li>
        )}
        {lines.map((l, i) => {
          // The sender's name heads each run of messages (shown once for consecutive messages).
          const showName = i === 0 || lines[i - 1]!.from !== l.from;
          const tint = l.color ? `var(--${l.color}-light)` : 'var(--surface-2)';
          return (
            <li key={l.id} className={cx('flex flex-col', l.mine ? 'items-end' : 'items-start', !showName && '-mt-2')}>
              {showName && <Name line={l} />}
              {l.kind === 'reaction' ? (
                <span className="text-4xl leading-none" role="img" aria-label={l.text} data-testid="chat-reaction">
                  {l.text}
                </span>
              ) : (
                <p
                  className={cx(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap shadow-soft',
                    l.mine ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md text-text',
                  )}
                  style={l.mine ? undefined : { background: tint }}
                >
                  {l.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div
        className="flex justify-between gap-0.5 rounded-2xl bg-surface-2 p-1"
        role="group"
        aria-label={t('chat.react')}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex h-9 flex-1 items-center justify-center rounded-xl text-xl transition-transform hover:scale-110 hover:bg-surface active:scale-95"
            onClick={() => void sendCommand({ type: 'react', emoji })}
            aria-label={`${t('chat.sendReaction')} ${emoji}`}
            data-testid={`react-${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <form
        onSubmit={send}
        className="mt-2 flex items-center gap-1 rounded-full border border-line bg-surface p-1 pl-4 transition-shadow focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15"
      >
        <label className="flex-1">
          <span className="sr-only">{t('chat.placeholder')}</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={LIMITS.chatMax}
            placeholder={t('chat.placeholder')}
            className="h-10 w-full bg-transparent outline-none focus-visible:outline-none"
            data-testid="chat-input"
          />
        </label>
        <IconButton
          label={t('chat.send')}
          type="submit"
          className={cx(
            'shrink-0 rounded-full transition-opacity',
            'bg-accent text-on-accent hover:bg-accent hover:text-on-accent',
            !text.trim() && 'opacity-50',
          )}
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
      className="mb-1 flex items-center gap-1.5 px-1 text-xs font-bold"
      style={{ color: line.color ? `var(--${line.color}-dark)` : 'var(--text-muted)' }}
    >
      {line.color && (
        <span className="size-2 rounded-full" style={{ background: pieceColor(line.color as never) }} aria-hidden />
      )}
      <span data-testid="chat-name">{line.name}</span>
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
