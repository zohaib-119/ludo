# 07 — Testing

## 1. Layers

| Layer                 | Tool                                | What                                                                |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Engine unit tests     | Vitest                              | Every rule in RULES.md, using hand-built positions                  |
| Engine property tests | fast-check                          | Invariants over random games                                        |
| Bot tests             | Vitest                              | Always legal; sensible choices in set positions; win rate vs random |
| Server tests          | Vitest + Colyseus testing utilities | Room lifecycle, seats, reconnect, timers (fake clock)               |
| End to end            | Playwright                          | 2–4 real browser contexts playing a game, network drop simulation   |
| Visual                | Playwright screenshots              | Board and key screens in light/dark, 3 breakpoints                  |

## 2. Test position helper

Tests build states with a compact DSL so each rule test reads like a diagram:

```ts
const s = position({
  settings: { diceMode: 2, killRequiredToEnterColumn: true },
  pieces: { red: [50, -1, -1, -1], yellow: [10, 12, -1, -1] },
  turn: { seat: 'red', bank: [3, 6] },
  hasKilled: { red: false },
});
```

Dice are injected with a scripted RNG: `rng([6, 6, 2, 3])`.

## 3. Rule test catalogue

Each line is at least one test. IDs are referenced from code comments.

**Dice and chains**

- D1 1-die: 6 grants re-roll; 5 doesn't.
- D2 2-dice: (6,6) grants re-roll; (6,3) doesn't.
- D3 Re-roll chain stacks without a cap (6,6)(6,6)(6,6)(2,3) → bank of 8 dice.
- D4 Main chain unplayable after a re-roll → whole bank void, turn ends.
- D5 (6,6) unplayable → no re-roll, void.
- D6 Exactly one of two dice playable → void (no partial play).

**Single die**

- S1 Rule A: one unfinished piece in column → 1 die.
- S2 Rule A doesn't apply when the single unfinished piece is on the track.
- S3 Rule B on: all unfinished in column → 1 die.
- S4 Rule B off: two pieces needing 1 each: (1,1) playable, (1,2) void.
- S5 With one die, a 6 grants re-roll.

**Movement**

- M1 Leave yard only on 6; lands on start square.
- M2 Exact finish; overshoot not legal.
- M3 No blocks: passing over stacks is fine.
- M4 Ordering matters: bank (6,3) with all pieces in yard is playable (6 out, then 3).
- M5 Order where capture unlocks the column for the second die is found by the search.

**Captures**

- C1 Landing on a single enemy captures it.
- C2 Same-owner stack captured together by one piece.
- C3 No capture on safe squares; mixed owners can share them.
- C4 Capture gives bonus only when the toggle is on; finish likewise.
- C5 Bonus rolled immediately with dice still in the bank; bonus dice join the bank.
- C6 Bonus chain unplayable → only bonus dice voided; original dice remain and are playable.
- C7 Bonus (6,6) accepted then its re-roll unplayable → the entire bonus chain voided.
- C8 Double capture counts as one bonus.

**Kill-to-enter**

- K1 Without a kill, moves past progress 50 are illegal.
- K2 After a capture the column opens, including within the same turn.
- K3 All four pieces back in the yard → requirement resets.
- K4 Piece in column → requirement never resets.

**Teams**

- T1 Teammates can't capture each other; they stack.
- T2 Single enemy can't capture a mixed stack and sits on it.
- T3 Second enemy (other enemy player) lands → both captured; both credited; bonus to the acting seat only.
- T4 Two pieces of the same enemy player can't capture a mixed stack.
- T5 Teammate leaves a mixed stack with a sitter → leftover captured, credit but no bonus.
- T6 Defender lands on a square where an enemy sits → enemy captured.
- T7 Immediate handover: finished player's next turn controls the teammate; dice count, kill status and credit use the teammate.
- T8 Delayed handover: the finished player's turns are skipped N times, then handover.
- T9 Team wins when both have finished.

**Game flow**

- G1 2-player games may use any two corners.
- G2 FFA rankings and game end when one player remains.
- G3 Finished FFA players are skipped.

## 4. Property tests (fast-check)

Random games with random settings, random seats and random legal actions, for thousands of games:

- P1 `apply` never throws and never mutates input.
- P2 Invariant: in `awaitMove`, `canPlayAll(bank)` is true.
- P3 Every piece's progress is in `-1..56`; never two different teams on a non-safe square unless one side is a mixed stack (team mode) — never in FFA.
- P4 Total pieces per colour is always 4.
- P5 `canPlayAll` agrees with brute-force permutation search on random small positions.
- P6 Every game terminates (with random play) within a bounded number of turns, or is flagged for inspection.
- P7 `legalMoves` is non-empty in `awaitMove`, and every listed move is accepted.

## 5. Bot evaluation

- The bot never produces an illegal action (property test over random states).
- Bot vs random: win rate over 1,000 games, must be clearly higher than 25 % in 4-player FFA (target ≥ 60 %).
- Weight tuning: a script plays bot variants against each other in headless mode and reports win rates. This headless runner is also the starting point for the future RL work.

## 6. Server and end-to-end scenarios

- Create room, 3 players join by link, pick seats, host changes rules (everyone un-readied), start.
- Full 2-player game played by scripted browsers with seeded dice.
- Network drop for 5 s mid-turn: player reconnects automatically, state correct, no duplicated move.
- Page refresh mid-turn: seat reclaimed via token.
- Same token in two tabs: older tab kicked with the right message.
- Turn timer expiry: bot plays one decision; two expiries → autoplay; switching Auto mode off restores control.
- Offline player's turn with takeover 15 s: bot takes over, then returns control after reconnect at the next turn.
- Stale click: `move` with old `stateVersion` rejected and UI recovers.

## 6b. What exists (M4)

- `apps/web/test/connection.test.ts`: the client connection manager against a real server in Node — create/join, every join failure reason, refused clicks while offline, layer-1 auto-reconnect, layer-2 token rejoin, second tab + "Use here", room closing, leaving, event delivery.
- `apps/web/test/lobby-logic.test.ts`: the client's start-blocker messages agree with the server for all 32 seat/team combinations.
- `apps/web/test/components.test.tsx` (jsdom): rules panel (host vs guest, conditional options, change highlight), seat board (host controls), home page (name and code validation, pasted links, saved profile).
- `e2e/lobby.spec.ts` (Playwright, real browsers, server and web app started by the config): four-player lobby flow with rule changes un-readying everyone, refresh keeping the seat in lobby and game, second tab, unknown/started rooms, leaving, going offline and back.
- `e2e/game.spec.ts`: turns against bots, a full autoplay game to results and rematch, host ending a game, an offline player with host takeover.
- `e2e/extras.spec.ts`: chat and reactions between players (lobby and game), the QR code, the How to play page and its links, the app manifest and icons, screen-reader turn announcement.
- Run with `npm test` and `npm run e2e`. CI (`.github/workflows/ci.yml`) runs typecheck, lint, the format check, unit tests and the browser tests. Set `PW_CHROMIUM_PATH` to use an already-installed Chromium instead of `npx playwright install`.

## 7. CI

All unit, property and server tests on every push. Playwright on the main branch and before deploys. Engine coverage target: 100 % of branches in `moves.ts`, `playability.ts`, `reducer.ts`, `teams.ts`.
