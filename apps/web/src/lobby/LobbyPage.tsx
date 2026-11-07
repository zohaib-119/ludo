import { Check, LogOut, Play } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { lastRoom } from '../lib/identity';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { Avatar, Badge, Button, Card, Dot, Logo, SectionTitle, Sheet } from '../ui/kit';
import { AppearanceButton } from '../ui/Appearance';
import { ChatButton, ChatPanel, useIsDesktop } from '../ui/ChatControls';
import { isHost, me, occupiedColors, startBlocker } from './logic';
import { RulesPanel } from './RulesPanel';
import { SeatBoard } from './SeatBoard';
import { ShareCard } from './ShareCard';

export function LobbyPage() {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const host = isHost(view, memberId);
  const self = me(view, memberId);
  const seatedCount = occupiedColors(view).length;
  const desktop = useIsDesktop();

  // Desktop: exactly one screen (no page scroll). Phones: a compact stacked page.
  return (
    <div className="flex min-h-dvh flex-col pb-36 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:pb-0">
      <TopBar code={view.code} inGame={false} />
      <main className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-[minmax(0,1fr)] gap-4 px-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_300px_260px] xl:grid-cols-[minmax(0,1fr)_360px_380px] lg:pb-[5.75rem]">
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <ShareCard code={view.code} />
          <Card className="flex min-h-0 flex-1 flex-col">
            <SectionTitle aside={<span className="text-sm font-semibold text-muted">{seatedCount}/4</span>}>
              {t('lobby.seats')}
            </SectionTitle>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <SeatBoard view={view} memberId={memberId} className="lg:w-[min(100%,calc(100dvh-24rem))]" />
            </div>
            {/* Everyone in the room. Always shown, one fixed-height line, so the seat board never moves. */}
            <div className="mt-3 border-t border-line pt-2">
              <ul
                className="flex h-7 items-center gap-1.5 overflow-x-auto"
                aria-label={t('lobby.inRoom')}
                data-testid="room-members"
              >
                {view.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-xs font-medium"
                  >
                    <Avatar avatar={m.avatar} size={22} color={m.seat ?? undefined} />
                    {m.name}
                    {m.id === memberId && <Badge tone="accent">{t('lobby.you')}</Badge>}
                    {m.isHost && <Badge>{t('lobby.host')}</Badge>}
                    {!m.seat && <span className="text-muted">{t('lobby.watchingShort')}</span>}
                    <Dot tone={m.connected ? 'online' : 'offline'} />
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
        <div className="min-h-0">
          <RulesPanel settings={view.settings} preset={view.preset} editable={host} />
        </div>
        {desktop && (
          <aside className="min-h-0">
            <Card className="flex h-full flex-col">
              <ChatPanel className="flex-1" captureTyping />
            </Card>
          </aside>
        )}
      </main>
      <ActionBar host={host} seated={Boolean(self?.seat)} ready={self?.ready ?? false} />
    </div>
  );
}

export function TopBar({ code, inGame }: { code: string; inGame: boolean }) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [confirm, setConfirm] = useState(false);
  const leave = async () => {
    setConfirm(false);
    await getConnection().leave();
    lastRoom.set(null);
    navigate('/');
  };
  return (
    <header className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="font-display text-lg font-extrabold">
          Do<span className="text-accent">Dice</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        {!desktop && <ChatButton />}
        <AppearanceButton />
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} icon={<LogOut className="size-4" />}>
          {t('room.leave')}
        </Button>
      </div>
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
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-center text-sm text-muted sm:text-left" data-testid="lobby-status">
          {host ? (blocker ?? ' ') : seated ? t('lobby.waitingForHost', { name: hostName }) : t('lobby.sitToPlay')}
        </p>
        <div className="flex gap-2 sm:w-auto">
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
