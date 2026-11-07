/**
 * The game screen (docs/01-product-and-ux.md §4.3).
 */
import type { Color, LegalMove } from '@ludo/engine';
import type { Command } from '@ludo/protocol';
import { ListOrdered, Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { sound } from '../audio/sound';
import { t } from '../i18n/messages';
import { useSettings } from '../lib/settings';
import { sendCommand } from '../net/commands';
import { getConnection, useConnection } from '../net/session';
import { Announcer } from '../ui/Announcer';
import { ChatControls } from '../ui/ChatControls';
import { Button, IconButton, Logo, cx } from '../ui/kit';
import { Board } from './Board';
import { movablePieceIds, onlyMove, valuesForPiece } from './choices';
import { Die } from './Dice';
import { GameMenu } from './GameMenu';
import { type Corner, cornerOf, rotationFor } from './geometry';
import { LogSheet } from './LogSheet';
import { NORMAL_TIMING, Playback, REDUCED_TIMING, type TrayDie } from './playback';
import { PlayerPanel } from './PlayerPanel';
import { Results } from './Results';
import { useGameSounds } from './useGameSounds';
import { formatSeconds, useNow } from './useNow';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

export function GameScreen() {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const clockOffset = useConnection((s) => s.clockOffset);
  const status = useConnection((s) => s.status);
  const game = view.game!;
  const settings = useSettings();
  const systemReduced = usePrefersReducedMotion();
  const reduced = settings.reducedMotion ?? systemReduced;

  const mySeat = view.members.find((m) => m.id === memberId)?.seat ?? null;
  const rotation = rotationFor(mySeat);
  const nameOf = useCallback((c: Color) => view.seats[c]?.name ?? c, [view.seats]);

  // --- Playback: server events → animated display ---------------------------
  const playback = useMemo(() => new Playback({ nameOf }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => playback.setNames(nameOf), [playback, nameOf]);
  useEffect(() => playback.setTiming(reduced ? REDUCED_TIMING : NORMAL_TIMING), [playback, reduced]);
  useEffect(() => {
    const conn = getConnection();
    const offEvents = conn.on('events', (m) => playback.push(m));
    const offBack = conn.on('backOnline', () => playback.snap());
    return () => {
      offEvents();
      offBack();
      playback.dispose();
    };
  }, [playback]);
  useEffect(() => playback.sync(game), [playback, game]);
  useGameSounds(playback, mySeat);
  const pb = useStore(playback.store);

  // --- Whose turn, and can I act? ---------------------------------------------
  const playing = view.phase === 'playing';
  const myTurn = playing && mySeat !== null && game.turn.seat === mySeat;
  const caughtUp = !pb.busy && pb.version === game.version;
  const [pending, setPending] = useState(false);
  const canAct = myTurn && caughtUp && status === 'connected' && !pending;
  const awaitingMove = canAct && game.turn.phase === 'awaitMove';
  const awaitingRoll = canAct && game.turn.phase === 'awaitRoll';
  const moves = useMemo(() => (awaitingMove ? game.legalMoves : []), [awaitingMove, game.legalMoves]);

  const [selected, setSelected] = useState<string | null>(null);
  const [chosenValue, setChosenValue] = useState<number | null>(null);
  useEffect(() => {
    setSelected(null);
    setChosenValue(null);
  }, [game.version]);

  const send = useCallback(async (command: Command) => {
    setPending(true);
    await sendCommand(command);
    setPending(false);
  }, []);
  const roll = useCallback(() => void send({ type: 'roll', stateVersion: game.version }), [send, game.version]);
  const move = useCallback(
    (m: LegalMove) => {
      setSelected(null);
      setChosenValue(null);
      void send({ type: 'move', stateVersion: game.version, pieceId: m.pieceId, value: m.value });
    },
    [send, game.version],
  );

  const movable = useMemo(() => movablePieceIds(moves, chosenValue), [moves, chosenValue]);
  const optionsFor = useCallback(
    (pieceId: string) => valuesForPiece(moves, game.pieces, pieceId).filter((m) => chosenValue === null || m.value === chosenValue),
    [moves, game.pieces, chosenValue],
  );
  const options = selected ? optionsFor(selected) : [];
  const preview = selected && options.length === 1 ? options[0]! : null;

  const onPieceTap = (pieceId: string) => {
    const opts = optionsFor(pieceId);
    if (opts.length === 0) return;
    if (opts.length === 1) {
      if (settings.quickMove || selected === pieceId) move(opts[0]!);
      else setSelected(pieceId);
      return;
    }
    setSelected(selected === pieceId ? null : pieceId);
  };

  // Auto-move when there is exactly one possible move.
  useEffect(() => {
    if (!awaitingMove || !settings.autoMove) return;
    const only = onlyMove(game.legalMoves);
    if (!only) return;
    const id = setTimeout(() => move(only), 600);
    return () => clearTimeout(id);
  }, [awaitingMove, settings.autoMove, game.legalMoves, move]);

  // Keyboard: Space/Enter rolls, Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if ((e.key === ' ' || e.key === 'Enter') && awaitingRoll) {
        e.preventDefault();
        roll();
      }
      if (e.key === 'Escape') {
        setSelected(null);
        setChosenValue(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [awaitingRoll, roll]);

  // --- Layout ------------------------------------------------------------------
  const corners = useMemo(() => {
    const out: Partial<Record<Corner, Color>> = {};
    for (const c of game.seats) out[cornerOf(c, rotation)] = c;
    return out;
  }, [game.seats, rotation]);
  const locked = view.settings.killRequiredToEnterColumn
    ? game.seats.filter((c) => !game.players[c]?.hasKilled && game.players[c]?.finishedRank == null && !game.players[c]?.eliminated)
    : [];

  const [menuOpen, setMenuOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const mySeatView = mySeat ? view.seats[mySeat] : undefined;
  const showResults = view.phase === 'finished' && (caughtUp || game.endedByHost);

  const panel = (corner: Corner) => {
    const color = corners[corner];
    if (!color) return <div aria-hidden />;
    return (
      <PlayerPanel
        color={color}
        view={view}
        game={game}
        progress={pb.progress}
        isMe={color === mySeat}
        clockOffset={clockOffset}
        align={corner.endsWith('right') ? 'right' : 'left'}
      />
    );
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="room-code text-sm text-muted">{view.code}</span>
        </div>
        <div className="flex items-center gap-1">
          <ChatControls />
          <IconButton label={t('game.log')} onClick={() => setLogOpen(true)}>
            <ListOrdered className="size-5" />
          </IconButton>
          <IconButton label={t('game.menu')} onClick={() => setMenuOpen(true)} data-testid="game-menu">
            <Menu className="size-5" />
          </IconButton>
        </div>
      </header>

      {mySeatView?.autoplay && playing && (
        <div className="mx-auto mb-2 flex w-full max-w-6xl items-center justify-between gap-3 bg-warning-soft px-4 py-2 text-sm font-semibold text-warning sm:rounded-xl">
          {t('game.autoplayOn')}
          <Button size="sm" onClick={() => void sendCommand({ type: 'setAutoplay', on: false })} data-testid="im-back">
            {t('game.imBack')}
          </Button>
        </div>
      )}

      <main className="game-grid mx-auto w-full max-w-6xl px-3 pb-4">
        <div style={{ gridArea: 'tl' }}>{panel('top-left')}</div>
        <div style={{ gridArea: 'tr' }}>{panel('top-right')}</div>
        <div style={{ gridArea: 'bl' }}>{panel('bottom-left')}</div>
        <div style={{ gridArea: 'br' }}>{panel('bottom-right')}</div>

        <div style={{ gridArea: 'board' }} className="relative mx-auto aspect-square w-full max-w-[min(100%,calc(100dvh-330px))] lg:max-w-none">
          <div className="size-full overflow-hidden rounded-[1.4rem] shadow-lift ring-1 ring-line">
            <Board
              pieces={game.pieces}
              progress={pb.progress}
              rotation={rotation}
              activeColor={playing ? game.turn.seat : null}
              movable={movable}
              selected={selected}
              options={options}
              preview={preview}
              locked={locked}
              colorBlind={settings.colorBlindMarkers}
              reducedMotion={reduced}
              onPieceTap={onPieceTap}
              onChoose={move}
              onBackgroundTap={() => setSelected(null)}
            />
          </div>
          <AnimatePresence>
            {pb.banner && (
              <motion.div
                key={pb.banner.id}
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={cx(
                  'pointer-events-none absolute left-1/2 top-[8%] z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 font-display text-base font-bold shadow-lift sm:text-lg',
                  pb.banner.tone === 'good' && 'bg-success text-white',
                  pb.banner.tone === 'bad' && 'bg-danger text-white',
                  pb.banner.tone === 'info' && 'bg-text text-bg',
                )}
                role="status"
                data-testid="banner"
                onAnimationComplete={() => {
                  const id = pb.banner?.id;
                  setTimeout(() => {
                    if (playback.store.getState().banner?.id === id) playback.store.setState({ banner: null });
                  }, 1300);
                }}
              >
                {pb.banner.text}
              </motion.div>
            )}
          </AnimatePresence>
          <OfflineNotice />
        </div>

        <div style={{ gridArea: 'action' }}>
          <ActionArea
            myTurn={myTurn}
            awaitingRoll={awaitingRoll}
            awaitingMove={awaitingMove}
            pending={pending}
            tray={pb.tray}
            traySeat={pb.traySeat}
            reduced={reduced}
            chosenValue={chosenValue}
            onChooseValue={(v) => {
              setChosenValue(chosenValue === v ? null : v);
              setSelected(null);
            }}
            onRoll={roll}
            clockOffset={clockOffset}
          />
        </div>
      </main>

      <Announcer />
      <GameMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} lines={pb.log} />
      {showResults && <Results />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionArea({
  myTurn,
  awaitingRoll,
  awaitingMove,
  pending,
  tray,
  traySeat,
  reduced,
  chosenValue,
  onChooseValue,
  onRoll,
  clockOffset,
}: {
  myTurn: boolean;
  awaitingRoll: boolean;
  awaitingMove: boolean;
  pending: boolean;
  tray: TrayDie[];
  traySeat: Color | null;
  reduced: boolean;
  chosenValue: number | null;
  onChooseValue: (v: number) => void;
  onRoll: () => void;
  clockOffset: number;
}) {
  const view = useConnection((s) => s.view)!;
  const game = view.game!;
  const seat = game.turn.seat;
  const seatView = view.seats[seat];
  const playing = view.phase === 'playing';
  const deadline = game.turn.deadline;
  const now = useNow(250, deadline > 0) + clockOffset;
  const left = deadline > 0 ? deadline - now : 0;
  const size = tray.length <= 2 ? 54 : tray.length <= 4 ? 44 : 36;

  // Last 5 seconds of my own decision: a soft tick each second.
  const secondsLeft = deadline > 0 && (awaitingRoll || awaitingMove) ? Math.ceil(left / 1000) : null;
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) sound.play('tick');
  }, [secondsLeft]);

  const rollLabel =
    game.turn.rollReason === 'reroll' || game.turn.rollReason === 'bonusReroll'
      ? t('game.rollAgain')
      : game.turn.rollReason === 'bonus'
        ? t('game.rollBonus')
        : t('game.roll');

  let status = '';
  if (playing && !myTurn) {
    const name = seatView?.name ?? seat;
    if (seatView && !seatView.isBot && (seatView.botControlled || seatView.autoplay)) status = t('game.botPlaying', { name });
    else status = game.turn.phase === 'awaitRoll' ? t('game.isRolling', { name }) : t('game.isMoving', { name });
  } else if (awaitingMove) {
    status = new Set(game.turn.bank).size > 1 ? t('game.pickValue') : t('game.tapPiece');
  }

  // Fixed heights: nothing below the board changes size as turns go by.
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2" data-testid="action-area">
      <div
        className="flex h-[68px] flex-wrap content-center items-center justify-center gap-2.5"
        role="group"
        aria-label="Dice to play"
        data-testid="tray"
      >
        <AnimatePresence initial={false}>
          {tray.map((d) => {
            const interactive = awaitingMove && !d.void;
            const chosen = interactive && chosenValue === d.value;
            return (
              <motion.button
                key={d.id}
                type="button"
                layout
                disabled={!interactive}
                onClick={() => interactive && onChooseValue(d.value)}
                aria-pressed={interactive ? chosen : undefined}
                aria-label={`Die ${d.value}`}
                className={cx('rounded-[22%] disabled:cursor-default', chosen && 'ring-4 ring-text ring-offset-2 ring-offset-bg')}
                initial={{ opacity: 0, scale: 0.5, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: chosen ? -6 : 0 }}
                exit={{ opacity: 0, scale: 0.4, y: -14, transition: { duration: reduced ? 0 : 0.22 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
              >
                <Die id={d.id} value={d.value} rolling={d.rolling} color={traySeat} voided={d.void} reducedMotion={reduced} size={size} />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="flex h-14 items-center justify-center">
        {awaitingRoll ? (
          <div className="flex items-center gap-3">
            <Button size="lg" className="min-w-44 animate-[pulse_2.2s_ease-in-out_infinite]" onClick={onRoll} loading={pending} data-testid="roll-button">
              {rollLabel}
            </Button>
            {deadline > 0 && (
              <span className={cx('font-display text-lg font-bold tabular-nums', left < 5000 ? 'text-danger' : 'text-muted')}>{formatSeconds(left)}</span>
            )}
          </div>
        ) : (
          <p className="text-center text-sm font-medium text-muted" role="status" data-testid="turn-status">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

/** Centre-bottom notice when the acting player is offline and the bot hasn't taken over yet. */
function OfflineNotice() {
  const view = useConnection((s) => s.view)!;
  const memberId = useConnection((s) => s.memberId);
  const clockOffset = useConnection((s) => s.clockOffset);
  const game = view.game!;
  const seat = view.seats[game.turn.seat];
  const show = view.phase === 'playing' && seat && !seat.isBot && !seat.connected && !seat.botControlled && !seat.autoplay;
  const takeoverAt = game.turn.takeoverAt;
  const now = useNow(500, Boolean(show && takeoverAt)) + clockOffset;
  if (!show) return null;
  const host = view.hostId === memberId;
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-center gap-2 rounded-2xl bg-surface/95 p-3 text-center shadow-lift backdrop-blur" role="status">
      <p className="text-sm font-semibold">{t('game.waitingOffline', { name: seat.name })}</p>
      {takeoverAt > 0 && <p className="text-xs text-muted">{t('game.botIn', { time: formatSeconds(takeoverAt - now) })}</p>}
      {host && (
        <Button size="sm" variant="secondary" onClick={() => void sendCommand({ type: 'hostBotTakeover', color: game.turn.seat })}>
          {t('game.hostLetBot')}
        </Button>
      )}
    </div>
  );
}
