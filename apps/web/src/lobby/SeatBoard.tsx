import type { Color } from '@ludo/engine';
import type { RoomView, SeatView } from '@ludo/protocol';
import { Bot, Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { t } from '../i18n/messages';
import { sendCommand } from '../net/commands';
import { Avatar, Badge, Dot, cx, pieceColor } from '../ui/kit';
import { isHost, teamOf } from './logic';

/** Canonical board corners: green top-left, yellow top-right, red bottom-left, blue bottom-right. */
const CORNERS: Color[] = ['green', 'yellow', 'red', 'blue'];

const OUTER_CORNER: Record<Color, string> = {
  green: 'left-2 top-2',
  yellow: 'right-2 top-2',
  red: 'bottom-2 left-2',
  blue: 'bottom-2 right-2',
};

/** The host's remove button goes in the other outer corner of the tile. */
const REMOVE_CORNER: Record<Color, string> = {
  green: 'right-1.5 top-1.5',
  yellow: 'left-1.5 top-1.5',
  red: 'bottom-1.5 right-1.5',
  blue: 'bottom-1.5 left-1.5',
};

const tint: Record<Color, string> = {
  red: 'var(--red-light)',
  green: 'var(--green-light)',
  yellow: 'var(--yellow-light)',
  blue: 'var(--blue-light)',
};

export function SeatBoard({
  view,
  memberId,
  className,
}: {
  view: RoomView;
  memberId: string | null;
  className?: string;
}) {
  const host = isHost(view, memberId);
  const mySeat = view.members.find((m) => m.id === memberId)?.seat ?? null;

  return (
    <div
      className={cx(
        'relative mx-auto grid aspect-square w-full max-w-[340px] grid-cols-2 grid-rows-2 gap-2.5',
        className,
      )}
      data-testid="seat-board"
    >
      {CORNERS.map((color) => (
        <SeatTile
          key={color}
          color={color}
          seat={view.seats[color]}
          mine={mySeat === color}
          host={host}
          hostId={view.hostId}
          teamMode={view.settings.teamMode}
          ready={view.members.find((m) => m.seat === color)?.ready ?? false}
        />
      ))}
      {/* Board centre: the four home triangles. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rotate-45 overflow-hidden rounded-xl shadow-card ring-4 ring-bg sm:size-16">
        <div className="grid size-full grid-cols-2">
          <span style={{ background: pieceColor('green') }} />
          <span style={{ background: pieceColor('yellow') }} />
          <span style={{ background: pieceColor('red') }} />
          <span style={{ background: pieceColor('blue') }} />
        </div>
      </div>
    </div>
  );
}

function SeatTile({
  color,
  seat,
  mine,
  host,
  hostId,
  teamMode,
  ready,
}: {
  color: Color;
  seat: SeatView | undefined;
  mine: boolean;
  host: boolean;
  hostId: string | null;
  teamMode: boolean;
  ready: boolean;
}) {
  const empty = !seat;
  const label = `${color} seat`;
  const take = () => void sendCommand({ type: 'takeSeat', color });

  return (
    <motion.div
      layout
      className={cx(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-[3px] p-2.5 sm:p-3',
        empty ? 'border-dashed' : 'border-solid shadow-card',
        mine && 'ring-4 ring-accent/60',
      )}
      style={{ borderColor: pieceColor(color), background: empty ? 'var(--surface)' : tint[color] }}
      data-testid={`seat-${color}`}
    >
      {/* Colour marker in the tile's outer corner, away from the board centre. */}
      <span
        className={cx('piece absolute size-3.5', OUTER_CORNER[color])}
        style={{ ['--piece' as string]: pieceColor(color) }}
        aria-hidden
      />

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={take}
            aria-label={`${t('lobby.tapToSit')}: ${label}`}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            {t('lobby.tapToSit')}
          </button>
          {host && (
            <button
              type="button"
              onClick={() => void sendCommand({ type: 'addBot', color })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
              data-testid={`add-bot-${color}`}
            >
              <Bot className="size-3.5" /> {t('lobby.addBot')}
            </button>
          )}
          {teamMode && <Badge tone="neutral">{teamOf(color) === 'A' ? t('lobby.teamA') : t('lobby.teamB')}</Badge>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
          <div className="relative">
            <Avatar avatar={seat.avatar} size={36} />
            {!seat.isBot && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <Dot tone={seat.connected ? 'online' : 'offline'} />
              </span>
            )}
          </div>
          <p className="w-full truncate px-1 font-display text-sm leading-tight font-bold" title={seat.name}>
            {seat.name}
          </p>
          <div className="flex flex-wrap justify-center gap-1">
            {teamMode && <Badge tone="neutral">{teamOf(color) === 'A' ? t('lobby.teamA') : t('lobby.teamB')}</Badge>}
            {mine && <Badge tone="accent">{t('lobby.you')}</Badge>}
            {seat.memberId === hostId && <Badge>{t('lobby.host')}</Badge>}
            {seat.isBot && <Badge>{t('lobby.bot')}</Badge>}
            {!seat.isBot && seat.memberId !== hostId && (
              <Badge tone={ready ? 'success' : 'neutral'}>
                {ready ? (
                  <>
                    <Check className="mr-0.5 size-3" />
                    {t('lobby.ready')}
                  </>
                ) : (
                  t('lobby.notReady')
                )}
              </Badge>
            )}
            {!seat.isBot && !seat.connected && <Badge tone="warning">{t('lobby.offline')}</Badge>}
          </div>
        </div>
      )}

      {/* ✕: the host can clear any seat; everyone can leave their own. */}
      {!empty && (host || mine) && (
        <button
          type="button"
          onClick={() => void sendCommand(mine ? { type: 'leaveSeat' } : { type: 'removeSeat', color })}
          aria-label={mine ? t('lobby.leaveSeat') : `${t('lobby.remove')}: ${seat.name}`}
          data-testid={`seat-x-${color}`}
          className={cx(
            'absolute inline-flex size-7 items-center justify-center rounded-full bg-surface/80 text-muted hover:bg-surface hover:text-danger',
            REMOVE_CORNER[color],
          )}
        >
          <X className="size-4" />
        </button>
      )}
    </motion.div>
  );
}
