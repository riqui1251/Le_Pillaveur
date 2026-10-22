"use client"

import { KeyRound, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import {
  MC_CLUE_MS,
  MC_COUNTDOWN_MS,
  MC_GUESS_MS,
  type MCClientView,
  type MCPlayerView,
  type MCTeam,
  type MCTileView,
} from '@/lib/mots-codes/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { TV_FEED_SIZE, playerIcon, speechFeedItems } from '@/components/online/bot-speech/bot-speech-feed'
import { MotsCodesSpeechFeed } from '@/components/online/mots-codes/MotsCodesSpeechFeed'
import { TvBigCountdown, TvTimeBar } from './tv-shared'

/**
 * Les réactions des bots sous la grille : deux bulles au plus à l'écran,
 * calées en bas et rognées en haut, pour que la grille garde sa hauteur.
 * Sans parole dans le tour, la bande n'existe pas.
 */
const FEED_CLIP = 'flex max-h-[6.5rem] min-h-0 w-full shrink-0 flex-col justify-end overflow-hidden'

/**
 * MOTS CODÉS sur grand écran : la grille en géant, l'indice courant, et de
 * part et d'autre les deux équipes (mots restants, Maître-mot, joueurs).
 * La vue reçue est la vue SPECTATEUR : la couleur d'une tuile n'y figure
 * qu'une fois révélée (ou en fin de partie), jamais la carte clé.
 */

const TEAM_TEXT: Record<MCTeam, string> = { gold: 'text-amber-300', red: 'text-red-300' }

/**
 * Mot de tuile : la taille suit la longueur (« interruttore » = 12 lettres), la césure fait le reste.
 * Le `leading-*` se pose APRÈS ces classes dans `cn` : tailwind-merge l'efface sinon.
 */
function tileTextClass(word: string): string {
  const n = word.length
  if (n <= 4) return 'text-4xl'
  if (n <= 6) return 'text-3xl'
  if (n <= 8) return 'text-2xl'
  // Une tuile fait ~9,5 rem utiles : à 11 lettres capitales grasses, text-xl
  // coupait le mot en plein milieu (« MARIONNETT / E »), les télés n'ayant pas
  // de dictionnaire de césure.
  if (n <= 10) return 'text-xl'
  if (n <= 11) return 'text-lg'
  return 'text-base'
}

function clueTextClass(word: string): string {
  const n = word.length
  if (n <= 8) return 'text-7xl'
  if (n <= 12) return 'text-6xl'
  if (n <= 16) return 'text-5xl'
  if (n <= 20) return 'text-4xl'
  return 'text-3xl'
}

function tileClass(tile: MCTileView, showKind: boolean): string {
  if (!tile.revealed && !showKind) return 'border-[#D8CCAE] bg-cream text-[#24201A]'
  if (tile.kind === 'gold') return 'border-amber-500 bg-gradient-to-b from-amber-400 to-amber-600 text-[#1c1509]'
  if (tile.kind === 'red') return 'border-red-800 bg-suit-red text-cream'
  return 'border-white/20 bg-white/10 text-white/70'
}

function TeamColumn({
  team,
  players,
  remaining,
  highlighted,
  winner,
  compact,
}: {
  team: MCTeam
  players: MCPlayerView[]
  /** null pendant le décompte : 9 contre 8 trahirait l'équipe qui commence avant les téléphones. */
  remaining: number | null
  highlighted: boolean
  winner: boolean
  /** En-tête sur une ligne quand une équipe dépasse 9 joueurs : 14 noms en text-xl tiennent dans la colonne. */
  compact: boolean
}) {
  const t = useTranslations('games.mots-codes')
  const crowded = players.length > 9
  const count = (
    <p
      className={cn(
        'shrink-0 font-display font-black tabular-nums text-white',
        compact ? 'text-5xl' : 'text-6xl',
        'leading-none'
      )}
    >
      {remaining ?? '—'}
    </p>
  )
  return (
    <aside className="flex w-52 shrink-0 flex-col gap-3">
      <div
        className={cn(
          'flex flex-col rounded-2xl border-2 px-3 text-center',
          compact ? 'py-2' : 'items-center py-3',
          team === 'gold' ? 'border-amber-400/60 bg-amber-500/10' : 'border-red-400/60 bg-red-500/10',
          highlighted && (team === 'gold' ? 'bg-amber-500/20 ring-4 ring-amber-300/70' : 'bg-red-500/20 ring-4 ring-red-300/70')
        )}
      >
        {compact ? (
          <div className="flex items-center justify-between gap-2">
            <p className={cn('flex min-w-0 items-center gap-2 text-2xl font-black', TEAM_TEXT[team])}>
              {winner && <Trophy className="h-7 w-7 shrink-0 text-gold" aria-hidden />}
              <span className="min-w-0 truncate">{team === 'gold' ? t('game.teamGold') : t('game.teamRed')}</span>
            </p>
            {count}
          </div>
        ) : (
          <>
            <p className={cn('flex items-center gap-2 text-2xl font-black', TEAM_TEXT[team])}>
              {winner && <Trophy className="h-7 w-7 text-gold" aria-hidden />}
              {team === 'gold' ? t('lobby.teamGold') : t('lobby.teamRed')}
            </p>
            {count}
          </>
        )}
        <p className="text-lg font-semibold leading-snug text-white/80">{t('game.tvRemaining')}</p>
      </div>
      <ul className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', crowded ? 'gap-1' : 'gap-2')}>
        {players.map((p) => (
          <li
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-2 text-xl font-bold leading-snug',
              p.leftAt ? 'text-white/60' : team === 'gold' ? 'text-amber-100' : 'text-red-100'
            )}
          >
            {p.isSpymaster ? (
              <KeyRound className={cn('h-6 w-6 shrink-0', TEAM_TEXT[team])} aria-hidden />
            ) : (
              <span className="h-6 w-6 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate">{p.name}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function TvMotsCodes({ room, state }: { room: TvRoomDto; state: MCClientView }) {
  const t = useTranslations('games.mots-codes.game')
  const tTv = useTranslations('tv')
  const finished = state.phase === 'finished'
  const playing = state.phase === 'clue' || state.phase === 'guess'
  const totalPhaseMs = state.phase === 'clue' ? MC_CLUE_MS : MC_GUESS_MS
  const teamName = (team: MCTeam) => (team === 'gold' ? t('teamGold') : t('teamRed'))
  const activeMaster = state.players.find((p) => p.team === state.activeTeam && p.isSpymaster)
  const leftPlayer = playing ? state.players.find((p) => !p.isBot && p.leftAt) : undefined
  // Même quorum que les téléphones (OnlineEndScreen) : les membres de la table et leurs seuls votes.
  const rematch = rematchCounter(room.members, state.rematchVotes ?? [], null)
  const compact = (['gold', 'red'] as const).some((team) => state.players.filter((p) => p.team === team).length > 9)
  const talking =
    state.phase !== 'countdown' && speechFeedItems(state.speech ?? [], state.turn ?? 0, null, TV_FEED_SIZE).length > 0

  const column = (team: MCTeam) => (
    <TeamColumn
      team={team}
      players={state.players.filter((p) => p.team === team)}
      remaining={state.phase === 'countdown' ? null : state.remaining[team]}
      highlighted={playing && state.activeTeam === team}
      winner={finished && state.winnerTeam === team}
      compact={compact}
    />
  )

  let center
  if (state.phase === 'countdown') {
    center = (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
        <p className="text-4xl font-black uppercase tracking-widest text-amber-300/90">{t('countdown.title')}</p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => (
            <TvBigCountdown
              seconds={Math.min(Math.max(1, seconds), Math.ceil(MC_COUNTDOWN_MS / 1000))}
              colorClass="text-amber-200"
            />
          )}
        </PhaseCountdown>
      </div>
    )
  } else {
    center = (
      <>
        <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 px-6 py-3">
          {finished ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="flex items-center gap-4 text-5xl font-black leading-tight text-gold">
                <Trophy className="h-12 w-12 shrink-0" aria-hidden />
                {state.winnerTeam ? t('victory.teamWins', { team: teamName(state.winnerTeam) }) : t('victory.tie')}
              </p>
              {state.loseReason === 'assassin' && (
                <p className="text-2xl font-bold text-red-300">{t('victory.assassin')}</p>
              )}
              {rematch.count > 0 && (
                <p className="text-xl font-semibold text-white/80">
                  {tTv('rematchPending')} <span className="tabular-nums">{rematch.count}/{rematch.total}</span>
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-6">
                <p className={cn('min-w-0 flex-1 truncate text-xl font-bold uppercase tracking-widest', TEAM_TEXT[state.activeTeam])}>
                  {state.phase === 'clue'
                    ? t('phaseClue', { team: teamName(state.activeTeam) })
                    : t('phaseGuess', { team: teamName(state.activeTeam) })}
                </p>
                {state.phase === 'guess' && state.clue && (
                  <p className="shrink-0 text-2xl font-bold text-white/80">{t('guessesLeft', { count: state.guessesLeft })}</p>
                )}
                {state.phaseEndsAt !== null && (
                  <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
                    {({ leftMs, seconds }) => (
                      <span
                        className={cn(
                          'w-16 shrink-0 text-right text-2xl font-black tabular-nums',
                          leftMs < 15_000 ? 'text-red-300' : 'text-white/80'
                        )}
                      >
                        {Math.min(seconds, Math.ceil(totalPhaseMs / 1000))}
                      </span>
                    )}
                  </PhaseCountdown>
                )}
              </div>
              {state.phase === 'guess' && state.clue ? (
                <div className="flex min-w-0 items-center justify-center gap-5">
                  <KeyRound className="h-10 w-10 shrink-0 text-gold" aria-hidden />
                  <span
                    className={cn(
                      'min-w-0 truncate font-display font-bold uppercase tracking-[0.08em] text-cream',
                      clueTextClass(state.clue.word),
                      'leading-none'
                    )}
                  >
                    {state.clue.word}
                  </span>
                  <span className={cn('shrink-0 font-display font-black text-gold', clueTextClass(state.clue.word), 'leading-none')}>
                    · {state.clue.count}
                  </span>
                </div>
              ) : state.phase === 'guess' ? (
                <p className="text-center text-4xl font-black leading-tight text-white">
                  {t('waitingGuess', { team: teamName(state.activeTeam) })}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-4 text-center text-4xl font-black leading-tight text-white">
                  <KeyRound className={cn('h-10 w-10 shrink-0', TEAM_TEXT[state.activeTeam])} aria-hidden />
                  <span className="min-w-0">
                    {t('waitingClue', { name: activeMaster?.name ?? '—', team: teamName(state.activeTeam) })}
                  </span>
                </p>
              )}
              {state.phaseEndsAt !== null && (
                <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
                  {({ leftMs }) => (
                    <div className="flex">
                      <TvTimeBar timeLeftMs={leftMs} totalMs={totalPhaseMs} dangerMs={15_000} colorClass="bg-gold" dangerClass="bg-suit-red" />
                    </div>
                  )}
                </PhaseCountdown>
              )}
            </>
          )}
        </div>

        {leftPlayer?.leftAt && (
          <p className="shrink-0 truncate rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-2 text-center text-xl font-semibold text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </p>
        )}

        <div className={cn('grid min-h-0 flex-1 grid-cols-5 grid-rows-5', leftPlayer ? 'gap-2.5' : 'gap-3')}>
          {state.tiles.map((tile, i) =>
            tile.kind === 'assassin' && (tile.revealed || finished) ? (
              <div key={i} className="relative min-h-0">
                <PlayingCardBack className="h-full w-full rounded-xl" />
                <span aria-hidden className="absolute inset-0 grid place-items-center font-display text-5xl text-gold">
                  ♠
                </span>
              </div>
            ) : (
              <div
                key={i}
                className={cn(
                  'flex min-h-0 items-center justify-center overflow-hidden rounded-xl border-2 px-2 text-center font-black uppercase shadow-md hyphens-auto [overflow-wrap:anywhere]',
                  tileTextClass(tile.word),
                  'leading-tight',
                  tileClass(tile, finished)
                )}
              >
                {tile.word}
              </div>
            )
          )}
        </div>

        {talking && (
          <div className={FEED_CLIP}>
            <MotsCodesSpeechFeed view={state} iconOf={(p) => playerIcon(p, room.members)} variant="tv" />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 gap-6 px-6 py-4">
      {column('gold')}
      <div className="flex min-w-0 flex-1 flex-col gap-3">{center}</div>
      {column('red')}
    </div>
  )
}
