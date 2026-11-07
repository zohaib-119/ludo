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
const { LobbyPage } = await import('../src/lobby/LobbyPage');
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
  const renderBoard = (movable: string[]) => render(boardWith(movable));
  const boardWith = (movable: string[]) => (
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
    />
  );

  it('safe squares take the colour of the home column next to them, no stars', async () => {
    const { COLUMN_CELLS, TRACK_CELLS } = await import('@ludo/engine');
    const { BOARD_THEMES } = await import('../src/lib/themes');
    const { container } = renderBoard([]);
    expect(container.querySelectorAll('polygon').length).toBe(4); // only the four centre triangles
    const safe = [...container.querySelectorAll('rect[data-safe]')];
    expect(safe.map((r) => r.getAttribute('data-safe')).sort()).toEqual(['blue', 'green', 'red', 'yellow']);
    for (const rect of safe) {
      const color = rect.getAttribute('data-safe') as 'red';
      expect(rect.getAttribute('fill')).toBe(BOARD_THEMES.classic.base[color]);
      const x = Number(rect.getAttribute('x')) + 0.5;
      const y = Number(rect.getAttribute('y')) + 0.5;
      expect(TRACK_CELLS.some((c) => c.x === x && c.y === y)).toBe(true);
      // Touches that colour's finishing column.
      expect(COLUMN_CELLS[color].some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) === 1)).toBe(true);
    }
  });

  it('my movable piece sits on top of a shared square and only it takes taps', () => {
    const { container, rerender } = renderBoard(['red-0']);
    const order = [...container.querySelectorAll('[data-testid^=piece-]')].map((el) => el.getAttribute('data-testid'));
    expect(order.at(-1)).toBe('piece-red-0'); // drawn last = on top
    const takesTaps = (id: string) =>
      container.querySelector(`[data-testid=piece-${id}]`)!.classList.contains('pointer-events-auto');
    const passesThrough = (id: string) =>
      container.querySelector(`[data-testid=piece-${id}]`)!.classList.contains('pointer-events-none');
    expect(takesTaps('red-0')).toBe(true);
    expect(passesThrough('red-0')).toBe(false);
    expect(passesThrough('yellow-0')).toBe(true);
    expect(passesThrough('red-1')).toBe(true);
    // A piece that becomes movable later takes taps too (and stops when it no longer is).
    rerender(boardWith(['red-1']));
    expect(takesTaps('red-1')).toBe(true);
    expect(passesThrough('red-0')).toBe(true);
    rerender(boardWith(['red-0']));
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

  it('a ✕ on my own seat stands me up; the host gets a ✕ on bots; no Stand up button', () => {
    let id = 0;
    const ctrl = new RoomController('ABCDEF', { rng: seededRng(1), now: () => 1000, newId: () => `m${++id}` });
    const host = (ctrl.join({ playerToken: 'token-host-1', name: 'zohaib' }) as { memberId: string }).memberId;
    const guest = (ctrl.join({ playerToken: 'token-guest-1', name: 'ali' }) as { memberId: string }).memberId;
    ctrl.command(host, { type: 'takeSeat', color: 'red' });
    ctrl.command(guest, { type: 'takeSeat', color: 'green' });
    ctrl.command(host, { type: 'addBot', color: 'yellow' });

    const { unmount } = render(<SeatBoard view={ctrl.view()} memberId={guest} />);
    // The only way to stand up is the ✕ on the seat itself.
    expect(screen.getAllByRole('button', { name: /stand up/i })).toEqual([screen.getByTestId('seat-x-green')]);
    // A guest only gets a ✕ on their own seat.
    expect(screen.queryByTestId('seat-x-red')).toBeNull();
    expect(screen.queryByTestId('seat-x-yellow')).toBeNull();
    fireEvent.click(screen.getByTestId('seat-x-green'));
    expect(sent).toEqual([{ type: 'leaveSeat' }]);
    unmount();

    sent.length = 0;
    render(<SeatBoard view={ctrl.view()} memberId={host} />);
    fireEvent.click(screen.getByTestId('seat-x-red'));
    fireEvent.click(screen.getByTestId('seat-x-yellow'));
    expect(sent).toEqual([{ type: 'leaveSeat' }, { type: 'removeSeat', color: 'yellow' }]);
  });
});

