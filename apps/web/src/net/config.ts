/** Where the game server lives (HTTP origin; the SDK derives the WebSocket URL). */
export function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:2567`;
  return window.location.origin;
}

export function roomLink(code: string): string {
  return `${window.location.origin}/r/${code}`;
}
