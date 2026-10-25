"use client"

import { useEffect, useState } from 'react'
import { CheckCircle2, Pencil, Skull, Trophy, UserX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  IMPOSTEUR_CLUE_MS,
  IMPOSTEUR_REVEAL_MS,
  IMPOSTEUR_VOTE_MS,
  imposteurCitedClue,
  type ImposteurClientView,
  type ImposteurPlayerView,
  type ImposteurSpeech,
} from '@/lib/imposteur/engine'
import { cn } from '@/lib/utils'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { BotSpeechFeed } from '@/components/online/bot-speech/BotSpeechFeed'
import { genreOf, genreOfId, type LineTranslator } from '@/components/online/bot-speech/bot-speech-feed'
import { TvBigCountdown, TvTimeBar } from './tv-shared'
import { serverNow } from '@/hooks/server-clock'

/** Au-delà, la liste des indices passe sur deux colonnes pour tenir en hauteur (16 joueurs max). */
const ONE_COLUMN_MAX = 8
/** Même seuil que l'avertissement anti-AFK des téléphones (ImposteurOnline). */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

type Afk = { name: string; endsAt: number }

/**
 * Avertissement anti-AFK des téléphones : le joueur humain au tour n'a pas
 * donné son indice depuis le dernier changement de version. Compté depuis
 * l'horloge de l'écran, comme chaque téléphone le compte depuis la sienne.
 */
