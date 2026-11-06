# 04 — Rules Engine

The engine is a pure TypeScript package (`@ludo/engine`) with no dependencies and no I/O. It implements [RULES.md](../RULES.md) exactly. The server, the bot and tests all use it; the client uses its geometry helpers.

```ts
apply(state: GameState, action: Action, rng: Rng): Result
// Result = { ok: true; state: GameState; events: GameEvent[] }
//        | { ok: false; error: EngineError }
```

`apply` never mutates its input. Same state + action + rng sequence always gives the same result.

## 1. Board geometry

### 1.1 Colours, order, teams

```ts
type Color = 'red' | 'green' | 'yellow' | 'blue';
const TURN_ORDER: Color[] = ['red', 'green', 'yellow', 'blue']; // clockwise
const OPPOSITE = { red: 'yellow', yellow: 'red', green: 'blue', blue: 'green' };
const START: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
```

Teams: `red + yellow` vs `green + blue`. In 2-player games the two seats must be opposite. 3-player games may use any three colours.

### 1.2 Progress

Each piece stores a **progress** value relative to its own colour:

| Progress | Meaning |
|---|---|
| `-1` | In the yard |
| `0` | Own start square |
| `0..50` | On the shared track |
| `51..55` | In own finishing column (private, no captures) |
| `56` | Home (finished) |

Track square (absolute index 0–51) for progress `p ≤ 50`: `(START[color] + p) % 52`.

### 1.3 Safe squares

Absolute track indices `0, 8, 13, 21, 26, 34, 39, 47` (the four start squares and the four stars 8 squares past each start). Stored as data in `board.ts`.

### 1.4 Screen coordinates

`board.ts` also exports the 15×15 grid cell for every absolute track index, every column square, yard slots and home positions, plus `pathBetween(color, fromProgress, toProgress)` for animations. The client rotates the whole board for the local player; coordinates in the engine are always in the canonical orientation (red bottom-left).

## 2. Data model

```ts
interface Settings {
  diceMode: 1 | 2;
  extraTurnOnCapture: boolean;
  extraTurnOnFinish: boolean;
  singleDieWhenAllInColumn: boolean;
  killRequiredToEnterColumn: boolean;
  teamMode: boolean;
  teamHandover: 'immediate' | 'delayed';
  teamHandoverDelayRounds: number;      // 1..10, default 4
  // turnTimer and disconnectTakeover are server settings, not engine settings
}

interface Piece { id: string; color: Color; progress: number }  // id like "red-2"

interface PlayerState {
  color: Color;
  hasKilled: boolean;          // kill-to-enter credit
  finishedRank: number | null; // FFA: 1, 2, 3...; teams: order of finishing
  handoverDelayLeft: number;   // team mode, delayed handover
}

interface Die { value: 1|2|3|4|5|6; chain: 'main' | `bonus-${number}` }

type Phase =
  | { kind: 'awaitRoll'; reason: 'turn' | 'reroll' | 'bonus' | 'bonusReroll'; chain: Die['chain'] }
  | { kind: 'awaitMove' }
  | { kind: 'gameOver' };

interface GameState {
  version: number;             // increments on every successful action
  settings: Settings;
  seats: Color[];              // colours in play, in turn order
  players: Record<Color, PlayerState>;
  pieces: Piece[];
  turn: {
    seat: Color;               // whose turn it is (who acts)
    controls: Color;           // whose pieces are moved (differs during team handover)
    phase: Phase;
    bank: Die[];               // rolled, unplayed dice
    nextBonusId: number;
  };
  rankings: Color[];           // FFA finishing order
  winningTeam: [Color, Color] | null;
  turnNumber: number;
}
```

## 3. Actions

```ts
type Action =
  | { type: 'roll'; seat: Color }
  | { type: 'move'; seat: Color; pieceId: string; value: number };
```

Server-only concerns (timers, bot takeover, autoplay, host controls, chat) are not engine actions. The bot produces ordinary `roll` / `move` actions.

## 4. Turn state machine

```
                ┌──────────────────────────────────────────────────┐
                ▼                                                  │
  start turn → awaitRoll(turn) ──roll──▶ evaluate roll             │
                                        │                          │
            ┌───────────────────────────┼──────────────┐           │
            ▼                           ▼              ▼           │
   not playable:               playable + re-roll   playable, no   │
   void chain (see §5.3)       trigger:             re-roll:       │
                               awaitRoll(reroll)    awaitMove      │
                                                       │           │
                       move ◀──────────────────────────┘           │
                        │                                          │
            ┌───────────┼──────────────────────┐                   │
            ▼           ▼                      ▼                   │
   capture/finish   bank not empty         bank empty ─────────────┘
   with bonus on:   → awaitMove            → end turn → next seat
   awaitRoll(bonus)
```

