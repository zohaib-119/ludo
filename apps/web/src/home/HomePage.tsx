/**
 * Landing page: one screen, no scrolling. Creating and joining happen in their
 * own dialogs, opened from the two main buttons.
 */
import { type Color, pointFor } from '@ludo/engine';
import { AVATARS, LIMITS, parseRoomCode } from '@ludo/protocol';
import { ArrowRight, BookOpen, LogIn, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BoardArt, BoardDefs } from '../game/BoardArt';
import { Die } from '../game/Dice';
import { t } from '../i18n/messages';
import { type Profile, isValidName, lastRoom, loadProfile, playerToken, saveProfile } from '../lib/identity';
import { storagePersists } from '../lib/storage';
import { serverUrl } from '../net/config';
import { getConnection } from '../net/session';
import { Avatar, Button, Sheet, TextField, cx } from '../ui/kit';
import { toast } from '../ui/toast';

type Dialog = 'create' | 'join' | null;

export function HomePage() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [continueCode, setContinueCode] = useState<string | null>(null);

  // "Continue game": only if the last room still exists on the server.
  useEffect(() => {
    const last = lastRoom.get();
    if (!last) return;
    const ctrl = new AbortController();
    fetch(`${serverUrl()}/api/rooms/${last}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((info: { exists: boolean }) => (info.exists ? setContinueCode(last) : lastRoom.set(null)))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <Backdrop />

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center gap-[clamp(0.9rem,3.2vh,2rem)] px-6 text-center">
        <Hero />
        <div>
          <h1 className="font-display text-[clamp(2.3rem,6.5vh,3.75rem)] leading-none font-extrabold tracking-tight">
            Do<span className="text-accent">Dice</span> Ludo
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-[clamp(0.95rem,2vh,1.1rem)] text-balance text-muted">
            {t('tagline')}
          </p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button
            size="lg"
            full
            icon={<Plus className="size-5" />}
            onClick={() => setDialog('create')}
            data-testid="open-create"
          >
            {t('home.create')}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            full
            icon={<LogIn className="size-5" />}
            onClick={() => setDialog('join')}
            data-testid="open-join"
          >
            {t('home.joinTitle')}
          </Button>
        </div>

        {continueCode && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate(`/r/${continueCode}`)}
            className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:brightness-95"
          >
            {t('home.continueBody', { code: continueCode })}
            <ArrowRight className="size-4" />
          </motion.button>
        )}
      </section>

      <footer
        className="relative z-10 flex flex-col items-center gap-1 px-6 text-sm"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Link
          to="/how-to-play"
          className="inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline"
        >
          <BookOpen className="size-4" /> {t('help.link')}
        </Link>
        <span className="text-muted">{t('home.features')}</span>
      </footer>

      <PlayDialog mode="create" open={dialog === 'create'} onClose={() => setDialog(null)} />
      <PlayDialog mode="join" open={dialog === 'join'} onClose={() => setDialog(null)} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Hero: the board, a few pieces and two dice you can roll
// ---------------------------------------------------------------------------

const HERO_PIECES: Array<{ color: Color; progress: number; slot?: number }> = [
  { color: 'red', progress: 6 },
  { color: 'green', progress: 9 },
  { color: 'yellow', progress: 53 },
  { color: 'blue', progress: 2 },
  { color: 'red', progress: -1, slot: 1 },
  { color: 'green', progress: -1, slot: 2 },
  { color: 'yellow', progress: -1, slot: 0 },
  { color: 'blue', progress: -1, slot: 3 },
];

function Hero() {
  const [dice, setDice] = useState(() => [
    { id: 1, value: 6 },
    { id: 2, value: 6 },
  ]);
  const roll = () => setDice((d) => d.map((x) => ({ id: x.id + 2, value: 1 + Math.floor(Math.random() * 6) })));

  return (
    <div className="relative w-[min(64vw,34vh,300px)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: -4 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        className="overflow-hidden rounded-[1.4rem] shadow-lift ring-1 ring-line"
      >
        <svg viewBox="-0.25 -0.25 15.5 15.5" className="block w-full" role="img" aria-label="Ludo board">
          <BoardDefs />
          <BoardArt />
          {HERO_PIECES.map((p, i) => {
            const pt = pointFor(p.color, p.progress, p.slot ?? 0);
            return (
              <g key={i} transform={`translate(${pt.x} ${pt.y})`}>
                <ellipse cx={0.03} cy={0.27} rx={0.32} ry={0.12} fill="black" opacity={0.18} />
                <circle r={0.36} fill={`url(#piece-${p.color})`} />
                <circle r={0.15} fill="white" opacity={0.3} />
              </g>
            );
          })}
        </svg>
      </motion.div>
      <button
        type="button"
        onClick={roll}
        aria-label={t('home.rollDice')}
        className="absolute -right-5 -bottom-5 flex gap-2 rounded-2xl p-1 transition-transform hover:scale-105 active:scale-95"
        data-testid="hero-dice"
      >
        {dice.map((d) => (
          <Die key={d.id} id={d.id} value={d.value} rolling color={null} size={44} />
        ))}
      </button>
    </div>
  );
}

