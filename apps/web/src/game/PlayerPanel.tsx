import { type Color, OPPOSITE } from '@ludo/engine';
import type { GameView, RoomView } from '@ludo/protocol';
import { Lock, LockOpen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSettings } from '../lib/settings';
import { useChat } from '../net/chat';
import { FloatingEmojis } from '../ui/ChatControls';
import { t } from '../i18n/messages';
import { Badge, cx, pieceColor } from '../ui/kit';
import { ordinal } from './log';
import { useNow } from './useNow';

const GLYPH: Record<Color, string> = { red: '●', green: '▲', yellow: '■', blue: '◆' };

export function PlayerPanel({
  color,
  view,
  game,
  progress,
  isMe,
  clockOffset,
  align,
}: {
  color: Color;
  view: RoomView;
  game: GameView;
  progress: Record<string, number>;
  isMe: boolean;
  clockOffset: number;
  align: 'left' | 'right';
}) {
  const seat = view.seats[color];
  const player = game.players[color];
  const active = game.turn.seat === color && game.turn.phase !== 'gameOver' && view.phase === 'playing';
  const home = game.pieces.filter((p) => p.color === color && (progress[p.id] ?? p.progress) === 56).length;
  const deadline = active ? game.turn.deadline : 0;
  const now = useNow(250, deadline > 0) + clockOffset;
  const total = view.settings.turnTimer * 1000;
  const left = deadline > 0 ? Math.max(0, deadline - now) : 0;
  const fraction = deadline > 0 && total > 0 ? left / total : 0;
  const out = player?.eliminated === true;
  const finished = player?.finishedRank != null && !out;
  const mate = view.settings.teamMode ? OPPOSITE[color] : null;
  const playingFor = finished && mate && active && game.turn.controls === mate;
  const memberId = seat?.memberId ?? null;
  const reactions = useChat((s) => s.reactions).filter((r) => memberId !== null && r.from === memberId);
  const bubble = useChat((s) => (memberId ? s.bubbles[memberId] : undefined));
  const colorBlind = useSettings((s) => s.colorBlindMarkers);

  return (
    <div
      className={cx(
        'relative flex min-w-0 items-center gap-2.5 rounded-2xl border bg-surface p-2 pr-3 shadow-soft transition-shadow',
        align === 'right' && 'flex-row-reverse text-right',
        active ? 'border-transparent' : 'border-line',
      )}
      style={active ? { boxShadow: `0 0 0 3px ${pieceColor(color)}, var(--shadow-card)` } : undefined}
      data-testid={`panel-${color}`}
      data-active={active || undefined}
    >
      <FloatingEmojis emojis={reactions} />
      <AnimatePresence>
        {bubble && (
          <motion.p
            key={bubble.id}
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            className={cx(
              'absolute top-full z-20 mt-1.5 max-w-[90%] truncate rounded-2xl bg-text px-3 py-1.5 text-xs font-medium text-bg shadow-lift',
              align === 'right' ? 'right-2' : 'left-2',
            )}
            data-testid={`bubble-${color}`}
          >
            {bubble.text}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="relative shrink-0">
        <span
          className="flex size-11 items-center justify-center rounded-full text-2xl"
          style={{ background: 'var(--surface-2)', boxShadow: `inset 0 0 0 3px ${pieceColor(color)}` }}
          aria-hidden
        >
          {seat?.avatar ?? '🤖'}
        </span>
        {deadline > 0 && (
          <svg viewBox="0 0 48 48" className="pointer-events-none absolute -inset-[2px] size-[48px] -rotate-90" aria-hidden>
            <circle
              cx="24"
              cy="24"
              r="22.5"
              fill="none"
              stroke={left < 5000 ? 'var(--danger)' : 'var(--text)'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 22.5}`}
              strokeDashoffset={`${2 * Math.PI * 22.5 * (1 - fraction)}`}
              style={{ transition: 'stroke-dashoffset 250ms linear' }}
            />
          </svg>
        )}
        {seat && !seat.isBot && (
          <span
            className={cx('absolute -bottom-0.5 size-3 rounded-full ring-2 ring-surface', seat.connected ? 'bg-success' : 'bg-muted', align === 'right' ? '-left-0.5' : '-right-0.5')}
            aria-label={seat.connected ? 'online' : t('lobby.offline')}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight">
          {colorBlind && (
            <span className="mr-1" style={{ color: pieceColor(color) }} aria-hidden>
              {GLYPH[color]}
            </span>
          )}
          {seat?.name ?? color}
          {isMe && <span className="ml-1 text-xs font-semibold text-accent">({t('lobby.you')})</span>}
        </p>
        <div className={cx('mt-1 flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="size-2.5 rounded-full"
              style={{ background: i < home ? pieceColor(color) : 'var(--surface-3)' }}
              aria-hidden
            />
          ))}
          <span className="sr-only">{home} of 4 home</span>
          {view.settings.killRequiredToEnterColumn && player && (
            <span className="ml-1 text-muted" title={player.hasKilled ? t('game.hasKill') : t('game.needsKill')}>
              {player.hasKilled ? <LockOpen className="size-3.5" aria-label={t('game.hasKill')} /> : <Lock className="size-3.5 text-danger" aria-label={t('game.needsKill')} />}
            </span>
          )}
        </div>
        <div className={cx('mt-1 flex flex-wrap gap-1', align === 'right' && 'justify-end')}>
          {finished && <Badge tone="success">{t('game.finishedBadge', { rank: ordinal(player.finishedRank!) })}</Badge>}
          {out && (
            <span title={t('game.outHelp')}>
              <Badge tone="warning">{t('game.outBadge')}</Badge>
            </span>
          )}
          {seat?.isBot && <Badge>{t('lobby.bot')}</Badge>}
          {seat?.autoplay && <Badge tone="warning">{t('game.autoplayOn')}</Badge>}
          {seat?.botControlled && !seat.autoplay && <Badge tone="warning">{t('lobby.bot')}</Badge>}
          {seat && !seat.isBot && !seat.connected && <Badge tone="warning">{t('lobby.offline')}</Badge>}
          {playingFor && mate && <Badge tone="accent">{t('game.playingFor', { name: view.seats[mate]?.name ?? mate })}</Badge>}
          {finished && (player?.handoverDelayLeft ?? 0) > 0 && <Badge>{t('game.waitingRounds', { n: player!.handoverDelayLeft })}</Badge>}
        </div>
      </div>
    </div>
  );
}
