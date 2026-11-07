/**
 * Sounds, haptics and the "Your turn!" tab title, driven by event playback.
 */
import type { Color } from '@ludo/engine';
import type { RoomEvent } from '@ludo/protocol';
import { useEffect, useRef } from 'react';
import { sound, vibrate } from '../audio/sound';
import { t } from '../i18n/messages';
import { useSettings } from '../lib/settings';
import { announce } from '../ui/Announcer';
import { describe } from './log';
import type { Playback } from './playback';

export function useGameSounds(playback: Playback, mySeat: Color | null): void {
  const haptics = useSettings((s) => s.haptics);
  const latest = useRef({ mySeat, haptics });
  latest.current = { mySeat, haptics };

  useEffect(() => {
    playback.setHooks({
      onEvent: (e: RoomEvent) => {
        const { mySeat: me, haptics: buzz } = latest.current;
        const T = playback.timing;
        switch (e.type) {
          case 'Rolled':
            if (me && e.seat === me) announce(t('a11y.youRolled', { dice: e.values.join(' and ') }));
            if (T.roll > 200) sound.play('shake');
            sound.play('land', { delayMs: Math.max(0, T.roll - 80) });
            break;
          case 'RerollGranted':
            sound.play('reroll');
            break;
          case 'RollVoided':
            sound.play('void');
            break;
          case 'Moved':
            if (e.from === -1) sound.play('enter', { delayMs: T.useDie });
            break;
          case 'Captured': {
            sound.play('capture');
            const mine = me !== null && e.victims.some((v) => v.startsWith(`${me}-`));
            if (mine) {
              if (buzz) vibrate([30, 40, 30]);
              announce(t('a11y.yourPieceCaptured'));
            } else if (me && e.creditedTo.includes(me)) announce(t('a11y.youCaptured'));
            break;
          }
          case 'PieceFinished':
            sound.play('finish');
            break;
          case 'KillUnlocked':
            sound.play('unlock');
            break;
          case 'PlayerFinished':
          case 'PlayerEliminated': {
            sound.play(e.type === 'PlayerEliminated' ? 'out' : e.color === me && e.rank === 1 ? 'win' : 'finish');
            const line = describe(e, playback.nameOf);
            if (line) announce(line.text);
            break;
          }
          case 'GameOver': {
            const won = me && (e.winningTeam ? e.winningTeam.includes(me) : e.rankings[0] === me);
            if (won) sound.play('win');
            announce(t('log.gameOver'));
            break;
          }
          case 'TurnStarted':
            if (me && e.seat === me) {
              announce(t('a11y.yourTurn'));
              sound.play('turn');
              if (buzz) vibrate(40);
              flashTitle();
            }
            break;
          default:
            break;
        }
      },
      onStep: (_id, step, total) => {
        // A soft tick per square, rising slightly along the path; skipped when there is no hop time.
        if (playback.timing.hop > 0) sound.play('hop', { pitch: 1 + (step / Math.max(total, 1)) * 0.35 });
      },
    });
    return () => playback.setHooks({});
  }, [playback]);
}

/** While the tab is hidden, alternate the title with "Your turn!" until the player comes back. */
function flashTitle(): void {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  const original = document.title;
  let on = false;
  const id = setInterval(() => {
    on = !on;
    document.title = on ? '🎲 Your turn!' : original;
  }, 1000);
  const stop = () => {
    if (document.visibilityState !== 'visible') return;
    clearInterval(id);
    document.title = original;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}
