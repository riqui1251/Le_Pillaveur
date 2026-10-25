"use client"

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, Crown, Gavel, Loader2, Trophy, WifiOff } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  SF_JUDGE_MS,
  SF_REVEAL_BOT_TICK_MS,
  SF_SUBMIT_MS,
  sfRevealLeaderId,
  type SFClientView,
} from '@/lib/sans-filtre/engine'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useDeadline } from '@/hooks/useDeadline'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * SANS FILTRE en ligne (serveur-autoritaire). Vue déjà filtrée : chacun ne
 * voit que SA main, les réponses abattues restent anonymes jusqu'au
 * couronnement. Le juge du tour ne joue pas — il lit à voix haute (vocal) et
 * couronne la plus drôle.
 *
 * Jouer une carte et couronner une réponse se font en DEUX TEMPS : un toucher
 * soulève la carte, le bouton de la barre du bas l'envoie. Les deux gestes
 * sont définitifs côté moteur (ALREADY_PLAYED, passage immédiat au reveal),
 * et une main de 7 cartes se fait défiler au pouce : un toucher accroché en
 * passant suffisait à jouer la mauvaise.
 */

function parseView(json: string | null | undefined): SFClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as SFClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Index de coin d'une carte : ornement calé dans la marge gauche, pas du texte à lire. */
function CardCorner({ rank, suit, className }: { rank: string; suit: string; className?: string }) {
  return (
    <span aria-hidden className={cn('absolute left-2 top-1.5 font-display text-[11px] font-black leading-tight', className)}>
      {rank}
      <br />
      {suit}
    </span>
  )
}

const CARD_BASE =
  'relative w-full rounded-xl border bg-cream py-3 pl-7 pr-3 text-left text-sm font-bold leading-snug text-[#24201A]'

/**
 * Carte réponse qu'on peut SOULEVER (main du joueur, réponses pour le juge).
 * Signe de l'état doublé : anneau + pastille (coche ou couronne) quand elle
 * est choisie, roue quand elle part, 60 % pour les autres pendant l'envoi.
 */
function PickableCard({
  text,
  corner,
  selected,
  pending,
  disabled,
  markIcon,
  sendingLabel,
  onToggle,
}: {
  text: string
  corner: ReactNode
  selected: boolean
  pending: boolean
  disabled: boolean
  markIcon: 'check' | 'crown'
  sendingLabel: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-busy={pending || undefined}
      className={cn(
        CARD_BASE,
        'flex min-h-[52px] items-center gap-2 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)] motion-safe:transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
        // Survol réservé aux pointeurs qui survolent : au doigt, :hover reste
        // collé après le toucher, et la carte qu'on vient de reposer resterait
        // soulevée comme si elle était encore choisie.
        selected
          ? '-translate-y-0.5 border-gold ring-[3px] ring-gold'
          : 'border-[#D8CCAE] motion-safe:[@media(hover:hover)]:hover:-translate-y-0.5 motion-safe:active:scale-[0.98]',
        disabled && !selected && !pending && 'opacity-60'
      )}
    >
      {corner}
      <span className="min-w-0 flex-1 break-words">{text}</span>
      {pending ? (
        <Loader2 className="h-5 w-5 shrink-0 text-[#6B6455] motion-safe:animate-spin" aria-hidden />
      ) : selected ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[#24201A]" aria-hidden>
          {markIcon === 'crown' ? <Crown className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Check className="h-4 w-4" strokeWidth={3} />}
        </span>
      ) : null}
      {pending && <span className="sr-only">{` (${sendingLabel})`}</span>}
    </button>
  )
}

