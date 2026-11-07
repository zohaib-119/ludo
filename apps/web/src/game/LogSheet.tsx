import { t } from '../i18n/messages';
import { Sheet, pieceColor } from '../ui/kit';
import type { LogLine } from './log';

export function LogSheet({ open, onClose, lines }: { open: boolean; onClose: () => void; lines: LogLine[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={t('game.log')}>
      {lines.length === 0 ? (
        <p className="text-muted">{t('game.logEmpty')}</p>
      ) : (
        <ol className="space-y-1.5" data-testid="game-log">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-2.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ? pieceColor(l.color) : 'var(--text-muted)' }} aria-hidden />
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
