import { RefreshCw, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { t } from '../i18n/messages';
import { getConnection, useConnection } from '../net/session';
import { Button } from '../ui/kit';

/**
 * "Reconnecting…" pill; after 10 s (or at once when the server restarted) a
 * dimmed overlay that says what is going on, when the next try is, and Retry.
 */
export function ConnectionBanner() {
  const status = useConnection((s) => s.status);
  const since = useConnection((s) => s.reconnectingSince);
  const nextRetryAt = useConnection((s) => s.nextRetryAt);
  const restoring = useConnection((s) => s.restoring);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'reconnecting') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status]);
  const reconnecting = status === 'reconnecting';
  const long = reconnecting && (restoring || (since !== null && now - since > 10_000));
  const secondsToRetry = nextRetryAt !== null ? Math.ceil((nextRetryAt - now) / 1000) : null;

  return (
    <>
      <AnimatePresence>
        {reconnecting && !long && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            role="status"
            className="fixed inset-x-0 top-3 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-warning px-4 py-1.5 text-sm font-semibold text-black shadow-lift"
          >
            <span className="size-2 animate-pulse rounded-full bg-black/60" />
            {t('room.reconnecting')}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {long && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alertdialog"
            aria-label={restoring ? t('room.restoring') : t('room.stillTrying')}
            className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-6 backdrop-blur-sm"
            data-testid="connection-overlay"
          >
            <div className="flex max-w-xs flex-col items-center gap-3 text-center">
              {restoring ? (
                <RefreshCw className="size-10 animate-spin text-accent [animation-duration:1.6s]" />
              ) : (
                <WifiOff className="size-10 text-warning" />
              )}
              <p className="font-display text-xl font-bold">
                {restoring ? t('room.restoring') : t('room.stillTrying')}
              </p>
              <p className="text-sm text-muted">{restoring ? t('room.restoringBody') : t('room.stillTryingBody')}</p>
              {!restoring && (
                <>
                  <p className="text-xs font-semibold text-muted tabular-nums" aria-live="off">
                    {secondsToRetry !== null && secondsToRetry > 0
                      ? t('room.nextTry', { s: secondsToRetry })
                      : t('room.tryingNow')}
                  </p>
                  <Button onClick={() => getConnection().retryNow()}>{t('room.retryNow')}</Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