### 4.1 Starting a turn

1. `seat` = next seat in `TURN_ORDER` that is active (see §7 for skipping rules).
2. `controls` = `seat`, or the teammate during team handover.
3. Phase `awaitRoll(turn)` with chain `main`. Bank is empty.

### 4.2 Dice count

Computed for each roll from the pieces of `controls`:

```
if settings.diceMode == 1 → 1
unfinished = pieces of `controls` with progress < 56
if unfinished.length == 1 and 51 ≤ unfinished[0].progress ≤ 55 → 1   (Rule A)
if singleDieWhenAllInColumn and every unfinished piece is 51..55 → 1 (Rule B)
otherwise → 2
```

### 4.3 Re-roll trigger

- 1 die: the value is 6.
- 2 dice: both are 6.

## 5. Rolling

### 5.1 Procedure

1. Roll `n` dice (n from §4.2), tag them with the phase's chain.
2. `candidate = bank + new dice`.
3. If `canPlayAll(state, candidate)`:
   - bank = candidate.
   - If re-roll trigger: phase `awaitRoll(reroll or bonusReroll)` with the same chain. Emit `RerollGranted`.
   - Else: phase `awaitMove`.
4. Else: void (§5.3).

### 5.2 Invariant

**Whenever the phase is `awaitMove`, the bank can be fully played from the current position.** Every roll that is accepted and every move that is allowed keeps this true. This is what makes voiding a bonus chain safe: removing it returns to a bank that was already known to be playable.

### 5.3 Voiding

- Chain `main`: the whole bank is discarded (it only ever contains `main` dice at this point) and the turn ends. Emit `RollVoided { scope: 'turn' }`.
- Chain `bonus-k`: remove every die with chain `bonus-k` (including earlier accepted rolls of the same bonus chain). Emit `RollVoided { scope: 'bonus' }`. If the bank is now empty the turn ends, otherwise phase becomes `awaitMove`.

## 6. Moving

### 6.1 Single-move legality

A move of piece `p` (colour = `controls`) by `v` (a value present in the bank) is **single-legal** when:

| Piece state | Rule |
|---|---|
| Yard (`-1`) | Only `v == 6`; destination progress `0` |
| Track / column | Destination `p.progress + v ≤ 56` (exact finish) |
| Kill-to-enter on and player can't enter column | Destination must be `≤ 50` |
| Home (`56`) | Never |

A player **can enter the column** when the rule is off, or `players[controls].hasKilled` is true. (A piece already in the column implies this was true, so it stays satisfied.)

### 6.2 Full legality

A move is **legal** when it is single-legal **and** `canPlayAll(stateAfterMove, bank − v)` is true. Only legal moves are accepted, and the legal-move list sent to clients contains exactly these.

### 6.3 Applying a move

1. Remove one die with value `v` from the bank (if several, the earliest).
2. Set the piece's progress. Emit `Moved { pieceId, from, to, value, path }`.
3. Resolve the **destination square** (§6.4), then the **departure square** (§6.5), only for track squares that are not safe.
4. If the piece reached 56, emit `PieceFinished`. If all four pieces of that colour are home, run §7.3.
5. Determine bonus: `extraTurnOnCapture` and this move captured, or `extraTurnOnFinish` and the piece finished. Leftover captures (§6.5) never give a bonus. At most one bonus per move. No bonus if the acting seat has nothing left to control (game over or the player finished in FFA).
6. Next phase:
   - Bonus → `awaitRoll(bonus)` with chain `bonus-${nextBonusId++}`. Emit `BonusGranted { reason }`.
   - Else if bank not empty → `awaitMove`.
   - Else end turn.

### 6.4 Captures at the destination

Let `S` be the destination track square, `mover` the moved piece's colour.

**Free-for-all:** every piece of another colour on `S` is captured (all of one owner, since two different owners can only share safe squares). Credit goes to `mover`.

