/**
 * "Install app": browsers that support it (Chrome, Edge, Android) fire
 * beforeinstallprompt; we keep that event so a button can show the prompt later.
 * iOS has no prompt (Share → Add to Home Screen), so no button there.
 */
import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallStore {
  event: BeforeInstallPromptEvent | null;
  installed: boolean;
}

export const useInstall = create<InstallStore>(() => ({ event: null, installed: false }));

/** True when running as an installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let listening = false;
export function listenForInstall(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    useInstall.setState({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ event: null, installed: true }));
}

/** Show the browser's install dialog. Resolves true if the player installed. */
export async function promptInstall(): Promise<boolean> {
  const { event } = useInstall.getState();
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  useInstall.setState({ event: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}
