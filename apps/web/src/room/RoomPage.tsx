import { LIMITS, type NoticeMessage, parseRoomCode } from '@ludo/protocol';
import { motion } from 'motion/react';
import { type FormEvent, type ReactNode, Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { type MessageKey, t } from '../i18n/messages';
import { isValidName, lastRoom, loadProfile, playerToken, saveProfile } from '../lib/identity';
import { LobbyPage } from '../lobby/LobbyPage';
import type { FailReason } from '../net/connection';
import { listenToChat, useChat } from '../net/chat';
import { getConnection, useConnection } from '../net/session';
import { Avatar, Button, Card, Logo, Spinner, TextField } from '../ui/kit';
import { toast } from '../ui/toast';
import { FloatingEmojis } from '../ui/ChatControls';
import { ConnectionBanner } from './ConnectionBanner';

// The game screen (board, dice, animations) loads only when a game starts.
const GameScreen = lazy(() => import('../game/GameScreen').then((m) => ({ default: m.GameScreen })));

export function RoomPage() {
  const params = useParams();
  const code = parseRoomCode(params.code ?? '');
  const [named, setNamed] = useState(() => isValidName(loadProfile().name));
  const status = useConnection((s) => s.status);
  const failure = useConnection((s) => s.failure);
  const kicked = useConnection((s) => s.kicked);
  const view = useConnection((s) => s.view);
  const connectedCode = useConnection((s) => s.code);

  // Join (or rejoin) this room unless we're already in it.
  useEffect(() => {
    if (!code || !named) return;
    const conn = getConnection();
    const { code: current, status: st } = conn.state;
    if (current === code && (st === 'connected' || st === 'connecting' || st === 'reconnecting')) return;
    const profile = loadProfile();
    void conn.connect(code, { playerToken: playerToken(), name: profile.name.trim(), avatar: profile.avatar });
  }, [code, named]);

  // Remember the room for "Continue game"; forget rooms that are gone.
  useEffect(() => {
    if (status === 'connected' && connectedCode) lastRoom.set(connectedCode);
    if (failure === 'ROOM_NOT_FOUND' || failure === 'ROOM_CLOSED') lastRoom.set(null);
  }, [status, connectedCode, failure]);

  useRoomNotices();

  // Chat and reactions for the whole room session (lobby, game and results).
  useEffect(() => {
    useChat.getState().reset();
    return listenToChat();
  }, [code]);

  if (!code) return <Failure reason="ROOM_NOT_FOUND" />;
  if (!named) return <NamePrompt code={code} onDone={() => setNamed(true)} />;
  if (status === 'failed' && failure) return <Failure reason={failure} />;
  if (status === 'kicked' && kicked) return <Kicked reason={kicked} />;
  if (!view || connectedCode !== code) {
    return (
      <Centered>
        <Spinner className="size-8" />
        <p className="text-muted">{t('room.connecting', { code })}</p>
      </Centered>
    );
  }
  return (
    <>
      <ConnectionBanner />
      {view.phase === 'lobby' || !view.game ? (
        <LobbyPage />
      ) : (
        <Suspense
          fallback={
            <Centered>
              <Spinner className="size-8" />
            </Centered>
          }
        >
          <GameScreen />
        </Suspense>
      )}
      <UnseatedReactions />
    </>
  );
}

/** Turn server notices into toasts (people joining, leaving, host changes…). */
function useRoomNotices() {
  useEffect(() => {
    const conn = getConnection();
    // Remember every name we've seen: a "left" notice arrives after the member is gone from the view.
    const names = new Map<string, string>();
    const remember = () => conn.state.view?.members.forEach((m) => names.set(m.id, m.name));
    remember();
    const offStore = conn.store.subscribe(remember);
    const nameOf = (id?: string) => (id ? (names.get(id) ?? '') : '');
    const offNotice = conn.on('notice', (n: NoticeMessage) => {
      const mine = n.memberId === conn.state.memberId;
      const name = nameOf(n.memberId);
      const playing = conn.state.view?.phase !== 'lobby';
      switch (n.code) {
        case 'memberJoined':
          if (!mine && name) toast(t('notice.joined', { name }));
          break;
        case 'memberLeft':
          if (!mine && name) toast(t('notice.left', { name }));
          break;
        case 'hostChanged':
          toast(mine ? t('notice.youAreHost') : t('notice.hostChanged', { name }), mine ? 'success' : 'info');
          break;
        case 'settingsChanged':
          if (conn.state.view?.hostId !== conn.state.memberId) toast(t('lobby.rulesChanged'), 'warning');
          break;
        case 'memberDisconnected':
          if (playing && !mine && name) toast(t('notice.disconnected', { name }), 'warning');
          break;
        case 'memberReconnected':
          if (playing && !mine && name) toast(t('notice.reconnected', { name }), 'success');
          break;
        default:
          break;
      }
    });
    const offBack = conn.on('backOnline', () => toast(t('room.backOnline'), 'success'));
    return () => {
      offStore();
      offNotice();
      offBack();
    };
  }, []);
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">{children}</main>;
}

const FAILURE_TEXT: Record<FailReason, [MessageKey, MessageKey]> = {
  ROOM_NOT_FOUND: ['room.notFoundTitle', 'room.notFoundBody'],
  ROOM_CLOSED: ['room.closedTitle', 'room.closedBody'],
  GAME_IN_PROGRESS: ['room.inProgressTitle', 'room.inProgressBody'],
  ROOM_FULL: ['room.fullTitle', 'room.fullBody'],
  NAME_INVALID: ['room.errorTitle', 'error.NAME_INVALID'],
  NETWORK: ['room.errorTitle', 'room.errorBody'],
};

function Failure({ reason }: { reason: FailReason }) {
  const navigate = useNavigate();
  const params = useParams();
  const [title, body] = FAILURE_TEXT[reason];
  const retryable = reason === 'NETWORK';
  return (
    <Centered>
      <Logo size={56} />
      <h1 className="font-display text-2xl font-extrabold">{t(title)}</h1>
      <p className="text-muted">{t(body, { max: LIMITS.maxMembers })}</p>
      <div className="flex gap-2">
        {retryable && (
          <Button
            onClick={() => {
              const p = loadProfile();
              const code = parseRoomCode(params.code ?? '');
              if (code) void getConnection().connect(code, { playerToken: playerToken(), name: p.name.trim(), avatar: p.avatar });
            }}
          >
            {t('room.tryAgain')}
          </Button>
        )}
        <Button variant={retryable ? 'secondary' : 'primary'} onClick={() => navigate('/')}>
          {t('room.home')}
        </Button>
      </div>
    </Centered>
  );
}

function Kicked({ reason }: { reason: 'otherTab' | 'removedByHost' | 'roomClosed' }) {
  const keys: Record<typeof reason, [MessageKey, MessageKey]> = {
    otherTab: ['room.otherTabTitle', 'room.otherTabBody'],
    removedByHost: ['room.removedTitle', 'room.removedBody'],
    roomClosed: ['room.closedTitle', 'room.closedBody'],
  };
  const [title, body] = keys[reason];
  return (
    <Centered>
      <Logo size={56} />
      <h1 className="font-display text-2xl font-extrabold">{t(title)}</h1>
      <p className="text-muted">{t(body)}</p>
      <div className="flex gap-2">
        {reason === 'otherTab' && <Button onClick={() => void getConnection().useHere()}>{t('room.useHere')}</Button>}
        <Link to="/" className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-accent hover:bg-surface-2">
          {t('room.home')}
        </Link>
      </div>
    </Centered>
  );
}

function NamePrompt({ code, onDone }: { code: string; onDone: () => void }) {
  const [profile, setProfile] = useState(loadProfile);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidName(profile.name)) {
      setError(t('home.nameHint', { min: LIMITS.nameMin, max: LIMITS.nameMax }));
      return;
    }
    saveProfile({ ...profile, name: profile.name.trim() });
    onDone();
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="flex items-center gap-3">
              <Avatar emoji={profile.avatar} size={48} />
              <div>
                <h1 className="font-display text-2xl font-extrabold">{t('room.namePromptTitle', { code })}</h1>
                <p className="text-sm text-muted">{t('room.namePromptBody')}</p>
              </div>
            </div>
            <TextField
              label={t('home.yourName')}
              placeholder={t('home.namePlaceholder')}
              value={profile.name}
              maxLength={LIMITS.nameMax}
              autoFocus
              error={error}
              onChange={(e) => {
                setError(null);
                setProfile({ ...profile, name: e.target.value });
              }}
            />
            <Button type="submit" size="lg" full>
              {t('room.joinButton')}
            </Button>
          </form>
        </Card>
      </motion.div>
    </main>
  );
}

/** Reactions from people without a seat (and everyone in the lobby) float from the top of the screen. */
function UnseatedReactions() {
  const reactions = useChat((s) => s.reactions);
  const phase = useConnection((s) => s.view?.phase);
  const shown = phase === 'lobby' ? reactions : reactions.filter((r) => r.color === null);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-40 h-0">
      <div className="relative mx-auto h-0 w-40">
        <FloatingEmojis emojis={shown} />
      </div>
    </div>
  );
}
