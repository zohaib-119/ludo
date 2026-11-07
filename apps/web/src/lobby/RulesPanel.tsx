import { type PresetId, type RoomSettings, TAKEOVER_OPTIONS, TURN_TIMER_OPTIONS } from '@ludo/protocol';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type MessageKey, t } from '../i18n/messages';
import { sendCommand } from '../net/commands';
import { Badge, Card, IconButton, Segmented, Switch } from '../ui/kit';

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
    <Card className="flex max-h-full min-h-0 flex-col" data-testid="rules-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg leading-none font-bold">{t('rules.title')}</h2>
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
      </div>

      <div className="scroll-fade min-h-0 overflow-x-hidden overflow-y-auto pb-4">
        <div className="divide-y divide-line">
          <ToggleRow k="teamMode" settings={settings} disabled={disabled} update={update} />
          {settings.teamMode && (
            <>
              <Row label="rules.teamHandover" value={settings.teamHandover}>
                <div className="ml-auto">
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
        </div>

        <div className="my-3">
          <Segmented<PresetId | 'custom'>
            label={t('rules.preset')}
            size="sm"
            value={preset}
            disabled={disabled}
            options={presetOptions}
            onChange={(p) => p !== 'custom' && void sendCommand({ type: 'applyPreset', preset: p })}
          />
        </div>

        <div className="divide-y divide-line">
          <Row label="rules.diceMode" value={settings.diceMode}>
            <div className="ml-auto">
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
          <ToggleRow k="extraTurnOnCapture" settings={settings} disabled={disabled} update={update} />
          <ToggleRow k="extraTurnOnFinish" settings={settings} disabled={disabled} update={update} />
          {settings.diceMode === 2 && (
            <ToggleRow k="singleDieWhenAllInColumn" settings={settings} disabled={disabled} update={update} />
          )}
          <ToggleRow k="killRequiredToEnterColumn" settings={settings} disabled={disabled} update={update} />
          <Row label="rules.turnTimer" value={settings.turnTimer}>
            <div className="ml-auto">
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
            </div>
          </Row>
          <Row label="rules.disconnectTakeover" value={settings.disconnectTakeover}>
            <div className="ml-auto">
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
            </div>
          </Row>
        </div>
      </div>
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
      <div className="ml-auto">
        <Switch
          label={t(`rules.${k}`)}
          checked={settings[k]}
          disabled={disabled}
          onChange={(v) => update({ [k]: v })}
        />
      </div>
    </Row>
  );
}

/** A rule row. Briefly highlights itself when its value changes (so guests notice host edits). */
function Row({ label, value, children }: { label: string; value: unknown; children: ReactNode }) {
  const key = (label.startsWith('rules.') ? label : `rules.${label}`) as MessageKey;
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
    <div className="relative py-2">
      {flash > 0 && (
        <motion.span
          key={flash}
          data-testid="rule-flash"
          className="pointer-events-none absolute inset-0 rounded-lg bg-accent-soft"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}
      <div className="relative flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 text-sm leading-snug font-medium">{t(key)}</p>
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
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-0.5">
      <IconButton label="−" className="size-7" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" />
      </IconButton>
      <span className="w-6 text-center font-display text-lg font-bold tabular-nums">{value}</span>
      <IconButton label="+" className="size-7" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}
