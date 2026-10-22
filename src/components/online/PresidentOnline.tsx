"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ChevronDown,
  ChevronsDown,
  Crown,
  Flag,
  Layers,
  Loader2,
  Medal,
  SkipForward,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { TurnBanner } from '@/components/game/TurnBanner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  preCloseNeeded,
  preComboIssue,
  preIsJoker,
  preLastPlayRank,
  preOuRien,
  preRankOf,
  preSuitOf,
  PRE_INTERLUDE_MS,
  PRE_RANKS,
  PRE_SUITS,
  PRE_TURN_MS,
  type PreClientView,
  type PrePlayerView,
} from '@/lib/president/engine'
import { botAvatarFromName, botTickDelayMs, type SpeechGenre } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { genreOf, genreOfId } from './bot-speech/bot-speech-feed'
import { PresidentSpeechFeed } from './president/PresidentSpeechFeed'

/**
 * PRÉSIDENT en ligne (serveur-autoritaire). Le tapis et la table en haut, la
 * main en bas, dans la barre fixe avec Poser/Passer : sur deux rangées qui
 * tiennent à 375 px (14 cartes au plus à 4 joueurs), plus de bande qui
 * défile et cache la paire de 9 hors écran. Tap = lever la carte. Les mains
 * adverses ne circulent jamais — seulement les comptes.
 */

function parseView(json: string | null | undefined): PreClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PreClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Libellé court d'une carte (échange, bouton fermer, historique) — joker inclus. */
function cardLabel(card: number): string {
  return preIsJoker(card) ? '🃏' : `${PRE_RANKS[preRankOf(card)]}${PRE_SUITS[preSuitOf(card)]}`
}

type PreRole = NonNullable<PrePlayerView['role']>

/** Insignes des rôles : couronne et médaille en or, le Trou et son vice en rouge. */
const ROLE_ICONS: Record<PreRole, { Icon: LucideIcon; tone: string }> = {
  president: { Icon: Crown, tone: 'text-gold' },
  vicePresident: { Icon: Medal, tone: 'text-gold' },
  viceTrou: { Icon: ChevronDown, tone: 'text-red-300' },
  trou: { Icon: ChevronsDown, tone: 'text-red-300' },
}

function RoleIcon({ role, className }: { role: PreRole; className?: string }) {
  const { Icon, tone } = ROLE_ICONS[role]
  return <Icon aria-hidden className={cn('h-4 w-4 shrink-0', tone, className)} />
}

/** Rôle attaché à une place du classement d'une manche close. */
function rankRole(i: number, len: number): PreRole | null {
  if (i === 0) return 'president'
  if (i === len - 1) return 'trou'
  if (len >= 4 && i === 1) return 'vicePresident'
  if (len >= 4 && i === len - 2) return 'viceTrou'
  return null
}

const CARD_SIZES = {
  md: { box: 'h-16 w-11 rounded-lg', rank: 'text-base', suit: 'text-lg', joker: 'text-2xl' },
  lg: { box: 'h-20 w-14 rounded-xl', rank: 'text-xl', suit: 'text-2xl', joker: 'text-3xl' },
} as const

function CardFace({
  card,
  label,
  size = 'md',
  selected = false,
  onToggle,
}: {
  card: number
  /** Nom lu par le lecteur d'écran (« 9♥ », « Joker »). */
  label: string
  size?: keyof typeof CARD_SIZES
  selected?: boolean
  /** Absent : carte à regarder, pas à toucher. */
  onToggle?: () => void
}) {
  const joker = preIsJoker(card)
  const suit = PRE_SUITS[preSuitOf(card)]
  const ink = !joker && (suit === '♥' || suit === '♦') ? 'text-suit-red' : 'text-[#24201A]'
  const s = CARD_SIZES[size]
  const face = joker ? (
    // Joker caméléon : il remplace n'importe quelle carte.
    <span aria-hidden className={cn('leading-none', s.joker)}>🃏</span>
  ) : (
    <>
      <span aria-hidden className={cn('font-display font-black leading-none', s.rank, ink)}>
        {PRE_RANKS[preRankOf(card)]}
      </span>
      <span aria-hidden className={cn('leading-none', s.suit, ink)}>{suit}</span>
    </>
  )
  const base = cn(
    'flex shrink-0 flex-col items-center justify-center border border-[#D8CCAE] bg-cream shadow-[0_6px_12px_-6px_rgba(0,0,0,0.7)]',
    s.box,
    joker && 'border-violet-400/70 bg-gradient-to-b from-cream to-violet-100'
  )
  if (!onToggle) {
    return (
      <span role="img" aria-label={label} className={base}>
        {face}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        base,
        'motion-safe:transition-transform motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
        // Carte levée : décalée vers le haut (signe lisible sans la couleur) et cerclée d'or.
        selected && '-translate-y-2 shadow-[0_0_0_4px_rgba(217,164,65,0.35)] ring-2 ring-gold'
      )}
    >
      {face}
    </button>
  )
}

