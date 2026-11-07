import { BookOpen, Bot, Flag, LogOut, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { lastRoom } from '../lib/identity';
import { useSettings } from '../lib/settings';
import { RulesPanel } from '../lobby/RulesPanel';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { sound } from '../audio/sound';
import { Button, Sheet, Switch } from '../ui/kit';

export function GameMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const navigate = useNavigate();
  const settings = useSettings();
  const reducedBySystem =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [sub, setSub] = useState<'none' | 'rules' | 'leave' | 'end'>('none');
  const host = view.hostId === memberId;
  const mySeat = view.members.find((m) => m.id === memberId)?.seat ?? null;
  const playing = view.phase === 'playing';
  const offline = Object.values(view.seats).filter((s) => s && !s.isBot && !s.connected && !s.botControlled);

  const leave = async () => {
    await getConnection().leave();
    lastRoom.set(null);
    navigate('/');
  };

  return (
    <>
      <Sheet open={open && sub === 'none'} onClose={onClose} title={t('game.menu')}>
        <div className="space-y-4">
          {mySeat && playing && (
            <div className="rounded-2xl border-2 border-accent/30 bg-accent-soft px-4">
              <ToggleRow
                title={t('game.autoMode')}
                help={t('game.autoMode.help')}
                checked={Boolean(view.seats[mySeat]?.autoplay)}
                onChange={(on) => {
                  void sendCommand({ type: 'setAutoplay', on });
                  if (on) onClose();
                }}
              />
            </div>
          )}
          <div className="divide-y divide-line rounded-2xl bg-surface-2 px-4">
            <label className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-medium">{t('game.quickMove')}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t('game.quickMove.help')}</span>
              </span>
              <Switch
                label={t('game.quickMove')}
                checked={settings.quickMove}
                onChange={(v) => settings.update({ quickMove: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-medium">{t('game.autoMove')}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t('game.autoMove.help')}</span>
              </span>
              <Switch
                label={t('game.autoMove')}
                checked={settings.autoMove}
                onChange={(v) => settings.update({ autoMove: v })}
              />
            </label>
            <ToggleRow
              title={t('settings.sound')}
              help={t('settings.sound.help')}
              checked={settings.soundVolume > 0}
              onChange={(v) => settings.update({ soundVolume: v ? 0.8 : 0 })}
            />
            {settings.soundVolume > 0 && (
              <label className="flex items-center gap-3 pb-3">
                <span className="sr-only">{t('settings.volume')}</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={settings.soundVolume}
                  onChange={(e) => settings.update({ soundVolume: Number(e.target.value) })}
                  onPointerUp={() => sound.play('pop')}
                  aria-label={t('settings.volume')}
                  className="w-full accent-[var(--accent)]"
                />
              </label>
            )}
            <ToggleRow
              title={t('settings.haptics')}
              help={t('settings.haptics.help')}
              checked={settings.haptics}
              onChange={(v) => settings.update({ haptics: v })}
            />
            <ToggleRow
              title={t('settings.colorBlind')}
              help={t('settings.colorBlind.help')}
              checked={settings.colorBlindMarkers}
              onChange={(v) => settings.update({ colorBlindMarkers: v })}
            />
            <ToggleRow
              title={t('settings.reducedMotion')}
              help={t('settings.reducedMotion.help')}
              checked={settings.reducedMotion ?? reducedBySystem}
              onChange={(v) => settings.update({ reducedMotion: v })}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" full icon={<ScrollText className="size-4" />} onClick={() => setSub('rules')}>
              {t('game.rules')}
            </Button>
            <a
              href="/how-to-play"
              target="_blank"
              rel="noopener"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold hover:bg-surface-2"
            >
              <BookOpen className="size-4" /> {t('help.link')}
            </a>
          </div>
          {host && playing && (
            <div className="space-y-2 rounded-2xl border border-line p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{t('game.hostTools')}</p>
              {offline.map((s) => (
                <Button
                  key={s!.color}
                  variant="secondary"
                  size="sm"
                  full
                  icon={<Bot className="size-4" />}
                  onClick={() => void sendCommand({ type: 'hostBotTakeover', color: s!.color })}
                >
                  {t('game.hostLetBot')}: {s!.name}
                </Button>
              ))}
              <Button variant="ghost" size="sm" full icon={<Flag className="size-4" />} onClick={() => setSub('end')}>
                {t('game.endGame')}
              </Button>
            </div>
          )}
          <Button variant="ghost" full icon={<LogOut className="size-4" />} onClick={() => setSub('leave')}>
            {t('room.leave')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={open && sub === 'rules'} onClose={() => setSub('none')} title={t('game.rules')}>
        <RulesPanel settings={view.settings} preset={view.preset} editable={false} />
      </Sheet>

      <Sheet open={open && sub === 'leave'} onClose={() => setSub('none')} title={t('room.leave')}>
        <p className="mb-5 text-muted">{playing ? t('room.leaveConfirmGame') : t('room.leaveConfirmLobby')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" full onClick={() => setSub('none')}>
            {t('cancel')}
          </Button>
          <Button variant="danger" full onClick={leave} data-testid="confirm-leave">
            {t('room.leave')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={open && sub === 'end'} onClose={() => setSub('none')} title={t('game.endGame')}>
        <p className="mb-5 text-muted">{t('game.endGameConfirm')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" full onClick={() => setSub('none')}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            full
            onClick={() => {
              void sendCommand({ type: 'endGame' });
              setSub('none');
              onClose();
            }}
          >
            {t('confirm')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function ToggleRow({
  title,
  help,
  checked,
  onChange,
}: {
  title: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{help}</span>
      </span>
      <Switch label={title} checked={checked} onChange={onChange} />
    </label>
  );
}
