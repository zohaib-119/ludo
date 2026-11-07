import { Check, LogOut, Play } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { lastRoom } from '../lib/identity';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { Avatar, Badge, Button, Card, Dot, Logo, SectionTitle, Sheet } from '../ui/kit';
import { isHost, me, occupiedColors, startBlocker } from './logic';
import { RulesPanel } from './RulesPanel';
import { SeatBoard } from './SeatBoard';
import { ShareCard } from './ShareCard';

export function LobbyPage() {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const host = isHost(view, memberId);
  const self = me(view, memberId);
  const watchers = view.members.filter((m) => !m.seat);
  const seatedCount = occupiedColors(view).length;

  return (
    <div className="min-h-dvh pb-36">
      <TopBar code={view.code} inGame={false} />
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <div className="space-y-4">
          <ShareCard code={view.code} />
          <Card>
            <SectionTitle aside={<span className="text-sm font-semibold text-muted">{seatedCount}/4</span>}>{t('lobby.seats')}</SectionTitle>
            <SeatBoard view={view} memberId={memberId} />
            {!view.settings.teamMode && seatedCount <= 2 && <p className="mt-3 text-center text-sm text-muted">{t('lobby.twoPlayerHint')}</p>}
            {watchers.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">{t('lobby.watching')}</p>
                <ul className="flex flex-wrap gap-2">
                  {watchers.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-sm font-medium">
                      <Avatar emoji={m.avatar} size={26} />
                      {m.name}
                      {m.id === memberId && <Badge tone="accent">{t('lobby.you')}</Badge>}
                      {m.isHost && <Badge>{t('lobby.host')}</Badge>}
                      <Dot tone={m.connected ? 'online' : 'offline'} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
        <RulesPanel settings={view.settings} preset={view.preset} editable={host} />
      </main>
      <ActionBar host={host} seated={Boolean(self?.seat)} ready={self?.ready ?? false} />
    </div>
  );
}

export function TopBar({ code, inGame }: { code: string; inGame: boolean }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const leave = async () => {
    setConfirm(false);
    await getConnection().leave();
    lastRoom.set(null);
    navigate('/');
  };
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="font-display text-lg font-extrabold">
          Do<span className="text-accent">Dice</span>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} icon={<LogOut className="size-4" />}>
        {t('room.leave')}
      </Button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t('room.leave')}>
        <p className="mb-5 text-muted">{inGame ? t('room.leaveConfirmGame') : t('room.leaveConfirmLobby')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" full onClick={() => setConfirm(false)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" full onClick={leave} data-testid="confirm-leave">
            {t('room.leave')}
          </Button>
        </div>
        <span className="sr-only">{code}</span>
      </Sheet>
    </header>
  );
}

function ActionBar({ host, seated, ready }: { host: boolean; seated: boolean; ready: boolean }) {
  const view = useConnection((s) => s.view)!;
  const status = useConnection((s) => s.status);
  const [busy, setBusy] = useState(false);
  const offline = status !== 'connected';
  const blocker = startBlocker(view);
  const hostName = view.members.find((m) => m.isHost)?.name ?? '';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/85 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-center text-sm text-muted sm:text-left" data-testid="lobby-status">
          {host
            ? (blocker ?? ' ')
            : seated
              ? t('lobby.waitingForHost', { name: hostName })
              : t('lobby.sitToPlay')}
        </p>
        <div className="flex gap-2 sm:w-auto">
          {seated && (
            <Button variant="ghost" onClick={() => void sendCommand({ type: 'leaveSeat' })} disabled={offline}>
              {t('lobby.leaveSeat')}
            </Button>
          )}
          {host ? (
            <Button
              size="lg"
              full
              className="sm:w-56"
              disabled={Boolean(blocker) || offline}
              loading={busy}
              icon={<Play className="size-5" />}
              onClick={() => run(() => sendCommand({ type: 'startGame' }))}
            >
              {busy ? t('lobby.starting') : t('lobby.start')}
            </Button>
          ) : seated ? (
            <Button
              size="lg"
              full
              className="sm:w-56"
              variant={ready ? 'secondary' : 'primary'}
              disabled={offline}
              loading={busy}
              icon={ready ? <Check className="size-5 text-success" /> : undefined}
              onClick={() => run(() => sendCommand({ type: 'setReady', ready: !ready }))}
              data-testid="ready-button"
            >
              {ready ? t('lobby.ready') : t('lobby.imReady')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
