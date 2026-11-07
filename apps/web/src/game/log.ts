/** Human-readable game log lines (docs/01-product-and-ux.md §4.3 "Game log"). */
import type { Color } from '@ludo/engine';
import type { RoomEvent } from '@ludo/protocol';
import { t } from '../i18n/messages';

export interface LogLine {
  id: number;
  color: Color | null;
  text: string;
}

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
export { ordinal };

/** Describe one event, or null for events that don't belong in the log. */
export function describe(e: RoomEvent, nameOf: (c: Color) => string): { color: Color | null; text: string } | null {
  switch (e.type) {
    case 'TurnStarted':
      return { color: e.seat, text: t('log.turn', { name: nameOf(e.seat) }) };
    case 'Rolled':
      return { color: e.seat, text: t('log.rolled', { name: nameOf(e.seat), dice: e.values.join(' · ') }) };
    case 'RerollGranted':
      return { color: e.seat, text: t('log.reroll', { name: nameOf(e.seat) }) };
    case 'RollVoided':
      return { color: e.seat, text: t(e.scope === 'bonus' ? 'log.bonusVoid' : 'log.void', { name: nameOf(e.seat) }) };
    case 'Moved':
      return e.from === -1
        ? { color: e.color, text: t('log.enteredBoard', { name: nameOf(e.color) }) }
        : { color: e.color, text: t('log.moved', { name: nameOf(e.color), from: e.from, to: e.to }) };
    case 'Captured': {
      const victims = [...new Set(e.victims.map((id) => id.split('-')[0] as Color))].map(nameOf).join(' & ');
      return {
        color: e.creditedTo[0] ?? null,
        text: t('log.captured', { name: e.creditedTo.map(nameOf).join(' & '), victims }),
      };
    }
    case 'PieceFinished':
      return { color: e.color, text: t('log.pieceHome', { name: nameOf(e.color) }) };
    case 'BonusGranted':
      return { color: e.seat, text: t('log.bonus', { name: nameOf(e.seat) }) };
    case 'PlayerFinished':
      return { color: e.color, text: t('log.finished', { name: nameOf(e.color), rank: ordinal(e.rank) }) };
    case 'HandoverStarted':
      return { color: e.seat, text: t('log.handover', { name: nameOf(e.seat), mate: nameOf(e.controls) }) };
    case 'TurnSkipped':
      return { color: e.seat, text: t('log.skipped', { name: nameOf(e.seat) }) };
    case 'KillUnlocked':
      return { color: e.color, text: t('log.unlocked', { name: nameOf(e.color) }) };
    case 'KillReset':
      return { color: e.color, text: t('log.reset', { name: nameOf(e.color) }) };
    case 'BotActed':
      return e.cause === 'bot' ? null : { color: e.seat, text: t(`log.bot.${e.cause}`, { name: nameOf(e.seat) }) };
    case 'PlayerEliminated':
      return { color: e.color, text: t('log.eliminated', { name: nameOf(e.color) }) };
    case 'GameOver':
      return { color: null, text: t('log.gameOver') };
    default:
      return null;
  }
}
