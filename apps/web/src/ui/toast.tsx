import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: Toast[];
  push(text: string, tone?: ToastTone, ms?: number): void;
  dismiss(id: number): void;
}

let nextId = 1;
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(text, tone = 'info', ms = 3200) {
    const id = nextId++;
    // Same text twice in a row: don't stack duplicates.
    if (get().toasts.some((x) => x.text === text)) return;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
}));

export const toast = (text: string, tone?: ToastTone) => useToasts.getState().push(text, tone);

const toneClass: Record<ToastTone, string> = {
  info: 'bg-text text-bg',
  success: 'bg-success text-white',
  warning: 'bg-warning text-black',
  danger: 'bg-danger text-white',
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-32 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-28"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={`pointer-events-auto max-w-sm rounded-full px-4 py-2 text-sm font-medium shadow-lift ${toneClass[x.tone]}`}
          >
            {x.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
