# 03 — Architecture

## 1. Overview

```
 Browser (React app)                         Node server (Colyseus 0.18)
┌──────────────────────────┐   WebSocket   ┌────────────────────────────────┐
│ UI (React, SVG, Motion)  │◀────────────▶│ LudoRoom (one per room code)    │
│ Colyseus SDK             │   state sync  │  ├─ seats, presence, settings   │
│  - auto reconnect        │   + messages  │  ├─ @ludo/engine (pure rules)   │
│ @ludo/engine (read-only: │               │  ├─ @ludo/bot (heuristic)       │
│  path geometry, helpers) │               │  ├─ timers (room clock)         │
└──────────────────────────┘               │  └─ dice RNG (crypto)           │
                                           └────────────────────────────────┘
```

- The **server is authoritative**. It rolls the dice, validates every action with the engine, and is the only place state changes.
- The **client never decides rules**. It renders the synced state, plays animations from events, and sends intents (roll, move). It imports the engine only for geometry and display helpers (for example to compute animation paths).

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5 (strict) | Shared types end to end |
| Package manager / monorepo | npm workspaces | |
| Realtime server | **Colyseus 0.18** (`colyseus`, `@colyseus/schema` 5) | Rooms, custom room IDs, reconnection, state sync, room clock |
| HTTP | Colyseus `defineServer` routes | Health check, room-exists check |
| Client SDK | `@colyseus/sdk` | Auto-reconnect, typed against the server |
| UI | React 19 + Vite | |
| Styling | Tailwind CSS 4 with CSS-variable design tokens | |
| Animation | Motion (`motion`) | |
| Client state | Zustand | Local UI state; room state comes from Colyseus |
| Routing | React Router | |
| Sound | Howler.js | |
| Icons | lucide-react | |
| QR codes | `qrcode` | Lobby share sheet |
| Tests | Vitest, fast-check (property tests), Playwright (end to end) | |
| Lint / format | ESLint, Prettier | |

Exact versions are pinned when the project is created; Colyseus APIs referenced here must be checked against its docs at that time (see §9).

## 3. Repository layout

```
ludo/
├─ RULES.md
├─ docs/                     planning documents
├─ packages/
│  ├─ engine/                pure rules engine, zero dependencies
│  │  ├─ src/
│  │  │  ├─ board.ts         geometry: track, columns, safe squares, colour offsets
│  │  │  ├─ types.ts         GameState, Settings, Action, Event, Move
│  │  │  ├─ setup.ts         createGame(settings, seats)
│  │  │  ├─ moves.ts         single-move generation and application
│  │  │  ├─ playability.ts   "can the whole bank be played?" search
│  │  │  ├─ reducer.ts       apply(state, action, rng) → { state, events }
│  │  │  ├─ teams.ts         handover, team captures
│  │  │  └─ index.ts
│  │  └─ test/
│  ├─ bot/                   heuristic bot, depends on engine
│  └─ protocol/              message names, payload types, Schema classes, error codes
├─ apps/
│  ├─ server/                Colyseus server, LudoRoom
│  └─ web/                   React client
├─ e2e/                      Playwright multi-browser tests
└─ package.json
```

## 4. Server design

### 4.1 Room lifecycle

