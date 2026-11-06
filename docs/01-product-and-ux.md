# 01 — Product and UX

## 1. Product summary

A browser Ludo game for playing with friends. Someone creates a room, shares a code or link, friends join, the host picks the house rules, and they play. It supports one-die and two-dice play, the custom rules in [RULES.md](../RULES.md), 2–4 players, teams, bots, and survives bad connections.

**Quality bar:** it should feel like a polished app, not a web page. Every action has visible and audible feedback, every waiting state is explained, and nothing ever leaves a player unsure whose turn it is or what they can do.

**Primary device:** phones in portrait. It must also work well on tablets and desktop.

## 2. Routes

| Route | Screen |
|---|---|
| `/` | Home |
| `/r/:code` | Room. Shows the lobby, the game or the results depending on room phase |
| `/how-to-play` | Rules explainer, including every house-rule toggle |
| `*` | Not found |

Links like `https://<site>/r/K7QX9M` are the main way to invite people.

## 3. Identity (no accounts)

- On first visit the client generates a **player token** (random UUID) and stores it in `localStorage`. It never changes unless storage is cleared.
- The player chooses a **display name** (2–16 characters) and an **avatar emoji** (from a curated set of ~24). Both are remembered.
- The token is what owns a seat. Reopening the link on the same device reclaims the seat.
- If storage is unavailable (private mode), a token is kept in memory for the session and the user is warned that a refresh may lose their seat.

## 4. Screens

### 4.1 Home (`/`)

- Logo and short tagline.
- Name field with avatar picker (pre-filled from storage).
- **Create game** (primary button).
- **Join game**: a 6-character code input. Auto-uppercases, ignores spaces and dashes, and accepts a pasted full link.
- "Continue game" card if the device was in a room that still exists (checked against the server). One tap rejoins.
- Footer links: How to play, sound toggle, theme toggle (system / light / dark).

### 4.2 Lobby (`/r/:code`, phase `lobby`)

**Top:** room code in large type with **Copy code**, **Copy link**, **Share** (Web Share API where available), and a **QR code** button that opens a sheet with a scannable code.

**Seat picker:** a miniature board showing the four corners. Each corner shows its occupant (avatar, name, connection dot, "Host" badge, "Bot" badge) or "Empty — tap to sit".
- Players tap an empty corner to take or change seat.
- 2-player rooms: only opposite pairs are allowed. Choosing red disables green and blue and the second player must take yellow, and so on. The UI explains why the other corners are greyed out.
- Team mode: corners are tinted by team (red+yellow vs green+blue) and labelled "Team A" / "Team B".
- Host can remove a player or bot from a seat (with confirmation) and **Add bot** to an empty seat.

**Rules panel:**
- Host sees editable controls; everyone else sees a read-only summary that updates live with a short highlight when something changes.
- **Presets** at the top (one tap sets everything): "Classic (1 die)", "Two Dice", "Two Dice — Hardcore" (kill-to-enter on, no bonuses), "Custom" (selected automatically when anything is edited).
- Controls grouped as: Dice, Bonuses, Endgame, Kill-to-enter, Teams, Time & bots. Each control has an info icon that opens a one-paragraph explanation with a small illustration.
- Invalid combinations are prevented, not reported. Team options only appear with 4 seats filled in team mode; handover delay only appears when "delayed" is selected.

**Ready and start:**
- Each non-host player has a **Ready** toggle.
- Host's **Start game** button is enabled when: 2–4 seats filled, the seat arrangement is valid for the player count and mode, and all humans are ready. When disabled, the button says why ("Waiting for Sara to get ready").
- Rule changes by the host un-ready everyone, so nobody starts with rules they didn't see.

**Room chat** strip at the bottom (see 4.6).

### 4.3 Game (`/r/:code`, phase `playing`)

Layout (portrait phone):

```
┌─────────────────────────────┐
│ ≡  Room K7QX9M   🔊  ⓘ     │  top bar: menu, sound, rules
├─────────────────────────────┤
│ [P3 panel]       [P4 panel] │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │          BOARD          │ │  square, fills width
│ │                         │ │
│ └─────────────────────────┘ │
│ [P2 panel]       [P1 panel] │  P1 = you, always bottom
├─────────────────────────────┤
│  dice bank: [6][6][3][4]    │
│      ( ROLL  )   timer ◔    │  action area
└─────────────────────────────┘
```

Landscape and desktop place the player panels on either side of the board and the action area under or beside it. Chat and the game log open as a side panel on desktop and a bottom sheet on mobile.

**Board orientation:** the board is rotated so the local player's colour is always in the bottom-left corner. Reconnecting does not change this.

**Player panel** (one per seat):
- Avatar, name, colour band.
- Pieces finished (four small pips that fill in).
- Kill-to-enter status when that rule is on: a lock icon (needs a kill) or open lock (unlocked). Tooltip explains.
- Status badges: "Bot", "Autoplay", "Offline", "Finished — 1st", "Playing for Ali" (team handover), "Waiting 3 rounds" (delayed handover).
- Turn indicator: the active panel glows in the player's colour, and a circular timer ring runs around the avatar when the turn timer is on.
- Connection dot: green (online), amber (reconnecting), grey (offline, with "offline 0:42" counter).

**Action area (your turn):**

