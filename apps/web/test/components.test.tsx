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
    fireEvent.click(screen.getByRole('switch', { name: 'Capture before entering home' }));
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

  it('team mode comes first, above the presets', () => {
    const { view } = lobbyView();
    render(<RulesPanel settings={view.settings} preset={view.preset} editable />);
    const team = screen.getByRole('switch', { name: 'Team mode' });
    const preset = screen.getByRole('radiogroup', { name: 'Preset' });
    expect(team.compareDocumentPosition(preset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the endgame rule in 1-die mode', () => {
    const { view } = lobbyView();
    render(<RulesPanel settings={{ ...view.settings, diceMode: 1 }} preset="classic" editable />);
    expect(screen.queryByText('One die in the home column')).toBeNull();
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

  it('is compact: one short label per rule, no explanations and no info buttons', () => {
    const { view } = lobbyView();
    render(
      <RulesPanel settings={{ ...view.settings, teamMode: true, teamHandover: 'delayed' }} preset="custom" editable />,
    );
    for (const label of [
      'Team mode',
      'When a player finishes',
      'Rounds to wait',
      'Dice',
      'Bonus roll for a capture',
      'Bonus roll for reaching home',
      'One die in the home column',
      'Capture before entering home',
      'Turn timer',
      'Bot for offline players',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/extra roll straight away/)).toBeNull();
    expect(screen.queryByText(/your pieces wait at the entrance/)).toBeNull();
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

  it('opens separate dialogs for creating and joining', async () => {
    localStorage.clear();
    await renderHome();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('open-create'));
    expect(screen.getByRole('dialog', { name: 'Create a game' })).toBeTruthy();
    expect(screen.queryByTestId('join-code')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('open-join'));
    expect(screen.getByRole('dialog', { name: 'Join a game' })).toBeTruthy();
    expect(screen.getByTestId('join-code')).toBeTruthy();
  });

  it('joining needs a valid name and code', async () => {
    localStorage.clear();
    await renderHome();
    fireEvent.click(screen.getByTestId('open-join'));
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: 'k7qx9m' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(screen.getByText('2–16 characters')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Zohaib' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(navigate).toHaveBeenCalledWith('/r/K7QX9M');
  });

  it('rejects malformed codes and accepts pasted links', async () => {
    localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Zohaib', avatar: '🦊' }));
    await renderHome();
    fireEvent.click(screen.getByTestId('open-join'));
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: 'ABC' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(screen.getByText(/Codes are 6 letters/)).toBeTruthy();
    fireEvent.change(screen.getByTestId('join-code'), { target: { value: 'https://x.y/r/k7qx9m' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    expect(navigate).toHaveBeenCalledWith('/r/K7QX9M');
  });

  it('remembers the name and avatar', async () => {
    localStorage.clear();
    await renderHome();
    fireEvent.click(screen.getByTestId('open-create'));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Zohaib' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Avatar 3' }));
    expect(JSON.parse(localStorage.getItem('dodice.profile')!)).toEqual({ name: 'Zohaib', avatar: 'avataaars:Hamza' });
  });

  it('avatars are generated pictures; More rolls new ones and keeps yours', async () => {
    localStorage.setItem('dodice.profile', JSON.stringify({ name: 'Zohaib', avatar: '🦊' })); // an old emoji profile
    await renderHome();
    fireEvent.click(screen.getByTestId('open-create'));
    const radios = () => screen.getAllByRole('radio').filter((r) => r.hasAttribute('data-avatar'));
    expect(radios()).toHaveLength(16);
    // The old emoji became the first generated avatar, and every choice is an SVG picture.
    expect(radios()[0]!.getAttribute('aria-checked')).toBe('true');
    expect(radios()[0]!.getAttribute('data-avatar')).toBe('avataaars:Zohaib');
    for (const r of radios()) expect(r.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    fireEvent.click(radios()[9]!);
    const mine = radios()[9]!.getAttribute('data-avatar');
    const before = radios().map((r) => r.getAttribute('data-avatar'));
    fireEvent.click(screen.getByTestId('shuffle-avatars'));
    const after = radios().map((r) => r.getAttribute('data-avatar'));
    expect(after[0]).toBe(mine); // yours stays, first
    expect(after.slice(1).some((a) => before.includes(a))).toBe(false);
    for (const a of after) expect(a).toMatch(/^(avataaars|toonHead):[a-z0-9]{1,16}$/i);
    fireEvent.click(radios()[5]!);
    expect(JSON.parse(localStorage.getItem('dodice.profile')!).avatar).toBe(after[5]);
  });
});
