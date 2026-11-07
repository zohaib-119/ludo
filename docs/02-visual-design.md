# 02 — Visual Design, Motion and Sound

## 1. Direction

**"Modern tabletop."** A real board game on a table, rendered cleanly: soft depth, tactile pieces and dice, warm surfaces, but no clutter or fake wood textures. Bright, confident player colours on a calm background. Think premium mobile board game, not a 2010 Flash game.

Principles:

1. **The board is the hero.** Everything else is quieter than the board.
2. **Turn clarity first.** At any moment a glance shows whose turn it is and what they can do.
3. **Motion explains rules.** Animations show cause and effect (why a roll was voided, why a piece was captured).
4. **Feels physical.** Pieces hop, dice tumble, captures knock pieces home.

## 2. Design tokens

All colours, sizes and timings are CSS custom properties (exposed through Tailwind's theme). **One light theme** (dark and system themes were removed at the owner's request; the dark column in the table below is no longer used).

### Colour

| Token          | Light                | Dark    | Use                          |
| -------------- | -------------------- | ------- | ---------------------------- |
| `--bg`         | #F4EFE6 (warm paper) | #14161C | Page background              |
| `--surface`    | #FFFFFF              | #1E2129 | Panels, sheets               |
| `--surface-2`  | #EDE6DA              | #272B35 | Board track squares, inputs  |
| `--text`       | #1D1B18              | #F2EFE9 | Primary text                 |
| `--text-muted` | #6B655C              | #A09B92 | Secondary text               |
| `--accent`     | #3B5BDB              | #7C93F2 | Primary buttons, focus rings |
| `--danger`     | #D9363E              | #FF6B6B | Destructive actions, void    |
| `--success`    | #2F9E44              | #51CF66 | Online, ready                |
| `--warning`    | #E8890C              | #FFB347 | Reconnecting                 |

**Player colours** (each has `base`, `light` for tints, `dark` for borders/shadows; values tuned so all four pass 3:1 contrast against the board surface in both themes):

| Player | Base    | Light   | Dark    |
| ------ | ------- | ------- | ------- |
| Red    | #E03131 | #FFC9C9 | #A61E1E |
| Green  | #2B9348 | #B2F2BB | #1B5E2E |
| Yellow | #F2B705 | #FFEC99 | #A67C00 |
| Blue   | #1C7ED6 | #A5D8FF | #105A9C |

### Typography

- Display / numbers: **Baloo 2** (rounded, friendly, great numerals for dice and codes).
- UI text: **Inter**.
- Both from Google Fonts, `font-display: swap`. Type scale: 12 / 14 / 16 / 20 / 24 / 32 / 48 px. Room code uses Baloo 2 at 32–48 px with letter spacing.

### Shape, depth, spacing

- Spacing scale: 4 px base (4, 8, 12, 16, 24, 32, 48).
- Radius: 8 px (controls), 16 px (cards, sheets), full (pills, chips).
- Elevation: 3 levels of soft, warm-tinted shadows. Pieces and dice use their own lighting (below).

## 3. The board

- Drawn as **one SVG** with a 15 × 15 grid viewBox, scaled to the container. Crisp at every size, cheap to animate.
- **Corners (yards):** large rounded squares in the player's base colour with a lighter inner tray holding 4 piece slots. The yard of the player whose turn it is gets a slow breathing glow.
- **Track squares:** `--surface-2` with a thin border. Each player's start square is filled with their light colour and marked with a small arrow showing direction of travel.
- **Safe squares:** filled with the colour of the home column they sit beside (no star symbol), with a tooltip "Safe square".
- **Finishing columns:** filled with the player's light colour, leading to the centre.
- **Centre (home):** four triangles in player colours meeting at a point. Finished pieces sit small inside their colour's triangle.
- **Kill-to-enter lock:** when the rule is on and a player hasn't captured yet, a small lock sits on the entrance to their column. It unlocks with a click animation and sound on their first capture.
- **Move preview:** ghost piece at 40 % opacity at the destination, and the path squares between highlight in a light trail.

## 3.1 Personal themes

Each player picks their own look from the palette button (landing page footer, lobby and game header). The choice is kept in this browser only (`dodice.settings` in localStorage) and never sent to the server, so everyone in a room can see the same game in a different style. All designs are drawn in code (`apps/web/src/lib/themes.ts`), so there is nothing to download or license.

| Group  | Choices                                                                      |
| ------ | ---------------------------------------------------------------------------- |
| Board  | Classic (default), Wooden, Pastel, Royal (maroon and gold), Night (dark)     |
| Pieces | Glossy (default), Flat, Pawn (ringed top), Gem (faceted), Coin (rimmed disc) |
| Dice   | Tinted in the player colour (default), Ivory, Casino red, Wooden, Neon       |

A board theme sets the paper, tray, track, grid, frame and its own tuning of the four player colours. The app chrome stays in the light theme.

## 4. Pieces

