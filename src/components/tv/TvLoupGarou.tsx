"use client"

import { type ComponentType, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Beer,
  Bird,
  Check,
  FlaskConical,
  Hourglass,
  Medal,
  MessageCircle,
  Moon,
  Shield,
  Skull,
  Sparkles,
  Scale,
  Sun,
  Target,
  Trophy,
  Vote,
  Wheat,
} from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import type { LGClientView, LGPlayerView, LGRole } from '@/lib/loup-garou/engine'
import { WolfIcon } from '@/components/icons/GameIcons'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { cn } from '@/lib/utils'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { DebateFeed } from '@/components/online/loup-garou/DebateFeed'
import { lgPlayerIcon } from '@/components/online/loup-garou/debate-feed'
import { genreOf, genreOfId } from '@/components/online/bot-speech/bot-speech-feed'

/**
 * LOUP-GAROU sur grand écran, en paysage : à gauche l'annonce de la phase
 * (Playfair géant), à droite le village en cartes crème (morts retournés côté
 * feutre, rôle révélé). La vue reçue est celle du spectateur neutre : aucun
 * rôle de vivant, aucune action de nuit, aucun vote individuel — seulement ce
 * que tous les téléphones affichent.
 */

const ROLE_META: Record<LGRole, { Icon: ComponentType<{ className?: string }>; color: string; ink: string }> = {
  loup: { Icon: WolfIcon, color: 'text-red-300', ink: 'text-suit-red' },
  voyante: { Icon: Sparkles, color: 'text-purple-300', ink: 'text-purple-800' },
  sorciere: { Icon: FlaskConical, color: 'text-emerald-300', ink: 'text-emerald-800' },
  chasseur: { Icon: Target, color: 'text-amber-300', ink: 'text-amber-700' },
  salvateur: { Icon: Shield, color: 'text-cyan-300', ink: 'text-cyan-800' },
  corbeau: { Icon: Bird, color: 'text-slate-300', ink: 'text-slate-600' },
  ancien: { Icon: Hourglass, color: 'text-orange-300', ink: 'text-orange-800' },
  villageois: { Icon: Wheat, color: 'text-sky-300', ink: 'text-sky-800' },
}

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'mayor-election': 30_000,
  'night-guard': 25_000,
  'night-seer': 30_000,
  'night-raven': 25_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

/** Comme le téléphone : la révélation des rôles est déjà sous la lune. */
const NIGHT_PHASES = new Set(['night-guard', 'night-seer', 'night-raven', 'night-wolves', 'night-witch'])

/** La marque du Corbeau n'est publique que le jour, et ne pèse plus au revote. */
const RAVEN_PHASES = new Set(['dawn', 'day-debate', 'day-vote'])

/** Masque du haut du fil du débat : la bulle la plus ancienne s'efface au lieu d'être coupée net. */
const FEED_FADE = 'linear-gradient(to bottom, transparent, black 2.5rem)'

