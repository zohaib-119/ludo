# Custom Ludo: Rules Specification (v1)

Status: agreed in discussion, ready for the rules engine to be built from it.

## 1. Setup

- Players: 2, 3 or 4. Four pieces per player.
- Colors: red, green, yellow, blue. Opposite corners are red/yellow and green/blue.
- 2 players: they must sit in opposite corners. They choose the pair (red/yellow or green/blue) and which color each takes.
- 4 players: either free-for-all or teams. Teammates sit opposite each other (red+yellow vs green+blue), so turns alternate between teams.
- Dice mode: **1 die** or **2 dice** (host setting).

## 2. Host settings (room config)

| Setting | Values | Notes |
|---|---|---|
| `diceMode` | 1 or 2 | |
| `extraTurnOnCapture` | on / off | |
| `extraTurnOnFinish` | on / off | Piece reaches home |
| `singleDieWhenAllInColumn` | on / off | Rule B, see 4.2. Only matters in 2-dice mode |
| `killRequiredToEnterColumn` | on / off | See 6 |
| `teamMode` | on / off | 4 players only |
| `teamHandover` | `immediate` / `delayed` | Team mode only |
| `teamHandoverDelayRounds` | number (default 4) | Used when `delayed` |
| `turnTimer` | off / 15 / 30 / 45 / 60 s | Default off. See 12 |
| `disconnectTakeover` | 15 / 30 / 60 s / never | Default 30 s. See 12 |

## 3. Turn flow

1. **Roll** all dice (1 or 2).
2. **Re-roll rule**: a roll of **6** in 1-die mode, or **(6,6)** in 2-die mode, adds a re-roll. The 6s are banked and rolling continues. There is no cap on chains.
3. **Play**: once the chain ends, the player plays every banked die value as a separate move. Dice can be used in any order, and on the same piece or different pieces.
4. **Bonus rolls** (capture / finish, if enabled) are rolled **immediately** when the capture or finish happens, without waiting for the remaining banked moves to be played. The bonus dice are added to the bank of unplayed dice. 6s on a bonus roll chain and stack the same way as in step 2.
5. The turn passes to the next player when the bank is empty.

### 3.1 All-or-nothing

- **Every die must be playable.** The whole banked set must be playable in some order. If it isn't, the entire roll and bank are void and the turn passes. There is no partial play.
- A re-roll is only granted if the dice just rolled are playable at that moment. For example, (6,6) with no way to use both 6s gives no re-roll and the turn is void.
- Order matters, since one move can unlock another (a 6 brings a piece out, a capture opens the finishing column). The engine must search for an ordering that uses every die.
- A player must make a move whenever one is available.
- **Bonus dice are voided separately.** If adding the bonus dice (including their 6 chain) makes the remaining bank unplayable, only the bonus dice from that trigger are voided. The original unplayed dice stay in the bank and remain playable.

## 4. Single-die situations (2-dice mode)

The player rolls one die instead of two in these cases:

1. **Rule A**: exactly one unfinished piece that is in finishing column remains and the other three are home.
2. **Rule B** (host toggle `singleDieWhenAllInColumn`): all unfinished pieces are in the finishing column, with none on the track or in the yard.
   - **On**: one die.
   - **Off**: two dice, still bound by all-or-nothing. For example, two pieces that each need a 1 require exactly (1,1).

With one die, a 6 gives a re-roll.

## 5. Movement

- A piece leaves the yard only on a 6.
- Finishing needs an **exact** roll. Overshooting is not playable.
- Star squares are safe: no captures there.
- No blocks (stacks are never walls). Pieces can pass over and share squares freely.
- A captured piece returns to the yard.

## 6. Kill-to-enter (host toggle)

- When on, a player must capture at least one enemy piece before any of their pieces can enter the finishing column.
- Until then, pieces stop at the square before the column entrance and cannot lap the board again.
- If all four of a player's pieces are in the yard at once, the requirement resets.
- Once any piece has entered the column or gone home, the requirement is permanently satisfied.
- Captures made through a mixed teammate stack count as a kill for each capturing player (see 8.3).
- **No capture left = defeat.** A player who still needs a capture loses at once when no enemy piece can be captured any more: every enemy piece is in its finishing column or home. Enemy pieces in the yard still count as capturable (they must come out). There is no point waiting for the end.
  - Free-for-all: the player is out and takes the lowest remaining place (the first player out finishes last). Their pieces leave the board, their turns are skipped, and the others play on. When only one player is left, the game ends.
  - Teams: that team can never get both players home, so the other team wins immediately.