/** Classement d'une manche close (interlude et fin de partie). */
function RankingRows({
  ranking,
  players,
  selfId,
  iconOf,
  labelOf,
}: {
  ranking: readonly string[]
  players: readonly PrePlayerView[]
  selfId: string
  iconOf: (p: PrePlayerView) => string
  labelOf: (role: PreRole, p: PrePlayerView) => string
}) {
  return (
    <ol className="w-full max-w-sm space-y-1.5">
      {ranking.map((id, i) => {
        const p = players.find((x) => x.id === id)
        if (!p) return null
        const role = rankRole(i, ranking.length)
        return (
          <li
            key={id}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
              role === 'president'
                ? 'border-gold/50 bg-gold/10'
                : role === 'trou'
                  ? 'border-suit-red/50 bg-suit-red/20'
                  : 'border-gold/20 bg-felt-deep/70'
            )}
          >
            <span className="w-5 shrink-0 text-center font-display text-sm font-black tabular-nums text-cream/80">
              {i + 1}
            </span>
            <span aria-hidden className="shrink-0 text-lg leading-none">
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className={cn('min-w-0 flex-1 truncate text-sm font-bold', p.id === selfId ? 'text-gold' : 'text-cream')}>
              {p.name}
            </span>
            {role && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wide text-cream/80">
                <RoleIcon role={role} />
                {labelOf(role, p)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Hauteur de la barre fixe du bas, à réserver sous le flux. Main sur une ou
 * deux rangées, fermeture de carré, Poser/Passer : la barre change de taille
 * d'un tour à l'autre, une réserve fixe laissait soit un trou, soit le tapis
 * sous les cartes.
 */
function useBarReserve(mode: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    // Le conteneur intérieur de la barre : ligne d'état, contenu, marges et zone sûre.
    const host = ref.current?.parentElement
    if (!mode || !host || typeof ResizeObserver === 'undefined') {
      setHeight(null)
      return
    }
    const measure = () => setHeight(host.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [mode])
  return [ref, height] as const
}

type PendingAction = 'play' | 'pass' | 'close' | 'continue'

export function PresidentOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.president.game')
  // Intention joueur : pas de verrou de version (le moteur valide le tour et la
  // légalité du combo) — le hook lit la réponse et annonce les refus.
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const [selected, setSelected] = useState<number[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const reduceMotion = useReducedMotion()

  const inGame = room?.gameId === 'president' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('president', inGame)
  const cosmetics = useMemberCosmetics(room)
  const isSoft = user?.ambianceMode === 'soft'

  // La sélection se vide à chaque changement de pli/tour.
  const turnKey = view ? `${view.phaseSeq}` : ''
  useEffect(() => {
    setSelected([])
  }, [turnKey])

  // Barre du bas : la main (en course) ou « Manche suivante » (interlude),
  // pour un joueur assis seulement — le spectateur n'a rien à y faire.
  const seated = Boolean(view && user && view.players.some((p) => p.id === user.id))
  const barMode =
    !view || !user || !seated
      ? null
      : view.phase === 'playing' && !view.outOrder.includes(user.id) && view.myHand.length > 0
        ? 'hand'
        : view.phase === 'interlude'
          ? 'interlude'
          : null
  const [barRef, barHeight] = useBarReserve(barMode)

  // Tick « advance » à l'échéance, arbitré par rang (cf. useAdvanceTick).
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Arbitre (avec secours par rang, cf. useBotReferee) : tours des bots +
  // remplacement des partis.
  const botActor = view?.players.find((p) => p.id === room?.currentTurnUserId)
  // Tick spéculatif « fermeture de carré » : quand un run ≥ 2 traîne au
  // sommet du pli, un bot détenant le complément peut fermer HORS TOUR — le
  // serveur tranche (NOT_BOT_TURN sinon, inoffensif). La fermeture complète
  // le carré d'une pose de même taille (un brelan posé d'un coup ne se ferme
  // pas d'une carte seule) : c'est preCloseNeeded.
  const closeChance = Boolean(
    view && preCloseNeeded(view) !== null && view.players.some((p) => p.isBot && !p.leftAt)
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      botActor?.isBot && (view?.phase === 'playing' || view?.phase === 'interlude')
        ? {
            body: { action: 'bot' },
            delayMs: view?.phase === 'interlude' ? 5000 : botTickDelayMs(botActor.name),
          }
        : closeChance
          ? { body: { action: 'bot' }, delayMs: 900 + Math.random() * 1200 }
          : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="president" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const roleLabel = (role: PreRole, genre: SpeechGenre) =>
    role === 'president'
      ? t('roles.president', { genre })
      : role === 'trou'
        ? t('roles.trou')
        : role === 'vicePresident'
          ? t('roles.vicePresident', { genre })
          : t('roles.viceTrou')
  const rankingLabel = (role: PreRole, p: PrePlayerView) => roleLabel(role, genreOf(p))
  // Paroles des bots de la manche : sous la table en jeu, sous le classement
  // à l'interlude et en fin de partie — jamais dans la barre de la main.
  const speechFeed = <PresidentSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" />
  const cardName = (card: number) => (preIsJoker(card) ? t('joker') : cardLabel(card))
  const tutorialButton = <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
  const tutorialModal = (
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="president" onClose={tutorial.close} />}
    </AnimatePresence>
  )
  // Réserve sous le flux : la hauteur MESURÉE de la barre ; avant la mesure,
  // la réserve haute par défaut.
  const flowReserve = barMode && barHeight === null ? onlineActionBarPadding('tall') : barMode ? undefined : 'pb-6'
  const flowStyle = barMode && barHeight !== null ? { paddingBottom: `${Math.ceil(barHeight) + 16}px` } : undefined

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    const ranking = view.lastRanking ?? []
    return (
      <OnlineEndScreen
        won={ranking[0] === user.id}
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
            <Crown aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
            <p className="max-w-xs text-sm text-cream/80">
              {t('finished.subtitle', { name: nameOf(ranking[0] ?? null), genre: genreOfId(view.players, ranking[0]) })}
            </p>
          </motion.div>
        }
        ranking={
          <>
            <RankingRows
              ranking={ranking}
              players={view.players}
              selfId={user.id}
              iconOf={iconOf}
              labelOf={rankingLabel}
            />
            <div className="w-full max-w-sm">{speechFeed}</div>
            {!isSoft && <p className="font-display text-lg font-bold text-gold">{t('trouDrinks')}</p>}
          </>
        }
        // La progression était bien créditée au Président, mais aucun écran
        // ne la montrait — le joueur gagnait de l'XP en aveugle.
        xp={<XpGainBanner won={ranking[0] === user.id} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream">
        <p className="font-display text-2xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch
          endsAt={view.phaseEndsAt}
          className="font-display text-8xl font-black tabular-nums text-cream"
        />
        <p className="max-w-xs text-sm font-semibold text-cream/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Interlude (fin de manche) ────────────────────────────────────────────
  if (view.phase === 'interlude') {
    const ranking = view.lastRanking ?? []
    return (
      <>
        <div
          className={cn('flex flex-1 flex-col items-center gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg', flowReserve)}
          style={flowStyle}
        >
          <PhaseHeader
            className="w-full"
            phase={t('mancheEnd', { n: view.manche + 1 })}
            endsAt={view.phaseEndsAt}
            total={PRE_INTERLUDE_MS}
            right={tutorialButton}
          />
          <RankingRows
            ranking={ranking}
            players={view.players}
            selfId={user.id}
            iconOf={iconOf}
            labelOf={rankingLabel}
          />
          <div className="w-full max-w-sm">{speechFeed}</div>
          <p className="max-w-sm text-center text-sm text-cream/80">{t('exchangeInfo')}</p>
          {!isSoft && <p className="font-display text-lg font-bold text-gold">{t('trouDrinks')}</p>}
        </div>
        {barMode === 'interlude' && (
          <OnlineActionBar status={actionError ?? t('interludeHint')} maxWidthClass="max-w-lg">
            <div ref={barRef}>
              {/* Le serveur refuse la relance avant le temps de lecture du
                  classement : le bouton attend `continueAt` au lieu d'essuyer
                  un refus. */}
              <PhaseCountdown endsAt={view.continueAt}>
                {({ expired }) => (
                  <Button
                    variant="primary"
                    size="gameLg"
                    className="w-full gap-2"
                    disabled={busy || !expired}
                    onClick={async () => {
                      setPending('continue')
                      await sendAction({ action: 'continue' })
                      setPending(null)
                    }}
                  >
                    {pending === 'continue' && <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />}
                    {t('nextManche')}
                  </Button>
                )}
              </PhaseCountdown>
            </div>
          </OnlineActionBar>
        )}
        {tutorialModal}
      </>
    )
  }

  // ── Manche en cours ──────────────────────────────────────────────────────
  // Bannière d'échange : chaque paire (Président/Trou, vices) ne voit que le
  // sien — le serveur masque déjà les cartes des autres.
  const exchange = view.lastExchange
  const myExchangeMsg = exchange
    ? user.id === exchange.trouId && exchange.fromPresident.length > 0
      ? t('exchangeAsTrou', { cards: exchange.fromPresident.map(cardLabel).join(' ') })
      : user.id === exchange.presidentId && exchange.fromTrou.length > 0
        ? t('exchangeAsPresident', { cards: exchange.fromTrou.map(cardLabel).join(' ') })
        : user.id === exchange.viceTrouId && (exchange.fromVicePresident?.length ?? 0) > 0
          ? t('exchangeAsViceTrou', { cards: (exchange.fromVicePresident ?? []).map(cardLabel).join(' ') })
          : user.id === exchange.vicePresidentId && (exchange.fromViceTrou?.length ?? 0) > 0
            ? t('exchangeAsVicePresident', { cards: (exchange.fromViceTrou ?? []).map(cardLabel).join(' ') })
            : null
    : null

  const trickHistory = view.trickHistory ?? []
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const turnPlayer = view.players.find((p) => p.id === view.currentTurnId)
  const myTurn = view.currentTurnId === user.id
  const iAmOut = view.outOrder.includes(user.id)
  const myOutRank = view.outOrder.indexOf(user.id) + 1
  const lastPlay = view.lastPlay
  const lastPlayRank = lastPlay ? preLastPlayRank(lastPlay) : null
  // « Ou rien » : la dernière pose a égalé la précédente → rang verrouillé.
  const lockedRank = preOuRien(view)

  const toggleCard = (card: number) => {
    if (!myTurn || busy) return
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card)
      // Sélection homogène sur les NATURELLES : un rang différent redémarre la
      // sélection — les jokers, caméléons, se combinent avec tout.
      const prevNaturals = prev.filter((c) => !preIsJoker(c))
      if (
        !preIsJoker(card) &&
        prevNaturals.length > 0 &&
        preRankOf(prevNaturals[0]) !== preRankOf(card)
      ) {
        return [card, ...prev.filter((c) => preIsJoker(c))]
      }
      return [...prev, card]
    })
  }

  // Les règles du moteur, lues sur la vue : le téléphone dit pourquoi la
  // sélection ne passe pas avant même l'envoi.
  const selectionIssue = myTurn && selected.length > 0 ? preComboIssue(view, selected) : null
  const canPlaySelection = myTurn && selected.length > 0 && selectionIssue === null
  const issueText =
    selectionIssue === 'WRONG_SIZE' && lastPlay
      ? t('need.size', { count: lastPlay.cards.length })
      : selectionIssue === 'TOO_LOW' && lastPlayRank !== null
        ? t('need.rank', { rank: PRE_RANKS[lastPlayRank] })
        : selectionIssue === 'MUST_MATCH_RANK' && lockedRank !== null
          ? t('ouRien', { rank: PRE_RANKS[lockedRank] })
          : null

  // Fermeture de carré : je détiens les cartes manquantes du rang au sommet
  // du pli (3 simples à la suite → la 4e ; une paire → l'autre paire) — les
  // jokers complètent.
  const closeNeed = preCloseNeeded(view)
  const myCloseCards = closeNeed
    ? [
        ...view.myHand.filter((c) => !preIsJoker(c) && preRankOf(c) === closeNeed.rank),
        ...view.myHand.filter((c) => preIsJoker(c)),
      ].slice(0, closeNeed.count)
    : []
  const canClose = !iAmOut && closeNeed !== null && myCloseCards.length === closeNeed.count

  const turnHint = !myTurn
    ? undefined
    : !lastPlay || lastPlayRank === null
      ? t('leadHint')
      : lockedRank !== null
        ? t('hint.ouRien', { rank: PRE_RANKS[lockedRank] })
        : t('hint.follow', { count: lastPlay.cards.length, rank: PRE_RANKS[lastPlayRank] })

  const barStatus = actionError ?? issueText ?? (!myTurn && canClose ? t('closeHint') : null)

  const play = async () => {
    if (!canPlaySelection) return
    setPending('play')
    const res = await sendAction({ action: 'play', cards: selected })
    setPending(null)
    // Échec : la sélection reste, on peut corriger et renvoyer.
    if (res?.ok) setSelected([])
  }
  const pass = async () => {
    setPending('pass')
    await sendAction({ action: 'pass' })
    setPending(null)
  }
  const closeTrick = async () => {
    setPending('close')
    await sendAction({ action: 'close', cards: myCloseCards })
    setPending(null)
  }
  const spinner = <Loader2 aria-hidden className="h-5 w-5 shrink-0 motion-safe:animate-spin" />

  return (
    <>
    <div
      className={cn('flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg', flowReserve)}
      style={flowStyle}
    >
      <PhaseHeader
        round={t('manche', { n: view.manche + 1, total: view.totalManches })}
        phase={lastPlay ? t('phase.trick', { count: lastPlay.cards.length }) : t('phase.free')}
        endsAt={view.phaseEndsAt}
        total={PRE_TURN_MS}
        dangerMs={8_000}
        right={tutorialButton}
      />

      <TurnBanner
        mine={myTurn}
        name={turnPlayer?.name}
        avatar={turnPlayer ? <PlayerAvatarGlyph value={iconOf(turnPlayer)} /> : undefined}
        hint={turnHint}
        alertOnMine
      />

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Coup refusé hors barre (spectateur, joueur sorti) — 3 s. En course,
          la ligne d'état de la barre l'annonce. */}
      {actionError && !barMode && (
        <div role="alert" className="rounded-2xl border border-red-300/40 bg-suit-red/20 px-4 py-2 text-center text-sm font-semibold text-red-300">
          {actionError}
        </div>
      )}

      {/* Échange (visible seulement de la paire concernée) */}
      {myExchangeMsg && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          {myExchangeMsg}
        </div>
      )}

      {iAmOut && (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-300/40 bg-felt-deep/70 px-4 py-3 text-center text-base font-bold text-emerald-300">
          <Flag aria-hidden className="h-5 w-5 shrink-0" />
          {t('out', { rank: myOutRank })}
        </p>
      )}

      {/* Tapis : dernier combo posé, en grandes cartes. Juste sous le tour :
          à 667 px de haut, sous une main de deux rangées, il restait
          caché derrière la liste des joueurs. */}
      <section className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4 shadow-inner">
        {lastPlay ? (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              {lastPlay.cards.map((card) => (
                <CardFace key={card} card={card} label={cardName(card)} size="lg" />
              ))}
            </div>
            <p className="text-sm font-semibold text-cream/80">
              {t('lastPlayBy', { name: nameOf(lastPlay.playerId) })}
            </p>
            {lockedRank !== null && (
              <motion.p
                initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-full border border-gold/60 bg-gold/[0.15] px-3 py-1 font-display text-sm font-bold text-gold"
              >
                {t('ouRien', { rank: PRE_RANKS[lockedRank] })}
              </motion.p>
            )}
          </>
        ) : (
          <p className="text-center font-display text-base font-bold text-cream/80">{t('freeTrick')}</p>
        )}
      </section>

      {/* Joueurs : rôle, cartes en main ou place de sortie, passe et départ
          signés d'une icône (pas seulement d'une teinte). */}
      <ul className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => {
          const outIdx = view.outOrder.indexOf(p.id)
          const isTurn = view.currentTurnId === p.id
          const passed = !isTurn && outIdx === -1 && view.passedIds.includes(p.id)
          const left = !p.isBot && Boolean(p.leftAt)
          return (
            <li
              key={p.id}
              className={cn(
                'inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold',
                isTurn
                  ? 'border-gold bg-gold/20 text-amber-200'
                  : outIdx !== -1
                    ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-gold/20 bg-felt-deep/70 text-cream',
                (passed || left) && 'opacity-60'
              )}
            >
              <span aria-hidden className="text-base leading-none">
                <PlayerAvatarGlyph value={iconOf(p)} />
              </span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              {p.role && (
                <>
                  <RoleIcon role={p.role} />
                  <span className="sr-only">{roleLabel(p.role, genreOf(p))}</span>
                </>
              )}
              {left && (
                <>
                  <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="sr-only">{t('playerLeft')}</span>
                </>
              )}
              {passed && (
                <>
                  <SkipForward aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="sr-only">{t('passed')}</span>
                </>
              )}
              {outIdx !== -1 ? (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <Flag aria-hidden className="h-4 w-4 shrink-0" />
                  <span aria-hidden>{outIdx + 1}</span>
                  <span className="sr-only">{t('outPosition', { rank: outIdx + 1 })}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <Layers aria-hidden className="h-4 w-4 shrink-0" />
                  <span aria-hidden>{p.handCount}</span>
                  <span className="sr-only">{t('handCount', { count: p.handCount })}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Paroles des bots : sous la table, le tapis et la main restent en place. */}
      {speechFeed}

      {/* Historique des plis de la manche (le plus récent en premier) */}
      {trickHistory.length > 0 && (
        <details className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4">
          <summary className="cursor-pointer select-none py-3 text-sm font-bold text-cream/80">
            {t('history.title', { count: trickHistory.length })}
          </summary>
          {/* max-h-[11rem] et non max-h-44 : Tailwind 3.3 ne génère pas l'échelle sur max-height. */}
          <div className="max-h-[11rem] space-y-1.5 overflow-y-auto pb-3">
            {[...trickHistory].reverse().map((entry, i) => {
              const n = trickHistory.length - i
              return (
                <div
                  key={n}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-cream/80"
                >
                  <span className="w-5 shrink-0 text-right tabular-nums text-cream/70">{n}</span>
                  {entry.plays.map((pl, j) => {
                    const p = view.players.find((x) => x.id === pl.playerId)
                    return (
                      <span key={j} className="inline-flex items-center gap-0.5" title={p?.name}>
                        {p && <PlayerAvatarGlyph value={iconOf(p)} />}
                        <span className={cn(pl.playerId === entry.winnerId && 'text-gold')}>
                          {pl.cards.map(cardLabel).join(' ')}
                        </span>
                      </span>
                    )
                  })}
                  {entry.winnerId && (
                    <span className="text-gold">→ {nameOf(entry.winnerId)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>

    {/* Ma main et l'action du moment, sous le pouce. Montée tant que je suis
        en course (sa ligne d'état annonce refus et sélection invalide) ; seuls
        ses boutons suivent le tour. */}
    {barMode === 'hand' && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        <div ref={barRef} className="space-y-3">
          {/* 7 cartes de 44 px par rangée tiennent dans les 343 px de la barre
              à 375 px : 14 cartes = deux rangées, toutes visibles. L'écart
              tombe à 2 px sous 370 px : les Android à 360 px (328 px utiles)
              gardent ainsi 7 cartes par rangée au lieu de passer à trois. */}
          <div
            role="group"
            aria-label={t('myHand')}
            className={cn(
              'flex flex-wrap justify-center gap-x-0.5 gap-y-2.5 pt-2.5 min-[370px]:gap-x-1',
              !myTurn && 'opacity-80'
            )}
          >
            {view.myHand.map((card) => (
              <CardFace
                key={card}
                card={card}
                label={cardName(card)}
                selected={selected.includes(card)}
                onToggle={myTurn ? () => toggleCard(card) : undefined}
              />
            ))}
          </div>

          {/* Fermeture de carré : hors tour, c'est l'action du moment. */}
          {canClose && (
            <Button
              variant={myTurn ? 'quiet' : 'primary'}
              size={myTurn ? 'game' : 'gameLg'}
              className="w-full gap-2 whitespace-normal leading-tight"
              disabled={busy}
              onClick={() => void closeTrick()}
            >
              {pending === 'close' ? spinner : <Zap aria-hidden className="h-5 w-5 shrink-0" />}
              {t('closeTrick', { cards: myCloseCards.map(cardLabel).join(' ') })}
            </Button>
          )}

          {myTurn && (
            <div className="flex gap-2">
              {/* On ne passe pas quand on mène le pli. */}
              {lastPlay && (
                <Button
                  variant="quiet"
                  size="gameLg"
                  className="flex-1 gap-2"
                  disabled={busy}
                  onClick={() => void pass()}
                >
                  {pending === 'pass' && spinner}
                  {t('pass')}
                </Button>
              )}
              <Button
                variant="primary"
                size="gameLg"
                className="min-w-0 flex-[2] gap-2 whitespace-normal leading-tight"
                disabled={!canPlaySelection || busy}
                onClick={() => void play()}
              >
                {pending === 'play' && spinner}
                {selected.length > 0
                  ? t('playCards', { cards: [...selected].sort((a, b) => a - b).map(cardLabel).join(' ') })
                  : t('pickCards')}
              </Button>
            </div>
          )}
        </div>
      </OnlineActionBar>
    )}
    {tutorialModal}
    </>
  )
}