export function TvLoupGarou({ room, state }: { room: TvRoomDto; state: LGClientView }) {
  const t = useTranslations('games.loup-garou.game')
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'
  const reduced = useReducedMotion()
  const finished = state.phase === 'finished'
  const isNight = NIGHT_PHASES.has(state.phase)
  const isVote = state.phase === 'day-vote' || state.phase === 'day-revote'
  const totalPhaseMs = state.phase === 'day-debate' ? state.debateMs : PHASE_TOTAL_MS[state.phase] ?? 60_000
  const alive = state.players.filter((p) => p.alive)
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—'
  const genreOfPlayer = (id: string | null | undefined) => genreOfId(state.players, id)
  const iconOf = (p: { id: string; name: string; isBot: boolean }) => lgPlayerIcon(p, room.members)
  const roleName = (role: LGRole) => t(`roles.${role}.name`)

  if (finished) {
    const villageWon = state.winnerTeam === 'village'
    const n = state.players.length
    const cols = n <= 4 ? 'grid-cols-2' : n <= 6 ? 'grid-cols-3' : 'grid-cols-4'
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-5 px-8 py-5">
        <p
          className={cn(
            'flex items-center gap-5 text-center font-display text-6xl font-black',
            villageWon ? 'text-emerald-200' : 'text-red-200'
          )}
        >
          <Trophy aria-hidden className="h-16 w-16 shrink-0 text-gold" />
          {villageWon ? t('victory.village') : t('victory.loups')}
        </p>
        {!soft && (
          <p className="text-3xl font-semibold text-white/80">
            {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
          </p>
        )}
        <p className="text-lg font-semibold uppercase tracking-widest text-gold/90">{t('victory.fullReveal')}</p>
        <div className={cn('grid w-full gap-3', cols)}>
          {state.players.map((p) => {
            const meta = p.role ? ROLE_META[p.role] : null
            return (
              <div
                key={p.id}
                className={cn(
                  'flex min-w-0 flex-col gap-1 rounded-xl border-2 bg-cream px-4 py-2 text-[#24201A] shadow-[0_0.625rem_1.5rem_-0.75rem_rgba(0,0,0,0.6)]',
                  p.role === 'loup' ? 'border-suit-red' : 'border-[#D8CCAE]',
                  !p.alive && 'opacity-80'
                )}
              >
                <span className="flex min-w-0 items-center gap-3 text-2xl font-bold">
                  <span aria-hidden className="shrink-0 text-3xl leading-none">
                    <PlayerAvatarGlyph value={iconOf(p)} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2 text-xl font-bold">
                  {p.role && meta && (
                    <span className={cn('flex min-w-0 flex-1 items-center gap-2', meta.ink)}>
                      <meta.Icon aria-hidden className="h-6 w-6 shrink-0" />
                      <span className="truncate">{roleName(p.role)}</span>
                    </span>
                  )}
                  {state.mayorId === p.id && (
                    <Medal className="h-6 w-6 shrink-0 text-amber-700" aria-label={t('mayorBadge', { genre: genreOf(p) })} />
                  )}
                  {!p.alive && <Skull aria-hidden className="h-6 w-6 shrink-0 text-[#55503F]" />}
                  {!soft && (
                    <span className="flex shrink-0 items-center gap-1 text-lg text-amber-700">
                      <Beer aria-hidden className="h-6 w-6" />
                      {p.sips}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const lastVote = state.lastVoteResult
  const showVoteBanner = Boolean(lastVote) && !isVote
  const showMayorBanner = Boolean(state.mayorId) && state.phase !== 'mayor-election'
  // Une seule ligne (nom + badge) au lieu de la phrase du téléphone, qui
  // prend deux lignes avec un nom long et mange la hauteur du fil du débat.
  const ravenBanner =
    state.ravenTargetId && RAVEN_PHASES.has(state.phase) ? (
      <p className="flex w-full min-w-0 shrink-0 items-center justify-center gap-3 rounded-xl bg-slate-500/20 px-4 py-1.5 text-xl font-bold text-slate-100">
        <Bird aria-hidden className="h-7 w-7 shrink-0" />
        <span className="min-w-0 truncate">{nameOf(state.ravenTargetId)}</span>
        <span className="shrink-0 font-semibold text-slate-200">
          {t('ravenMarkBadge', { genre: genreOfPlayer(state.ravenTargetId) })}
        </span>
      </p>
    ) : null

  let center: ReactNode = null
  if (state.phase === 'reveal-role') {
    center = (
      <>
        <Moon aria-hidden className="h-24 w-24 text-sky-300" />
        <p className="font-display text-6xl font-black text-gold">{t('revealPrompt')}</p>
        <p className="text-3xl text-white/80">{t('revealHint')}</p>
      </>
    )
  } else if (isNight) {
    center = (
      <>
        <Moon aria-hidden className="h-24 w-24 text-sky-300" />
        <p className="font-display text-6xl font-black text-cream">{t('sleep')}</p>
        <p className="text-3xl text-white/80">{t('sleepHint')}</p>
      </>
    )
  } else if (state.phase === 'mayor-election') {
    center = (
      <>
        <Medal aria-hidden className="h-20 w-20 text-gold" />
        <p className="font-display text-5xl font-black leading-tight text-amber-100">{t('mayorPrompt')}</p>
        <p className="text-3xl font-bold text-white/80">
          {t('votedCount', { n: alive.filter((p) => state.hasVotedMayor[p.id]).length, total: alive.length })}
        </p>
      </>
    )
  } else if (state.phase === 'dawn') {
    center = (
      <>
        <Sun aria-hidden className="h-20 w-20 text-gold" />
        {state.lastNightDeaths.length === 0 ? (
          <p className="font-display text-6xl font-black text-emerald-200">{t('dawnNobody')}</p>
        ) : (
          state.lastNightDeaths.map((d) => (
            <p
              key={d.playerId}
              className={cn(
                'font-display font-black leading-tight text-red-200',
                state.lastNightDeaths.length > 1 ? 'text-4xl' : 'text-5xl'
              )}
            >
              {t(soft ? 'dawnDeathSoft' : 'dawnDeath', {
                name: nameOf(d.playerId),
                genre: genreOfPlayer(d.playerId),
                role: roleName(d.role),
              })}
            </p>
          ))
        )}
        {ravenBanner}
      </>
    )
  } else if (state.phase === 'hunter-shot') {
    center = (
      <>
        <motion.span
          aria-hidden
          className="inline-flex"
          animate={reduced ? undefined : { scale: [1, 1.15, 1] }}
          transition={reduced ? undefined : { repeat: Infinity, duration: 1.4 }}
        >
          <Target className="h-24 w-24 text-red-300" />
        </motion.span>
        <p className="font-display text-6xl font-black uppercase tracking-wide text-red-200">{t('hunterMoment')}</p>
        <p className="text-4xl font-bold text-amber-200">
          {t('hunterWaiting', { name: nameOf(state.pendingHunterId), genre: genreOfPlayer(state.pendingHunterId) })}
        </p>
      </>
    )
  } else if (state.phase === 'day-debate') {
    center = (
      <>
        <p className="flex items-center gap-3 font-display text-4xl font-black text-cream">
          <MessageCircle aria-hidden className="h-10 w-10 shrink-0 text-gold" />
          {t('debatePrompt')}
        </p>
        {ravenBanner}
        {/* Le fil garde les dernières paroles en bas ; s'il déborde, c'est
            la plus ancienne qui sort par le haut, en fondu, jamais la plus récente. */}
        <div
          className="flex min-h-0 w-full flex-1 flex-col justify-end overflow-hidden"
          style={{ WebkitMaskImage: FEED_FADE, maskImage: FEED_FADE }}
        >
          <DebateFeed
            speeches={state.debateSpeech}
            round={state.round}
            players={state.players}
            iconOf={iconOf}
            variant="tv"
          />
        </div>
        <p className="flex items-center gap-3 text-2xl font-bold text-gold">
          <Vote aria-hidden className="h-7 w-7" />
          {t('skipToVote', { n: state.debateSkips.length, total: alive.length })}
        </p>
      </>
    )
  } else if (isVote) {
    const candidates = state.revoteCandidates
      ? state.players.filter((p) => state.revoteCandidates?.includes(p.id))
      : null
    // Jusqu'à 10 ex-aequo (12 joueurs) : grille à colonnes fixes, noms
    // tronqués, pour que trois rangées au plus tiennent sous l'annonce.
    const candidateCols = !candidates
      ? ''
      : candidates.length <= 4
        ? 'grid-cols-2'
        : candidates.length <= 9
          ? 'grid-cols-3'
          : 'grid-cols-4'
    center = (
      <>
        {!candidates && <Vote aria-hidden className="h-20 w-20 shrink-0 text-gold" />}
        <p
          className={cn(
            'font-display font-black leading-tight text-cream',
            candidates ? 'text-5xl' : 'text-6xl'
          )}
        >
          {state.phase === 'day-revote' ? t('revotePrompt') : t('votePrompt')}
        </p>
        {candidates && (
          <div className={cn('grid w-full shrink-0 gap-3', candidateCols)}>
            {candidates.map((p) => (
              <span
                key={p.id}
                className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border-2 border-suit-red bg-cream px-3 py-1.5 text-2xl font-black text-[#24201A]"
              >
                <span aria-hidden className="shrink-0 leading-none">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <span className="min-w-0 truncate">{p.name}</span>
              </span>
            ))}
          </div>
        )}
        {state.phase === 'day-revote' && state.ravenTargetId && (
          <p className="flex w-full min-w-0 shrink-0 items-center justify-center gap-3 rounded-xl bg-slate-500/20 px-4 py-1.5 text-xl font-bold text-slate-100">
            <Bird aria-hidden className="h-7 w-7 shrink-0" />
            <span className="min-w-0 truncate">{t('ravenRevoteNotice')}</span>
          </p>
        )}
        {state.phase === 'day-vote' && ravenBanner}
        <p className="flex shrink-0 items-center gap-3 text-3xl font-bold text-white/80">
          {candidates && <Vote aria-hidden className="h-8 w-8 text-gold" />}
          {t('votedCount', { n: alive.filter((p) => state.hasVoted[p.id]).length, total: alive.length })}
        </p>
      </>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col gap-4 px-8 py-5',
        (isNight || state.phase === 'reveal-role') && 'bg-gradient-to-b from-chip-blue/30 to-transparent'
      )}
    >
      <div className="flex shrink-0 items-center gap-6">
        <span className="flex shrink-0 items-center gap-3 text-3xl font-black text-cream">
          {isNight || state.phase === 'reveal-role' ? (
            <Moon aria-hidden className="h-9 w-9 text-sky-300" />
          ) : (
            <Sun aria-hidden className="h-9 w-9 text-gold" />
          )}
          {t(isNight || state.phase === 'reveal-role' ? 'roundNight' : 'roundDay', { n: Math.max(1, state.round) })}
        </span>
        <span className="shrink-0 font-display text-2xl font-bold uppercase tracking-widest text-gold">
          {t(`phases.${state.phase}`)}
        </span>
        {state.phaseEndsAt !== null ? (
          <PhaseCountdown
            variant="bar"
            endsAt={state.phaseEndsAt}
            total={totalPhaseMs}
            dangerMs={10_000}
            className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
            barClassName="h-full rounded-full"
            colorClassName="bg-gold"
            dangerClassName="bg-red-400"
          />
        ) : (
          <span className="flex-1" />
        )}
        <span className="shrink-0 text-xl font-bold uppercase tracking-widest text-gold/90">
          {t('village', { alive: alive.length, total: state.players.length })}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-8">
        <motion.div
          key={`${state.phase}#${state.phaseSeq}`}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-4 text-center"
        >
          {center}
          {(showVoteBanner || showMayorBanner) && (
            <div className="flex w-full shrink-0 flex-col gap-1 pt-1">
              {showVoteBanner && lastVote && (
                <p className="flex items-center justify-center gap-2 text-xl font-semibold text-cream/80">
                  <Scale aria-hidden className="h-6 w-6 shrink-0 text-gold" />
                  <span className="truncate">
                  {lastVote.eliminatedId
                    ? t('voteBanner', {
                        name: nameOf(lastVote.eliminatedId),
                        genre: genreOfPlayer(lastVote.eliminatedId),
                        role: lastVote.role ? roleName(lastVote.role) : '—',
                      })
                    : t('voteTieBanner')}
                  </span>
                </p>
              )}
              {showMayorBanner && (
                <p className="flex items-center justify-center gap-2 text-xl font-semibold text-amber-100/90">
                  <Medal aria-hidden className="h-6 w-6 shrink-0 text-gold" />
                  <span className="truncate">{t('mayorBanner', { name: nameOf(state.mayorId), genre: genreOfPlayer(state.mayorId) })}</span>
                </p>
              )}
            </div>
          )}
        </motion.div>

        <VillageColumn
          state={state}
          soft={soft}
          iconOf={iconOf}
          roleName={roleName}
          mayorLabel={(p) => t('mayorBadge', { genre: genreOf(p) })}
          ravenLabel={(p) => t('ravenMarkBadge', { genre: genreOf(p) })}
        />
      </div>
    </div>
  )
}

/**
 * Le village : une colonne jusqu'à 6 joueurs, deux au-delà (12 au maximum du
 * moteur → 6 rangées de cartes de 4,5 rem, qui tiennent dans la hauteur).
 */
function VillageColumn({
  state,
  soft,
  iconOf,
  roleName,
  mayorLabel,
  ravenLabel,
}: {
  state: LGClientView
  soft: boolean
  iconOf: (p: LGPlayerView) => string
  roleName: (role: LGRole) => string
  mayorLabel: (p: LGPlayerView) => string
  ravenLabel: (p: LGPlayerView) => string
}) {
  const twoCols = state.players.length > 6
  const isVote = state.phase === 'day-vote' || state.phase === 'day-revote'
  return (
    <div className={cn('grid shrink-0 content-center gap-2', twoCols ? 'w-[32rem] grid-cols-2' : 'w-[26rem] grid-cols-1')}>
      {state.players.map((p) => {
        const meta = p.role ? ROLE_META[p.role] : null
        const voted =
          p.alive &&
          ((isVote && state.hasVoted[p.id]) || (state.phase === 'mayor-election' && state.hasVotedMayor[p.id]))
        const ravenMarked = RAVEN_PHASES.has(state.phase) && state.ravenTargetId === p.id && p.alive
        const candidate = state.phase === 'day-revote' && state.revoteCandidates?.includes(p.id)
        const hunter = state.phase === 'hunter-shot' && state.pendingHunterId === p.id
        const mayor = state.mayorId === p.id
        // Gorgées des morts seulement : chez un vivant, le +1 de potion de la
        // Sorcière (en pleine nuit) et le +3 des seuls loups quand un complice
        // est lynché trahiraient un rôle à tout le salon.
        const sips = !soft && !p.alive && p.sips > 0
        return (
          <div
            key={p.id}
            className={cn(
              'flex min-w-0 flex-col justify-center gap-0.5 rounded-xl border-2 px-3 py-1.5',
              p.alive
                ? 'border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_0.5rem_1.125rem_-0.625rem_rgba(0,0,0,0.7)]'
                : 'border-gold/30 bg-felt-deep text-cream',
              voted && 'border-emerald-600',
              candidate && 'border-suit-red',
              hunter && 'border-red-300 ring-[0.25rem] ring-red-300/70'
            )}
          >
            <span className="flex min-w-0 items-center gap-2 text-xl font-bold leading-snug">
              <span aria-hidden className={cn('shrink-0 text-2xl leading-none', !p.alive && 'opacity-70')}>
                {p.alive ? <PlayerAvatarGlyph value={iconOf(p)} /> : <Skull className="h-6 w-6 text-cream/70" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </span>
            <span className="flex min-h-[1.75rem] min-w-0 items-center gap-2 text-lg font-bold leading-snug">
              {p.role && meta && (
                <span className={cn('flex min-w-0 items-center gap-1.5', p.alive ? meta.ink : meta.color)}>
                  <meta.Icon aria-hidden className="h-6 w-6 shrink-0" />
                  <span className="truncate">{roleName(p.role)}</span>
                </span>
              )}
              {ravenMarked && (
                <span className="flex shrink-0 items-center gap-1 text-slate-600" aria-label={ravenLabel(p)}>
                  <Bird aria-hidden className="h-6 w-6" />
                  +2
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {mayor && (
                  <Medal
                    className={cn('h-6 w-6 shrink-0', p.alive ? 'text-amber-700' : 'text-gold')}
                    aria-label={mayorLabel(p)}
                  />
                )}
                {voted && <Check aria-hidden className="h-6 w-6 shrink-0 text-emerald-700" strokeWidth={3} />}
                {sips && (
                  <span className="flex items-center gap-1 text-amber-200/90">
                    <Beer aria-hidden className="h-6 w-6" />
                    {p.sips}
                  </span>
                )}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
