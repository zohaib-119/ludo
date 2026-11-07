import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { t } from '../i18n/messages';
import { getConnection, useConnection } from '../net/session';
import { Button } from '../ui/kit';

/** "Reconnecting…" pill; after 10 s a dimmed overlay with Retry (docs/01 §5). */
export function ConnectionBanner() {
  const status = useConnection((s) => s.status);
  const since = useConnection((s) => s.reconnectingSince);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status !== 'reconnecting') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);
  const reconnecting = status === 'reconnecting';
  const long = reconnecting && since !== null && now - since > 10_000;

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
            aria-label={t('room.stillTrying')}
            className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-6 backdrop-blur-sm"
          >
            <div className="flex max-w-xs flex-col items-center gap-4 text-center">
              <WifiOff className="size-10 text-warning" />
              <p className="font-display text-xl font-bold">{t('room.stillTrying')}</p>
              <Button onClick={() => getConnection().retryNow()}>{t('room.retryNow')}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