function useAfkWarning(room: TvRoomDto, state: ImposteurClientView): Afk | null {
  const target = state.players.find((p) => p.id === room.currentTurnUserId)
  const watchable = Boolean(
    state.phase === 'clue' &&
      target &&
      !target.isBot &&
      !target.leftAt &&
      state.players.some((p) => !p.isBot && !p.leftAt && p.id !== target.id)
  )
  const [endsAt, setEndsAt] = useState<number | null>(null)
  useEffect(() => {
    setEndsAt(null)
    if (!watchable) return
    const startedAt = serverNow()
    const timer = setTimeout(() => setEndsAt(startedAt + ONLINE_REPLACE_GRACE_MS), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [room.stateVersion, watchable])
  return watchable && target && endsAt !== null ? { name: target.name, endsAt } : null
}

/**
 * L'IMPOSTEUR sur grand écran : ce que tous les téléphones montrent — manche,
 * phase et chrono, indices de la manche (et ceux des manches passées), qui a
 * voté, paroles, révélation avec le décompte — JAMAIS les mots des vivants (la
 * vue TV est neutre). Révélation complète à la fin de partie seulement.
 */
export function TvImposteur({ room, state }: { room: TvRoomDto; state: ImposteurClientView }) {
  const t = useTranslations('games.imposteur.game')
  const { mode } = useAmbianceMode()
  const afk = useAfkWarning(room, state)
  const soft = mode === 'soft'
  const nameOf = (id: string | null | undefined) =>
    state.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  if (state.phase === 'finished') {
    return <Finished state={state} soft={soft} iconOf={iconOf} />
  }

  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const banners = <Banners leftPlayer={leftPlayer} afk={afk} />

  if (state.phase === 'countdown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="font-display text-4xl font-black uppercase tracking-widest text-gold/90">
          {t('countdown.title')}
        </p>
        <PhaseCountdown endsAt={state.phaseEndsAt}>
          {({ seconds }) => <TvBigCountdown seconds={Math.max(1, seconds)} colorClass="text-gold" />}
        </PhaseCountdown>
        <p className="text-3xl text-white/80">{t('countdown.hint')}</p>
        <div className="w-[48rem] max-w-full">{banners}</div>
      </div>
    )
  }

  const reveal = state.lastReveal
  const activeId = state.phase === 'clue' ? state.clueOrder[state.clueTurnIdx] ?? null : null
  const totalPhaseMs =
    state.phase === 'clue' ? IMPOSTEUR_CLUE_MS : state.phase === 'vote' ? IMPOSTEUR_VOTE_MS : IMPOSTEUR_REVEAL_MS
  const alive = state.players.filter((p) => !p.eliminated)
  const votedCount = alive.filter((p) => p.hasVoted).length
  // À 9 joueurs et plus, la consigne passe en tête de la colonne des paroles :
  // la hauteur qu'elle libère sert aux lignes sur deux niveaux (nom, indice).
  const twoCols = state.clueOrder.length > ONE_COLUMN_MAX
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }
  const speechValues = (sp: ImposteurSpeech) => ({
    clue: imposteurCitedClue(state.clues, sp.targetId, sp.round),
  })

  const votePill = (
    <p className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-5 py-1 text-3xl font-black tabular-nums text-emerald-100">
      <CheckCircle2 aria-hidden className="h-8 w-8" />
      {votedCount}/{alive.length}
    </p>
  )

  return (
    <div className="flex h-full w-full flex-col gap-3 p-5">
      {/* Manche + phase + chrono */}
      <div className="flex shrink-0 items-center gap-5">
        <span className="text-2xl font-black text-white/90">{t('round', { n: state.round })}</span>
        <span className="text-xl font-semibold uppercase tracking-widest text-gold">
          {state.phase === 'clue' && t('phaseClue')}
          {state.phase === 'vote' && t('phaseVote')}
          {state.phase === 'reveal' && t('phaseReveal')}
        </span>
        {state.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={state.phaseEndsAt} tickMs={400}>
            {({ leftMs, seconds }) => (
              <>
                <TvTimeBar
                  timeLeftMs={leftMs}
                  totalMs={totalPhaseMs}
                  dangerMs={10_000}
                  colorClass="bg-gold"
                  dangerClass="bg-red-400"
                />
                <span
                  className={cn(
                    'w-20 shrink-0 text-right font-display text-3xl font-black tabular-nums',
                    leftMs < 10_000 ? 'text-red-300' : 'text-gold'
                  )}
                >
                  {seconds}s
                </span>
              </>
            )}
          </PhaseCountdown>
        )}
      </div>

      {state.phase === 'reveal' && reveal ? (
        <>
          <div className="flex shrink-0 justify-center">
            <div className="w-[48rem] max-w-full">{banners}</div>
          </div>
          <RevealHero state={state} soft={soft} nameOf={nameOf} />
        </>
      ) : (
        <>
          {/* La seule chose à lire d'un coup d'œil : qui parle, ou le vote en cours. */}
          {!twoCols && (
            <div className="flex shrink-0 items-center justify-center gap-6 text-center">
              {state.phase === 'vote' ? (
                <>
                  <p className="min-w-0 truncate text-4xl font-black text-white">{t('votePrompt')}</p>
                  {votePill}
                </>
              ) : (
                <p className="min-w-0 truncate text-5xl font-black text-gold">
                  {t('turnOf', { name: nameOf(activeId) })}
                </p>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-1 gap-6">
            <ClueBoard state={state} activeId={activeId} iconOf={iconOf} twoCols={twoCols} />
            <aside className="flex min-h-0 w-[26rem] shrink-0 flex-col gap-3">
              {twoCols &&
                (state.phase === 'vote' ? (
                  <div className="flex shrink-0 flex-col items-start gap-2">
                    <p className="line-clamp-2 text-3xl font-black leading-tight text-white">{t('votePrompt')}</p>
                    {votePill}
                  </div>
                ) : (
                  <p className="line-clamp-2 shrink-0 text-4xl font-black leading-tight text-gold">
                    {t('turnOf', { name: nameOf(activeId) })}
                  </p>
                ))}
              {banners}
              {state.phase === 'vote' && (
                <p className="shrink-0 text-center text-xl text-white/80">{t('spectatorVote')}</p>
              )}
              {/* Seul le fil est rogné, par le haut : les plus vieilles bulles partent d'abord. */}
              <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
                <BotSpeechFeed
                  speeches={state.speech ?? []}
                  round={state.round}
                  players={state.players}
                  iconOf={iconOf}
                  variant="tv"
                  tr={tr}
                  feedAria={t('feedAria')}
                  valuesOf={speechValues}
                />
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

/** Bandeaux « joueur parti » et « joueur inactif », comme sur les téléphones. */
function Banners({
  leftPlayer,
  afk,
}: {
  leftPlayer: ImposteurPlayerView | undefined
  afk: Afk | null
}) {
  const t = useTranslations('games.imposteur.game')
  if (!leftPlayer?.leftAt && !afk) return null
  return (
    <div className="flex shrink-0 flex-col gap-2 text-center">
      {leftPlayer?.leftAt && (
        <p className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xl font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </p>
      )}
      {afk && (
        <p className="rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-2 text-xl font-semibold text-red-100">
          <PhaseCountdown endsAt={afk.endsAt}>
            {({ seconds }) => t('afkWarning', { name: afk.name, seconds })}
          </PhaseCountdown>
        </p>
      )}
    </div>
  )
}

/** Indices de la manche dans l'ordre de parole, avec ceux des manches passées et le « a voté ». */
function ClueBoard({
  state,
  activeId,
  iconOf,
  twoCols,
}: {
  state: ImposteurClientView
  activeId: string | null
  iconOf: (p: ImposteurPlayerView) => string
  twoCols: boolean
}) {
  const rows = state.clueOrder
    .map((pid) => state.players.find((p) => p.id === pid))
    .filter((p): p is ImposteurPlayerView => Boolean(p))
  const rowCount = twoCols ? Math.ceil(rows.length / 2) : rows.length
  const currentClues = state.clues.filter((c) => c.round === state.round)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
      <div
        className={cn('grid gap-x-4', twoCols ? 'grid-cols-2 gap-y-1' : 'grid-cols-1 gap-y-2')}
        // Remplissage par colonne : l'ordre de parole se lit de haut en bas.
        style={{ gridTemplateRows: `repeat(${rowCount}, auto)`, gridAutoFlow: 'column' }}
      >
        {rows.map((p) => {
          const clue = currentClues.find((c) => c.playerId === p.id)
          const past = twoCols
            ? []
            : state.clues.filter((c) => c.playerId === p.id && c.round < state.round)
          const isActive = p.id === activeId
          const voted = state.phase === 'vote' && p.hasVoted
          const clueContent = clue ? (
            `« ${clue.text} »`
          ) : isActive ? (
            <Pencil aria-hidden className="inline h-7 w-7 animate-pulse text-gold" />
          ) : (
            ' '
          )
          return (
            <div
              key={p.id}
              className={cn(
                'flex min-w-0 items-center rounded-2xl border',
                twoCols ? 'gap-3 px-4 py-0.5' : 'gap-4 px-5 py-1.5',
                isActive
                  ? 'border-gold/60 bg-gold/20'
                  : voted
                    ? 'border-emerald-400/50 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5',
                p.eliminated && 'opacity-70'
              )}
            >
              <span className="shrink-0 text-3xl leading-none" aria-hidden>
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              {twoCols ? (
                // Nom au-dessus de l'indice : l'indice garde toute la largeur de la carte.
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold leading-tight text-white/90">{p.name}</p>
                  <p className="truncate text-2xl font-black leading-tight text-white">{clueContent}</p>
                </div>
              ) : (
                <>
                  <span className="w-[13rem] shrink-0 truncate text-2xl font-bold text-white/90">{p.name}</span>
                  {/* L'indice de la manche prend sa largeur d'abord ; l'aide-mémoire, le reste. */}
                  <span className="min-w-0 truncate text-3xl font-black text-white">{clueContent}</span>
                  {past.length > 0 && (
                    <span className="min-w-0 flex-1 truncate text-lg text-white/70">
                      {past.map((c) => `« ${c.text} »`).join(' · ')}
                    </span>
                  )}
                </>
              )}
              {voted && <CheckCircle2 aria-hidden className="ml-auto h-7 w-7 shrink-0 text-emerald-300" />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Révélation du voté : nom, mot, camp, gorgées et décompte public. */
function RevealHero({
  state,
  soft,
  nameOf,
}: {
  state: ImposteurClientView
  soft: boolean
  nameOf: (id: string | null | undefined) => string
}) {
  const t = useTranslations('games.imposteur.game')
  const reveal = state.lastReveal
  if (!reveal) return null
  const genre = genreOfId(state.players, reveal.eliminatedId)
  const tally = Object.entries(reveal.tally).sort((a, b) => b[1] - a[1])

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 text-center">
      {reveal.eliminatedId ? (
        <>
          <UserX aria-hidden className="h-16 w-16 text-red-300" />
          <p className="max-w-full truncate text-6xl font-black text-gold">
            {t('reveal.outTitle', { name: nameOf(reveal.eliminatedId), genre })}
          </p>
          <p className="max-w-full truncate text-4xl font-semibold text-white/90">
            {t('reveal.outWord', { word: reveal.word ?? '—', genre })}
          </p>
          <p
            className={cn(
              'rounded-full px-8 py-2 text-4xl font-black uppercase',
              reveal.team === 'imposteur' ? 'bg-suit-red/30 text-red-100' : 'bg-emerald-500/20 text-emerald-100'
            )}
          >
            {reveal.team === 'imposteur' ? t('reveal.wasImposteur', { genre }) : t('reveal.wasCivil', { genre })}
          </p>
          {!soft && reveal.sips > 0 && (
            <p className="text-3xl font-bold text-amber-200">
              {t('reveal.sips', { name: nameOf(reveal.eliminatedId), sips: reveal.sips })}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-7xl font-black text-gold">{reveal.tie ? t('reveal.tieTitle') : t('reveal.noVote')}</p>
          <p className="text-3xl text-white/80">{t('reveal.tieMsg')}</p>
        </>
      )}
      {tally.length > 0 && (
        <div className="flex max-w-full flex-wrap justify-center gap-3">
          {tally.map(([id, count]) => (
            <span
              key={id}
              className={cn(
                'flex min-w-0 max-w-[18rem] items-center gap-2 rounded-full border px-4 py-1 text-xl font-bold',
                id === reveal.eliminatedId
                  ? 'border-red-300/50 bg-suit-red/20 text-red-100'
                  : 'border-white/10 bg-white/10 text-white/90'
              )}
            >
              <span className="min-w-0 truncate">{nameOf(id)}</span>
              <span className="shrink-0 font-black tabular-nums text-gold">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Fin de partie : vainqueurs, les deux mots, et le camp de chacun. */
function Finished({
  state,
  soft,
  iconOf,
}: {
  state: ImposteurClientView
  soft: boolean
  iconOf: (p: ImposteurPlayerView) => string
}) {
  const t = useTranslations('games.imposteur.game')
  const civilWon = state.winnerTeam === 'civil'
  // Un bot ne boit pas : la ligne des gorgées ne vise que des perdants humains (comme le téléphone).
  const humanLosers = state.players.some((p) => !p.isBot && p.team !== state.winnerTeam)
  const civilWord = state.players.find((p) => p.team === 'civil')?.word
  const imposteurWord = state.players.find((p) => p.team === 'imposteur')?.word
  const players = [...state.players].sort(
    (a, b) => Number(b.team === 'imposteur') - Number(a.team === 'imposteur')
  )
  const n = players.length
  const cols = n <= 4 ? n : n <= 6 ? 3 : 4

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-5">
      <p className={cn('flex max-w-full items-center gap-4 text-5xl font-black', civilWon ? 'text-emerald-200' : 'text-red-200')}>
        <Trophy aria-hidden className="h-14 w-14 shrink-0 text-gold" />
        <span className="min-w-0 truncate">{civilWon ? t('victory.civilWin') : t('victory.imposteurWin')}</span>
      </p>
      {!soft && humanLosers && (
        <p className="text-2xl text-white/80">{civilWon ? t('victory.civilDrinks') : t('victory.imposteurDrinks')}</p>
      )}
      {/* Une paire longue (« contratto a tempo indeterminato ») passe à la ligne au lieu de déborder. */}
      <div className="flex max-w-full flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span className="text-base font-semibold uppercase tracking-widest text-gold/90">{t('victory.fullReveal')}</span>
        {civilWord && (
          <span className="min-w-0 max-w-full truncate rounded-full bg-emerald-500/20 px-5 py-1 text-3xl font-black text-emerald-100">
            {t('victory.teamCivil', { genre: 'other' })} « {civilWord} »
          </span>
        )}
        {imposteurWord && (
          <span className="min-w-0 max-w-full truncate rounded-full bg-suit-red/30 px-5 py-1 text-3xl font-black text-red-100">
            {t('victory.teamImposteur', { genre: 'other' })} « {imposteurWord} »
          </span>
        )}
      </div>
      <div
        className="grid w-full gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {players.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-2',
              p.team === 'imposteur' ? 'border-red-300/50 bg-suit-red/20' : 'border-white/10 bg-white/5'
            )}
          >
            <span className="shrink-0 text-4xl leading-none" aria-hidden>
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2 text-2xl font-bold text-white">
                <span className="min-w-0 truncate">{p.name}</span>
                {p.eliminated && <Skull aria-hidden className="h-6 w-6 shrink-0 text-white/70" />}
              </p>
              <p className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-xl text-white/80">« {p.word} »</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 text-lg font-black uppercase',
                    p.team === 'imposteur' ? 'bg-suit-red/30 text-red-100' : 'bg-emerald-500/20 text-emerald-100'
                  )}
                >
                  {p.team === 'imposteur'
                    ? t('victory.teamImposteur', { genre: genreOf(p) })
                    : t('victory.teamCivil', { genre: genreOf(p) })}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
