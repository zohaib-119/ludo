/**
 * Lobby helpers, checked against real views from the server's RoomController,
 * so the client's "why can't I start?" always agrees with the server.
 */
import { describe, expect, it } from 'vitest';
import { type Color, seededRng } from '@ludo/engine';
import type { Command } from '@ludo/protocol';
import { RoomController } from '../../server/src/controller';
import { isHost, me, startBlocker, suggestedColor } from '../src/lobby/logic';

function room() {
  let id = 0;
  const ctrl = new RoomController('ABCDEF', { rng: seededRng(1), now: () => 1000, newId: () => `m${++id}` });
  const join = (name: string) => {
    const r = ctrl.join({ playerToken: `token-${name}`, name });
    if (!r.ok) throw new Error(r.code);
    return r.memberId;
  };
  const cmd = (who: string, c: Command) => ctrl.command(who, c);
  return { ctrl, join, cmd, view: () => ctrl.view() };
}

/** For every lobby we build, the client blocker must be null exactly when the server accepts a start. */
function agreesWithServer(r: ReturnType<typeof room>, host: string) {
  const blocker = startBlocker(r.view());
  const result = r.cmd(host, { type: 'startGame' });
  expect(blocker === null, `client said "${blocker}", server said ${JSON.stringify(result)}`).toBe(result.ok);
}

describe('startBlocker', () => {
  it('explains each reason and matches the server', () => {
    const r = room();
    const ali = r.join('Ali');
    expect(startBlocker(r.view())).toBe('Need at least 2 players');
    r.cmd(ali, { type: 'takeSeat', color: 'red' });
    const sara = r.join('Sara');
    r.cmd(sara, { type: 'takeSeat', color: 'green' });
    expect(startBlocker(r.view())).toBe('2 players must sit in opposite corners');
    agreesWithServer(r, ali);
    r.cmd(sara, { type: 'takeSeat', color: 'yellow' });
    expect(startBlocker(r.view())).toBe('Waiting for Sara');
    agreesWithServer(r, ali);
    r.cmd(sara, { type: 'setReady', ready: true });
    expect(startBlocker(r.view())).toBeNull();
    agreesWithServer(r, ali);
  });

  it('team mode needs four seats; bots count and need no ready', () => {
    const r = room();
    const ali = r.join('Ali');
    r.cmd(ali, { type: 'takeSeat', color: 'red' });
    r.cmd(ali, { type: 'updateSettings', settings: { teamMode: true } });
    r.cmd(ali, { type: 'addBot', color: 'yellow' });
    expect(startBlocker(r.view())).toBe('Team mode needs all 4 seats');
    agreesWithServer(r, ali);
    for (const c of ['green', 'blue'] as Color[]) r.cmd(ali, { type: 'addBot', color: c });
    expect(startBlocker(r.view())).toBeNull();
    agreesWithServer(r, ali);
  });

  it('agrees with the server across many seatings', () => {
    const colors: Color[] = ['red', 'green', 'yellow', 'blue'];
    // Every subset of seats, with and without team mode, all humans ready.
    for (let mask = 0; mask < 16; mask++) {
      for (const teamMode of [false, true]) {
        const r = room();
        const host = r.join('Host');
        if (teamMode) r.cmd(host, { type: 'updateSettings', settings: { teamMode } });
        colors.forEach((c, i) => {
          if (!(mask & (1 << i))) return;
          const m = r.join(`P${i}${c}`);
          r.cmd(m, { type: 'takeSeat', color: c });
          r.cmd(m, { type: 'setReady', ready: true });
        });
        agreesWithServer(r, host);
      }
    }
  });
});

describe('helpers', () => {
  it('me / isHost', () => {
    const r = room();
    const ali = r.join('Ali');
    const sara = r.join('Sara');
    expect(me(r.view(), sara)?.name).toBe('Sara');
    expect(isHost(r.view(), ali)).toBe(true);
    expect(isHost(r.view(), sara)).toBe(false);
    expect(isHost(r.view(), null)).toBe(false);
  });

  it('suggests the opposite corner when exactly one other seat is taken', () => {
    const r = room();
    const ali = r.join('Ali');
    const sara = r.join('Sara');
    expect(suggestedColor(r.view(), sara)).toBeNull();
    r.cmd(ali, { type: 'takeSeat', color: 'green' });
    expect(suggestedColor(r.view(), sara)).toBe('blue');
    r.cmd(sara, { type: 'takeSeat', color: 'red' });
    // Sara's own seat doesn't count; Ali sees the suggestion for Sara's corner gone.
    expect(suggestedColor(r.view(), ali)).toBe('yellow');
  });
});
