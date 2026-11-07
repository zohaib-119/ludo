# 06 — Bot, Timers and Takeover

## 1. Purpose

One bot implementation (`@ludo/bot`) serves four situations:
1. A seat filled with a bot in the lobby.
2. A human's decision timer ran out (one decision).
3. A human is in autoplay (manual, or after 2 consecutive timeouts).
4. A disconnected human's turn waited longer than `disconnectTakeover`.

It produces ordinary engine actions, so it can never break a rule.

## 2. Interface

```ts
chooseAction(state: GameState, seat: Color): Action
```

- Phase `awaitRoll` → always `roll`.
- Phase `awaitMove` → evaluate the legal moves and return the best `move`.

## 3. Choosing a move

The bot plans the **whole remaining bank**, not one die at a time:

1. Enumerate complete play sequences for the bank (same search as `canPlayAll`, but collecting sequences instead of stopping at the first). Deduplicate sequences that end in the same position. If there are more than 2,000, sample the best per first move greedily.
2. Score each **final position** with the evaluation below, plus points for events along the way (captures, finishes).
3. Play the first move of the best sequence. After the server applies it (and any bonus roll), re-plan from scratch.

Ties are broken randomly so the bot doesn't feel robotic.

### 3.1 Evaluation (Normal difficulty)

Weights are constants in one file, tuned by self-play (07-testing §5).

| Feature | Weight (start value) |
|---|---|
| Each piece's progress | +1 per step |
| Piece in finishing column | +15 |
| Piece home | +30 |
| Piece leaving the yard | +12 |
| Capture made in the sequence | +40 per piece captured (+20 more if it unlocks kill-to-enter) |
| Own piece on a safe square | +6 |
| Own piece in a mixed teammate stack | +6 |
| **Danger**: own piece on a non-safe square with enemy pieces 1–6 squares behind it | −(progress × 0.4 + 8) × hit chance |
| Teammate's danger (team mode) | half weight |
| Stuck by kill-to-enter at square 50 with no kill | −5 per piece (encourages hunting) |

**Hit chance** is estimated per threatening enemy piece from the distance: single-die distances 1–6 with probability 1/6 each in 1-die mode; in 2-die mode distances 1–12 using each die separately and the combination of both on one piece (two-dice reach is larger and the bot accounts for it).

### 3.2 Difficulty

v1 ships **Normal** only. Easy (random legal move 40 % of the time) is trivial to add later. A future RL bot replaces the evaluation function with a trained network; the interface stays the same.

### 3.3 Measured strength (M3)

Against random players over 100 games each (`npm run arena`): 1-die 4-player 83 % wins, 2-dice 4-player 95 %, 2-dice with kill-to-enter 95 %, 1-vs-1 96 %, bot team vs random team 99 %. Decision time is under 4 ms even with large 2-dice banks.

## 4. Pacing

Every bot action (a roll, or playing one die) waits until players have seen the previous action animate, then 1 more second (`BOT_GAP_MS`). The server estimates the animation length with `estimateAnimationMs()` from `@ludo/protocol`, using the same timings the web client animates with. If the room has no connected humans, bots stop acting until someone returns.

## 5. Timer behaviour (server)

| Setting | Behaviour |
|---|---|
| `turnTimer = off` | No deadline for connected humans |
| `turnTimer = N s` | Each decision (roll or move) gets N seconds. Deadline synced as `turn.deadline`. Last 5 s: ticking sound and red ring. On expiry: bot makes **that one decision**, `timeouts++`, event `BotActed { cause: 'timeout' }`. Any manual action resets `timeouts` to 0. |
| 2 consecutive timeouts | Seat enters autoplay. Player sees a full-width bar "Autoplay is on — **I'm back**". Tapping it turns autoplay off **immediately**, resets the timeout count and starts a fresh timer for the current decision. |
| Timer vs. takeover | The decision timer also runs for an offline player; whichever of the timer and the takeover grace period ends first applies. |

## 6. Disconnect behaviour (server)

| Setting | Behaviour |
|---|---|
| `disconnectTakeover = N s` | When an offline seat becomes the acting seat (or the acting seat goes offline), set `takeoverAt = now + N s`. If the player reconnects first, cancel. On expiry the bot plays for the seat (`botControlled = true`) until the seat reconnects; control returns at the start of the seat's next turn so a move isn't snatched mid-animation. |
| `disconnectTakeover = never` | The game waits. The host can trigger takeover immediately with "Let bot play". |

Timers use the room clock, are cancelled on every state change, and are recreated from state after each action, so there is never more than one pending timer per room.
