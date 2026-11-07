/**
 * Service worker UI: a "new version" prompt (never reloads by itself, so a game
 * is never interrupted) and an "offline" pill. The worker itself is generated at
 * build time by vite-plugin-pwa (app shell and assets cached for instant, offline starts).
 */
import { RefreshCw, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../i18n/messages';
import { Button } from '../ui/kit';

/** Check for a new version every hour while the app stays open. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });
  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          role="status"
          className="fixed inset-x-0 bottom-4 z-[60] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-text py-2 pr-2 pl-4 text-sm font-medium text-bg shadow-lift"
          data-testid="update-prompt"
        >
          <RefreshCw className="size-4 shrink-0" />
          {t('pwa.updateReady')}
          <Button size="sm" onClick={() => void updateServiceWorker(true)}>
            {t('pwa.reload')}
          </Button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-bg/70 hover:text-bg"
            onClick={() => setNeedRefresh(false)}
          >
            {t('pwa.later')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflinePill() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          role="status"
          className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-text px-4 py-1.5 text-sm font-semibold text-bg shadow-lift"
          data-testid="offline-pill"
        >
          <WifiOff className="size-4" />
          {t('pwa.offline')}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