1. *Awaiting roll:* a large **Roll** button with a gentle pulse. Tapping it (or Space/Enter) sends the roll. The button shows a spinner state until the server answers, so double taps do nothing.
2. *Rolling:* dice tumble in the dice tray (~700 ms), then land on the server values.
3. *Re-roll earned:* banner "Double six! Roll again" and the Roll button returns. Rolled dice slide into the **bank**.
4. *Awaiting move:* the bank shows every unplayed die value as a chip. Legal pieces pulse and lift slightly. See "Moving pieces" below.
5. *Bonus roll earned* (capture / finish): banner "Capture! Bonus roll", Roll button returns, other moves are paused until the bonus is rolled.
6. *Void:* the dice shake and grey out, with the message "Not all dice can be played — roll void" (or "Bonus roll void" when only the bonus dice are dropped). Turn passes after ~1.5 s.

When it is not your turn, the action area shows whose turn it is ("Sara is moving…") and their dice, at reduced size.

**Moving pieces:**
- The client only offers moves the server says are legal (the legal move list is part of synced state, see 05-protocol). A move is legal only if the rest of the bank can still be fully played afterwards.
- **Tap a piece:**
  - If only one die value can move it, a ghost of the piece appears at the destination and the move is sent on a second tap on the piece or the ghost. With "Quick move" on (personal setting, default on) the move is sent on the first tap.
  - If several die values can move it, small numbered bubbles appear above it, one per value, each showing its destination as a ghost on hover/press. Tap a bubble to move.
- **Tap a die chip first** (alternative): selects that value; only pieces that can use it stay highlighted; tapping one moves it.
- **Stacks:** tapping a square with several of your pieces opens a small fan-out picker. Pieces on the same square with the same legal moves are treated as one choice.
- **Auto-move:** when exactly one legal move exists for the whole remaining bank, it plays automatically after 600 ms (personal setting, default on).
- Pieces animate square by square along the path. Captures, finishes and stack interactions have their own animations (see 02-visual-design).

**Top-bar menu:** Leave game (with confirmation; your seat goes to the bot), Rules summary, Sound and music volumes, Quick move / Auto-move toggles, Theme, "Let bot play for me" (enter autoplay).

**Host-only controls in the menu:** "Let bot play" for an offline player, "End game for everyone" (confirmation).

**Game log** (sheet/panel): a readable timeline, newest first. "Ali rolled 6 · 6 → roll again", "Ali moved red 2 by 6", "Sara captured Ali's piece", "Roll void", "Bot played for Ali (timeout)". Each entry has the player's colour mark.

**Toasts** for events that happen off-turn: "Ali reconnected", "Bot is playing for Sara", "Rules: kill-to-enter is on — you need a capture first" (first time a piece is blocked by it).

### 4.4 Results (phase `finished`)

- Podium animation with rankings (free-for-all) or winning team banner (teams). Confetti for the winner(s).
- Per-player stats: captures made, pieces lost, sixes rolled, rolls voided, turns played by bot.
- **Play again**: every seated human votes. When all have voted, the game resets with the same seats and rules. The host can also change rules (back to lobby).
- **Back to lobby** (host), **Leave room** (anyone).

### 4.5 How to play (`/how-to-play`)

Illustrated explanation of the base game and every toggle in RULES.md, written for people who know one-die Ludo but not the custom rules. Small inline diagrams for: two-dice bank, all-or-nothing, single-die endgame, kill-to-enter, mixed teammate stacks. The lobby info icons deep-link to the matching section.

### 4.6 Chat and reactions

- Quick reactions bar: 8 emoji (👍 😂 😮 😡 🔥 😭 👏 🙏). Tapping one shows it floating up from your player panel for everyone.
- Short text chat (max 120 characters, rate-limited to 1 message/second). Messages appear in the log and as a small bubble near the sender's panel.
- Mute chat per player (local only).

## 5. Connection states the UI must handle

| Situation | What the user sees |
|---|---|
| Brief network drop | Small amber pill "Reconnecting…" at top. Board stays visible but input is disabled. No modal. |
| Drop longer than ~10 s | The pill becomes a dimmed overlay with "Still trying to reconnect…" and a **Retry now** button |
| Reconnected | Pill turns green "Back online" for 1.5 s, the board snaps to current state without replaying missed animations, and a toast summarises what happened ("While you were away: Sara captured your piece") |
| Page refresh / app reopened | Room screen loads with a skeleton, rejoins with the stored token, and continues |
| Tab in background (mobile) | On return, the client checks the connection immediately and reconnects if needed |
| Same token opens the room in a second tab | Newest tab takes the seat; the older one shows "This game is open in another tab" with **Use here** |
| Another player is offline | Their panel shows the grey dot and timer; when it is their turn the centre of the board shows "Waiting for Ali (offline) — bot plays in 0:24" or, with takeover off, "Waiting for Ali" and a host-only **Let bot play** button |
| Room not found | Friendly page: "This room doesn't exist or has ended" with Create / Join buttons |
| Room full / game started and you have no seat | "This game has already started" (spectating is out of scope for v1) |
| Server restarting | "The server is restarting — your game could not be saved" (until persistence is added) |

## 6. Personal settings (stored locally)

Sound effects volume, haptics (on by default where supported), quick move, auto-move, theme, reduced motion (defaults to the OS setting), colour-blind markers (off by default).

## 7. Copy and tone

Short, friendly, direct. Always say who and what: "Sara rolled 6 · 6", never "Roll complete". Rule names in the UI must match RULES.md wording so the help text and the game agree.

## 8. Localisation

All strings live in one message file from day one. English ships first; Urdu (with RTL layout support) is a likely second language.
