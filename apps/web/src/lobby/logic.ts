/**
 * Pure lobby helpers, shared by the UI and its tests. The server is the
 * authority; these only explain in advance why something is not possible.
 */
import { type Color, TEAM, TURN_ORDER } from '@ludo/engine';
import type { MemberView, RoomView } from '@ludo/protocol';
import { t } from '../i18n/messages';

export const me = (view: RoomView, memberId: string | null): MemberView | undefined =>
  view.members.find((m) => m.id === memberId);

export const isHost = (view: RoomView, memberId: string | null): boolean =>
  memberId !== null && view.hostId === memberId;

export const occupiedColors = (view: RoomView): Color[] => TURN_ORDER.filter((c) => view.seats[c]);

/** Why the host can't start yet, or null when the game can start. Mirrors the server's checks. */
export function startBlocker(view: RoomView): string | null {
  const colors = occupiedColors(view);
  if (colors.length < 2) return t('start.needPlayers');
  if (view.settings.teamMode && colors.length !== 4) return t('start.teamsNeedFour');
  const waiting = view.members.filter((m) => m.seat && m.id !== view.hostId && !m.ready).map((m) => m.name);
  if (waiting.length > 0) return t('start.waitingFor', { names: waiting.join(', ') });
  return null;
}

/** Team label for a colour in team mode. */
export const teamOf = (color: Color): 'A' | 'B' => (TEAM[color] === 0 ? 'A' : 'B');
