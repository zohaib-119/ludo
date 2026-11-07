import { type PresetId, type RoomSettings, TAKEOVER_OPTIONS, TURN_TIMER_OPTIONS } from '@ludo/protocol';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type MessageKey, t } from '../i18n/messages';
import { sendCommand } from '../net/commands';
import { Badge, Card, IconButton, SectionTitle, Segmented, Switch } from '../ui/kit';

type Patch = Partial<RoomSettings>;

export function RulesPanel({
  settings,
  preset,
  editable,
}: {
  settings: RoomSettings;
  preset: PresetId | 'custom';
  editable: boolean;
}) {
  const update = (patch: Patch) => void sendCommand({ type: 'updateSettings', settings: patch });
  const disabled = !editable;
  const presetOptions: Array<{ value: PresetId | 'custom'; label: string }> = [
    { value: 'classic', label: t('rules.preset.classic') },
    { value: 'twoDice', label: t('rules.preset.twoDice') },
    { value: 'hardcore', label: t('rules.preset.hardcore') },
  ];
  if (preset === 'custom') presetOptions.push({ value: 'custom', label: t('rules.preset.custom') });

  return (
    <Card>
      <SectionTitle
        aside={
          <span className="flex items-center gap-2">
            <a
              href="/how-to-play"
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t('help.link')}
            </a>
            {!editable && <Badge>{t('rules.readOnly')}</Badge>}
          </span>
        }
      >
        {t('rules.title')}
      </SectionTitle>

      <Segmented<PresetId | 'custom'>
        label={t('rules.preset')}
        value={preset}
        disabled={disabled}
        options={presetOptions}
        onChange={(p) => p !== 'custom' && void sendCommand({ type: 'applyPreset', preset: p })}
      />

      <Group title={t('rules.group.dice')}>
        <Row label="rules.diceMode" value={settings.diceMode}>
          <div className="w-44 shrink-0">
            <Segmented<1 | 2>
              label={t('rules.diceMode')}
              size="sm"
              value={settings.diceMode}
              disabled={disabled}
              onChange={(v) => update({ diceMode: v })}
              options={[
                { value: 1, label: t('rules.diceMode.1') },
                { value: 2, label: t('rules.diceMode.2') },
              ]}
            />
          </div>
        </Row>
      </Group>

      <Group title={t('rules.group.bonuses')}>
        <ToggleRow k="extraTurnOnCapture" settings={settings} disabled={disabled} update={update} />
        <ToggleRow k="extraTurnOnFinish" settings={settings} disabled={disabled} update={update} />
      </Group>

      {settings.diceMode === 2 && (
        <Group title={t('rules.group.endgame')}>
          <ToggleRow k="singleDieWhenAllInColumn" settings={settings} disabled={disabled} update={update} />
        </Group>
      )}

      <Group title={t('rules.group.kill')}>
        <ToggleRow k="killRequiredToEnterColumn" settings={settings} disabled={disabled} update={update} />
      </Group>

      <Group title={t('rules.group.teams')}>
        <ToggleRow k="teamMode" settings={settings} disabled={disabled} update={update} />
        {settings.teamMode && (
          <>
            <Row label="rules.teamHandover" value={settings.teamHandover}>
              <div className="w-56">
                <Segmented<'immediate' | 'delayed'>
                  label={t('rules.teamHandover')}
                  size="sm"
                  value={settings.teamHandover}
                  disabled={disabled}
                  onChange={(v) => update({ teamHandover: v })}
                  options={[
                    { value: 'immediate', label: t('rules.teamHandover.immediate') },
                    { value: 'delayed', label: t('rules.teamHandover.delayed') },
                  ]}
                />
              </div>
            </Row>
            {settings.teamHandover === 'delayed' && (
              <Row label="rules.teamHandoverDelayRounds" value={settings.teamHandoverDelayRounds}>
                <Stepper
                  value={settings.teamHandoverDelayRounds}
                  min={1}
                  max={10}
                  disabled={disabled}
                  onChange={(v) => update({ teamHandoverDelayRounds: v })}
                />
              </Row>
            )}
          </>
        )}
      </Group>

      <Group title={t('rules.group.time')}>
        <Row label="rules.turnTimer" value={settings.turnTimer} stacked>
          <Segmented<RoomSettings['turnTimer']>
            label={t('rules.turnTimer')}
            size="sm"
            value={settings.turnTimer}
            disabled={disabled}
            onChange={(v) => update({ turnTimer: v })}
            options={TURN_TIMER_OPTIONS.map((v) => ({
              value: v,
              label: v === 0 ? t('rules.off') : t('rules.seconds', { n: v }),
            }))}
          />
        </Row>
        <Row label="rules.disconnectTakeover" value={settings.disconnectTakeover} stacked>
          <Segmented<RoomSettings['disconnectTakeover']>
            label={t('rules.disconnectTakeover')}
            size="sm"
            value={settings.disconnectTakeover}
            disabled={disabled}
            onChange={(v) => update({ disconnectTakeover: v })}
            options={TAKEOVER_OPTIONS.map((v) => ({
              value: v,
              label: v === 0 ? t('rules.never') : t('rules.seconds', { n: v }),
            }))}
          />
        </Row>
      </Group>
    </Card>
  );
}

type BoolKey =
  | 'extraTurnOnCapture'
  | 'extraTurnOnFinish'
  | 'singleDieWhenAllInColumn'
  | 'killRequiredToEnterColumn'
  | 'teamMode';

function ToggleRow({
  k,
  settings,
  disabled,
  update,
}: {
  k: BoolKey;
  settings: RoomSettings;
  disabled: boolean;
  update: (p: Patch) => void;
}) {
  return (
    <Row label={k} value={settings[k]}>
      <Switch label={t(`rules.${k}`)} checked={settings[k]} disabled={disabled} onChange={(v) => update({ [k]: v })} />
    </Row>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** A rule row. Briefly highlights itself when its value changes (so guests notice host edits). */
function Row({
  label,
  value,
  children,
  stacked,
}: {
  label: string;
  value: unknown;
  children: ReactNode;
  stacked?: boolean;
}) {
  const key = (label.startsWith('rules.') ? label : `rules.${label}`) as MessageKey;
  const helpKey = `${key}.help` as MessageKey;
  // Flash only when the value really changes, never on mount or unrelated re-renders.
  const valueKey = JSON.stringify(value);
  const previous = useRef(valueKey);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (previous.current === valueKey) return;
    previous.current = valueKey;
    setFlash((n) => n + 1);
  }, [valueKey]);
  return (
    <div className="relative -mx-2 rounded-xl px-2 py-2.5">
      {flash > 0 && (
        <motion.span
          key={flash}
          data-testid="rule-flash"
          className="pointer-events-none absolute inset-0 rounded-xl bg-accent-soft"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}
      <div className={stacked ? 'relative space-y-2' : 'relative flex items-center justify-between gap-3'}>
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-snug">{t(key)}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{t(helpKey)}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
      <IconButton label="−" className="size-8" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" />
      </IconButton>
      <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{value}</span>
      <IconButton label="+" className="size-8" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}
