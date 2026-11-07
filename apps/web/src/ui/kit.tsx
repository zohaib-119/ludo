/**
 * Design-system components (docs/02-visual-design.md). Small, token-driven,
 * accessible: real buttons, labelled switches, focus rings, 44px targets.
 */
import type { Color } from '@ludo/engine';
import { Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/messages';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[0_2px_0_var(--accent-strong)] hover:brightness-105 active:translate-y-px active:shadow-none',
  secondary: 'bg-surface text-text border border-line shadow-soft hover:bg-surface-2 active:translate-y-px',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-105 active:translate-y-px',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-14 px-6 text-lg gap-2.5 rounded-2xl font-display font-bold tracking-wide',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[transform,filter,background-color,box-shadow] duration-150 disabled:opacity-50',
        variantClass[variant],
        sizeClass[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-[1.1em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5', className)} {...rest}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-lg font-bold leading-none">{children}</h2>
      {aside}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }
>(function TextField({ label, hint, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={cx(
          'h-12 w-full rounded-xl border bg-surface-2 px-4 text-base text-text outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:bg-surface',
          error ? 'border-danger' : 'border-transparent',
          className,
        )}
        {...rest}
      />
      {(error || hint) && (
        <p id={noteId} className={cx('mt-1.5 text-xs', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-surface-3',
        disabled && 'cursor-not-allowed opacity-50 saturate-50',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cx('size-5 rounded-full bg-white shadow-soft', checked ? 'ml-6' : 'ml-1')}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange?: (v: T) => void;
  disabled?: boolean;
  label: string;
  size?: 'sm' | 'md';
}) {
  const group = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cx('flex rounded-xl bg-surface-2 p-1', disabled && 'cursor-not-allowed opacity-55 saturate-50')}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange?.(o.value)}
            className={cx(
              'relative flex-1 whitespace-nowrap rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
              active ? 'text-text' : 'text-muted hover:text-text',
              disabled && !active && 'hover:text-muted',
              disabled && 'cursor-not-allowed',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-lg bg-surface shadow-soft"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet: bottom sheet on phones, centred dialog on larger screens.
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** A wider dialog on larger screens (e.g. the appearance picker). */
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={cx(
              'relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-lift sm:rounded-3xl',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
            )}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">{title}</h2>
              <IconButton label={t('close')} onClick={onClose} className="-mr-2">
                <X className="size-5" />
              </IconButton>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Identity bits
// ---------------------------------------------------------------------------

const colorVar: Record<Color, string> = {
  red: 'var(--red)',
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  blue: 'var(--blue)',
};
export const pieceColor = (c: Color) => colorVar[c];

export function Avatar({ emoji, color, size = 40 }: { emoji: string; color?: Color; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        boxShadow: color ? `0 0 0 3px ${colorVar[color]}` : undefined,
      }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
}) {
  const toneClass = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
  }[tone];
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold uppercase tracking-wide',
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: 'online' | 'offline' | 'reconnecting' }) {
  const cls = { online: 'bg-success', offline: 'bg-muted', reconnecting: 'bg-warning animate-pulse' }[tone];
  return <span className={cx('inline-block size-2.5 rounded-full ring-2 ring-surface', cls)} aria-hidden />;
}

/** Four glossy pieces in a diamond. */
export function Logo({ size = 56 }: { size?: number }) {
  const piece = (c: Color, x: number, y: number, i: number) => (
    <motion.span
      key={c}
      className="piece absolute"
      style={{
        ['--piece' as string]: colorVar[c],
        width: size * 0.36,
        height: size * 0.36,
        left: x * size,
        top: y * size,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.05 * i, type: 'spring', stiffness: 500, damping: 22 }}
    />
  );
  return (
    <span className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
      {piece('green', 0.32, 0.0, 0)}
      {piece('yellow', 0.64, 0.32, 1)}
      {piece('blue', 0.32, 0.64, 2)}
      {piece('red', 0.0, 0.32, 3)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-muted', className)} aria-hidden />;
}

export { cx };