export function SansFiltreOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.sans-filtre.game')
  const tCommon = useTranslations('common')
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  // Carte soulevée, rattachée à la phase où elle a été choisie : un changement
  // de phase (chrono échu, jugement qui démarre) l'oublie sans effet à part.
  const [pick, setPick] = useState<{ key: string; card: number } | null>(null)
  const [sendingCard, setSendingCard] = useState<number | null>(null)

  const inGame = room?.gameId === 'sans-filtre' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('sans-filtre', inGame)
  const cosmetics = useMemberCosmetics(room)
  // Le serveur refuse « manche suivante » avant le temps de lecture
  // (READING_TIME) : le bouton reste grisé, décompte affiché, jusque-là.
  const continueUnlocked = useDeadline(view?.continueAt ?? null)

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick)
  // — le rang 0 tire à l'échéance, le suivant prend le relais 4 s plus tard si
  // son téléphone est verrouillé, et la version qui bouge coupe les autres.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (jeu des bots + remplacement), avec secours par rang.
  // Le tick se réarme à chaque changement d'état, donc chaque bot en attente
  // « réfléchit » selon le tempo de SON persona (botTickDelayMs).
  // Prochain bot à agir — en submit, le PREMIER en attente (même ordre que
  // le server-adapter, qui n'en fait soumettre qu'un par tick).
  const pendingBot =
    view?.phase === 'submit'
      ? view.players.find(
          (p) => p.isBot && !p.isJudge && !p.hasPlayed && p.handCount > 0 && !p.leftAt
        )
      : view?.phase === 'judging'
        ? view.players.find((p) => p.isJudge && p.isBot)
        : view?.phase === 'reveal'
          ? view.players.find((p) => p.id === sfRevealLeaderId(view) && p.isBot)
          : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: pendingBot
      ? {
          body: { action: 'bot' },
          delayMs:
            view?.phase === 'reveal'
              ? Math.max(SF_REVEAL_BOT_TICK_MS, botTickDelayMs(pendingBot.name))
              : botTickDelayMs(pendingBot.name),
        }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="sans-filtre" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div aria-hidden className="h-8 w-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 motion-safe:animate-spin" />
        <span className="sr-only">{tCommon('loading')}</span>
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const continueLocked = view.continueAt != null && !continueUnlocked
  const isLastRound = view.round + 1 >= view.totalRounds
  const judge = view.players.find((p) => p.isJudge)
  const iAmJudge = judge?.id === user.id

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot
      ? botAvatarFromName(p.name)
      : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const totalPhaseMs = view.phase === 'judging' ? SF_JUDGE_MS : SF_SUBMIT_MS
  const playersInRound = view.players.filter((p) => !p.isJudge && !p.leftAt)
  const playedCount = playersInRound.filter((p) => p.hasPlayed).length

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const sorted = [...view.players].sort((a, b) => b.crowns - a.crowns)
    const won = view.winnerId === user.id
    return (
      <OnlineEndScreen
        confetti
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className="h-14 w-14 text-gold" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gold">
              {view.winnerId ? t('victory.winnerIs', { name: nameOf(view.winnerId) }) : t('victory.tie')}
            </h2>
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t('victory.finalScore')}
            </p>
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.id === view.winnerId
                    ? 'border-gold/60 bg-gold/10'
                    : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-cream/70">{i + 1}</span>
                <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-cream">
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black tabular-nums text-amber-200">
                  <Crown className="h-4 w-4" aria-hidden />
                  <span aria-hidden>{p.crowns}</span>
                  <span className="sr-only">{t('crownsCount', { count: p.crowns })}</span>
                </span>
              </div>
            ))}
          </div>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-cream">
        <p className="font-display text-xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-amber-200" />
        <p className="text-sm font-semibold text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const canPlay = view.phase === 'submit' && !iAmJudge && view.myPlayed === null && view.myHand.length > 0
  const canCrown = view.phase === 'judging' && iAmJudge && (view.submissions?.length ?? 0) > 0

  // Carte soulevée encore valable : même phase, et toujours en main / parmi
  // les réponses (une resynchro peut l'avoir retirée).
  const pickedCard =
    pick && pick.key === view.phaseKey
      ? canPlay && view.myHand.some((c) => c.card === pick.card)
        ? pick.card
        : canCrown && view.submissions?.some((s) => s.card === pick.card)
          ? pick.card
          : null
      : null
  const togglePick = (card: number) =>
    setPick((cur) =>
      cur && cur.key === view.phaseKey && cur.card === card ? null : { key: view.phaseKey, card }
    )
  // sendAction ne lève jamais : `ok` faux (refus, réseau) garde la carte
  // soulevée pour réessayer, le message d'erreur s'affiche dans la barre.
  const sendPick = async (action: 'play-card' | 'judge-pick') => {
    if (pickedCard === null) return
    setSendingCard(pickedCard)
    const res = await sendAction({ action, card: pickedCard })
    setSendingCard(null)
    if (res?.ok) setPick(null)
  }

  const phaseLabel =
    view.phase === 'submit' ? t('phaseSubmit') : view.phase === 'judging' ? t('phaseJudging') : t('phaseReveal')

  // Un seul bandeau de tour : le joueur qui abat, puis le juge qui couronne.
  // Pas de bandeau au reveal : n'importe qui lance la manche suivante.
  const turn: { mine: boolean; name?: string; avatar?: ReactNode; hint?: ReactNode } | null =
    view.phase === 'submit'
      ? canPlay
        ? { mine: true, hint: t('playPrompt') }
        : { mine: false }
      : view.phase === 'judging'
        ? iAmJudge
          ? { mine: true, hint: t('judgePickPrompt') }
          : {
              mine: false,
              name: judge?.name,
              avatar: judge ? <PlayerAvatarGlyph value={iconOf(judge)} /> : undefined,
            }
        : null

  const barStatus =
    view.phase === 'submit'
      ? canPlay
        ? t('playedStatus', { count: playedCount, total: playersInRound.length })
        : view.myPlayed !== null
          ? t('played', { count: playedCount, total: playersInRound.length })
          : t('judgeWaits', { count: playedCount, total: playersInRound.length })
      : view.phase === 'judging'
        ? iAmJudge
          ? null
          : t('judgeReading', { name: judge?.name ?? '—' })
        : t('reveal.everyone')

  return (
    <>
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
        onlineActionBarPadding('tall')
      )}
    >
      <PhaseHeader
        round={t('round', { n: view.round + 1, total: view.totalRounds })}
        phase={phaseLabel}
        endsAt={view.phaseEndsAt}
        total={totalPhaseMs}
        dangerMs={10_000}
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        status={
          judge ? (
            <span className="flex items-start gap-1.5">
              <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>{iAmJudge ? t('youAreJudge') : t('judgeIs', { name: judge.name })}</span>
            </span>
          ) : undefined
        }
      />

      {/* Monté toute la partie, masqué au reveal : TurnBanner sonne au PASSAGE
          à « à moi », jamais au montage — sinon aucun début de manche n'alerte. */}
      <TurnBanner
        mine={turn?.mine ?? false}
        name={turn?.name}
        avatar={turn?.avatar}
        hint={turn?.hint}
        alertOnMine
        className={turn ? undefined : 'hidden'}
      />


      {/* Bannière retour */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Carte noire : couleur de CONTENU du jeu, pas une surface. */}
      {view.black && (
        <div className="rounded-2xl border border-gold/40 bg-[#1d1a14] px-4 py-4 text-center shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">{t('blackLabel')}</p>
          <p className="mt-1.5 font-display text-xl font-bold leading-snug text-cream">{view.black}</p>
        </div>
      )}

      {/* Couronnement */}
      <AnimatePresence>
        {view.phase === 'reveal' && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-gold/40 bg-felt-deep/80 p-4"
          >
            {view.crowned ? (
              <div className="space-y-2 text-center">
                <p className="flex items-center justify-center gap-1.5 font-display text-lg font-bold text-gold">
                  <Crown className="h-5 w-5" aria-hidden /> {t('crowned.title')}
                </p>
                <div className={cn(CARD_BASE, 'mx-auto max-w-xs border-[#D8CCAE] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)]')}>
                  <CardCorner rank="J" suit="♣" className="text-[#24201A]" />
                  {view.crowned.text}
                </div>
                <p className="text-sm font-semibold text-amber-200">
                  {t('crowned.by', { name: view.crowned.playerName })}
                </p>
              </div>
            ) : (
              <p className="text-center text-sm font-semibold text-cream/80">{t('crowned.nobody')}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jugement : réponses anonymes */}
      {view.phase === 'judging' && view.submissions && (
        <section aria-labelledby="sf-answers-title" className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 id="sf-answers-title" className="text-center font-display text-base font-bold text-gold">
            {t('answersTitle', { count: view.submissions.length })}
          </h3>
          {iAmJudge ? (
            <div className="space-y-2">
              {view.submissions.map((s) => (
                <PickableCard
                  key={s.card}
                  text={s.text}
                  corner={<CardCorner rank="?" suit="♣" className="text-[#24201A]/70" />}
                  selected={pickedCard === s.card}
                  pending={sendingCard === s.card}
                  disabled={busy}
                  markIcon="crown"
                  sendingLabel={tCommon('sending')}
                  onToggle={() => togglePick(s.card)}
                />
              ))}
            </div>
          ) : (
            // Pour les autres, des cartes POSÉES (ni ombre ni survol) : elles
            // se lisent pendant que le juge les dit, sans passer pour des boutons.
            <ul className="space-y-2">
              {view.submissions.map((s) => (
                <li key={s.card} className={cn(CARD_BASE, 'border-[#D8CCAE] bg-cream/90')}>
                  <CardCorner rank="?" suit="♣" className="text-[#24201A]/70" />
                  {s.text}
                </li>
              ))}
            </ul>
          )}
          {iAmJudge && <p className="text-center text-sm text-cream/70">{t('judgeReadAloud')}</p>}
        </section>
      )}

      {/* Abattage : ma main */}
      {canPlay && (
        <section aria-labelledby="sf-hand-title" className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h3 id="sf-hand-title" className="text-center font-display text-base font-bold text-gold">
            {t('handTitle')}
          </h3>
          <div className="space-y-2">
            {view.myHand.map((c) => (
              <PickableCard
                key={c.card}
                text={c.text}
                corner={<CardCorner rank="J" suit="♥" className="text-suit-red" />}
                selected={pickedCard === c.card}
                pending={sendingCard === c.card}
                disabled={busy}
                markIcon="check"
                sendingLabel={tCommon('sending')}
                onToggle={() => togglePick(c.card)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Table : juge, « a joué », couronnes — chaque état a son signe. */}
      <ul aria-label={t('tableLabel')} className="flex flex-wrap justify-center gap-2">
        {view.players.map((p) => {
          const played = view.phase === 'submit' && !p.isJudge && p.hasPlayed
          const away = Boolean(p.leftAt)
          return (
            <li
              key={p.id}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold',
                p.isJudge
                  ? 'border-gold/60 bg-gold/[0.15] text-cream'
                  : played
                    ? 'border-emerald-400/50 bg-emerald-500/10 text-cream'
                    : 'border-gold/20 bg-felt-deep/70 text-cream/90',
                away && 'opacity-40'
              )}
            >
              <span aria-hidden className="shrink-0">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 truncate" />
              {p.isJudge && (
                <>
                  <Gavel className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span className="sr-only">{` (${t('judgeTag')})`}</span>
                </>
              )}
              {played && (
                <>
                  <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={3} aria-hidden />
                  <span className="sr-only">{` (${t('playedTag')})`}</span>
                </>
              )}
              {away && (
                <>
                  <WifiOff className="h-4 w-4 shrink-0 text-cream/80" aria-hidden />
                  <span className="sr-only">{` (${t('awayTag')})`}</span>
                </>
              )}
              {p.crowns > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 font-bold tabular-nums text-amber-300">
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  <span aria-hidden>{p.crowns}</span>
                  <span className="sr-only">{` (${t('crownsCount', { count: p.crowns })})`}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>

    {/* Montée toute la partie : sa région live annonce chaque changement
        d'état ; seuls les boutons du moment vont et viennent. */}
    {/* L'erreur prend la ligne d'état : un encadré en plus dépasserait la
        hauteur que le flux réserve sous la barre. */}
    <OnlineActionBar
      status={actionError ? <span className="font-semibold text-red-300">{actionError}</span> : barStatus}
      maxWidthClass="max-w-lg"
    >
      {(canPlay || canCrown) && (
        <div className="flex gap-2">
          <Button
            variant="quiet"
            size="gameLg"
            className="shrink-0"
            disabled={pickedCard === null || busy}
            onClick={() => setPick(null)}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            variant="primary"
            size="gameLg"
            className="min-w-0 flex-1 whitespace-normal text-center leading-tight"
            disabled={pickedCard === null || busy}
            onClick={() => void sendPick(canPlay ? 'play-card' : 'judge-pick')}
          >
            {sendingCard !== null ? (
              <Loader2 className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />
            ) : canCrown && pickedCard !== null ? (
              <Crown className="mr-2 h-5 w-5 shrink-0" aria-hidden />
            ) : null}
            {canPlay
              ? pickedCard !== null ? t('playCard') : t('pickCard')
              : pickedCard !== null ? t('crownCard') : t('pickAnswer')}
          </Button>
        </div>
      )}
      {view.phase === 'reveal' && (
        <Button
          variant="primary"
          size="gameLg"
          className="w-full"
          disabled={busy || continueLocked}
          onClick={() => void sendAction({ action: 'continue' })}
        >
          {busy && <Loader2 className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />}
          {continueLocked ? (
            <PhaseCountdown endsAt={view.continueAt}>
              {({ seconds }) =>
                isLastRound ? t('reveal.seeResultIn', { seconds }) : t('reveal.continueIn', { seconds })
              }
            </PhaseCountdown>
          ) : isLastRound ? (
            t('reveal.seeResult')
          ) : (
            t('reveal.continue')
          )}
        </Button>
      )}
    </OnlineActionBar>

    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="sans-filtre" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
