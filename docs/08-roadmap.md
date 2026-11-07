# 08 — Roadmap

Each milestone ends with something that works and is tested. Later milestones never require rewriting earlier ones.

## M0 — Project setup
- npm-workspaces monorepo per 03-architecture §3, TypeScript strict, Vitest. ✅
- ESLint, Prettier and CI: added with the client in M4.
- Colyseus spike (custom room ID, join by ID, drop + reconnect): moved to the start of M2.

**Done when:** `npm test` and `npm run typecheck` pass. ✅

## Status

- **M1 complete (2026-11-07):** engine, 57 rule tests, 14 geometry tests, 3 property tests (200 random full games checked after every action, 300 random nonsense-action runs, 3,000 brute-force playability comparisons). Mutation check: deliberately broken team captures and bank legality were both caught.
- **M2 complete (2026-11-07):** Colyseus 0.18 server. Room logic in a network-free `RoomController` (37 tests with a fake clock: joining, seats, settings and presets, starting, game actions, stale/duplicate protection, rematch, host transfer, leaving, chat, rate limits, disposal) plus 10 integration tests with real WebSocket clients (room codes, refused joins, event ordering, network drop + auto-reconnect, page refresh, second tab, leaving, HTTP endpoints). Mutation check: accepting stale versions, and not replacing an older connection, were both caught.
- **M3 complete (2026-11-07):** heuristic bot (`@ludo/bot`) planning whole banks; 83–99 % wins against random players, under 4 ms per decision. Server: bot seats, paced bot play with precise wake-ups, decision timer, autoplay after 2 timeouts and "I'm back", offline takeover with control returned at the next turn, host takeover, bots pause when nobody is connected. 11 bot tests (tactical positions checked against dummy bots, legality over random games, win rate), 15 automation tests with a fake clock, 1 real-network bot test. Mutation check: three planted automation bugs were all caught. 148 tests in total.
- **M4 complete (2026-11-07):** React web client foundations. Design tokens (light/dark), UI kit, message catalogue, personal settings, connection manager (SDK auto-reconnect + token rejoin with backoff, offline-safe commands, second-tab handling), Home (name/avatar, create, join by code or pasted link, continue game), Lobby (share card with copy/share/QR, seat board, bots, live rules panel with presets and change highlights, ready/start with reasons, leave), all failure screens. Tests: 27 web unit/component tests plus 6 Playwright browser scenarios; 187 automated tests in total. The tests caught two real bugs (pasted links with an upper-cased path, and a name-field accessibility issue) and one UI bug ("left" toasts without a name). ESLint/Prettier/CI are moved to M6.
- **M5 complete (2026-11-07):** the game screen. SVG board rotated so your colour is bottom-left; glossy pieces that hop square by square, stacks, captures flying home; 3D dice and bank chips; tap-to-move with choice bubbles, destination previews, Quick move and Auto-move; event playback queue that speeds up and snaps when behind; banners; player panels (turn glow, timer ring, pieces home, kill-to-enter lock, bot/autoplay/offline/handover badges); offline notice with host "Let bot play"; autoplay bar with "I'm back"; menu (rules, settings, host tools, leave); game log; results with podium, stats and rematch. Server: `LUDO_BOT_PACE` (environment only) speeds bots up for tests; "bot turns" now counts only turns played for humans. Tests: 17 new logic tests (geometry, choices, log, playback) and 4 new browser scenarios (turns vs bots, a full autoplay game to results and rematch, host ending a game, offline player + host takeover). 198 automated tests plus 10 browser tests. Sound, haptics, chat and reactions follow in M6.

## M1 — Rules engine
- `@ludo/engine` per 04-engine: geometry, setup, moves, playability search, reducer, teams, events.
- Full rule catalogue (07-testing §3) and property tests (§4).
- Headless runner: plays random games from the command line.

**Done when:** every catalogue test and property test passes, and 10,000 random games complete without errors.

## M2 — Server
- Colyseus server with `LudoRoom`: codes, seats, host, lobby rules, start, actions, events, rematch.
- Three-layer reconnection, token rejoin, other-tab handling, stale-version rejection.
- Room cleanup rules.

**Done when:** server tests pass, including scripted clients playing a full game and surviving forced disconnects.

## M3 — Bot, timers, takeover
- `@ludo/bot` with the Normal evaluation.
- Decision timer, autoplay, disconnect takeover, bots in empty seats, host "Let bot play".

**Done when:** bot test targets met; a 4-bot room plays to completion on the server; timer and takeover tests pass with a fake clock.

## M4 — Client foundations
- Vite + React app, design tokens, UI components (button, toggle, sheet, toast, dialog), routing, i18n setup, local settings.
- Connection manager with all states from 01-product-and-ux §5.
- Home and Lobby screens, fully working against the server (seats, rules panel with presets, ready, start, share link, QR).

**Done when:** four browsers can create, join and configure a room, and refreshing any of them keeps their seat.

## M5 — Game screen
- SVG board, pieces, stacks, dice, bank, move interaction (tap piece / tap die / bubbles / ghosts / quick move / auto-move).
- Animation queue, banners, game log, player panels with all badges, timer ring, offline/takeover display.
- Results screen and rematch.

**Done when:** a full game with every rule toggle can be played end to end on phones and desktop, and the Playwright scenarios in 07-testing §6 pass.

## M6 — Polish
- All animations and sounds from 02-visual-design, haptics, reduced motion, colour-blind glyphs, keyboard play, screen-reader announcements.
- Chat and reactions.
- How to play page with diagrams.
- PWA manifest and icon, performance budget checks.

**Done when:** Lighthouse targets met (Performance ≥ 90, Accessibility ≥ 95 on mobile), visual tests approved, and a real play session with friends raises no blocking issues.

## M7 — Deploy
- Production build, single-origin deploy, HTTPS/WSS, health checks, logs, graceful shutdown notice.

**Done when:** friends can play on the public URL from different networks, including mobile data.

## M8 — Later (optional)
- Room snapshot persistence (SQLite) so games survive server restarts.
- Easy bot difficulty; RL bot trained with the headless runner.
- Urdu localisation with RTL.
- Spectators, local pass-and-play.

## Decisions

- Product name: **DoDice Ludo** ("do" = two in Urdu/Hindi, a nod to the two-dice game).
- No background music. Dice-roll and piece-move sounds play for **every** player, not only the one whose turn it is.
- Package manager: npm workspaces (pnpm not needed).

## Open decisions (do not block M0–M3)

- Hosting provider for the server. Render is the current favourite. Note: Vercel serverless functions can't keep WebSocket connections open, so the game server can't run there; the web client can. Render's free tier sleeps when idle and restarts end live games until M8 persistence exists.
