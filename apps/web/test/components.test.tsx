// @vitest-environment jsdom
/**
 * Lobby and home components in a simulated browser. Commands are captured
 * instead of sent, so these check what the UI asks the server to do.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRng } from '@ludo/engine';
import type { Command, RoomView } from '@ludo/protocol';
import { RoomController } from '../../server/src/controller';

const sent: Command[] = [];
vi.mock('../src/net/commands', () => ({
  sendCommand: async (c: Command) => {
    sent.push(c);
    return true;
  },
}));
const navigate = vi.fn();
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));

// jsdom lacks these.
beforeEach(() => {
  sent.length = 0;
  navigate.mockReset();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as never;
});
afterEach(cleanup);

const { RulesPanel } = await import('../src/lobby/RulesPanel');
const { SeatBoard } = await import('../src/lobby/SeatBoard');
const { HomePage } = await import('../src/home/HomePage');

function lobbyView(): { view: RoomView; host: string; guest: string } {
  let id = 0;
  const ctrl = new RoomController('ABCDEF', { rng: seededRng(1), now: () => 1000, newId: () => `m${++id}` });
  const host = (ctrl.join({ playerToken: 'token-host', name: 'Ali' }) as { memberId: string }).memberId;
  const guest = (ctrl.join({ playerToken: 'token-guest', name: 'Sara' }) as { memberId: string }).memberId;
  ctrl.command(host, { type: 'takeSeat', color: 'red' });
  ctrl.command(guest, { type: 'takeSeat', color: 'yellow' });
  ctrl.command(host, { type: 'addBot', color: 'green' });
  return { view: ctrl.view(), host, guest };
}

describe('RulesPanel', () => {
  it('lets the host change rules and presets', () => {
    const { view } = lobbyView();
    render(<RulesPanel settings={view.settings} preset={view.preset} editable />);
    fireEvent.click(screen.getByRole('switch', { name: 'Capture before entering home column' }));
    fireEvent.click(screen.getByRole('radio', { name: '1 die' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Turn timer' })).getByRole('radio', { name: '30s' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Two Dice' }));
    expect(sent).toEqual([
      { type: 'updateSettings', settings: { killRequiredToEnterColumn: false } },
      { type: 'updateSettings', settings: { diceMode: 1 } },
      { type: 'updateSettings', settings: { turnTimer: 30 } },
      { type: 'applyPreset', preset: 'twoDice' },
    ]);
  });

  it('is read-only for guests: everything visible, every control disabled, nothing sent', () => {
    const { view } = lobbyView();
    render(<RulesPanel settings={view.settings} preset={view.preset} editable={false} />);
    expect(screen.getByText('Set by the host')).toBeTruthy();
    for (const sw of screen.getAllByRole('switch')) expect((sw as HTMLButtonElement).disabled).toBe(true);
    for (const r of screen.getAllByRole('radio')) expect((r as HTMLButtonElement).disabled).toBe(true);
    for (const g of screen.getAllByRole('radiogroup')) expect(g.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Team mode' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    expect(sent).toEqual([]);
  });

  it('shows team options only with team mode, and the delay only when delayed', () => {
    const { view } = lobbyView();
    const { rerender } = render(<RulesPanel settings={view.settings} preset={view.preset} editable />);
    expect(screen.queryByText('When a player finishes')).toBeNull();
    rerender(<RulesPanel settings={{ ...view.settings, teamMode: true }} preset="custom" editable />);
    expect(screen.getByText('When a player finishes')).toBeTruthy();
    expect(screen.queryByText('Rounds to wait')).toBeNull();
    rerender(
      <RulesPanel settings={{ ...view.settings, teamMode: true, teamHandover: 'delayed' }} preset="custom" editable />,
    );
    expect(screen.getByText('Rounds to wait')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(sent.at(-1)).toEqual({ type: 'updateSettings', settings: { teamHandoverDelayRounds: 5 } });
  });

  it('hides the endgame rule in 1-die mode', () => {
    const { view } = lobbyView();
    render(<RulesPanel settings={{ ...view.settings, diceMode: 1 }} preset="classic" editable />);
    expect(screen.queryByText('One die when all pieces are in the home column')).toBeNull();
  });

  it('highlights a rule only when its value changes', () => {
    const { view } = lobbyView();
    const { rerender, container } = render(
      <RulesPanel settings={view.settings} preset={view.preset} editable={false} />,
    );
    expect(container.querySelectorAll('[data-testid=rule-flash]')).toHaveLength(0);
    rerender(<RulesPanel settings={view.settings} preset={view.preset} editable={false} />);
    expect(container.querySelectorAll('[data-testid=rule-flash]')).toHaveLength(0);
    rerender(<RulesPanel settings={{ ...view.settings, extraTurnOnCapture: true }} preset="custom" editable={false} />);
    expect(container.querySelectorAll('[data-testid=rule-flash]')).toHaveLength(1);
  });

  it('every rule shows a plain explanation right under it (no info buttons)', () => {
    const { view } = lobbyView();
    render(
      <RulesPanel settings={{ ...view.settings, teamMode: true, teamHandover: 'delayed' }} preset="custom" editable />,
    );
    for (const text of [
      'Roll 1 die, or roll 2 and play each die as its own move.',
      'Capturing an enemy piece gives you an extra roll straight away.',
      'Getting a piece home gives you an extra roll straight away.',
      'Once all your remaining pieces are in the coloured home column, roll just one die.',
      'Capture an enemy piece first, or your pieces wait at the entrance. If nothing is left to capture, you are out.',
      'Red + Yellow against Green + Blue. Team-mates never capture each other; both must finish to win.',
      'A finished player then plays their team-mate’s pieces on their own turns.',
      'How many of their own turns a finished player sits out before helping.',
      'Time for each roll or move. If it runs out, the bot plays that move for you.',
      'If someone is disconnected on their turn, the bot plays for them until they are back.',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /More info/ })).toBeNull();
  });
});

describe('SeatBoard', () => {
  it('shows occupants, badges and host controls', () => {
    const { view, host } = lobbyView();
    render(<SeatBoard view={view} memberId={host} />);
    const red = within(screen.getByTestId('seat-red'));
    expect(red.getByText('Ali')).toBeTruthy();
    expect(red.getByText('You')).toBeTruthy();
    expect(red.getByText('Host')).toBeTruthy();
    expect(within(screen.getByTestId('seat-green')).getByText('Bot')).toBeTruthy();
    expect(within(screen.getByTestId('seat-yellow')).getByText('Not ready')).toBeTruthy();
    // Host: add bot to an empty seat, remove others, but not themselves.
    fireEvent.click(screen.getByTestId('add-bot-blue'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from seat: Sara' }));
    expect(red.queryByRole('button', { name: /Remove from seat/ })).toBeNull();
    expect(sent).toEqual([
      { type: 'addBot', color: 'blue' },
      { type: 'removeSeat', color: 'yellow' },
    ]);
  });

  it('guests can only sit in empty seats', () => {
    const { view, guest } = lobbyView();
    render(<SeatBoard view={view} memberId={guest} />);
    expect(screen.queryByTestId('add-bot-blue')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove from seat/ })).toBeNull();
    fireEvent.click(within(screen.getByTestId('seat-blue')).getByRole('button', { name: /Tap to sit/ }));
    expect(sent).toEqual([{ type: 'takeSeat', color: 'blue' }]);
  });
});

describe('HomePage', () => {
  const renderHome = async () => {
    const { MemoryRouter } = await import('react-router');
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
  };

  it('requires a valid name before joining', async () => {
    localStorage.clear();
    await renderHome();
    fireEvent.change(screen.getByPlaceholderText('Room code'), { target: { value: 'k7qx9m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText('2–16 characters')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Zohaib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(navigate).toHaveBeenCalledWith('/r/K7QX9M');
  });

  it('rejects malformed codes and accepts pasted links', async () => {
    localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Zohaib', avatar: '🦊' }));
    await renderHome();
    fireEvent.change(screen.getByPlaceholderText('Room code'), { target: { value: 'ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByText(/Codes are 6 letters/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Room code'), { target: { value: 'https://x.y/r/k7qx9m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(navigate).toHaveBeenCalledWith('/r/K7QX9M');
  });

  it('remembers the name and avatar', async () => {
    localStorage.clear();
    await renderHome();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Zohaib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick an avatar' }));
    fireEvent.click(screen.getByRole('button', { name: '🐼' }));
    expect(JSON.parse(localStorage.getItem('dodice.profile')!)).toEqual({ name: 'Zohaib', avatar: '🐼' });
  });
});
