"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Beer, CupSoda, Dices, Eye, EyeOff, Loader2, Minus, Plus, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { TurnBanner } from '@/components/game/TurnBanner'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isLegalRaise, menteurHumanSeated, type MenteurBid, type MenteurClientView } from '@/lib/menteur/engine'
import { menteurBotTickDelayMs } from '@/lib/menteur/bot-tick'
import { CssDie } from '@/components/games/CssDie'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { genreOf, genreOfId, playerIcon } from './bot-speech/bot-speech-feed'
import { BID_LADDER_PHONE, BidLadder } from './menteur/BidLadder'
import { MenteurSpeechFeed } from './menteur/MenteurSpeechFeed'

/**
 * LE MENTEUR en ligne (serveur-autoritaire). La vue reçue est déjà filtrée :
 * seuls MES dés arrivent au client — ceux des autres sont réduits à un compte
 * (anti-triche), sauf pendant la révélation (gobelets levés, publics).
 * Mobile-first : mes dés et l'enchère sous le pouce, dans la barre fixe ;
 * « Menteur ! » et « Calza ! » demandent confirmation (gobelets levés = sans retour).
 */

// Le dé CSS vit dans components/games/CssDie (partagé avec l'écran TV).

function parseView(json: string | null | undefined): MenteurClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as MenteurClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Vivant côté vue client : les dés des autres sont masqués → compte seul. */
function aliveInView(p: { diceCount: number }): boolean {
  return p.diceCount > 0
}

/** Suggestion de relance minimale légale (préremplit les steppers). */
function minimalLegalBid(
  prev: MenteurBid | null,
  totalDice: number
): { qty: number; face: number } {
  for (let qty = 1; qty <= totalDice; qty += 1) {
    for (const face of [2, 3, 4, 5, 6, 1]) {
      if (isLegalRaise(prev, qty, face, totalDice)) return { qty, face }
    }
  }
  return { qty: 1, face: 2 }
}

const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

const Die = CssDie

type MenteurMove = 'bid' | 'dudo' | 'calza' | 'continue'

const FACES = [1, 2, 3, 4, 5, 6] as const

// Réserve basse du flux À MON TOUR, mesurée sur la barre la plus haute :
// ligne d'état sur deux lignes (« Enchère trop basse… » à 375 px, 48),
// mes dés (44), Menteur/Calza (56), faces (48), quantité + Enchérir (56),
// écarts et marges : ≈ 301 px. Les tailles d'OnlineActionBar s'arrêtent à
// deux rangées : la révélation et l'enchère en cours passaient dessous.
const MY_TURN_PADDING = 'pb-[calc(19.5rem+env(safe-area-inset-bottom,0px))]'
const MY_TURN_OPENING_PADDING = 'pb-[calc(16rem+env(safe-area-inset-bottom,0px))]'

// Le bouton touché garde sa pleine lumière (et sa roue) pendant l'envoi ;
// les autres s'estompent.
const SENDING = 'disabled:opacity-100'

const STEP_BUTTON =
  'flex h-12 w-11 items-center justify-center rounded-xl border border-gold/30 bg-felt-deep/70 text-gold transition-colors hover:bg-gold/10 active:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream disabled:pointer-events-none disabled:opacity-40'

// Calza : variante `danger` (crème, anneau de focus, ombre) teinte jeton bleu —
// crème sur chip-blue 7:1 ; l'encre par défaut y tombait à 2:1.
const CALZA_BUTTON =
  'flex-1 bg-chip-blue tracking-wide shadow-[0_10px_22px_-12px_rgba(39,75,143,0.8)] hover:bg-[#1F3C73]'

