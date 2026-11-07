/**
 * Bot arena: plays the bot against random players and reports win rates and speed.
 * Usage: npm run arena -- [games=200]
 */
import { type Color, type Settings, DEFAULT_SETTINGS } from '@ludo/engine';
import { type Player, playMatch } from './match';

const games = Number(process.argv[2] ?? 200);
const four: Color[] = ['red', 'green', 'yellow', 'blue'];
const configs: Array<{ name: string; settings: Settings; seats: Color[]; players: Partial<Record<Color, Player>>; win: (s: ReturnType<typeof playMatch>['state']) => boolean }> = [
  { name: '1 die FFA: bot vs 3 random', settings: { ...DEFAULT_SETTINGS, diceMode: 1 }, seats: four, players: { red: 'bot' }, win: (s) => s.rankings[0] === 'red' },
  { name: '2 dice FFA: bot vs 3 random', settings: { ...DEFAULT_SETTINGS }, seats: four, players: { red: 'bot' }, win: (s) => s.rankings[0] === 'red' },
  { name: '2 dice kill-to-enter: bot vs 3', settings: { ...DEFAULT_SETTINGS, killRequiredToEnterColumn: true }, seats: four, players: { red: 'bot' }, win: (s) => s.rankings[0] === 'red' },
  { name: '2 dice 1v1: bot vs random', settings: { ...DEFAULT_SETTINGS }, seats: ['red', 'yellow'], players: { red: 'bot' }, win: (s) => s.rankings[0] === 'red' },
  { name: 'teams: bot team vs random team', settings: { ...DEFAULT_SETTINGS, teamMode: true }, seats: four, players: { red: 'bot', yellow: 'bot' }, win: (s) => (s.winningTeam ?? []).includes('red') },
];

for (const c of configs) {
  let wins = 0;
  let ms = 0;
  let decisions = 0;
  for (let g = 0; g < games; g++) {
    const r = playMatch(c.settings, c.seats, c.players, g + 1);
    if (c.win(r.state)) wins++;
    ms += r.botMs;
    decisions += r.botDecisions;
  }
  console.log(`${c.name.padEnd(34)} win ${(100 * wins / games).toFixed(1)}%   ${(ms / decisions).toFixed(2)} ms/decision`);
}
