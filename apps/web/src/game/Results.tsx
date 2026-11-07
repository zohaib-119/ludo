/** Results (docs/01-product-and-ux.md §4.4): podium, stats, rematch. */
import type { Color } from '@ludo/engine';
import type { PlayerStats } from '@ludo/protocol';
import { Check, LogOut, RotateCcw, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { lastRoom } from '../lib/identity';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { Avatar, Button, cx, pieceColor } from '../ui/kit';
import { ordinal } from './log';

const STAT_KEYS = ['captures', 'lost', 'sixes', 'voids'] as const satisfies ReadonlyArray<keyof PlayerStats>;
/** Columns hidden on narrow phones so the table fits without scrolling. */
const WIDE_ONLY = new Set<keyof PlayerStats>(['voids']);

export function Results() {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const navigate = useNavigate();
  const game = view.game!;
  const host = view.hostId === memberId;
  const me = view.members.find((m) => m.id === memberId);
  const voted = memberId !== null && view.rematchVotes.includes(memberId);
  const voters = view.members.filter((m) => m.seat && m.connected);
  const name = (c: Color) => view.seats[c]?.name ?? c;

  const order: Color[] = game.winningTeam
    ? [...game.winningTeam, ...game.seats.filter((c) => !game.winningTeam!.includes(c))]
    : game.rankings.length > 0
      ? [...game.rankings, ...game.seats.filter((c) => !game.rankings.includes(c))]
      : [...game.seats];

  const title = game.endedByHost
    ? t('game.finished')
    : game.winningTeam
      ? t('results.teamWins', { team: game.winningTeam[0] === 'red' || game.winningTeam[0] === 'yellow' ? 'A' : 'B' })
      : t('results.winner', { name: name(order[0]!) });

  const leave = async () => {
    await getConnection().leave();
    lastRoom.set(null);
    navigate('/');
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-y-auto bg-bg/90 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('results.title')}
      data-testid="results"
    >
      {!game.endedByHost && <Confetti />}
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
        <motion.h1
          className="text-center font-display text-3xl font-extrabold sm:text-4xl"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          {title}
        </motion.h1>
        {game.endedByHost && <p className="text-center text-muted">{t('results.endedByHost')}</p>}

        {/* Podium: 2nd, 1st, 3rd */}
        {!game.endedByHost && !game.winningTeam && (
          <div className="flex items-end justify-center gap-3">
            {[order[1], order[0], order[2]].map((c, i) =>
              c ? (
                <motion.div
                  key={c}
                  className="flex w-24 flex-col items-center"
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + [0.15, 0, 0.3][i]!, type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <Avatar emoji={view.seats[c]?.avatar ?? '🤖'} color={c} size={i === 1 ? 60 : 48} />
                  <p className="mt-1 w-full truncate text-center font-display font-bold">{name(c)}</p>
                  <div
                    className="mt-1 flex w-full items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-extrabold text-white"
                    style={{ height: [72, 104, 52][i], background: pieceColor(c) }}
                  >
                    {ordinal([2, 1, 3][i]!)}
                  </div>
                </motion.div>
              ) : (
                <div key={i} className="w-24" />
              ),
            )}
          </div>
        )}

        {game.winningTeam && (
          <div className="flex justify-center gap-4">
            {game.winningTeam.map((c) => (
              <div key={c} className="flex flex-col items-center">
                <Avatar emoji={view.seats[c]?.avatar ?? '🤖'} color={c} size={60} />
                <p className="mt-1 font-display font-bold">{name(c)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2 text-left font-bold" />
                {STAT_KEYS.map((k) => (
                  <th
                    key={k}
                    className={cx('px-2 py-2 text-right font-bold', WIDE_ONLY.has(k) && 'hidden sm:table-cell')}
                  >
                    {t(`results.stats.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((c, i) => (
                <tr key={c} className="border-t border-line">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: pieceColor(c) }} />
                      {!game.winningTeam && game.rankings.includes(c) && (
                        <span className="text-muted">{ordinal(i + 1)}</span>
                      )}
                      <span className="truncate">{name(c)}</span>
                    </span>
                  </td>
                  {STAT_KEYS.map((k) => (
                    <td
                      key={k}
                      className={cx('px-2 py-2 text-right tabular-nums', WIDE_ONLY.has(k) && 'hidden sm:table-cell')}
                    >
                      {game.stats[c]?.[k] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          {me?.seat && (
            <Button
              size="lg"
              full
              variant={voted ? 'secondary' : 'primary'}
              icon={voted ? <Check className="size-5 text-success" /> : <RotateCcw className="size-5" />}
              onClick={() => void sendCommand({ type: 'rematchVote', yes: !voted })}
              data-testid="play-again"
            >
              {voted ? t('results.waitingVotes') : t('results.playAgain')}
            </Button>
          )}
          {view.rematchVotes.length > 0 && (
            <p className="text-center text-sm text-muted">
              {t('results.votes', { n: view.rematchVotes.length, total: voters.length })}
            </p>
          )}
          <div className="flex gap-2">
            {host && (
              <Button
                variant="secondary"
                full
                icon={<Undo2 className="size-4" />}
                onClick={() => void sendCommand({ type: 'backToLobby' })}
              >
                {t('results.backToLobby')}
              </Button>
            )}
            <Button variant="ghost" full icon={<LogOut className="size-4" />} onClick={leave}>
              {t('room.leave')}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Lightweight confetti: a few dozen coloured bits falling once. */
function Confetti() {
  const colors = ['var(--red)', 'var(--green)', 'var(--yellow)', 'var(--blue)'];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 48 }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 12) * 0.08;
        const rotate = (i * 47) % 360;
        return (
          <motion.span
            key={i}
            className={cx('absolute top-0 block h-3 w-2 rounded-sm')}
            style={{ left: `${left}%`, background: colors[i % 4] }}
            initial={{ y: -40, rotate, opacity: 1 }}
            animate={{ y: '105vh', rotate: rotate + 540, opacity: [1, 1, 0] }}
            transition={{ duration: 2.4 + (i % 5) * 0.3, delay, ease: 'easeIn' }}
          />
        );
      })}
    </div>
  );
}