- One room type, `ludo`. One room instance per game, identified by a **6-character room code** (alphabet without look-alikes: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
- Creating: the client calls `client.create('ludo', joinOptions)`; the room's `onCreate` sets `this.roomId` to a freshly generated code (retried on collision) and the creator joins as host.
- Joining: `client.joinById(code, { playerToken, name, avatar })`.
- `maxClients = 4` humans plus reconnecting clients. Bots don't use connections.
- `autoDispose = false`. The room disposes itself when:
  - no human has been connected for **30 minutes**, or
  - the game finished and nobody has been connected for 5 minutes, or
  - the lobby has been empty for 5 minutes.
- Room phases: `lobby` → `playing` → `finished` → (`lobby` again via rematch or back-to-lobby).

### 4.2 Seats and identity

- A **seat** belongs to a player token, not to a connection. `seats[color] = { token, name, avatar, isBot, connected, ... }`.
- `onJoin` with a token that already owns a seat → rebind that seat to the new `sessionId` (this is how page refreshes and long disconnects recover). If an older connection for the same token is still open, it is sent `kicked: other-tab` and closed.
- `onJoin` with a new token: in `lobby`, accepted as a seatless member until they pick a seat; in `playing`/`finished`, rejected with `GAME_IN_PROGRESS`.
- The **host** is the room creator. If the host is disconnected for over 60 s, host role passes to the longest-connected human.
- Player tokens are never sent to other clients (only seat colour, name, avatar, flags).

### 4.3 Reconnection (three layers)

| Layer | Handles | Mechanism |
|---|---|---|
| 1. Transport auto-reconnect | Network blips, Wi-Fi ↔ mobile switches, short sleeps | Colyseus SDK reconnects automatically after an abnormal close (close codes 1001, 1005, 1006, 4010 only). Server `onDrop` marks the seat `connected=false` and calls `allowReconnection(client, 120)`; `onReconnect` marks it connected. State listeners on the client survive. **Client settings:** the SDK defaults are `minUptime` 5 s (no auto-reconnect for younger connections), 15 retries, 5 s max delay; the web client sets `minUptime` to 1 s and raises retries, and falls back to layer 2 when they run out. |
| 2. Token rejoin | Page refresh, app killed, reconnection window expired | Client stores `{ roomCode, playerToken }` in `localStorage`. On loading `/r/:code` it calls `joinById` with the token; the server rebinds the seat (§4.2). `onLeave` therefore **never frees a seat during a game** — it only marks it offline. |
| 3. Server restart | Deploys, crashes | v1: games are lost; clients show "server restarted". Milestone M8: room snapshot persisted after every action and restored on boot under the same room code (see roadmap). |

Extra client behaviour:
- On `visibilitychange` → visible, and on the browser `online` event, the client checks the connection immediately instead of waiting for backoff.
- While disconnected, all input is disabled; pending clicks are not queued.
- After any reconnect the client trusts the synced state completely and clears its animation queue.

**Stale and duplicate actions:** every action carries `stateVersion` (the version the client saw). The server rejects actions whose version does not match the current one (`STALE_STATE`), so a click made on outdated state, or resent after a reconnect, can never apply twice or apply to the wrong situation.

### 4.4 Action handling

```
message ──▶ validate sender owns the acting seat (or host for host actions)
        ──▶ check phase + stateVersion
        ──▶ engine.apply(state, action, rng) → { state', events } | error
        ──▶ store state', version++
        ──▶ mirror state' into the Colyseus Schema (one mapping function)
        ──▶ broadcast events (afterNextPatch) for animations and log
        ──▶ schedule timers / bot for the new acting seat
```

- All room logic lives in `RoomController` (`apps/server/src/controller.ts`), a plain class with an injected clock, RNG and id generator, tested without a network. `LudoRoom` (`room.ts`) is a thin Colyseus adapter: it maps sessions to members, forwards `cmd` messages, and after every change writes `controller.view()` as JSON into the synced state (05-protocol §2), then broadcasts queued messages with `afterNextPatch`.
- One live session per member: a new connection for the same player token closes an older tab (`kicked: otherTab`) or cancels a pending reconnection slot.
- Every action is handled synchronously in one tick, so actions can never interleave.

### 4.5 Dice

- Rolled on the server with `crypto.randomInt(1, 7)`.
- The engine takes an injected `rng` so tests and bot simulations can use a seeded generator.
- The client never sees future rolls.

### 4.6 Timers and bot scheduling

Implemented with the room clock (`this.clock.setTimeout`), so they are cleaned up with the room.

- **Decision timer** (`turnTimer`): started whenever the acting seat must roll or move. Its deadline (`turnDeadline`, server timestamp) is synced so clients can draw the countdown. On expiry the bot makes that one decision; the seat's consecutive-timeout counter increases, and at 2 the seat goes into autoplay.
- **Disconnect takeover** (`disconnectTakeover`): when the acting seat is offline, a timer starts; on expiry the bot plays that seat's turns until it reconnects. Control returns at the start of the seat's next turn.
- **Bot pacing:** bot decisions run after a delay (roll: 700 ms; move: 600–900 ms, longer for captures) so humans can follow.
- The client clock offset is estimated from the server timestamps so countdowns match across devices.

### 4.7 Rate limiting and safety

- Chat: 1 message/s per connection, 120 characters, trimmed, control characters stripped. Text is always rendered as text, never HTML.
- Game messages: at most 20/s per connection; excess is dropped.
- Names: 2–16 characters, trimmed, unique per room (a number is appended on collision).
- Message payloads are validated against schemas before reaching the engine.

## 5. Client design

### 5.1 Modules

```
apps/web/src/
├─ app/               routes, providers, error boundary
├─ net/               Colyseus client, connection manager, room store
├─ game/              board SVG, pieces, dice, action area, animation queue
├─ lobby/             seats, rules panel, share sheet
├─ results/
├─ ui/                design system components (Button, Sheet, Toast, Toggle…)
├─ audio/             sound manager (Howler)
├─ i18n/              messages
└─ settings/          local preferences
```

### 5.2 Data flow

- `net/` owns the Colyseus connection and exposes a store with: connection status, the synced room state (as a plain snapshot), and an event stream.
- `game/` renders the **displayed state**, which lags the synced state only while animations play. The animation queue consumes events in order; when it is empty, displayed state equals synced state.
- User intents go through `net/` which attaches `stateVersion` and disables input until the server responds (state change or error).

### 5.3 Performance targets

- First load under 250 KB gzipped JS for the game route (code-split How to play and Results).
- 60 fps animations on a mid-range phone: only `transform` and `opacity` are animated.
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95 on mobile.
- PWA: installable, offline page ("You're offline") — gameplay itself needs a connection.

## 6. Deployment

| Part | Where | Notes |
|---|---|---|
| Server | A single always-on Node container on Fly.io, Railway or a small VPS | WebSockets need a long-running process. One instance is plenty for friends' games. Region close to the players. |
| Web | Static hosting (Cloudflare Pages / Netlify / Vercel), or served by the same Node server | Single origin is simplest (no CORS) |
| Domain / TLS | HTTPS + WSS required | Provided by the host |
| Config | `PORT`, `PUBLIC_URL`, `ALLOWED_ORIGINS`, `LOG_LEVEL` | |
| Health | `GET /healthz` | Used by the host's health checks |
| Logs | Structured JSON logs (room code, event, latency). No personal data beyond display names. | |

Deploys restart the server and (until M8) end live games, so deploys should happen when nobody is playing. The server sends a `server-shutdown` notice to clients before exiting.

Scaling beyond one process (Redis presence + driver) is supported by Colyseus but not needed for v1.

## 7. Security model

- No accounts and no personal data. The player token is a bearer secret for a seat; it stays in the owner's browser and is never broadcast.
- The server validates every action; a modified client can only send legal moves.
- Room codes are random and short-lived; there is no public room list.
- Basic abuse limits as in §4.7.

## 8. Observability

- Server metrics logged per room: actions per minute, reconnects, average reconnect time, timeouts, bot takeovers.
- Client sends nothing by default. An optional error reporter can be added later.

## 9. Verified against Colyseus 0.18 (M2 spike)

Confirmed with real servers and SDK clients in tests: custom `roomId` in `onCreate` and `joinById`; `onDrop` → `allowReconnection(client, seconds)` → `onReconnect`; request/reply via `room.request()` with handler return values; `afterNextPatch` ordering of messages after state.

Learned:
- Colyseus calls `process.send()` when it exists (PM2 integration), which breaks Vitest's child-process pool; tests run with `pool: 'threads'`.
- `express` must be a direct server dependency (it is only an optional peer of `@colyseus/core`).
- Schema 5 `t.number()` has no default (undefined) unless `.default(0)` is given.
