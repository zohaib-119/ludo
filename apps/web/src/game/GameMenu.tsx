import { Bot, Flag, LogOut, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../i18n/messages';
import { lastRoom } from '../lib/identity';
import { type Theme, useSettings } from '../lib/settings';
import { RulesPanel } from '../lobby/RulesPanel';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { Button, InfoButton, Segmented, Sheet, Switch } from '../ui/kit';

export function GameMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const navigate = useNavigate();
  const settings = useSettings();
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
          {mySeat && playing && !view.seats[mySeat]?.autoplay && (
            <Button
              variant="secondary"
              full
              icon={<Bot className="size-4" />}
              onClick={() => {
                void sendCommand({ type: 'setAutoplay', on: true });
                onClose();
              }}
            >
              {t('game.letBotPlayForMe')}
            </Button>
          )}
          <div className="divide-y divide-line rounded-2xl bg-surface-2 px-4">
            <label className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-1 font-medium">
                {t('game.quickMove')} <InfoButton title={t('game.quickMove')} text={t('game.quickMove.help')} />
              </span>
              <Switch label={t('game.quickMove')} checked={settings.quickMove} onChange={(v) => settings.update({ quickMove: v })} />
            </label>
            <label className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-1 font-medium">
                {t('game.autoMove')} <InfoButton title={t('game.autoMove')} text={t('game.autoMove.help')} />
              </span>
              <Switch label={t('game.autoMove')} checked={settings.autoMove} onChange={(v) => settings.update({ autoMove: v })} />
            </label>
            <div className="py-3">
              <Segmented<Theme>
                label={t('settings.theme')}
                size="sm"
                value={settings.theme}
                onChange={(v) => settings.update({ theme: v })}
                options={(['system', 'light', 'dark'] as Theme[]).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
              />
            </div>
          </div>
          <Button variant="ghost" full icon={<ScrollText className="size-4" />} onClick={() => setSub('rules')}>
            {t('game.rules')}
          </Button>
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
