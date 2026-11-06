# 05 — Client–Server Protocol

Transport: Colyseus room `ludo`, joined by room code. Synced state uses Colyseus Schema (automatic patches). Commands are Colyseus messages. Animation and log information arrives as `events` messages. Types live in `@ludo/protocol` and are shared by server and client.

## 1. Connecting

| Step | Client call | Server |
|---|---|---|
| Create room | `POST /api/rooms` → `{ code }`, then join by ID | `onCreate` sets `roomId = code`, creator becomes host on join |
| Check room | `GET /api/rooms/:code` → `{ exists, phase, seatsFree }` | Used by Home "Continue game" and the join screen |
| Join / rejoin | `joinById(code, { playerToken, name, avatar })` | §4.2 of 03-architecture: rebinds an existing seat or adds a member |

Join errors (close codes / error messages): `ROOM_NOT_FOUND`, `GAME_IN_PROGRESS`, `ROOM_FULL`, `NAME_INVALID`.

## 2. Synced state (Schema)

The Schema is a projection of the engine state plus room data. Shown as TypeScript-like pseudo-types.

```ts
RoomState {
  phase: 'lobby' | 'playing' | 'finished'
  code: string
  hostId: string                       // member id (not the token)
  settings: SettingsSchema             // engine settings + turnTimer + disconnectTakeover + preset
  members: Map<memberId, Member>       // everyone connected or holding a seat
  seats: Map<Color, Seat>              // occupied seats only
  game: GameSchema | null              // null in lobby
  serverTime: number                   // for clock offset
}

Member { id, name, avatar, connected, ready, seat: Color | '' }

Seat {
  color, memberId | '' (bots have none), isBot, connected,
  autoplay, botControlled          // bot currently playing for this human
  offlineSince: number             // 0 when online
  timeouts: number                 // consecutive timeouts
}

GameSchema {
  version: number
  pieces: Array<{ id, color, progress }>
  players: Map<Color, { hasKilled, finishedRank, handoverDelayLeft }>
  turn: {
    seat, controls,
    phase: 'awaitRoll' | 'awaitMove' | 'gameOver',
    rollReason: 'turn' | 'reroll' | 'bonus' | 'bonusReroll' | '',
    bank: number[],                // values only
    lastRoll: number[],            // for dice display
    deadline: number               // server ms timestamp, 0 = no timer
    takeoverAt: number             // when the bot takes over an offline seat, 0 = n/a
  }
  legalMoves: Array<{ pieceId, value, to, captures: string[], finishes }>
  rankings: Color[]
  winningTeam: Color[]
  stats: Map<Color, { captures, lost, sixes, voids, botTurns }>
}
```

Notes:
- `legalMoves` is only meaningful for the acting seat but is synced to everyone (it reveals nothing secret and lets spectating UIs show hints later).
- `version` is what the client sends back as `stateVersion`.

## 3. Client → server messages

| Message | Payload | Who | Phase |
|---|---|---|---|
| `setProfile` | `{ name, avatar }` | anyone | any |
| `takeSeat` | `{ color }` | member | lobby |
| `leaveSeat` | `{}` | member | lobby |
| `setReady` | `{ ready }` | seated member | lobby |
| `updateSettings` | `Partial<Settings>` or `{ preset }` | host | lobby |
| `addBot` / `removeSeat` | `{ color }` | host | lobby |
| `startGame` | `{}` | host | lobby |
| `roll` | `{ stateVersion }` | acting seat | playing |
| `move` | `{ stateVersion, pieceId, value }` | acting seat | playing |
| `setAutoplay` | `{ on }` | seated member | playing |
| `hostBotTakeover` | `{ color }` | host | playing (target offline) |
| `endGame` | `{}` | host | playing |
| `rematchVote` | `{ yes }` | seated member | finished |
| `backToLobby` | `{}` | host | finished |
| `chat` | `{ text }` | member | any |
| `react` | `{ emoji }` | member | any |

Commands that change game state are answered via `room.request` style acknowledgements: `{ ok: true }` or `{ ok: false, code, message }`. The client re-enables input on either.

## 4. Server → client messages

| Message | Payload | Notes |
|---|---|---|
| `events` | `{ version, events: GameEvent[] }` | Sent after the state patch for that version. Clients ignore batches older than what they have rendered. |
| `chat` | `{ from, text, at }` | |
| `react` | `{ from, emoji }` | |
| `notice` | `{ code, params }` | Toast-worthy room events: `playerReconnected`, `botTookOver`, `hostChanged`, `settingsChanged`, `serverShutdown` |
| `kicked` | `{ reason: 'otherTab' \| 'removedByHost' \| 'roomClosed' }` | Followed by close |

`GameEvent` is exactly the engine event union (04-engine §9), plus room-level events: `BotActed { seat, cause: 'timeout' | 'offline' | 'autoplay' | 'bot' }`.

## 5. Error codes

| Code | Meaning |
|---|---|
| `STALE_STATE` | `stateVersion` didn't match; client should wait for the next patch |
| `NOT_YOUR_TURN`, `WRONG_PHASE`, `ILLEGAL_MOVE`, `VALUE_NOT_IN_BANK`, `NO_SUCH_PIECE`, `GAME_OVER` | From the engine |
| `NOT_HOST`, `NOT_SEATED`, `SEAT_TAKEN`, `SEAT_NOT_ALLOWED`, `CANNOT_START` | Room rules |
| `RATE_LIMITED`, `BAD_PAYLOAD` | Abuse protection |

## 6. Ordering guarantees

1. For each accepted action, the server updates state, then sends the patch, then the `events` batch (`afterNextPatch`). The client therefore always has the final state before it animates towards it.
2. Events carry the `version` they produced. After a reconnect the client discards its queue and renders the synced state directly.
3. One action is processed at a time per room; there are no concurrent writes.
