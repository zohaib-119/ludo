import { AVATARS, LIMITS, parseRoomCode } from '@ludo/protocol';
import { ArrowRight, BookOpen, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { type Profile, isValidName, lastRoom, loadProfile, playerToken, saveProfile } from '../lib/identity';
import { type Theme, useSettings } from '../lib/settings';
import { storagePersists } from '../lib/storage';
import { serverUrl } from '../net/config';
import { getConnection } from '../net/session';
import { Avatar, Button, Card, Logo, Segmented, Sheet, TextField, cx } from '../ui/kit';
import { toast } from '../ui/toast';

export function HomePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [continueCode, setContinueCode] = useState<string | null>(null);
  const [persists] = useState(storagePersists);

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

  const requireName = (): boolean => {
    if (isValidName(profile.name)) return true;
    setNameError(t('home.nameHint', { min: LIMITS.nameMin, max: LIMITS.nameMax }));
    document.getElementById('player-name')?.focus();
    return false;
  };

  const commitProfile = (p: Profile) => {
    setProfile(p);
    saveProfile({ ...p, name: p.name.trim() });
  };

  const create = async () => {
    if (!requireName()) return;
    setCreating(true);
    const conn = getConnection();
    await conn.connect(null, { playerToken: playerToken(), name: profile.name.trim(), avatar: profile.avatar });
    setCreating(false);
    const { status, code: created } = conn.state;
    if (status === 'connected' && created) navigate(`/r/${created}`);
    else toast(t('room.errorBody'), 'danger');
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseRoomCode(code);
    if (!parsed) {
      setCodeError(t('home.codeInvalid'));
      return;
    }
    if (!requireName()) return;
    navigate(`/r/${parsed}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-10 sm:pt-16">
      <header className="mb-8 flex flex-col items-center text-center">
        <motion.div initial={{ rotate: -45 }} animate={{ rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}>
          <Logo size={72} />
        </motion.div>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">
          Do<span className="text-accent">Dice</span> Ludo
        </h1>
        <p className="mt-2 max-w-xs text-balance text-muted">{t('tagline')}</p>
      </header>

      {continueCode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t('home.continueTitle')}</p>
              <p className="text-sm text-muted">{t('home.continueBody', { code: continueCode })}</p>
            </div>
            <Button size="sm" onClick={() => navigate(`/r/${continueCode}`)} icon={<ArrowRight className="size-4" />}>
              {t('home.continue')}
            </Button>
          </Card>
        </motion.div>
      )}

      <Card className="space-y-5">
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            className="group relative rounded-full transition-transform active:scale-95"
            aria-label={t('home.pickAvatar')}
          >
            <Avatar emoji={profile.avatar} size={52} />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent ring-2 ring-surface">
              ✎
            </span>
          </button>
          <div className="flex-1">
            <TextField
              id="player-name"
              label={t('home.yourName')}
              placeholder={t('home.namePlaceholder')}
              value={profile.name}
              maxLength={LIMITS.nameMax}
              autoComplete="nickname"
              error={nameError}
              onChange={(e) => {
                setNameError(null);
                commitProfile({ ...profile, name: e.target.value });
              }}
            />
          </div>
        </div>

        <Button size="lg" full onClick={create} loading={creating} icon={<Plus className="size-5" />}>
          {creating ? t('home.creating') : t('home.create')}
        </Button>

        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
          <span className="h-px flex-1 bg-line" />
          {t('home.joinTitle')}
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={join} className="flex gap-2" noValidate>
          <label className="flex-1">
            <span className="sr-only">{t('home.codePlaceholder')}</span>
            <input
              value={code}
              onChange={(e) => {
                setCodeError(null);
                setCode(e.target.value.toUpperCase());
              }}
              placeholder={t('home.codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={codeError ? true : undefined}
              className={cx(
                'room-code h-14 w-full rounded-2xl border bg-surface-2 px-4 text-center text-xl uppercase outline-none transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-muted/70 focus:border-accent focus:bg-surface',
                codeError ? 'border-danger' : 'border-transparent',
              )}
            />
          </label>
          <Button type="submit" variant="secondary" size="lg" className="px-5">
            {t('home.join')}
          </Button>
        </form>
        {codeError && <p className="-mt-3 text-xs text-danger">{codeError}</p>}
      </Card>

      {!persists && <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{t('home.storageWarning')}</p>}

      <footer className="mt-auto flex flex-col items-center gap-4 pt-10">
        <Link to="/how-to-play" className="inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline">
          <BookOpen className="size-4" /> {t('help.link')}
        </Link>
        <ThemeSwitch />
      </footer>

      <Sheet open={avatarOpen} onClose={() => setAvatarOpen(false)} title={t('home.pickAvatar')}>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                commitProfile({ ...profile, avatar: a });
                setAvatarOpen(false);
              }}
              aria-pressed={a === profile.avatar}
              className={cx(
                'flex aspect-square items-center justify-center rounded-2xl text-2xl transition-transform hover:scale-105 active:scale-95',
                a === profile.avatar ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2',
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </Sheet>
    </main>
  );
}

export function ThemeSwitch() {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  return (
    <div className="w-64">
      <Segmented<Theme>
        label={t('settings.theme')}
        size="sm"
        value={theme}
        onChange={(v) => update({ theme: v })}
        options={(['system', 'light', 'dark'] as Theme[]).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
      />
    </div>
  );
}
