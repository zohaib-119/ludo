/**
 * Appearance picker: board theme, piece style and dice style. Saved in this
 * browser only (personal settings in localStorage); nothing is sent to the server.
 */
import type { Color } from '@ludo/engine';
import { Palette } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { BoardArt, BoardDefs, PieceShape } from '../game/BoardArt';
import { Die } from '../game/Dice';
import { t } from '../i18n/messages';
import { useSettings } from '../lib/settings';
import { BOARD_THEMES, type BoardThemeId, DICE_STYLES, PIECE_STYLES } from '../lib/themes';
import { IconButton, Sheet, cx } from './kit';

const COLORS4: Color[] = ['red', 'green', 'yellow', 'blue'];

function Choice({
  selected,
  label,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      data-testid={testId}
      className={cx(
        'flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-transform hover:scale-[1.03] active:scale-95',
        selected ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2',
      )}
    >
      {children}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-bold tracking-[0.14em] text-muted uppercase">{title}</h3>
      <div role="radiogroup" aria-label={title} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

export function AppearancePanel() {
  const settings = useSettings();
  const theme = BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.classic;
  return (
    <div>
      <Group title={t('look.board')}>
        {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => {
          const th = BOARD_THEMES[id];
          return (
            <Choice
              key={id}
              selected={settings.boardTheme === id}
              label={th.name}
              onClick={() => settings.update({ boardTheme: id })}
              testId={`look-board-${id}`}
            >
              <svg
                viewBox="-0.25 -0.25 15.5 15.5"
                className="aspect-square w-full rounded-lg"
                style={{ boxShadow: `0 0 0 3px ${th.frame}` }}
                aria-hidden
              >
                <BoardDefs theme={th} />
                <BoardArt theme={th} />
              </svg>
            </Choice>
          );
        })}
      </Group>

      <Group title={t('look.pieces')}>
        {PIECE_STYLES.map((ps) => (
          <Choice
            key={ps.id}
            selected={settings.pieceStyle === ps.id}
            label={ps.name}
            onClick={() => settings.update({ pieceStyle: ps.id })}
            testId={`look-pieces-${ps.id}`}
          >
            <svg
              viewBox="0 0 4 4"
              className="aspect-square w-full rounded-lg"
              style={{ background: theme.cell }}
              aria-hidden
            >
              <BoardDefs theme={theme} />
              {COLORS4.map((c, i) => (
                <g key={c} transform={`translate(${1 + (i % 2) * 2} ${1 + Math.floor(i / 2) * 2})`}>
                  <PieceShape color={c} r={0.7} style={ps.id} theme={theme} />
                </g>
              ))}
            </svg>
          </Choice>
        ))}
      </Group>

      <Group title={t('look.dice')}>
        {DICE_STYLES.map((ds) => (
          <Choice
            key={ds.id}
            selected={settings.diceStyle === ds.id}
            label={ds.name}
            onClick={() => settings.update({ diceStyle: ds.id })}
            testId={`look-dice-${ds.id}`}
          >
            <div className="flex aspect-square w-full items-center justify-center">
              <Die id={1} value={5} rolling={false} color="blue" size={44} diceStyle={ds.id} />
            </div>
          </Choice>
        ))}
      </Group>
      <p className="text-center text-xs text-muted">{t('look.private')}</p>
    </div>
  );
}

/** A palette button that opens the appearance picker. */
export function AppearanceButton({ variant = 'icon' }: { variant?: 'icon' | 'link' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <IconButton label={t('look.title')} onClick={() => setOpen(true)} data-testid="appearance-button">
          <Palette className="size-5" />
        </IconButton>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline"
          data-testid="appearance-button"
        >
          <Palette className="size-4" /> {t('look.title')}
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('look.title')} wide>
        <AppearancePanel />
      </Sheet>
    </>
  );
}
