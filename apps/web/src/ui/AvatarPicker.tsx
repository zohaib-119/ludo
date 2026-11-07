/**
 * Avatar choice: 16 generated avatars plus a dice button that rolls 16 new ones.
 * The current avatar always stays in the grid so it is never lost by shuffling.
 */
import { AVATARS } from '@ludo/protocol';
import { Dices } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/messages';
import { avatarUri, randomAvatar } from '../lib/avatars';
import { cx } from './kit';

export function AvatarPicker({ value, onChange }: { value: string; onChange: (avatar: string) => void }) {
  const [choices, setChoices] = useState<string[]>(() =>
    AVATARS.includes(value as never) ? [...AVATARS] : [value, ...AVATARS.slice(1)],
  );
  const shuffle = () => {
    const fresh = Array.from({ length: AVATARS.length - 1 }, () => randomAvatar());
    setChoices([value, ...fresh]);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-muted">{t('home.pickAvatar')}</p>
        <button
          type="button"
          onClick={shuffle}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-accent hover:bg-accent-soft"
          data-testid="shuffle-avatars"
        >
          <Dices className="size-4" /> {t('home.moreAvatars')}
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label={t('home.pickAvatar')}>
        {choices.map((a, i) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={a === value}
            aria-label={t('home.avatarN', { n: i + 1 })}
            onClick={() => onChange(a)}
            data-avatar={a}
            className={cx(
              'aspect-square overflow-hidden rounded-xl transition-transform hover:scale-105 active:scale-95',
              a === value ? 'ring-3 ring-accent ring-offset-2 ring-offset-surface' : 'bg-surface-2',
            )}
          >
            <img src={avatarUri(a) ?? undefined} alt="" className="size-full" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
