# DoDice Ludo

**Online Ludo for friends, with two dice and real house rules.** Share a room code, take a corner, and play in the browser on any phone or computer. No accounts and no installs.

![A game in progress](docs/images/game.png)

## What makes it different

DoDice is Ludo as it is played at home, with the rules friends actually argue about, built in:

- **Two dice, played separately.** Roll both, then move each die on its own, on one piece or two.
- **All or nothing.** If you can't use every die, the whole roll is lost.
- **Double six rolls again,** with no limit, and every six is kept.
- **Capture before you go home.** You can't enter your home column until you've captured someone. If nobody is left to capture, you're out.
- **Teams.** Red and Yellow play Green and Blue. A pair of teammates on one square can only be captured by both enemies together.
- **Host's choice.** One die or two, bonus rolls for captures and finishing, a turn timer, and three presets: Classic, Two Dice and Hardcore.

The full rules are in [RULES.md](RULES.md), and the in-game **How to play** page explains them with pictures.

## Screenshots

| Lobby: seats, rules and chat          | Pick your look                      |
| ------------------------------------- | ----------------------------------- |
| ![Lobby](docs/images/lobby.png)       | ![Themes](docs/images/themes.png)   |
| **Start screen**                      | **Results**                         |
| ![Start screen](docs/images/home.png) | ![Results](docs/images/results.png) |

<p align="center"><img src="docs/images/mobile.png" alt="Playing on a phone" width="300"></p>

## Features

- **Rooms by code or link.** Up to 4 players plus people watching, with a QR code for the people next to you.
- **Bots** fill empty seats, play for anyone whose turn timer runs out, and take over offline players.
- **Never lose your seat.** Refresh, switch networks or lose signal, and you're put straight back. If the server restarts, your room comes back with the same code, everyone's seats, the rules and the bots.
- **Your own style.** 5 boards, 5 piece styles and 5 dice styles, plus generated avatars. Each player's choice is saved in their own browser.
- **Chat and quick reactions,** sounds made in the browser, vibration on your turn, and a layout made for phones as well as desktops.
- **Installable app (PWA).** Add it to your home screen or desktop. It opens instantly, works offline up to the point of joining a game, and offers updates without interrupting a game.
- **Accessible.** Keyboard play (Space rolls), screen-reader announcements, colour-blind markers and reduced motion.

## Run it locally

You need **Node.js 22 or newer** (with npm).

```bash
npm install

# terminal 1: the game server (http://localhost:2567)
npm run server

# terminal 2: the web app (http://localhost:5173)
npm run dev:web
```

Open http://localhost:5173, press **Create game**, and share the room link. Friends on the same Wi-Fi can open the app at your computer's local address, for example `http://192.168.1.20:5173`. To test alone, open a second browser window (or a private one) and join your own room, or fill the empty seats with bots.

> If the page stays blank after you pull new changes or install packages, restart the web app with `npm run dev:web -- --force` so it rebuilds its module cache.

## Scripts

| Command                           | What it does                                                  |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run server`                  | Starts the game server (`PORT` sets the port, default 2567)   |
| `npm run dev:web`                 | Starts the web app with live reload                           |
| `npm test`                        | Unit and integration tests (rules engine, bot, server, web)   |
| `npm run e2e`                     | Browser tests with Playwright (starts its own servers)        |
| `npm run typecheck`               | Type-checks every package                                     |
| `npm run lint` / `npm run format` | ESLint / Prettier                                             |
| `npm run sim`                     | Plays random games in six setups to check the rules engine    |
| `npm run arena`                   | Pits the bot against simpler players and reports its win rate |

For browser tests, install Chromium once with `npx playwright install chromium`.

## Deploying: Render (game server) and Vercel (web app)

The game server needs a host that keeps WebSocket connections open, so it goes on **Render**. The web app is a static site, so it goes on **Vercel**. Both read their settings from this repo ([render.yaml](render.yaml), [vercel.json](vercel.json)) and redeploy on every push.

**1. Game server on Render**

1. Push the repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo, and apply. This creates the `dodice-ludo-server` web service from `render.yaml` (build `npm ci`, start `npm run server`, health check `/healthz`, Node 22).
3. When it's live, copy its address, for example `https://dodice-ludo-server.onrender.com`, and open `/healthz` on it to check that it answers `{"ok":true}`.

Prefer to click through instead of using a Blueprint? Create a **Web Service** with runtime Node, build command `npm ci`, start command `npm run server` and health check path `/healthz`. Render sets `PORT` itself.

**2. Web app on Vercel**

1. In Vercel: **Add New → Project**, import the same repo, and leave **Root Directory** as the repo root. The build settings come from `vercel.json`.
2. Under **Environment Variables**, add `VITE_SERVER_URL` with the Render address from step 1 (no trailing slash).
3. Deploy. Room links like `/r/ABC123` work on refresh, and the service worker is never cached, so updates reach players.

`VITE_SERVER_URL` is built into the app, so after changing it, redeploy on Vercel.

**Good to know**

- **Free Render instances sleep** after about 15 minutes without traffic, and the first visit then takes up to a minute to wake it. The app handles this: it starts waking the server as soon as the home page opens and shows "Waking up the server…" until it answers.
- **Rooms live in the server's memory.** On a restart or deploy, connected players are put back into their room automatically (same code, seats, rules and bots), but a game in progress has to be started again. So deploy when nobody is mid-game, or use a paid instance, which doesn't sleep.

## How it's built

| Package             | What it is                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/engine`   | The rules: pure TypeScript with no dependencies, fully tested, shared by the server and the bot |
| `packages/protocol` | Shared types, presets and limits for the client and server                                      |
| `packages/bot`      | A heuristic bot that plans a whole roll at a time                                               |
| `apps/server`       | The game server, built on [Colyseus](https://colyseus.io). It owns the game and rolls the dice  |
| `apps/web`          | The web app: React, an SVG board, Motion animations and Tailwind CSS                            |
| `e2e`               | Playwright tests that play real games in real browsers                                          |

The design documents (product, visual design, architecture, engine, protocol, bot, testing and roadmap) are in [docs/](docs/README.md).

## Credits

Avatars are made with [DiceBear](https://www.dicebear.com): Avataaars and Bottts by Pablo Stanley, and ToonHead by Johan Melin under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). All other artwork, sounds and themes are drawn in code.
