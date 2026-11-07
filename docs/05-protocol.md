# 05 — Client–Server Protocol

Transport: Colyseus room `ludo`, joined by room code. Synced state uses Colyseus Schema (automatic patches). Commands are Colyseus messages. Animation and log information arrives as `events` messages. Types live in `@ludo/protocol` and are shared by server and client.

## 1. Connecting

| Step          | Client call                                             | Server                                                                                                                                        |
| ------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Create room   | `client.create('ludo', { playerToken, name, avatar })`  | `onCreate` generates the code and sets `roomId = code`; the creator joins as host. Create options are never trusted (no client-chosen codes). |
| Check room    | `GET /api/rooms/:code` → `{ exists, phase, seatsFree }` | Used by Home "Continue game" and the join screen                                                                                              |
| Join / rejoin | `joinById(code, { playerToken, name, avatar })`         | §4.2 of 03-architecture: rebinds an existing seat or adds a member                                                                            |

Join errors (close codes / error messages): `ROOM_NOT_FOUND`, `GAME_IN_PROGRESS`, `ROOM_FULL`, `NAME_INVALID`.

## 2. Synced state

The Colyseus Schema has just two fields:

```ts
LudoState { revision: number; view: string }   // view = JSON.stringify(RoomView)
```

`RoomView` (defined in `packages/protocol/src/index.ts`) is the complete public picture of the room: code, phase, host, settings and detected preset, members, seats, the game (pieces, players, turn, bank, legal moves, rankings, stats) and rematch votes. `revision` increments on every change.

Why one JSON view instead of a field-by-field Schema mirror: the state is a few kilobytes and changes about once a second, so delta encoding saves nothing worth having, while a second model would have to be kept in sync with the engine by hand. Colyseus still provides join-time full state, reconnection and ordering. If bandwidth ever matters, the view can be split into Schema fields without changing the client contract.

Notes:

- `game.legalMoves` lists exactly the moves the server will accept for the acting seat.
- `game.version` is what the client sends back as `stateVersion`.
- `serverTime` is the server clock when the view last changed, for clock-offset estimation.

## 3. Client → server messages

| Message                 | Payload                             | Who           | Phase                    |
| ----------------------- | ----------------------------------- | ------------- | ------------------------ |
| `setProfile`            | `{ name, avatar }`                  | anyone        | any                      |
| `takeSeat`              | `{ color }`                         | member        | lobby                    |
| `leaveSeat`             | `{}`                                | member        | lobby                    |
| `setReady`              | `{ ready }`                         | seated member | lobby                    |
| `updateSettings`        | `Partial<Settings>` or `{ preset }` | host          | lobby                    |
| `addBot` / `removeSeat` | `{ color }`                         | host          | lobby                    |
| `startGame`             | `{}`                                | host          | lobby                    |
| `roll`                  | `{ stateVersion }`                  | acting seat   | playing                  |
| `move`                  | `{ stateVersion, pieceId, value }`  | acting seat   | playing                  |
| `setAutoplay`           | `{ on }`                            | seated member | playing                  |
| `hostBotTakeover`       | `{ color }`                         | host          | playing (target offline) |
| `endGame`               | `{}`                                | host          | playing                  |
| `rematchVote`           | `{ yes }`                           | seated member | finished                 |
| `backToLobby`           | `{}`                                | host          | finished                 |
| `chat`                  | `{ text }`                          | member        | any                      |
| `react`                 | `{ emoji }`                         | member        | any                      |

All commands go through one message type, `cmd`, sent with `room.request('cmd', command)`. Every command is answered with `{ ok: true }` or `{ ok: false, code, message }`; the client re-enables input on either. `applyPreset { preset }` sets the preset rule fields, and `leaveRoom` leaves explicitly (lobby: frees the seat; in game: the seat stays for the bot).

## 4. Server → client messages

| Message   | Payload                                                     | Notes                                                                                                            |
| --------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `welcome` | `{ memberId }`                                              | Sent right after joining or reconnecting, so the client knows which member it is                                 |
| `events`  | `{ version, events: GameEvent[] }`                          | Sent after the state patch for that version. Clients ignore batches older than what they have rendered.          |
| `chat`    | `{ from, text, at }`                                        |                                                                                                                  |
| `react`   | `{ from, emoji }`                                           |                                                                                                                  |
| `notice`  | `{ code, params }`                                          | Toast-worthy room events: `playerReconnected`, `botTookOver`, `hostChanged`, `settingsChanged`, `serverShutdown` |
| `kicked`  | `{ reason: 'otherTab' \| 'removedByHost' \| 'roomClosed' }` | Followed by close                                                                                                |

`RoomEvent` is the engine event union (04-engine §9) plus the room-level `BotActed { seat, cause: 'bot' | 'timeout' | 'offline' | 'autoplay' }`, which precedes the engine events of the decision the bot made. Seats in the view carry `autoplay`, `botControlled` and `timeouts`; the turn carries `deadline` and `takeoverAt` (server timestamps, 0 when not applicable).

## 5. Error codes

| Code                                                                                              | Meaning                                                            |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `STALE_STATE`                                                                                     | `stateVersion` didn't match; client should wait for the next patch |
| `NOT_YOUR_TURN`, `WRONG_PHASE`, `ILLEGAL_MOVE`, `VALUE_NOT_IN_BANK`, `NO_SUCH_PIECE`, `GAME_OVER` | From the engine                                                    |
| `NOT_HOST`, `NOT_SEATED`, `SEAT_TAKEN`, `SEAT_NOT_ALLOWED`, `CANNOT_START`                        | Room rules                                                         |
| `RATE_LIMITED`, `BAD_PAYLOAD`                                                                     | Abuse protection                                                   |

## 6. Ordering guarantees

1. For each accepted action, the server updates state, then sends the patch, then the `events` batch (`afterNextPatch`). The client therefore always has the final state before it animates towards it.
2. Events carry the `version` they produced. After a reconnect the client discards its queue and renders the synced state directly.
3. One action is processed at a time per room; there are no concurrent writes.
