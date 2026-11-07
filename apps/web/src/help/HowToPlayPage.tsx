/**
 * How to play (docs/01-product-and-ux.md §4.5): every rule in plain words,
 * with small diagrams. Sections have ids so other pages can deep-link.
 */
import type { Color } from '@ludo/engine';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card, Logo, pieceColor } from '../ui/kit';

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

function MiniDie({ value, faded = false }: { value: number; faded?: boolean }) {
  return (
    <svg
      viewBox="0 0 30 30"
      className="size-9 shrink-0"
      style={{ opacity: faded ? 0.35 : 1 }}
      role="img"
      aria-label={`die ${value}`}
    >
      <rect x="1" y="1" width="28" height="28" rx="7" fill="#fff8ea" stroke="#d8cdb9" />
      {PIPS[value]!.map(([cx, cy], i) => (
        <circle key={i} cx={7 + cx * 8} cy={7 + cy * 8} r="2.6" fill="#1d1b18" />
      ))}
    </svg>
  );
}

interface Cell {
  pieces?: Color[];
  safe?: boolean;
  column?: Color;
  lock?: boolean;
  highlight?: boolean;
  label?: string;
}

/** A strip of board squares with pieces on it. */
function Track({ cells, caption }: { cells: Cell[]; caption?: string }) {
  const w = cells.length * 34 + 4;
  return (
    <figure className="my-3">
      <svg viewBox={`0 0 ${w} 46`} className="w-full max-w-md" role="img" aria-label={caption}>
        {cells.map((c, i) => {
          const x = 2 + i * 34;
          return (
            <g key={i}>
              <rect
                x={x}
                y={6}
                width={31}
                height={31}
                rx={6}
                fill={c.column ? pieceColor(c.column) : 'var(--surface-2)'}
                stroke={c.highlight ? 'var(--accent)' : 'none'}
                strokeWidth={c.highlight ? 2.5 : 0}
                strokeDasharray={c.highlight ? '4 3' : undefined}
              />
              {c.safe && <rect x={x} y={6} width={31} height={31} rx={6} fill="#F4DE9C" />}
              {c.lock && (
                <text x={x + 15.5} y={28} textAnchor="middle" fontSize="15">
                  🔒
                </text>
              )}
              {c.pieces?.map((p, k) => {
                const n = c.pieces!.length;
                const ox = n === 1 ? 0 : k === 0 ? -6 : 6;
                return (
                  <circle
                    key={k}
                    cx={x + 15.5 + ox}
                    cy={21.5}
                    r={n === 1 ? 10 : 8}
                    fill={pieceColor(p)}
                    stroke="rgb(0 0 0 / 0.25)"
                  />
                );
              })}
              {c.label && (
                <text x={x + 15.5} y={45} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {caption && <figcaption className="mt-1 text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <Card>
        <h2 className="mb-2 font-display text-xl font-extrabold">{title}</h2>
        <div className="space-y-2 leading-relaxed text-[15px]">{children}</div>
      </Card>
    </section>
  );
}

const TOC: Array<[string, string]> = [
  ['goal', 'Goal'],
  ['turn', 'Your turn with two dice'],
  ['sixes', 'Sixes and rolling again'],
  ['void', 'Every die must be playable'],
  ['moving', 'Moving and finishing'],
  ['captures', 'Captures and safe squares'],
  ['bonus', 'Bonus rolls'],
  ['endgame', 'One die near the end'],
  ['kill', 'Capture before entering home'],
  ['teams', 'Teams'],
  ['bots', 'Timer, bots and connections'],
];

export function HowToPlayPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Home"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Logo size={34} />
        <h1 className="font-display text-3xl font-extrabold">How to play</h1>
      </header>

      <nav aria-label="Sections" className="mb-6 flex flex-wrap gap-2">
        {TOC.map(([id, title]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-surface-3"
          >
            {title}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <Section id="goal" title="Goal">
          <p>
            Get all four of your pieces from your yard, once around the board and up your coloured home column into the
            centre. In free-for-all, places are decided by who finishes first. In teams, the first team with both
            players home wins.
          </p>
          <p>The host picks the rules in the lobby. Everyone can see them; only the host can change them.</p>
        </Section>

        <Section id="turn" title="Your turn with two dice">
          <p>
            Roll both dice. Each die is a <b>separate move</b>: play one die with one piece, then the other die with the
            same piece or a different one. You choose the order.
          </p>
          <div className="flex items-center gap-2">
            <MiniDie value={5} />
            <MiniDie value={3} />
            <span className="text-sm text-muted">→ move one piece 5, then a piece 3 (or the other way round)</span>
          </div>
          <p className="text-sm text-muted">
            On screen, the dice you still have to play sit under the board. Each one disappears as you use it — for
            every player, bots too.
          </p>
        </Section>

        <Section id="sixes" title="Sixes and rolling again">
          <p>
            A piece can only leave its yard with a <b>6</b>. Rolling <b>double six</b> (or a 6 with one die) gives you
            another roll straight away. Keep rolling while the sixes keep coming — then play all your dice.
          </p>
          <div className="flex items-center gap-2">
            <MiniDie value={6} />
            <MiniDie value={6} />
            <span className="text-sm text-muted">→ roll again →</span>
            <MiniDie value={4} />
            <MiniDie value={2} />
            <span className="text-sm text-muted">→ play 6, 6, 4 and 2</span>
          </div>
        </Section>

        <Section id="void" title="Every die must be playable">
          <p>
            If there is no way to play <b>all</b> your dice, the whole roll is void and your turn ends. There is no
            playing just one of them. The game always looks for an order that works, so you are never blocked by
            choosing the wrong die first.
          </p>
          <div className="flex items-center gap-2">
            <MiniDie value={3} />
            <MiniDie value={4} faded />
            <span className="text-sm text-muted">
              → a piece needs exactly 3 to get home and nothing else can move 4: the roll is void
            </span>
          </div>
        </Section>

        <Section id="moving" title="Moving and finishing">
          <p>
            Pieces move clockwise around the board, then turn into their own coloured column. You need the <b>exact</b>{' '}
            number to get home.
          </p>
          <Track
            cells={[
              { pieces: ['red'] },
              {},
              { column: 'red' },
              { column: 'red', highlight: true, label: 'needs 3' },
              { column: 'red' },
              { column: 'red', label: 'home' },
            ]}
            caption="A red piece two squares from home needs exactly the right roll."
          />
          <p>There are no blocks: pieces can always pass over other pieces.</p>
        </Section>

        <Section id="captures" title="Captures and safe squares">
          <p>
            Land exactly on an enemy piece to send it back to its yard. Two pieces of the same player on one square are
            captured together.
          </p>
          <Track
            cells={[
              { pieces: ['red'] },
              {},
              {},
              { pieces: ['yellow'], highlight: true },
              {},
              { safe: true, pieces: ['green'] },
            ]}
            caption="Red rolls 3 and captures yellow. Green is safe on the gold square."
          />
          <p>
            <b>The gold squares and everyone’s start squares are safe</b>: nobody can be captured there, and different
            colours can share them.
          </p>
        </Section>

        <Section id="bonus" title="Bonus rolls">
          <p>
            If the host turns them on, capturing a piece or getting a piece home gives you a bonus roll straight away.
            The bonus dice join the dice you still have. If the bonus roll can’t be played, only the bonus dice are
            lost.
          </p>
        </Section>

        <Section id="endgame" title="One die near the end">
          <p>
            With two dice, when your last piece is in its home column you roll just one die. The host can also choose to
            switch to one die as soon as <i>all</i> your remaining pieces are in the home column. Otherwise you keep
            rolling two — and both must be playable.
          </p>
        </Section>

        <Section id="kill" title="Capture before entering home">
          <p>
            With this rule on, you must <b>capture at least one enemy piece</b> before any of your pieces may enter the
            home column. Until then, your pieces wait at the entrance and can’t go round again.
          </p>
          <Track
            cells={[
              { pieces: ['red'] },
              { pieces: ['red'] },
              { lock: true, column: 'red' },
              { column: 'red' },
              { column: 'red' },
            ]}
            caption="The padlock opens on your first capture."
          />
          <p>
            Lose all four pieces back to your yard and you must capture again. And if <b>nothing is left to capture</b>{' '}
            — every enemy piece is already in its home column or home — you are out: last place in free-for-all, a loss
            for your team in team mode.
          </p>
        </Section>

        <Section id="teams" title="Teams">
          <p>
            Red + Yellow play against Green + Blue. Team-mates never capture each other and can share squares. A square
            with
            <b> both</b> team-mates on it is protected: one enemy piece can only sit there. It takes one piece from{' '}
            <b>each</b> enemy player together to capture the pair.
          </p>
          <Track
            cells={[{}, { pieces: ['red', 'yellow'], highlight: true }, {}, { pieces: ['green'] }]}
            caption="Green alone can’t capture the red–yellow pair. Green and blue together can."
          />
          <p>
            If one team-mate leaves a protected pair while an enemy is sitting on it, the piece left behind is captured.
            When you finish, you use your turns to play your team-mate’s pieces — straight away, or after waiting some
            rounds if the host chose that.
          </p>
        </Section>

        <Section id="bots" title="Timer, bots and connections">
          <p>
            With a turn timer, the bot plays for you when time runs out; two timeouts in a row switch on Auto mode until
            you switch it off in the game menu. If you lose connection the game keeps your seat — just reopen the link.
            If you are gone long enough, the bot plays for you until you return. The host can fill empty seats with
            bots.
          </p>
        </Section>
      </div>

      <p className="mt-8 text-center">
        <Link to="/" className="font-semibold text-accent underline-offset-4 hover:underline">
          Start a game
        </Link>
      </p>
      <p className="mt-6 text-center text-xs text-muted" data-testid="credits">
        Avatars made with{' '}
        <a href="https://www.dicebear.com" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          DiceBear
        </a>
        : Avataaars and Bottts by Pablo Stanley; ToonHead by Johan Melin, licensed{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
        .
      </p>
    </main>
  );
}
