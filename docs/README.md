# Ludo: Planning Documents

These documents describe the whole product before any code is written. Implementation follows them in the order set by the roadmap.

| #   | Document                                     | What it covers                                                           |
| --- | -------------------------------------------- | ------------------------------------------------------------------------ |
| —   | [../RULES.md](../RULES.md)                   | Game rules and host settings. **The source of truth for gameplay.**      |
| 01  | [01-product-and-ux.md](01-product-and-ux.md) | Screens, user flows, interactions, every state the UI must handle        |
| 02  | [02-visual-design.md](02-visual-design.md)   | Design system, board and piece art, motion, sound, accessibility         |
| 03  | [03-architecture.md](03-architecture.md)     | Tech stack, repo layout, server and room design, connections, deployment |
| 04  | [04-engine.md](04-engine.md)                 | Rules engine: data model, board geometry, state machine, algorithms      |
| 05  | [05-protocol.md](05-protocol.md)             | Client–server contract: synced state, messages, events, errors           |
| 06  | [06-bot.md](06-bot.md)                       | Heuristic bot, timer and takeover behaviour                              |
| 07  | [07-testing.md](07-testing.md)               | Test strategy and the rule test catalogue                                |
| 08  | [08-roadmap.md](08-roadmap.md)               | Milestones, build order, acceptance criteria                             |

## Key decisions

| Area            | Decision                                                                     | Why                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript everywhere                                                        | One language; the engine is shared by server, client and bot                                                                                        |
| Realtime server | **Colyseus 0.18**                                                            | Rooms, custom room IDs, automatic client reconnection with a server-side grace period, state sync. Actively maintained (0.18 released August 2026). |
| Rules engine    | Custom, pure TypeScript, no dependencies                                     | No library understands these rules. Pure functions make it testable and reusable by the bot (and a future RL bot).                                  |
| Client          | React 19 + Vite, SVG board, Motion for animation, Tailwind CSS               | Responsive, crisp at any size, rich animation without a game engine                                                                                 |
| Identity        | No accounts. A random player token stored in the browser plus a display name | The token lets players reclaim their seat after any disconnect                                                                                      |
| Persistence     | Rooms live in server memory (v1). Snapshot-to-SQLite is a later milestone    | Simple. A server restart losing live games is acceptable at first                                                                                   |
| Bots            | Heuristic bot in v1; RL bot later                                            | Needed for timers, disconnects and empty seats                                                                                                      |

## Not in scope for v1

Accounts, matchmaking with strangers, spectators, in-app purchases, leaderboards, RL bot, native apps.