**Team mode:** enemies are pieces of the other team on `S`.
- No enemies → nothing.
- Enemies all from one owner (single piece or same-owner stack) → all captured. Credit: `mover`.
- Enemies from both enemy players (a **mixed stack**) → captured only if, after landing, `S` holds pieces of **both** attacking players (the mover plus at least one piece of the mover's teammate already sitting there). Then all enemy pieces on `S` are captured; credit goes to **both** attacking players; the bonus (if enabled) goes to the acting seat only. Otherwise the mover just sits on `S`.

Captured pieces go to progress `-1`. Every credited player gets `hasKilled = true` (emit `KillUnlocked` when it changes). During team handover, credit goes to the owner of the moving piece (`controls`), never to the finished player.

### 6.5 Leftover capture at the departure square (team mode)

After a piece leaves square `D` (not safe, on the track): if `D` still holds pieces of the mover's team that are now all from **one** owner, and `D` also holds enemy pieces, those remaining team pieces are captured by the enemies there. Credit (kill-to-enter only) goes to the owners of the enemy pieces on `D`. No bonus.

### 6.6 Kill-to-enter reset

After any capture, for each victim colour: if all four of its pieces are in the yard (`-1`), set `hasKilled = false` (emit `KillReset`). A colour with any piece in the column or home can never reach this state.

## 7. Turn order, finishing and game end

### 7.1 Next seat

Go clockwise from the current seat through `seats`, skipping:
- FFA: players who have finished.
- Teams: a finished player whose teammate has also finished (game is over anyway); a finished player with `handoverDelayLeft > 0` (decrement it and emit `TurnSkipped { reason: 'handoverDelay' }`).

### 7.2 Team handover

When a team player finishes and their teammate has not, `controls` for that player's future turns is the teammate. With `delayed`, `handoverDelayLeft = teamHandoverDelayRounds` first. Dice-count rules (§4.2), kill-to-enter and kill credit all use the teammate's pieces and status.

### 7.3 Player finishes all pieces

- FFA: assign the next rank. If only one player is unfinished, they get the last rank and the game ends.
- Teams: if the teammate has also finished, that team wins and the game ends. Otherwise handover begins (§7.2).
- Any dice left in the bank at this moment are impossible (the finishing move would not have been legal), so the turn simply ends.

### 7.4 Game over

Phase `gameOver`. Emit `GameOver { rankings | winningTeam }`. All further actions return `GAME_OVER`.

## 8. The playability search

```ts
canPlayAll(state, controls, values: number[]): boolean
```

Depth-first search: if `values` is empty → true. Otherwise for each **distinct** value, for each **distinct** single-legal move with that value (pieces of the same colour at the same progress are interchangeable), apply the move **including captures and kill credit** (so a capture can unlock the column for a later die), and recurse with that value removed. Return true on the first success.

- Memoise on `(positions of all pieces, hasKilled flags, sorted remaining values)`.
- Bonus rolls are not part of the search (they haven't happened yet).
- Bank sizes are almost always ≤ 4; even 10 dice with 4 pieces stay small thanks to deduplication and memoisation. A property test checks the search against brute force over all permutations (07-testing).

`legalMoves(state)` returns every legal `{ pieceId, value, from, to, captures, finishes }`; the server syncs this list so clients never compute legality themselves.

## 9. Events

Events describe what happened, in order, for animations and the game log.

| Event | Payload |
|---|---|
| `TurnStarted` | seat, controls |
| `Rolled` | seat, values, diceCount, reason |
| `RerollGranted` | seat |
| `RollVoided` | seat, scope (`turn` / `bonus`), values |
| `Moved` | pieceId, from, to, value, path |
| `Captured` | victims[], at, creditedTo[], kind (`landing` / `leftover`) |
| `KillUnlocked` / `KillReset` | color |
| `PieceFinished` | pieceId |
| `BonusGranted` | seat, reason (`capture` / `finish`) |
| `PlayerFinished` | color, rank |
| `HandoverStarted` | seat, controls, delay |
| `TurnSkipped` | seat, reason |
| `GameOver` | rankings / winningTeam |

## 10. Errors

`NOT_YOUR_TURN`, `WRONG_PHASE`, `NO_SUCH_PIECE`, `VALUE_NOT_IN_BANK`, `ILLEGAL_MOVE`, `GAME_OVER`. The engine never throws for invalid input; it returns an error result.

## 11. Setup

`createGame(settings, seats, rng)` validates the seat set (2 players: opposite colours; teams: all four seats), places all pieces in yards, and picks the **first player at random**. Emits `TurnStarted`.
