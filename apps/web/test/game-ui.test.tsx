// @vitest-environment jsdom
/**
 * Game screen interactions in a simulated browser: the menu's Auto mode switch,
 * Space to roll, safe squares and which pieces take taps.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Rng, seededRng } from '@ludo/engine';
import type { Command, RoomView } from '@ludo/protocol';
import { RoomController } from '../../server/src/controller';

const sent: Command[] = [];
vi.mock('../src/net/commands', () => ({
  sendCommand: async (c: Command) => {
    sent.push(c);
    return true;
  },
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as never;
});
beforeEach(() => {
  sent.length = 0;
});
afterEach(cleanup);

const { getConnection } = await import('../src/net/session');
const { GameScreen } = await import('../src/game/GameScreen');
const { GameMenu } = await import('../src/game/GameMenu');
const { Board } = await import('../src/game/Board');
const { SeatBoard } = await import('../src/lobby/SeatBoard');
const { MemoryRouter } = await import('react-router');

/** A started game: me (red) against a bot (yellow); it's my turn to roll. */
function gameView(): { view: RoomView; me: string } {
  const rng: Rng = { ...seededRng(3), int: () => 0 }; // red starts
  let id = 0;
  const ctrl = new RoomController('ABCDEF', { rng, now: () => 1000, newId: () => `m${++id}` });
  const me = (ctrl.join({ playerToken: 'token-me-1', name: 'Zohaib' }) as { memberId: string }).memberId;
  ctrl.command(me, { type: 'takeSeat', color: 'red' });
  ctrl.command(me, { type: 'addBot', color: 'yellow' });
  ctrl.command(me, { type: 'startGame' });
  return { view: ctrl.view(), me };
}

function showView(view: RoomView, memberId: string) {
  getConnection().store.setState({ status: 'connected', view, memberId, code: view.code, revision: 1 });
}

describe('game menu', () => {
  it('Auto mode is the first option and switches autoplay on and off', () => {
    const { view, me } = gameView();
    showView(view, me);
    render(
      <MemoryRouter>
        <GameMenu open onClose={() => {}} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    const switches = within(dialog).getAllByRole('switch');
    expect(switches[0]!.getAttribute('aria-label')).toBe('Auto mode');
    fireEvent.click(switches[0]!);
    expect(sent).toEqual([{ type: 'setAutoplay', on: true }]);

    cleanup();
    sent.length = 0;
    const on: RoomView = { ...view, seats: { ...view.seats, red: { ...view.seats.red!, autoplay: true } } };
    showView(on, me);
    render(
      <MemoryRouter>
        <GameMenu open onClose={() => {}} />
      </MemoryRouter>,
    );
    const toggle = within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('switch', { name: 'Auto mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(sent).toEqual([{ type: 'setAutoplay', on: false }]);
  });
});

describe('Space rolls the dice on your turn', () => {
  const renderGame = () => {
    const { view, me } = gameView();
    showView(view, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    return view;
  };

  it('from the page, from a focused button, and from an empty chat box', async () => {
    const view = renderGame();
    const roll = { type: 'roll', stateVersion: view.game!.version };
    // After each roll the screen waits for the server's answer (no double rolls); let that settle.
    const settle = () => act(async () => {});
    fireEvent.keyDown(window, { key: ' ' });
    expect(sent).toEqual([roll]);
    await settle();

    sent.length = 0;
    const button = screen.getByTestId('game-menu');
    fireEvent.keyDown(button, { key: ' ' });
    expect(sent).toEqual([roll]);
    await settle();

    sent.length = 0;
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: ' ' });
    expect(sent).toEqual([roll]);
    input.remove();
  });

  it('a second press while the first roll is still pending does nothing', () => {
    renderGame();
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(sent).toHaveLength(1);
  });

  it('not while typing a message, and not when it is not your turn', () => {
    renderGame();
    const input = document.createElement('input');
    input.value = 'good';
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: ' ' });
    expect(sent).toEqual([]);
    input.remove();

    cleanup();
    const { view, me } = gameView();
    const notMine: RoomView = {
      ...view,
      game: { ...view.game!, turn: { ...view.game!.turn, seat: 'yellow', controls: 'yellow' } },
    };
    showView(notMine, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: ' ' });
    expect(sent).toEqual([]);
  });
});

describe('board', () => {
  const pieces = [
    { id: 'red-0', color: 'red' as const, progress: 10 },
    { id: 'yellow-0', color: 'yellow' as const, progress: 36 }, // same square as red-0 (absolute 10)
    { id: 'red-1', color: 'red' as const, progress: -1 },
  ];
  const renderBoard = (movable: string[]) =>
    render(
      <Board
        pieces={pieces}
        progress={{}}
        rotation={0}
        activeColor="red"
        movable={new Set(movable)}
        selected={null}
        options={[]}
        preview={null}
        locked={[]}
        colorBlind={false}
        reducedMotion
        onPieceTap={() => {}}
        onChoose={() => {}}
        onBackgroundTap={() => {}}
      />,
    );

  it('safe squares are plain gold squares, no stars', () => {
    const { container } = renderBoard([]);
    expect(container.querySelectorAll('polygon').length).toBe(4); // only the four centre triangles
    expect(container.querySelectorAll('rect[fill="#F4DE9C"]').length).toBe(4);
  });

  it('my movable piece sits on top of a shared square and only it takes taps', () => {
    const { container } = renderBoard(['red-0']);
    const order = [...container.querySelectorAll('[data-testid^=piece-]')].map((el) => el.getAttribute('data-testid'));
    expect(order.at(-1)).toBe('piece-red-0'); // drawn last = on top
    const style = (id: string) =>
      (container.querySelector(`[data-testid=piece-${id}]`) as SVGElement).style.pointerEvents;
    expect(style('red-0')).toBe('auto');
    expect(style('yellow-0')).toBe('none');
    expect(style('red-1')).toBe('none');
    // The movable piece's tap target covers its whole square.
    const hit = container.querySelector('[data-testid=piece-red-0] rect[fill=transparent]');
    expect(Number(hit?.getAttribute('width'))).toBeGreaterThanOrEqual(1);
  });
});

describe('seat cards', () => {
  it('in team mode the team label sits with the other badges, not in a corner', () => {
    let id = 0;
    const ctrl = new RoomController('ABCDEF', { rng: seededRng(1), now: () => 1000, newId: () => `m${++id}` });
    const me = (ctrl.join({ playerToken: 'token-me-1', name: 'zohaib' }) as { memberId: string }).memberId;
    ctrl.command(me, { type: 'updateSettings', settings: { teamMode: true } });
    ctrl.command(me, { type: 'takeSeat', color: 'blue' });
    render(<SeatBoard view={ctrl.view()} memberId={me} />);
    const blue = within(screen.getByTestId('seat-blue'));
    const team = blue.getByText('Team B');
    const you = blue.getByText('You');
    expect(team.parentElement).toBe(you.parentElement); // same badge row
  });
});