describe('auto mode', () => {
  it('shows no bar or badge while on; it is turned off from the menu', () => {
    const { view, me } = gameView();
    const red = view.seats.red!;
    const auto = { ...view, seats: { ...view.seats, red: { ...red, autoplay: true, botControlled: true } } };
    showView(auto, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('im-back')).toBeNull();
    expect(screen.queryByText(/autoplay/i)).toBeNull();
    expect(screen.queryByText(/I'm back/i)).toBeNull();
  });
});

describe('themes', () => {
  it('the picker saves board, piece and dice choices in this browser only', async () => {
    const { AppearanceButton } = await import('../src/ui/Appearance');
    const { useSettings } = await import('../src/lib/settings');
    const { BOARD_THEMES, PIECE_STYLES, DICE_STYLES } = await import('../src/lib/themes');
    render(<AppearanceButton />);
    fireEvent.click(screen.getByTestId('appearance-button'));
    // Every design is offered.
    for (const id of Object.keys(BOARD_THEMES)) expect(screen.getByTestId(`look-board-${id}`)).toBeTruthy();
    for (const { id } of PIECE_STYLES) expect(screen.getByTestId(`look-pieces-${id}`)).toBeTruthy();
    for (const { id } of DICE_STYLES) expect(screen.getByTestId(`look-dice-${id}`)).toBeTruthy();

    fireEvent.click(screen.getByTestId('look-board-night'));
    fireEvent.click(screen.getByTestId('look-pieces-gem'));
    fireEvent.click(screen.getByTestId('look-dice-neon'));
    expect(screen.getByTestId('look-board-night').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('look-board-classic').getAttribute('aria-checked')).toBe('false');
    const { boardTheme, pieceStyle, diceStyle } = useSettings.getState();
    expect({ boardTheme, pieceStyle, diceStyle }).toEqual({
      boardTheme: 'night',
      pieceStyle: 'gem',
      diceStyle: 'neon',
    });
    const saved = JSON.parse(localStorage.getItem('dodice.settings') ?? '{}');
    expect(saved).toMatchObject({ boardTheme: 'night', pieceStyle: 'gem', diceStyle: 'neon' });
    expect(sent).toEqual([]); // nothing goes to the server
    useSettings.getState().update({ boardTheme: 'classic', pieceStyle: 'glossy', diceStyle: 'tinted' });
  });

  it('every board theme and piece style renders the board with its own colours', async () => {
    const { BOARD_THEMES, PIECE_STYLES } = await import('../src/lib/themes');
    const pieces = (['red', 'green', 'yellow', 'blue'] as const).flatMap((color) =>
      [0, 1].map((i) => ({ id: `${color}-${i}`, color, progress: i === 0 ? -1 : 3 })),
    );
    for (const theme of Object.values(BOARD_THEMES)) {
      for (const { id } of PIECE_STYLES) {
        const { container, unmount } = render(
          <Board
            pieces={pieces}
            progress={{}}
            rotation={0}
            activeColor="red"
            movable={new Set(['red-1'])}
            selected={null}
            options={[]}
            preview={null}
            locked={['green']}
            colorBlind
            reducedMotion
            onPieceTap={() => {}}
            onChoose={() => {}}
            onBackgroundTap={() => {}}
            theme={theme}
            pieceStyle={id}
          />,
        );
        expect(container.querySelectorAll('[data-testid^=piece-]').length).toBe(8);
        const safe = container.querySelector('rect[data-safe=blue]');
        expect(safe?.getAttribute('fill')).toBe(theme.base.blue);
        unmount();
      }
    }
  });

  it('dice styles give every colour a readable face', async () => {
    const { DICE_STYLES, diceLook } = await import('../src/lib/themes');
    for (const { id } of DICE_STYLES)
      for (const c of ['red', 'green', 'yellow', 'blue', null] as const) {
        const look = diceLook(id, c);
        expect(look.face).not.toBe(look.pip);
      }
  });
});

describe('dice tray', () => {
  it('on my roll it holds dice waiting to be thrown; tapping the tray rolls (no Roll button)', () => {
    const { view, me } = gameView(); // red (me) to roll, two dice
    showView(view, me);
    const { unmount } = render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    const box = screen.getByTestId('dice-box');
    expect(within(box).getAllByTestId('ready-die')).toHaveLength(2);
    expect(screen.getByTestId('roll-hint').textContent).toBe('Tap the dice to roll');
    // The only "Roll" control is the tray itself.
    const roll = screen.getByRole('button', { name: 'Roll' });
    expect(roll).toBe(screen.getByTestId('roll-button'));
    expect(box.contains(roll)).toBe(true);
    fireEvent.click(roll);
    expect(sent.map((c) => c.type)).toEqual(['roll']);
    unmount();

    // In 1-die mode, one die waits.
    const one = { ...view, settings: { ...view.settings, diceMode: 1 as const } };
    showView(one, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    expect(within(screen.getByTestId('dice-box')).getAllByTestId('ready-die')).toHaveLength(1);
  });

  it('shows no waiting dice and no roll target on someone else’s turn', () => {
    const { view, me } = gameView();
    const theirs = { ...view, game: { ...view.game!, turn: { ...view.game!.turn, seat: 'yellow' as const } } };
    showView(theirs, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('ready-die')).toBeNull();
    expect(screen.queryByTestId('roll-button')).toBeNull();
  });

  it('sits in the colour of whoever is rolling, named for them', () => {
    const { view, me } = gameView(); // red (me) to roll
    showView(view, me);
    const { unmount } = render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    const box = screen.getByTestId('dice-box');
    expect(box.getAttribute('data-color')).toBe('red');
    expect(box.textContent).toContain('Your dice');
    expect(within(box).getByTestId('tray')).toBeTruthy();
    unmount();
    // The bot's turn: the tray turns yellow and carries its name.
    const theirs = { ...view, game: { ...view.game!, turn: { ...view.game!.turn, seat: 'yellow' as const } } };
    showView(theirs, me);
    render(
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('dice-box').getAttribute('data-color')).toBe('yellow');
    expect(screen.getByTestId('dice-box').textContent).toContain(`${view.seats.yellow!.name}’s dice`);
  });
});

describe('lobby members row', () => {
  it('lists everyone in the room, seated or not, with their avatar', () => {
    let id = 0;
    const ctrl = new RoomController('ABCDEF', { rng: seededRng(1), now: () => 1000, newId: () => `m${++id}` });
    const host = (
      ctrl.join({ playerToken: 'token-host-1', name: 'zohaib', avatar: 'toonHead:Mina' }) as { memberId: string }
    ).memberId;
    ctrl.join({ playerToken: 'token-guest-1', name: 'sara' });
    ctrl.command(host, { type: 'takeSeat', color: 'red' });
    showView(ctrl.view(), host);
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    );
    const row = screen.getByTestId('room-members');
    expect(row.textContent).toContain('zohaib');
    expect(row.textContent).toContain('sara');
    expect(row.textContent).toContain('watching'); // sara isn't seated
    expect(row.querySelector('img[data-avatar="toonHead:Mina"]')).toBeTruthy();
  });
});

describe('connection overlay', () => {
  it('explains an outage with a countdown and Retry, and says when the room is being brought back', async () => {
    const { ConnectionBanner } = await import('../src/room/ConnectionBanner');
    const store = getConnection().store;
    const now = Date.now();
    store.setState({
      status: 'reconnecting',
      reconnectingSince: now - 20_000,
      nextRetryAt: now + 4_000,
      restoring: false,
    });
    const { unmount } = render(<ConnectionBanner />);
    const overlay = screen.getByTestId('connection-overlay');
    expect(overlay.textContent).toContain('Can’t reach the server');
    expect(overlay.textContent).toContain('put back in your seat automatically');
    expect(overlay.textContent).toMatch(/Trying again in [45]s/);
    expect(within(overlay).getByRole('button', { name: 'Retry now' })).toBeTruthy();
    unmount();

    // Server came back without the room: the overlay shows at once, without Retry.
    store.setState({ reconnectingSince: Date.now(), nextRetryAt: null, restoring: true });
    render(<ConnectionBanner />);
    const restoring = screen.getByTestId('connection-overlay');
    expect(restoring.textContent).toContain('The server restarted');
    expect(restoring.textContent).toContain('same code');
    expect(within(restoring).queryByRole('button')).toBeNull();
    store.setState({ status: 'idle', reconnectingSince: null, restoring: false });
  });
});

describe('which die to play', () => {
  it('offers real dice faces (pips, no numbers) beside the piece, and picking one plays it', () => {
    const pieces = [{ id: 'red-0', color: 'red' as const, progress: 10 }];
    const options = [3, 6].map((value) => ({ pieceId: 'red-0', value, from: 10, to: 10 + value }) as never);
    const chosen: number[] = [];
    const { container } = render(
      <Board
        pieces={pieces}
        progress={{}}
        rotation={0}
        activeColor="red"
        movable={new Set(['red-0'])}
        selected="red-0"
        options={options}
        preview={null}
        locked={[]}
        colorBlind={false}
        reducedMotion
        onPieceTap={() => {}}
        onChoose={(m) => chosen.push((m as { value: number }).value)}
        onBackgroundTap={() => {}}
      />,
    );
    for (const value of [3, 6]) {
      const die = screen.getByTestId(`choice-${value}`);
      expect(die.getAttribute('aria-label')).toBe(`Move ${value}`);
      expect(die.querySelectorAll('circle')).toHaveLength(value); // one pip per point
      expect(die.querySelector('text')).toBeNull();
    }
    // At least 1.3 board squares across: much bigger than the old 0.84 bubbles.
    const face = screen.getByTestId('choice-3').querySelectorAll('rect')[2]!;
    expect(Number(face.getAttribute('width'))).toBeGreaterThanOrEqual(1.3);
    fireEvent.click(screen.getByTestId('choice-6'));
    expect(chosen).toEqual([6]);
    expect(container.querySelector('[data-testid=choice-6]')).toBeTruthy();
  });
});