export function MenteurOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.menteur.game')
  const tc = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [hideDice, setHideDice] = useState(false)
  const [pending, setPending] = useState<MenteurMove | null>(null)
  const [confirmDialog, confirm] = useConfirmAction()
  const reduceMotion = useReducedMotion()

  const inGame = room?.gameId === 'menteur' && room.status === 'playing'
  const tutorial = useGameTutorial('menteur', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  const totalDice = useMemo(
    () => (view ? view.players.reduce((s, p) => s + p.diceCount, 0) : 0),
    [view]
  )

  // Steppers d'enchère, resynchronisés à chaque nouvel état serveur.
  const stateVersion = room?.stateVersion ?? -1
  const [bidQty, setBidQty] = useState(1)
  const [bidFace, setBidFace] = useState(2)
  // En état et non en ref : tant que les steppers n'ont pas reçu la
  // suggestion de cet état, « Enchère trop basse » ne s'affiche pas (il
  // clignotait au premier rendu de chaque tour, région live comprise).
  const [syncedVersion, setSyncedVersion] = useState(-1)
  useEffect(() => {
    if (!view || syncedVersion === stateVersion) return
    setSyncedVersion(stateVersion)
    // En manche Palifico avec enchère en cours, la face est verrouillée.
    if (view.palifico && view.currentBid) {
      setBidQty(view.currentBid.qty + 1)
      setBidFace(view.currentBid.face)
      return
    }
    const suggestion = minimalLegalBid(view.currentBid, totalDice)
    setBidQty(suggestion.qty)
    setBidFace(suggestion.face)
  }, [view, stateVersion, syncedVersion, totalDice])

  // Version lue AU MOMENT de l'envoi : « Menteur ! » part après la
  // confirmation, et la salle a pu bouger entre-temps (départ d'un joueur).
  const versionRef = useRef(stateVersion)
  useEffect(() => {
    versionRef.current = stateVersion
  }, [stateVersion])

  // Ticks « arbitre » (avec secours par rang, cf. useBotReferee) : tour d'un
  // bot → un coup ; joueur parti depuis 3 min → remplacement. expectedVersion
  // rend les ticks concurrents inoffensifs (le serveur revalide tout). Délai
  // calculé comme le filet serveur (bot-tick.ts) : la révélation que mène un
  // bot reste 5 s à l'écran dès qu'un humain est assis.
  const activeActor = view?.players.find((p) => p.id === room?.currentTurnUserId)
  const botDelayMs = view
    ? menteurBotTickDelayMs(
        {
          phase: view.phase,
          actorIsBot: Boolean(activeActor?.isBot),
          actorName: activeActor?.name,
          humanSeated: menteurHumanSeated(view.players),
        },
        Math.random
      )
    : null
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: botDelayMs === null ? null : { body: { action: 'bot' }, delayMs: botDelayMs },
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  const afkTarget = activeActor
  const afkWatchable = Boolean(
    view &&
      view.phase !== 'finished' &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  // Base locale des comptes à rebours AFK (l'autorité reste l'horloge serveur).
  const turnStartedAt = useAfkTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    targetId: afkTarget?.id,
    enabled: afkWatchable,
  })

  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  if (!inGame) {
    return <GameOnlineLobby gameId="menteur" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div
          role="status"
          aria-label={tc('loading')}
          className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin"
        />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const meAlive = Boolean(me && aliveInView(me))
  const activeId = room.currentTurnUserId
  const activePlayer = view.players.find((p) => p.id === activeId)
  const bidding = view.phase === 'bidding'
  const isMyTurn = bidding && activeId === user.id
  const myControls = isMyTurn && meAlive
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const winner = view.players.find((p) => p.id === view.winnerId)
  // Champs optionnels : une vue d'avant leur arrivée n'en a pas.
  const bids = view.bids ?? []
  const duels = view.duels ?? []
  const lastDuel = view.phase === 'reveal' ? duels[duels.length - 1] : undefined

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  // Portrait du persona, ou l'icône du compte (un déserteur converti la garde).
  const iconOf = (p: { id: string; name: string; isBot: boolean }) => playerIcon(p, room.members)
  const revealing = view.phase === 'reveal' && Boolean(reveal)
  // Le fil se lit sous l'enchère pendant les enchères, puis dans le panneau
  // de révélation, où la réaction du bot se lit avec le résultat, pendant le
  // plancher de lecture. Le fil sous l'enchère reste monté à la révélation,
  // masqué à l'œil : déplacé, sa région aria-live renaîtrait déjà remplie, et
  // le lecteur d'écran tairait le « Menteur ! » né avec la révélation et la
  // réaction ; la copie du panneau est muette (aria-hidden).
  const speechFeed = <MenteurSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" />

  // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit ; le
  // hook, lui, annonce les refus (enchère illégale, tour perdu…).
  const play = async (move: MenteurMove, body: Record<string, unknown>) => {
    setPending(move)
    try {
      await postAction({ ...body, expectedVersion: versionRef.current })
    } finally {
      setPending(null)
    }
  }

  // Lever les gobelets ne se rattrape pas : un « Menteur ! » touché à la
  // place d'« Enchérir » coûtait un dé. Confirmation, avec l'enchère visée.
  const challenge = async (move: 'dudo' | 'calza') => {
    const target = view.currentBid
    if (!target) return
    const values = { name: nameOf(target.by), qty: target.qty, face: target.face }
    const ok = await confirm(
      move === 'dudo'
        ? {
            title: t('confirmDudo.title'),
            description: t('confirmDudo.description', values),
            confirmLabel: t('dudo'),
            tone: 'danger',
          }
        : {
            title: t('confirmCalza.title'),
            description: t('confirmCalza.description', values),
            confirmLabel: t('calza'),
            tone: 'primary',
          }
    )
    if (ok) await play(move, { action: move })
  }

  const stepsReady = syncedVersion === stateVersion
  const bidLegal = isLegalRaise(view.currentBid, bidQty, bidFace, totalDice, view.palifico)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const spinner = <Loader2 aria-hidden className="h-5 w-5 shrink-0 motion-safe:animate-spin" />

  // ── Écran de victoire ────────────────────────────────────────────────────
  if (finished) {
    const ranking = [...view.players].sort((a, b) => {
      if (a.id === view.winnerId) return -1
      if (b.id === view.winnerId) return 1
      return a.lostCount - b.lostCount
    })
    return (
      <OnlineEndScreen
        confetti
        won={view.winnerId === user.id}
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
            <Trophy aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('victoryTitle', { name: winner?.name ?? '—' })}</h2>
            {!isSoft && <p className="text-sm text-cream/80">{t('victoryDrinks')}</p>}
          </motion.div>
        }
        ranking={
          <ol className="w-full max-w-sm space-y-2">
            {ranking.map((p, idx) => (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.id === view.winnerId ? 'border-gold/50 bg-gold/10' : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <span className="w-6 text-center text-lg font-black tabular-nums text-cream/80">{idx + 1}</span>
                <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-bold" />
                <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-cream/80">
                  {/* Derrière la chope : les GORGÉES bues (1+2+3…), pas le nombre de dés
                      perdus — à 3 dés perdus on a bu 6 gorgées, pas 3 (F35). */}
                  <Beer aria-hidden className="h-4 w-4 text-gold" /> {p.sipsTotal}
                </span>
              </li>
            ))}
          </ol>
        }
        xp={
          <XpGainBanner
            won={view.winnerId === user.id}
            playerIds={view.players.map((p) => p.id)}
            className="w-full max-w-sm"
          />
        }
      />
    )
  }

  const matches = (d: number) =>
    reveal ? d === reveal.bid.face || (!view.palifico && reveal.bid.face !== 1 && d === 1) : false
  const faceLocked = view.palifico && Boolean(view.currentBid)

  // Ligne d'état de la barre : le refus du serveur d'abord (il répond au geste
  // fait DANS la barre), puis l'enchère trop basse, puis le spectateur.
  const barStatus = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : myControls && stepsReady && !bidLegal ? (
    <span className="font-semibold text-red-300">{t('illegalBid')}</span>
  ) : me && !meAlive && bidding ? (
    t('spectator')
  ) : undefined

  const flowPadding = !me
    ? undefined
    : myControls
      ? view.currentBid
        ? MY_TURN_PADDING
        : MY_TURN_OPENING_PADDING
      : onlineActionBarPadding(meAlive || revealing ? 'tall' : 'default')

  // ── Partie en cours ──────────────────────────────────────────────────────
  return (
    <>
    {confirmDialog}
    <div className={cn('flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg', flowPadding)}>
      <PhaseHeader
        round={
          <span className="flex flex-wrap items-center gap-x-3">
            <span>{t('round', { n: view.round })}</span>
            <span className="inline-flex items-center gap-1">
              <Dices aria-hidden className="h-4 w-4 text-gold" />
              {t('diceOnTable', { n: totalDice })}
            </span>
          </span>
        }
        phase={revealing ? t('reveal.title') : t('phaseBidding')}
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
      />

      {/* Bannières retour / AFK */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}
      {afkWatch && afkTarget && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
          <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) =>
              afkTarget.id === user.id
                ? t('afkWarningSelf', { seconds })
                : t('afkWarning', { name: afkTarget.name, seconds })
            }
          </PhaseCountdown>
        </div>
      )}

      {view.palifico && (
        <div className="rounded-2xl border border-chip-blue/50 bg-chip-blue/20 px-4 py-2 text-center text-sm font-semibold text-sky-100">
          {view.currentBid ? t('palificoBadge', { face: view.currentBid.face }) : t('palificoBadgeOpen')}
        </div>
      )}

      {/* Masqué, pas démonté, à la révélation : le son « à toi » part au
          PASSAGE à mon tour, et un bandeau remonté à chaque manche tairait
          celui du joueur qui rouvre les enchères. */}
      <TurnBanner
        mine={isMyTurn}
        name={activePlayer?.name}
        avatar={activePlayer ? <PlayerAvatarGlyph value={iconOf(activePlayer)} /> : undefined}
        // L'enchère à battre dans la consigne : sur un petit écran, la barre
        // de mon tour (≈ 300 px) repousse la carte de l'enchère sous le pli.
        hint={
          isMyTurn
            ? view.currentBid
              ? t('turnHint', { qty: view.currentBid.qty, face: view.currentBid.face })
              : t('turnHintOpen')
            : undefined
        }
        alertOnMine
        className={bidding ? undefined : 'hidden'}
      />

      {/* Révélation : en tête du flux, c'est le moment où la table se penche
          sur le téléphone. Les dés qui comptent sont cerclés d'or, les autres
          s'effacent : on compte d'un coup d'œil. */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-gold/30 bg-felt-deep/80 p-4"
          >
            <div className="text-center">
              <p className="text-base font-bold text-cream">
                {reveal.bidHeld
                  ? t('reveal.bidHeld', { count: reveal.matchCount, qty: reveal.bid.qty })
                  : t('reveal.bidFailed', { count: reveal.matchCount, qty: reveal.bid.qty })}{' '}
                <span className="inline-block align-middle">
                  <Die face={reveal.bid.face} size="sm" />
                </span>
              </p>
              <p className="mt-1 text-sm text-cream/80">{t('bidBy', { name: nameOf(reveal.bid.by) })}</p>
            </div>
            <ul className="space-y-2">
              {reveal.allDice.map(({ playerId, dice }) => (
                <li key={playerId} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-24 shrink-0 truncate text-sm font-semibold',
                      playerId === reveal.loserId ? 'text-red-300' : 'text-cream'
                    )}
                  >
                    {nameOf(playerId)}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {dice.map((d, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex rounded-lg',
                          matches(d)
                            ? 'ring-2 ring-gold ring-offset-1 ring-offset-felt-deep'
                            : 'opacity-30 grayscale'
                        )}
                      >
                        <Die face={d} size="sm" />
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {lastDuel && lastDuel.round === view.round && (
              <BidLadder bids={lastDuel.bids} players={view.players} iconOf={iconOf} variant="phone" titled />
            )}
            {reveal.mode === 'calza' && reveal.loserId ? (
              <p className="text-center text-sm font-bold text-red-300">
                {t(isSoft ? 'reveal.calzaLostSoft' : 'reveal.calzaLost', { name: nameOf(reveal.loserId), sips: reveal.sips })}
              </p>
            ) : reveal.mode === 'calza' && reveal.gainedId ? (
              <p className="text-center text-sm font-bold text-emerald-300">
                {t('reveal.calzaWon', { name: nameOf(reveal.gainedId) })}
              </p>
            ) : reveal.mode === 'calza' ? (
              <p className="text-center text-sm font-bold text-emerald-300">
                {t('reveal.calzaWonCapped', { name: nameOf(reveal.challengerId) })}
              </p>
            ) : (
              <p className="text-center text-sm font-bold text-red-300">
                {t(isSoft ? 'reveal.loserSoft' : 'reveal.loser', { name: nameOf(reveal.loserId), sips: reveal.sips })}
              </p>
            )}
            {reveal.eliminatedId && (
              <p className="text-center text-sm font-bold text-gold">
                {t('reveal.eliminatedMsg', {
                  name: nameOf(reveal.eliminatedId),
                  genre: genreOfId(view.players, reveal.eliminatedId),
                })}
              </p>
            )}
            <div aria-hidden>{speechFeed}</div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Enchère en cours */}
      {bidding && (
        <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-3 text-center">
          {view.currentBid ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">{t('currentBid')}</p>
              {/* Le « 4 × ⚄ » se lit mal au lecteur d'écran : une phrase à sa place. */}
              <p className="sr-only">
                {t('bidChipAria', {
                  name: nameOf(view.currentBid.by),
                  qty: view.currentBid.qty,
                  face: view.currentBid.face,
                })}
              </p>
              <div aria-hidden>
                <p className="mt-1 flex items-center justify-center gap-2 font-display text-4xl font-bold tabular-nums text-cream">
                  {view.currentBid.qty} <span className="text-2xl text-cream/70">×</span>
                  <Die face={view.currentBid.face} size="lg" />
                </p>
                <p className="mt-1 text-sm text-cream/80">{t('bidBy', { name: nameOf(view.currentBid.by) })}</p>
              </div>
              {/* L'échelle ne montre rien de plus que la grosse enchère tant
                  qu'elle n'a qu'un échelon ; à la révélation, le panneau la
                  reprend en entier avec ses bluffs. */}
              {bids.length > 1 && (
                <div className="mt-2">
                  <BidLadder
                    bids={bids}
                    players={view.players}
                    iconOf={iconOf}
                    variant="phone"
                    limit={BID_LADDER_PHONE}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-base font-semibold text-cream">{t('noBid')}</p>
          )}
          {/* En manche Palifico, les 1 ne sont plus jokers : le rappel mentirait. */}
          {!view.palifico && <p className="mt-2 text-xs text-cream/70">{t('pillaveurHint')}</p>}
        </div>
      )}

      {/* Paroles des bots, portées par leurs coups : monté dès les enchères,
          même vide, pour que la région aria-live existe avant la 1re bulle. */}
      <div className={revealing ? 'sr-only' : undefined}>{speechFeed}</div>

      {/* Joueurs */}
      <ul className="grid grid-cols-2 gap-2">
        {view.players.map((p) => {
          const isActive = p.id === activeId && bidding
          const dead = !aliveInView(p)
          return (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors',
                isActive ? 'border-gold bg-gold/[0.15] ring-1 ring-gold/50' : 'border-gold/20 bg-felt-deep/70',
                dead && 'opacity-40'
              )}
            >
              <RankCrest role={cosmetics.get(p.id)?.role} />
              <span className={cn('text-lg', dead && 'grayscale')} aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-bold', dead && 'line-through')}>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                  {p.id === user.id && <span className="font-semibold text-cream/70"> {t('you')}</span>}
                </p>
                <p className="text-xs text-cream/80">
                  {dead ? (
                    t('eliminated', { genre: genreOf(p) })
                  ) : (
                    <>
                      <Dices aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-gold" />
                      <span aria-hidden>{p.diceCount}</span>
                      <span className="sr-only">{t('diceLeft', { count: p.diceCount })}</span>
                    </>
                  )}
                  {/* Même échelle que le classement : gorgées bues, pas dés perdus (F35). */}
                  {p.sipsTotal > 0 && !dead && ` · 🍺 ${p.sipsTotal}`}
                </p>
              </div>
              {isActive && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-gold motion-safe:animate-pulse" />}
            </li>
          )
        })}
      </ul>
    </div>

    {/* Mes dés et l'action du moment, sous le pouce. Montée toute la partie
        (sa région live annonce refus et enchère trop basse) ; seul son contenu
        suit la phase. Un visiteur sans siège n'a rien à y faire. */}
    {me && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        <div className="space-y-2">
          {meAlive && bidding && (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold leading-tight text-cream/80">{t('yourDice')}</span>
              <div className="flex min-w-0 flex-1 justify-center gap-1">
                {hideDice
                  ? me.dice.map((_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-black/30 text-gold/80"
                      >
                        <CupSoda className="h-5 w-5" />
                      </span>
                    ))
                  : me.dice.map((d, i) => <Die key={i} face={d} size="md" />)}
              </div>
              <Button
                type="button"
                variant="quiet"
                size="gameIcon"
                className="shrink-0"
                onClick={() => setHideDice((v) => !v)}
                aria-label={hideDice ? t('showDice') : t('hideDice')}
              >
                {hideDice ? <Eye aria-hidden className="h-5 w-5" /> : <EyeOff aria-hidden className="h-5 w-5" />}
              </Button>
            </div>
          )}

          {myControls && (
            <>
              {/* Défier l'enchère : au-dessus de la composition, à part. */}
              {view.currentBid && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="gameLg"
                    className={cn('flex-1 gap-2 tracking-wide', pending === 'dudo' && SENDING)}
                    disabled={busy}
                    onClick={() => void challenge('dudo')}
                  >
                    {pending === 'dudo' && spinner}
                    {t('dudo')}
                  </Button>
                  {view.ruleCalza && (
                    <Button
                      type="button"
                      variant="danger"
                      size="gameLg"
                      className={cn(CALZA_BUTTON, 'gap-2', pending === 'calza' && SENDING)}
                      disabled={busy}
                      onClick={() => void challenge('calza')}
                    >
                      {pending === 'calza' && spinner}
                      {t('calza')}
                    </Button>
                  )}
                </div>
              )}

              {/* Face annoncée : six cases pleine largeur, 48 px de haut. */}
              <div role="group" aria-label={t('facesLabel')} className="grid grid-cols-6 gap-1.5">
                {FACES.map((face) => {
                  const selected = bidFace === face
                  const locked = faceLocked && !selected
                  return (
                    <button
                      key={face}
                      type="button"
                      onClick={() => setBidFace(face)}
                      disabled={locked}
                      aria-pressed={selected}
                      aria-label={t('faceAria', { face })}
                      className={cn(
                        'flex h-12 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream disabled:cursor-not-allowed',
                        selected
                          ? 'border-gold bg-gold/20 ring-2 ring-gold'
                          : 'border-cream/20 bg-black/25 hover:bg-gold/10',
                        locked && 'opacity-40'
                      )}
                    >
                      <Die face={face} size="md" />
                    </button>
                  )
                })}
              </div>

              {/* Quantité, puis Enchérir avec l'enchère écrite dedans. */}
              <div className="flex gap-2">
                <div
                  role="group"
                  aria-label={t('qtyLabel')}
                  className="flex h-14 shrink-0 items-center gap-1 rounded-2xl border border-gold/20 bg-black/20 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setBidQty((q) => Math.max(1, q - 1))}
                    disabled={bidQty <= 1}
                    className={STEP_BUTTON}
                    aria-label={t('qtyLess')}
                  >
                    <Minus aria-hidden className="h-5 w-5" />
                  </button>
                  <span
                    aria-live="polite"
                    className="w-9 text-center font-display text-2xl font-bold tabular-nums text-cream"
                  >
                    {bidQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBidQty((q) => Math.min(totalDice, q + 1))}
                    disabled={bidQty >= totalDice}
                    className={STEP_BUTTON}
                    aria-label={t('qtyMore')}
                  >
                    <Plus aria-hidden className="h-5 w-5" />
                  </button>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="gameLg"
                  className={cn('min-w-0 flex-1 gap-1.5', pending === 'bid' && SENDING)}
                  disabled={busy || !stepsReady || !bidLegal}
                  aria-label={t('bidAria', { qty: bidQty, face: bidFace })}
                  onClick={() => void play('bid', { action: 'bid', qty: bidQty, face: bidFace })}
                >
                  {pending === 'bid' && spinner}
                  <span>{t('bid')}</span>
                  <span className="tabular-nums">{bidQty} ×</span>
                  {/* Pastille feutre : le dé du 1, or sur or, disparaissait sur le bouton. */}
                  <span className="inline-flex rounded-md bg-felt-deep p-0.5">
                    <Die face={bidFace} size="xs" />
                  </span>
                </Button>
              </div>
            </>
          )}

          {revealing && (
            <Button
              type="button"
              variant="primary"
              size="gameLg"
              className={cn('w-full gap-2', pending === 'continue' && SENDING)}
              disabled={busy}
              onClick={() => void play('continue', { action: 'continue' })}
            >
              {pending === 'continue' && spinner}
              {t('reveal.continue')}
            </Button>
          )}
        </div>
      </OnlineActionBar>
    )}
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="menteur" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