/** Soft coloured light behind the page, one tint per player colour. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute -top-24 -left-24 size-80 rounded-full bg-red/15 blur-3xl" />
      <div className="absolute -top-16 -right-24 size-80 rounded-full bg-yellow/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 size-80 rounded-full bg-green/15 blur-3xl" />
      <div className="absolute -right-20 -bottom-28 size-96 rounded-full bg-blue/15 blur-3xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / Join dialogs
// ---------------------------------------------------------------------------

function PlayDialog({ mode, open, onClose }: { mode: 'create' | 'join'; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [persists] = useState(storagePersists);

  // Re-read the saved profile whenever the dialog opens (the other dialog may have changed it).
  useEffect(() => {
    if (open) setProfile(loadProfile());
  }, [open]);

  const commit = (p: Profile) => {
    setProfile(p);
    saveProfile({ ...p, name: p.name.trim() });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nameOk = isValidName(profile.name);
    if (!nameOk) setNameError(t('home.nameHint', { min: LIMITS.nameMin, max: LIMITS.nameMax }));
    if (mode === 'join') {
      const parsed = parseRoomCode(code);
      if (!parsed) setCodeError(t('home.codeInvalid'));
      if (parsed && nameOk) navigate(`/r/${parsed}`);
      return;
    }
    if (!nameOk) return;
    setBusy(true);
    const conn = getConnection();
    await conn.connect(null, { playerToken: playerToken(), name: profile.name.trim(), avatar: profile.avatar });
    setBusy(false);
    const { status, code: created } = conn.state;
    if (status === 'connected' && created) navigate(`/r/${created}`);
    else toast(t('room.errorBody'), 'danger');
  };

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'create' ? t('home.createTitle') : t('home.joinTitle')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <p className="mb-2 text-sm font-semibold text-muted">{t('home.pickAvatar')}</p>
          <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label={t('home.pickAvatar')}>
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={a === profile.avatar}
                aria-label={a}
                onClick={() => commit({ ...profile, avatar: a })}
                className={cx(
                  'flex aspect-square items-center justify-center rounded-xl text-xl transition-transform hover:scale-105 active:scale-95',
                  a === profile.avatar ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2',
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <Avatar emoji={profile.avatar} size={48} />
          <div className="flex-1">
            <TextField
              id={`player-name-${mode}`}
              label={t('home.yourName')}
              placeholder={t('home.namePlaceholder')}
              value={profile.name}
              maxLength={LIMITS.nameMax}
              autoComplete="nickname"
              error={nameError}
              onChange={(e) => {
                setNameError(null);
                commit({ ...profile, name: e.target.value });
              }}
            />
          </div>
        </div>

        {mode === 'join' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-muted">{t('home.codePlaceholder')}</span>
            <input
              value={code}
              onChange={(e) => {
                setCodeError(null);
                setCode(e.target.value.toUpperCase());
              }}
              placeholder="K7QX9M"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={codeError ? true : undefined}
              className={cx(
                'room-code h-14 w-full rounded-2xl border bg-surface-2 px-4 text-center text-2xl uppercase outline-none transition-colors placeholder:text-muted/40 focus:border-accent focus:bg-surface',
                codeError ? 'border-danger' : 'border-transparent',
              )}
              data-testid="join-code"
            />
            {codeError && <span className="mt-1.5 block text-xs text-danger">{codeError}</span>}
          </label>
        )}

        {!persists && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">{t('home.storageWarning')}</p>
        )}

        <Button
          type="submit"
          size="lg"
          full
          loading={busy}
          data-testid={mode === 'create' ? 'create-submit' : 'join-submit'}
        >
          {mode === 'create' ? (busy ? t('home.creating') : t('home.create')) : t('home.join')}
        </Button>
      </form>
    </Sheet>
  );
}
