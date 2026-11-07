import { t } from '../i18n/messages';
import { TopBar } from '../lobby/LobbyPage';
import { useConnection } from '../net/session';
import { Avatar, Card, pieceColor } from '../ui/kit';

/** Stand-in until the board arrives in M5: shows the game is running and who is playing. */
export function GamePlaceholder() {
  const view = useConnection((s) => s.view)!;
  const game = view.game;
  const finished = view.phase === 'finished';
  return (
    <div className="min-h-dvh">
      <TopBar code={view.code} inGame={!finished} />
      <main className="mx-auto max-w-md px-4 pt-6">
        <Card className="text-center" data-testid="game-placeholder">
          <h1 className="font-display text-2xl font-extrabold">{finished ? t('game.finished') : t('game.inProgress')}</h1>
          <p className="mt-2 text-sm text-muted">{t('game.comingSoon')}</p>
          <ul className="mt-5 space-y-2 text-left">
            {(game?.seats ?? []).map((color) => {
              const seat = view.seats[color];
              const active = game?.turn.seat === color && !finished;
              return (
                <li
                  key={color}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{ background: active ? 'var(--surface-2)' : undefined }}
                >
                  <Avatar emoji={seat?.avatar ?? '🤖'} color={color} size={34} />
                  <span className="flex-1 font-semibold">{seat?.name}</span>
                  <span className="text-xs text-muted">
                    {game?.pieces.filter((p) => p.color === color && p.progress === 56).length}/4
                  </span>
                  <span className="piece size-3" style={{ ['--piece' as string]: pieceColor(color) }} aria-hidden />
                </li>
              );
            })}
          </ul>
        </Card>
      </main>
    </div>
  );
}
