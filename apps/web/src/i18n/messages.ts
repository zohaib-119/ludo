/**
 * Every user-facing string (docs/01-product-and-ux.md §8). English first; a
 * second language is a copy of this object with the same keys.
 * Rule names match RULES.md wording.
 */
const en = {
  appName: 'DoDice Ludo',
  tagline: 'Ludo with friends — one die or two, your house rules.',

  // Home
  'home.yourName': 'Your name',
  'home.namePlaceholder': 'e.g. Zohaib',
  'home.nameHint': '{min}–{max} characters',
  'home.pickAvatar': 'Pick an avatar',
  'home.create': 'Create game',
  'home.creating': 'Creating…',
  'home.joinTitle': 'Join a game',
  'home.codePlaceholder': 'Room code',
  'home.join': 'Join',
  'home.joining': 'Joining…',
  'home.codeInvalid': 'Codes are 6 letters and numbers, like K7QX9M.',
  'home.continueTitle': 'Game in progress',
  'home.continueBody': 'Room {code} is still going.',
  'home.continue': 'Continue',
  'home.storageWarning': 'Your browser is not saving data (private mode?). Refreshing the page may lose your seat.',

  // Room shell
  'room.connecting': 'Connecting to room {code}…',
  'room.reconnecting': 'Reconnecting…',
  'room.stillTrying': 'Still trying to reconnect…',
  'room.retryNow': 'Retry now',
  'room.backOnline': 'Back online',
  'room.leave': 'Leave',
  'room.leaveConfirmLobby': 'Leave this room?',
  'room.leaveConfirmGame': 'Leave the game? The bot will play your seat. You can come back with the same link.',
  'room.notFoundTitle': 'Room not found',
  'room.notFoundBody': 'This room doesn’t exist or has ended.',
  'room.inProgressTitle': 'Game already started',
  'room.inProgressBody': 'This game started without you. Ask the host to start a new room.',
  'room.fullTitle': 'Room is full',
  'room.fullBody': 'This room has reached its limit of {max} people.',
  'room.otherTabTitle': 'Open in another tab',
  'room.otherTabBody': 'This game is open in another tab or window.',
  'room.useHere': 'Use here',
  'room.removedTitle': 'You were removed',
  'room.removedBody': 'The host removed you from this room.',
  'room.closedTitle': 'Room closed',
  'room.closedBody': 'This room has closed.',
  'room.errorTitle': 'Couldn’t connect',
  'room.errorBody': 'Check your connection and try again.',
  'room.tryAgain': 'Try again',
  'room.home': 'Home',
  'room.namePromptTitle': 'Join room {code}',
  'room.namePromptBody': 'Choose a name so your friends know who you are.',
  'room.joinButton': 'Join room',

  // Lobby
  'lobby.roomCode': 'Room code',
  'lobby.copyCode': 'Copy code',
  'lobby.copyLink': 'Copy link',
  'lobby.share': 'Share',
  'lobby.qr': 'QR code',
  'lobby.copied': 'Copied!',
  'lobby.shareText': 'Join my DoDice Ludo game! Room {code}',
  'lobby.qrTitle': 'Scan to join',
  'lobby.seats': 'Seats',
  'lobby.tapToSit': 'Tap to sit',
  'lobby.empty': 'Empty',
  'lobby.addBot': 'Add bot',
  'lobby.you': 'You',
  'lobby.host': 'Host',
  'lobby.bot': 'Bot',
  'lobby.ready': 'Ready',
  'lobby.notReady': 'Not ready',
  'lobby.offline': 'Offline',
  'lobby.remove': 'Remove from seat',
  'lobby.leaveSeat': 'Stand up',
  'lobby.teamA': 'Team A',
  'lobby.teamB': 'Team B',
  'lobby.twoPlayerHint': 'With 2 players, sit in opposite corners (red–yellow or green–blue).',
  'lobby.watching': 'Watching',
  'lobby.watchingHint': 'Pick a corner to play.',
  'lobby.members': 'In the room',
  'lobby.imReady': 'I’m ready',
  'lobby.notReadyButton': 'Not ready',
  'lobby.start': 'Start game',
  'lobby.starting': 'Starting…',
  'lobby.waitingForHost': 'Waiting for {name} to start the game',
  'lobby.sitToPlay': 'Take a seat to play',
  'lobby.rulesChanged': 'Rules changed — check them and get ready again.',

  // Start blockers
  'start.needPlayers': 'Need at least 2 players',
  'start.opposite': '2 players must sit in opposite corners',
  'start.teamsNeedFour': 'Team mode needs all 4 seats',
  'start.waitingFor': 'Waiting for {names}',

  // Rules
  'rules.title': 'Rules',
  'rules.readOnly': 'Set by the host',
  'rules.preset': 'Preset',
  'rules.preset.classic': 'Classic',
  'rules.preset.twoDice': 'Two Dice',
  'rules.preset.hardcore': 'Hardcore',
  'rules.preset.custom': 'Custom',
  'rules.group.dice': 'Dice',
  'rules.group.bonuses': 'Bonus rolls',
  'rules.group.endgame': 'Endgame',
  'rules.group.kill': 'Kill to enter',
  'rules.group.teams': 'Teams',
  'rules.group.time': 'Time & bots',
  'rules.diceMode': 'Dice',
  'rules.diceMode.1': '1 die',
  'rules.diceMode.2': '2 dice',
  'rules.diceMode.help':
    'With 2 dice you roll both, then play each die as a separate move. A double six (or a six with one die) earns another roll, and every die must be playable or the whole roll is void.',
  'rules.extraTurnOnCapture': 'Bonus roll for a capture',
  'rules.extraTurnOnCapture.help': 'Capturing an enemy piece gives an immediate bonus roll.',
  'rules.extraTurnOnFinish': 'Bonus roll for reaching home',
  'rules.extraTurnOnFinish.help': 'Getting a piece home gives an immediate bonus roll.',
  'rules.singleDieWhenAllInColumn': 'One die when all pieces are in the home column',
  'rules.singleDieWhenAllInColumn.help':
    'With 2 dice: once every remaining piece is in the coloured home column, roll a single die. When off, you keep rolling two and both must be playable. With one piece left in the column you always roll one die.',
  'rules.killRequiredToEnterColumn': 'Capture before entering home column',
  'rules.killRequiredToEnterColumn.help':
    'You must capture at least one enemy piece before any of your pieces may enter the home column. Pieces wait at the entrance until then. Losing all four pieces to the yard resets this.',
  'rules.teamMode': 'Team mode',
  'rules.teamMode.help':
    'Red + Yellow vs Green + Blue. Team-mates can’t capture each other, and a stack of both team-mates can only be captured by both enemies together.',
  'rules.teamHandover': 'When a player finishes',
  'rules.teamHandover.immediate': 'Help team-mate now',
  'rules.teamHandover.delayed': 'Wait first',
  'rules.teamHandover.help':
    'A player who gets all pieces home uses their turns to play their team-mate’s pieces — straight away, or after skipping some rounds.',
  'rules.teamHandoverDelayRounds': 'Rounds to wait',
  'rules.turnTimer': 'Turn timer',
  'rules.turnTimer.help': 'Time for each roll or move. When it runs out the bot plays that move. Two timeouts in a row switch on autoplay.',
  'rules.off': 'Off',
  'rules.never': 'Never',
  'rules.seconds': '{n}s',
  'rules.disconnectTakeover': 'Bot plays for offline players after',
  'rules.disconnectTakeover.help':
    'If a player is disconnected on their turn, the bot plays for them after this long. They get control back on their next turn after reconnecting.',

  // Game placeholder (until M5)
  'game.inProgress': 'Game in progress',
  'game.comingSoon': 'The game board arrives in the next update. The game is running on the server.',
  'game.finished': 'Game finished',

  // Connection pill
  'conn.connecting': 'Connecting…',
  'conn.reconnecting': 'Reconnecting…',
  'conn.online': 'Back online',

  // Notices
  'notice.joined': '{name} joined',
  'notice.left': '{name} left',
  'notice.hostChanged': '{name} is now the host',
  'notice.youAreHost': 'You are now the host',
  'notice.reconnected': '{name} is back',
  'notice.disconnected': '{name} lost connection',

  // Settings
  'settings.theme': 'Theme',
  'settings.theme.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.sound': 'Sound',

  // Errors
  'error.RATE_LIMITED': 'Slow down a little.',
  'error.STALE_STATE': 'The game moved on — try again.',
  'error.NOT_HOST': 'Only the host can do that.',
  'error.SEAT_TAKEN': 'That seat was just taken.',
  'error.NAME_INVALID': 'Names must be 2–16 characters.',
  'error.OFFLINE': 'You’re offline right now.',
  'error.generic': 'Something went wrong. Try again.',

  close: 'Close',
  cancel: 'Cancel',
  confirm: 'Confirm',
  info: 'More info',
} as const;

export type MessageKey = keyof typeof en;
const dictionary: Record<MessageKey, string> = en;

/** Translate a key, filling {placeholders}. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Translate a dynamic key if it exists, else return null. */
export function tMaybe(key: string, params: Record<string, string | number> = {}): string | null {
  return key in dictionary ? t(key as MessageKey, params) : null;
}
