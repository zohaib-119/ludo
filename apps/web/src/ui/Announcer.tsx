/** Screen-reader announcements (docs/02-visual-design.md §9): one polite live region. */
import { create } from 'zustand';

interface AnnouncerStore {
  text: string;
  /** Changes on every announcement so repeating the same text is still read out. */
  key: number;
  say(text: string): void;
}

export const useAnnouncer = create<AnnouncerStore>((set) => ({
  text: '',
  key: 0,
  say: (text) => set((s) => ({ text, key: s.key + 1 })),
}));

export const announce = (text: string) => useAnnouncer.getState().say(text);

export function Announcer() {
  const text = useAnnouncer((s) => s.text);
  const key = useAnnouncer((s) => s.key);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
      <span key={key}>{text}</span>
    </div>
  );
}