## 7. Capturing and stacks (no teams)

- Landing on a square holding an enemy piece captures it (unless the square is safe).
- Two pieces of the same owner on one square are captured **together** by one enemy piece.

## 8. Team mode (4 players)

### 8.1 Basics
- Each player plays their own four pieces.
- Teammates never capture each other and can stack harmlessly.
- The team wins when both teammates have finished all pieces.

### 8.2 Handover
- When a player finishes all pieces, they keep their seat and their own turn. On it they roll and move **their teammate's pieces**.
- `immediate`: starts as soon as they finish.
- `delayed`: they skip `teamHandoverDelayRounds` full rounds first.
- While controlling a teammate's pieces, all status belongs to the teammate who owns them: single-die rules, kill-to-enter progress and kill credit.
- The finished player earns no status or rewards of their own.

### 8.3 Mixed stack
A mixed stack has one piece from each teammate on the same square.
- A single enemy piece cannot capture it. It may land and sit on the square.
- If a teammate then moves away, the piece left behind is captured by the sitting enemy. This gives **no** extra turn but **counts** toward that enemy's kill-to-enter.
- If enemy pieces from **both** enemy teammates are on the square (one each), both pieces in the stack are captured. The extra-turn bonus (if enabled) goes only to the player whose turn it was. Kill credit goes to both enemy players.
- Two pieces from the **same** enemy player cannot capture a mixed stack.
- A same-owner stack (two pieces of one player) is captured together by a single enemy piece, as in section 7.

## 9. Winning

- Free-for-all: play continues until rankings are decided (1st, 2nd, 3rd).
- Teams: the first team to have both players finished wins.
- No draw mechanism.

## 10. Connection handling (non-gameplay requirement)

- The server owns the true game state and rolls the dice (but players click a button for that on UI)
- Players get a session token and rejoin their seat automatically after dropped connections or refreshes, receiving the full current state.
- Messages carry IDs or sequence numbers so a resent action is never applied twice.
- A disconnected player's seat is always kept for them. What happens on their turn is set by the timer and bot settings in section 12.

## 11. Board geometry (standard layout)

- 52-square shared track. Each color has a start square, and the colors' start squares are 13 squares apart.
- From its start square a piece travels 51 squares of track (progress 0-50), then enters its own 5-square finishing column (51-55), then home (56). A full journey is 56 steps after leaving the yard.
- 8 safe squares: the four start squares, plus the four star squares 8 squares past each start.
- These follow the most common modern layout found in online references. Positions are stored as data, so they can be changed in one place.

## 12. Timers and bots

- `turnTimer` (host setting): off / 15 / 30 / 45 / 60 seconds, **off by default**. The timer counts down each decision (a roll or a move) separately.
- If the timer runs out, the bot makes that one decision for the player.
- After 2 timeouts in a row, the player is put on **autoplay**: the bot plays all their turns until they tap "I'm back".
- `disconnectTakeover` (host setting): 15 / 30 / 60 seconds / never, **30 seconds by default**. Once a disconnected player's turn has waited this long, the bot plays for them until they reconnect. They get control back at the start of their next turn.
- With the timer off and takeover set to never, the game simply waits for the player. The host can always tap "Let bot play" for a disconnected player.
- The host can fill empty seats with bots in the lobby.
- The bot follows exactly the same rules as a human player. One difficulty level ("Normal") in v1. A reinforcement-learning bot may come later.

## 13. Remaining assumptions

- All bonus dice earned by one capture or finish (including their 6 chain) are voided together if they make the bank unplayable.
- A piece stuck by kill-to-enter cannot use a die that would take it past progress 50. That die must be used elsewhere, or the all-or-nothing rule applies.
- In team mode, one of the defending team's pieces landing on a square where an enemy is sitting on their mixed stack captures that enemy piece normally.
- A capture of several pieces in one move counts as one capture event for the extra-turn bonus.
