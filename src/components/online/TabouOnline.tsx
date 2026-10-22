"use client"

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowRight, Ban, Check, Loader2, Mic, SkipForward, Trophy, WifiOff, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { TurnBanner } from '@/components/game/TurnBanner'
import { Button } from '@/components/ui/button'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import {
  TABOU_BOT_DESCRIBER_ROUND_MS,
  TABOU_ROUND_MS,
  type TabouClientView,
  type TabouPlayerView,
  type TabouTeam,
} from '@/lib/tabou/engine'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { genreOf } from './bot-speech/bot-speech-feed'
import { TabouSpeechFeed } from './tabou/TabouSpeechFeed'

/**
 * TABOU VOCAL en ligne (serveur-autoritaire). Pendant la manche, `currentWord`
 * va au décrivant et à l'équipe adverse, qui guette les mots interdits pour
 * crier TABOU — jamais aux coéquipiers, qui devinent (cf. tabouSeesCurrentWord).
 * `lastRoundWord` devient public au bilan.
 *
 * Compte à rebours, manche et bilan partagent un même arbre : le bandeau de
 * tour y reste monté, et sonne quand le rôle de décrivant ARRIVE au joueur
 * (dès le bilan qui l'annonce) au lieu de se remonter muet à chaque phase.
 */

function parseView(json: string | null | undefined): TabouClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as TabouClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Couleurs de CONTENU des équipes (bleu ciel / rose), texte ≥ 4,5:1 sur le feutre. */
const TEAM_STYLES: Record<TabouTeam, { card: string; text: string; ring: string }> = {
  A: { card: 'border-sky-400/30 bg-sky-500/10', text: 'text-sky-300', ring: 'ring-2 ring-sky-300/60' },
  B: { card: 'border-rose-400/30 bg-rose-500/10', text: 'text-rose-300', ring: 'ring-2 ring-rose-300/60' },
}

/**
 * Carte du mot, crème et encre : le mot en titre, ses quatre interdits en
 * rouge carreau. Pas de fond teinté sous les interdits : le rouge sur crème
 * tient 5:1, sur un voile rose il tombait sous 4,5:1.
 */
function WordCard({
  label,
  word,
  tabooLabel,
  taboo,
}: {
  label: string
  word: string
  tabooLabel: string
  taboo: readonly string[]
}) {
  return (
    <PlayingCard suit="heart" rank="Q" className="px-5 pb-4 pt-5 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6B6455]">{label}</p>
      <p className="mt-1 break-words font-display text-3xl font-bold leading-tight">{word}</p>
      <div aria-hidden className="mx-auto my-3 h-px w-16 bg-[#24201A]/20" />
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-suit-red">{tabooLabel}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {taboo.map((w) => (
          <li
            key={w}
            className="flex min-h-[2.5rem] items-center justify-center gap-1.5 break-words rounded-lg border border-suit-red/40 px-2 py-1.5 text-base font-bold leading-tight text-suit-red"
          >
            <Ban aria-hidden className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{w}</span>
          </li>
        ))}
      </ul>
    </PlayingCard>
  )
}

function StatTile({
  icon: Icon,
  iconClassName,
  value,
  label,
}: {
  icon: LucideIcon
  iconClassName: string
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3 text-center">
      <Icon aria-hidden className={cn('h-5 w-5', iconClassName)} />
      <span className="font-display text-3xl font-bold tabular-nums leading-none text-cream">{value}</span>
      <span className="text-sm font-semibold text-cream/80">{label}</span>
    </div>
  )
}

