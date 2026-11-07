/**
 * Headless simulation: plays random games and reports length and speed.
 * Usage: npm run sim -- [games=200] [maxActions=20000]
 */
import { type Color, type Settings, DEFAULT_SETTINGS, seededRng } from '../src';
import { VALID_SEATINGS, playRandomGame } from '../test/random-play';

const games = Number(process.argv[2] ?? 200);
const maxActions = Number(process.argv[3] ?? 20000);

const configs: Array<{ name: string; settings: Settings; seats: Color[] }> = [
  { name: '1 die, 4 FFA', settings: { ...DEFAULT_SETTINGS, diceMode: 1 }, seats: VALID_SEATINGS[6]! },
  { name: '2 dice, 4 FFA', settings: { ...DEFAULT_SETTINGS }, seats: VALID_SEATINGS[6]! },
  { name: '2 dice, 2 players', settings: { ...DEFAULT_SETTINGS }, seats: VALID_SEATINGS[0]! },
  {
    name: '2 dice, kill-to-enter',
    settings: { ...DEFAULT_SETTINGS, killRequiredToEnterColumn: true },
    seats: VALID_SEATINGS[6]!,
  },
  { name: '2 dice, teams', settings: { ...DEFAULT_SETTINGS, teamMode: true }, seats: VALID_SEATINGS[6]! },
  {
    name: '2 dice, teams, delayed, kill',
    settings: { ...DEFAULT_SETTINGS, teamMode: true, teamHandover: 'delayed', killRequiredToEnterColumn: true },
    seats: VALID_SEATINGS[6]!,
  },
];

for (const { name, settings, seats } of configs) {
  const lengths: number[] = [];
  let unfinished = 0;
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    const { state, actions } = playRandomGame(settings, seats, seededRng(g * 2 + 1), seededRng(g * 2 + 2), maxActions);
    lengths.push(actions);
    if (state.turn.phase.kind !== 'gameOver') unfinished++;
  }
  const ms = performance.now() - t0;
  const total = lengths.reduce((a, b) => a + b, 0);
  lengths.sort((a, b) => a - b);
  console.log(
    `${name.padEnd(30)} games=${games} unfinished=${unfinished} ` +
      `actions median=${lengths[Math.floor(games / 2)]} p95=${lengths[Math.floor(games * 0.95)]} ` +
      `max=${lengths.at(-1)}  ${((ms / total) * 1000).toFixed(1)}µs/action`,
  );
}