- SVG "pawn top" tokens seen from above: a coloured disc with a radial gradient (highlight top-left), a darker rim, and a soft drop shadow. Slight scale-up (1.08) and stronger shadow when movable.
- **Colour-blind markers** (setting): each colour also gets a shape glyph in the centre of the piece (red ●, green ▲, yellow ■, blue ◆). The same glyph appears in the yard and player panel.
- **Stacks:** up to 2 pieces show side by side (offset); 3–4 show as a small cluster with a count badge. Mixed teammate stacks show both colours with a small link icon, meaning "protected by team".
- **Enemy sitting on a mixed stack:** the enemy piece is drawn on top with a subtle warning outline on the stack.

## 5. Dice

- Rendered as **3D CSS cubes** (CSS transforms, no WebGL) with rounded edges and pips. Each face is pre-built; a roll animates random tumbling for ~700 ms then eases to the face matching the server value.
- Dice are coloured in the current player's colour (light face, dark pips).
- **Bank chips:** after landing, dice shrink into numbered chips in the bank row. The selected chip is raised and outlined. Used chips fly to the piece they moved and fade.
- **Re-roll:** the double six (or single six) glows gold before sliding into the bank.
- **Void:** dice shake left-right, turn grey, a strike line draws through them.

## 6. Motion

All animation uses **Motion** (formerly Framer Motion) for UI and SVG elements. Durations are tokens so they can be tuned in one place. With reduced motion on, movement is replaced by quick cross-fades and the dice show their value immediately.

| Animation                      | Spec                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Piece step                     | Hop per square: 110 ms, slight arc (translate + scale 1.0→1.12→1.0). Path length 1–12 squares, so 0.1–1.3 s total                                                                         |
| Leave yard                     | Pop out of yard slot to start square with a bounce, 300 ms                                                                                                                                |
| Capture                        | Attacker finishes its hop and lands with a small squash; victim is knocked up and flies in an arc back to its yard slot (500 ms), with a short screen shake (2 px, off in reduced motion) |
| Double capture (stack)         | Both victims fly back, slightly staggered (80 ms)                                                                                                                                         |
| Finish                         | Piece slides into the centre triangle, small burst of particles in the player colour                                                                                                      |
| Player finishes all pieces     | Full-width banner "Ali finished — 1st!" and confetti                                                                                                                                      |
| Turn change                    | Active panel glow moves to the next player (250 ms); the board's yard glow follows                                                                                                        |
| Banners (re-roll, bonus, void) | Drop in from top of board, hold 1.2 s, fade out; never block input longer than 300 ms                                                                                                     |
| Lobby rule change              | Changed row flashes the accent tint for 800 ms                                                                                                                                            |

**Animation queue:** server events are played one after another on the client. If more than 3 events are queued (for example after a reconnect or very fast bot play), the client speeds animations up 2× and skips banners, so the display never falls behind the real state by more than ~1 s. A reconnect snaps straight to the current state.

## 7. Sound

Short, soft, tactile sounds, **synthesised in the browser with the Web Audio API** (`apps/web/src/audio/sound.ts`): no audio files to download or license, instant start, one volume control. Audio unlocks on the first tap or key press, as browsers require. No background music. Game sounds (dice, hops, captures, finishes) play for **every** player, whoever's turn it is.

| Event                | Sound                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Roll pressed         | Dice shaken in a cup                                                                         |
| Dice land            | Wooden clatter                                                                               |
| Double six / re-roll | Bright chime                                                                                 |
| Piece hop            | Soft tick per square (pitch rises slightly along the path)                                   |
| Capture              | Thud + whoosh                                                                                |
| Kill-to-enter unlock | Small lock click                                                                             |
| Piece finishes       | Pleasant two-note chime                                                                      |
| Roll void            | Low "bonk"                                                                                   |
| Your turn            | Gentle notification ping (also if the tab is in background, with a title flash "Your turn!") |
| Timer last 5 seconds | Soft ticking                                                                                 |
| Win                  | Short fanfare                                                                                |

Haptics (`navigator.vibrate`, where supported): short buzz on your turn, a double buzz on capture of your piece.

## 8. Responsive layout

| Breakpoint                     | Layout                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------- |
| < 400 px wide (small phones)   | Board full width, player panels compact (avatar + pips only), chat in sheet      |
| 400–767 px (phones portrait)   | Layout in 01-product-and-ux §4.3                                                 |
| Landscape phones / 768–1199 px | Board on the left at full height, panels and action area on the right            |
| ≥ 1200 px                      | Board centred, panels at the four corners around it, log/chat in a right sidebar |

The board never scrolls and is always fully visible. Tap targets are at least 44 × 44 px (pieces get an invisible enlarged hit area).

## 9. Accessibility

- Colour is never the only signal: colour-blind glyphs, text labels for status, and the log describes every event in words.
- Full keyboard play: Space/Enter rolls; Tab cycles legal pieces; number keys pick a die value; Enter confirms.
- Screen readers: an ARIA live region announces turns and events ("Your turn. You rolled 6 and 3."). Pieces have labels ("Red piece 2, square 14, can move 3 or 6").
- Focus rings use `--accent`, 2 px, always visible on keyboard focus.
- Contrast: text meets WCAG AA in both themes.

## 10. Branding

Name: **DoDice Ludo**. Simple logo: four coloured pieces arranged in a diamond. App icon and PWA manifest so it can be added to the home screen.