export function TabouOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.tabou.game')
  const tc = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()

  const inGame = room?.gameId === 'tabou' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('tabou', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » générique, arbitré par rang.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots en attente au bilan + remplacement), avec secours
  // par rang (cf. useBotReferee).
  const roundEndActor =
    view?.phase === 'roundEnd'
      ? view.players.find((p) => p.id === room?.currentTurnUserId)
      : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: roundEndActor?.isBot
      ? { body: { action: 'bot' }, delayMs: botTickDelayMs(roundEndActor.name) }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="tabou" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const describer = view.players.find((p) => p.id === view.describerId)
  const describerName = describer?.name ?? ''
  const myTeam = me?.team
  const isTeammate = !view.isDescriber && Boolean(myTeam) && describer?.team === myTeam
  const isOpponent = !view.isDescriber && Boolean(myTeam) && Boolean(describer) && describer?.team !== myTeam
  const finished = view.phase === 'finished'
  const won = finished && myTeam && view.winnerTeam === myTeam

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const renderTeams = (showScores: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      {(['A', 'B'] as const).map((team) => {
        const mine = team === myTeam
        const teamName = team === 'A' ? t('teamA') : t('teamB')
        return (
          <section
            key={team}
            aria-label={teamName}
            className={cn('min-w-0 rounded-2xl border p-3', TEAM_STYLES[team].card, mine && TEAM_STYLES[team].ring)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('text-sm font-bold uppercase tracking-wide', TEAM_STYLES[team].text)}>{teamName}</p>
                {mine && <p className="text-xs font-semibold text-cream/80">{t('yourTeam')}</p>}
              </div>
              {showScores && (
                <span className="font-display text-3xl font-bold tabular-nums leading-none text-cream">
                  {view.scores[team]}
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {view.players.filter((p) => p.team === team).map((p) => (
                <li
                  key={p.id}
                  className={cn('flex min-w-0 items-center gap-1.5 text-sm font-semibold text-cream', p.leftAt && 'opacity-40')}
                >
                  <span aria-hidden className="shrink-0 text-base leading-none">
                    <PlayerAvatarGlyph value={iconOf(p)} />
                  </span>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 break-words" />
                  {p.id === user.id && <span className="shrink-0 text-xs font-medium text-cream/70">{t('you')}</span>}
                  {/* Au bilan, le micro resterait sur l'ANCIEN décrivant alors que le
                      bandeau annonce le suivant : marqueur limité à la manche. */}
                  {(view.phase === 'countdown' || view.phase === 'describing') && p.id === view.describerId && (
                    <>
                      <Mic aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                      <span className="sr-only">{t('describerTag')}</span>
                    </>
                  )}
                  {p.leftAt && (
                    <>
                      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
                      <span className="sr-only">{t('leftTag')}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <OnlineEndScreen
        confetti
        won={Boolean(won)}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy aria-hidden className={cn('h-14 w-14', view.winnerTeam === 'A' ? 'text-sky-300' : 'text-rose-300')} />
            <h2 className="font-display text-3xl font-bold text-gold">
              {view.winnerTeam === 'A' ? t('victory.teamAWin') : t('victory.teamBWin')}
            </h2>
            <p className="text-base font-semibold text-cream/80">{t('score', { a: view.scores.A, b: view.scores.B })}</p>
          </motion.div>
        }
        ranking={<div className="w-full max-w-sm">{renderTeams(true)}</div>}
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours, manche en cours, bilan : un seul arbre ─────────────
  const countdown = view.phase === 'countdown'
  const describing = view.phase === 'describing'
  const roundEnd = view.phase === 'roundEnd'
  const gameDecided = view.scores.A >= view.targetScore || view.scores.B >= view.targetScore
  const roundTotal = describer?.isBot ? TABOU_BOT_DESCRIBER_ROUND_MS : TABOU_ROUND_MS

  // En pleine manche, la carte dit déjà tout au décrivant : son bandeau
  // s'allège pour que la carte entière tienne sur un petit écran.
  const roleHint = view.isDescriber
    ? countdown
      ? t('describerHint')
      : undefined
    : isTeammate
      ? t('teammateHint', { name: describerName })
      : isOpponent
        ? t('opponentHint', { name: describerName, genre: genreOf(describer) })
        : undefined

  // Au bilan, le bandeau annonce le PROCHAIN décrivant (même rotation que le moteur).
  const order = view.describerOrder ?? []
  const nextDescriber: TabouPlayerView | undefined =
    roundEnd && !gameDecided && order.length > 0
      ? view.players.find((p) => p.id === order[(view.describerIdx + 1) % order.length])
      : undefined
  const turn: { player: TabouPlayerView; mine: boolean; hint?: string } | null = roundEnd
    ? nextDescriber
      ? {
          player: nextDescriber,
          mine: nextDescriber.id === user.id,
          hint: nextDescriber.id === user.id ? t('roundEnd.nextHintMine') : t('roundEnd.nextHint'),
        }
      : null
    : describer
      ? { player: describer, mine: view.isDescriber, hint: roleHint }
      : null

  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const hasBar = describing || roundEnd
  const hasBots = view.players.some((p) => p.isBot)

  const busyIcon = (Icon: LucideIcon) =>
    busy ? (
      <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
    ) : (
      <Icon aria-hidden className="mr-2 h-5 w-5 shrink-0" />
    )

  const statsLine = (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-semibold">
      <span className="inline-flex items-center gap-1">
        <Check aria-hidden className="h-4 w-4 text-emerald-300" />
        <span className="tabular-nums text-cream">{view.roundStats.found}</span> {t('roundEnd.found')}
      </span>
      <span className="inline-flex items-center gap-1">
        <SkipForward aria-hidden className="h-4 w-4 text-cream/70" />
        <span className="tabular-nums text-cream">{view.roundStats.passed}</span> {t('roundEnd.passed')}
      </span>
      <span className="inline-flex items-center gap-1">
        <Ban aria-hidden className="h-4 w-4 text-red-300" />
        <span className="tabular-nums text-cream">{view.roundStats.taboo}</span> {t('roundEnd.taboo')}
      </span>
    </span>
  )

  const barStatus = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : describing ? (
    statsLine
  ) : null

  const phaseTitle = countdown ? t('countdown.title') : roundEnd ? t('roundEnd.title') : t('phaseDescribingTitle')

  return (
    <>
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg',
          hasBar ? onlineActionBarPadding('tall') : 'pb-6'
        )}
      >
        <PhaseHeader
          round={t('roundLabel', { n: view.round, target: view.targetScore })}
          phase={phaseTitle}
          endsAt={describing ? view.phaseEndsAt : null}
          total={roundTotal}
          dangerMs={describer?.isBot ? 0 : 15_000}
          right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
          status={
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-sky-300">
                {t('teamA')} <span className="font-bold tabular-nums text-cream">{view.scores.A}</span>
              </span>
              <span aria-hidden className="text-cream/60">·</span>
              <span className="text-rose-300">
                {t('teamB')} <span className="font-bold tabular-nums text-cream">{view.scores.B}</span>
              </span>
            </span>
          }
        />

        {turn && (
          <TurnBanner
            mine={turn.mine}
            name={turn.player.name}
            avatar={<PlayerAvatarGlyph value={iconOf(turn.player)} />}
            hint={turn.hint}
            alertOnMine
          />
        )}

        {leftPlayer?.leftAt && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-gold" />
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        {countdown && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <PhaseCountdownLaunch
              endsAt={view.phaseEndsAt}
              className="font-display text-8xl font-bold tabular-nums text-cream"
            />
            <p className="text-sm font-semibold text-cream/80">{t('countdown.hint')}</p>
          </div>
        )}

        {describing &&
          (view.currentWord && (view.isDescriber || isOpponent) ? (
            <motion.div
              key={view.currentWord.word}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <WordCard
                label={view.isDescriber ? t('yourWord') : t('theirWord', { name: describerName })}
                word={view.currentWord.word}
                tabooLabel={view.isDescriber ? t('tabooWords') : t('watchWords')}
                taboo={view.currentWord.taboo}
              />
            </motion.div>
          ) : isTeammate ? (
            <div className="flex items-center gap-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <PlayingCardBack className="h-24 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <Mic aria-hidden className="mb-1 h-6 w-6 text-gold" />
                <p className="text-base font-semibold leading-snug text-cream/80">{t('teammateSecret')}</p>
              </div>
            </div>
          ) : null)}

        {roundEnd && (
          <>
            {view.lastRoundWord && (
              <WordCard
                label={t('roundEnd.wordWasLabel')}
                word={view.lastRoundWord.word}
                tabooLabel={t('tabooWords')}
                taboo={view.lastRoundWord.taboo}
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              <StatTile icon={Check} iconClassName="text-emerald-300" value={view.roundStats.found} label={t('roundEnd.found')} />
              <StatTile icon={SkipForward} iconClassName="text-cream/70" value={view.roundStats.passed} label={t('roundEnd.passed')} />
              <StatTile icon={Ban} iconClassName="text-red-300" value={view.roundStats.taboo} label={t('roundEnd.taboo')} />
            </div>
          </>
        )}

        {/* Réactions des bots, sous la carte et le bilan, au-dessus des équipes :
            dans le flux, jamais par-dessus la carte ni sous la barre d'action.
            Monté dès qu'un bot est assis, même vide, pour que la région
            aria-live existe avant la première bulle. */}
        {hasBots && <TabouSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" />}

        {renderTeams(false)}
      </div>

      {hasBar && (
        <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
          {describing && view.isDescriber ? (
            <Button
              variant="quiet"
              size="gameLg"
              className="w-full"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void sendAction({ action: 'pass' })}
            >
              {busyIcon(SkipForward)}
              {t('passButton')}
            </Button>
          ) : describing && isTeammate ? (
            <Button
              variant="primary"
              size="gameLg"
              className="w-full text-lg"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void sendAction({ action: 'found' })}
            >
              {busyIcon(Check)}
              {t('foundButton')}
            </Button>
          ) : describing && isOpponent ? (
            <Button
              variant="danger"
              size="gameLg"
              className="w-full text-lg"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void sendAction({ action: 'taboo-called' })}
            >
              {busyIcon(Ban)}
              {t('tabooButton')}
            </Button>
          ) : roundEnd ? (
            <Button
              variant="primary"
              size="gameLg"
              className="w-full"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void sendAction({ action: 'continue' })}
            >
              {busyIcon(gameDecided ? Trophy : ArrowRight)}
              {/* Libellé nominatif : n'importe qui peut lancer, et le chrono du
                  prochain décrivant part aussitôt (pas de compte à rebours). */}
              <span className="min-w-0 truncate">
                {gameDecided
                  ? t('roundEnd.seeResult')
                  : nextDescriber
                    ? nextDescriber.id === user.id
                      ? t('roundEnd.startMyRound')
                      : t('roundEnd.startRoundOf', { name: nextDescriber.name })
                    : t('roundEnd.continue')}
              </span>
            </Button>
          ) : null}
        </OnlineActionBar>
      )}

      <AnimatePresence>
        {tutorial.open && <GameTutorialModal gameId="tabou" onClose={tutorial.close} />}
      </AnimatePresence>
    </>
  )
}
