"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, Loader2, Pencil, Send, Trophy, WifiOff, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseHeader } from './PhaseHeader'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PartyCanvas, PartyCanvasTools, usePartyCanvasTool, type Stroke } from './PartyCanvas'
import { TurnBanner } from '@/components/game/TurnBanner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { playGameSound } from '@/lib/sound/game-sounds'
import {
  CROBARD_BOT_DRAWER_ROUND_MS,
  CROBARD_CHOOSING_MS,
  CROBARD_DRAWING_MS,
  CROBARD_GUESS_MAX_LEN,
  crobardFoundTally,
  crobardGuessOutcome,
  crobardRoundEndLeaderId,
  type CrobardClientView,
  type CrobardPlayerView,
} from '@/lib/crobard/engine'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * CROBARD en ligne (serveur-autoritaire). `word`/`wordChoices` ne sont
 * envoyés qu'au dessinateur ; les traits (`strokes`) restent PUBLICS —
 * c'est le principe du jeu. Une réponse fausse/proche est notée (quota
 * d'essais par manche), mais son issue ne revient qu'à son auteur.
 *
 * Choix du mot, dessin et bilan partagent UN écran : bandeau de phase, tour,
 * contenu, et une barre fixe en bas qui porte l'action du moment (les trois
 * mots, les outils de dessin, le champ de réponse, « Manche suivante »).
 */

type StrokeQueueItem =
  | { action: 'draw-stroke'; stroke: Stroke }
  | { action: 'undo-stroke' }
  | { action: 'clear' }

/** Seuil d'urgence du chrono : 10 s de choix en tout, 80 s de dessin. */
const CHOOSING_DANGER_MS = 4_000
const DRAWING_DANGER_MS = 15_000

/**
 * Padding du flux sous la barre : trois mots empilés (statut + 3 × h-14,
 * 236 px), plus une ligne de marge pour le statut qui passe sur deux lignes
 * en espagnol et en italien.
 */
const CHOOSING_BAR_PADDING = 'pb-[calc(16.5rem+env(safe-area-inset-bottom,0px))]'
/** Padding du flux sous la barre d'outils : statut + deux rangées. */
const TOOLS_BAR_PADDING = 'pb-[calc(10rem+env(safe-area-inset-bottom,0px))]'
/**
 * Marge de défilement de la toile du dessinateur : la scène réserve 9 rem en
 * bas (`scroll-pb-36`), la barre d'outils en prend 149 px plus la zone sûre.
 */
const DRAWER_CANVAS_SCROLL_MARGIN = 'scroll-mb-[calc(1rem+env(safe-area-inset-bottom,0px))]'

function parseView(json: string | null | undefined): CrobardClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as CrobardClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function CrobardOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.crobard.game')
  const tc = useTranslations('common')
  const reduceMotion = useReducedMotion()
  // Intention joueur : pas de verrou de version (le moteur valide la phase et
  // l'acteur) — un verrou ferait perdre l'action sur écritures simultanées
  // (devinettes + traits).
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const [guessText, setGuessText] = useState('')
  const [guessFeedback, setGuessFeedback] = useState<'wrong' | 'close' | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Mot touché par le dessinateur, en attente du serveur (roue sur ce bouton). */
  const [pickedWord, setPickedWord] = useState<number | null>(null)
  const tool = usePartyCanvasTool()
  // File d'envoi des traits, SÉRIALISÉE (ordre garanti) et sans verrou busy ni
  // version : un trait dessiné pendant l'envoi du précédent était silencieusement
  // perdu (verrou busy), et les devinettes simultanées faisaient churner la
  // version → 409 → traits manquants chez les devineurs.
  const strokeQueueRef = useRef<StrokeQueueItem[]>([])
  const strokePumpingRef = useRef(false)

  const inGame = room?.gameId === 'crobard' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('crobard', inGame)
  const cosmetics = useMemberCosmetics(room)

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

  // Ticks « arbitre » (bot au bilan + remplacement), avec secours par rang.
  // Le meneur du bilan n'est pas `currentTurnUserId` (null au bilan, pour
  // qu'aucun joueur n'y soit expulsable pour inactivité) : même calcul que
  // le serveur.
  const roundEndLeaderId = view ? crobardRoundEndLeaderId(view) : null
  const roundEndActor = view?.players.find((p) => p.id === roundEndLeaderId)
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

  useEffect(() => {
    setGuessText('')
    setGuessFeedback(null)
    setPickedWord(null)
  }, [view?.round])

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
  }, [])

  // Le choix du mot ne dure que 10 s et n'importe qui peut lancer la manche
  // suivante : le dessinateur qui regardait ailleurs est prévenu (son de tour
  // + vibration) au PASSAGE à son choix, jamais au montage ni au retour sur
  // l'onglet en plein choix.
  const livePhaseKey = view?.phaseKey ?? null
  const drawerChoosing = view?.phase === 'choosing' && view.isDrawer
  const seenPhaseKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = seenPhaseKeyRef.current
    seenPhaseKeyRef.current = livePhaseKey
    if (!drawerChoosing || previous === null || previous === livePhaseKey) return
    playGameSound('turn')
    try {
      navigator.vibrate?.(60)
    } catch {
      // vibration non supportée — silencieux
    }
  }, [livePhaseKey, drawerChoosing])

  // Sur un téléphone court (Safari, barres d'outils visibles), le bas de la
  // toile tombait sous la barre fixe : le dessinateur ne pouvait pas y tracer,
  // le devineur ne voyait pas tout le dessin. Au début du dessin, on fait
  // défiler juste ce qu'il faut pour la montrer en entier.
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const drawingPhaseKey = view?.phase === 'drawing' ? view.phaseKey : null
  useEffect(() => {
    if (!drawingPhaseKey) return
    canvasBoxRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [drawingPhaseKey, reduceMotion])

  if (!inGame) {
    return <GameOnlineLobby gameId="crobard" />
  }

  if (!view || !user || !room) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-8 w-8 text-gold motion-safe:animate-spin" aria-hidden />
        <span className="sr-only">{tc('loading')}</span>
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const won = finished && view.winnerId === user.id
  const ranking = [...view.players].sort((a, b) => b.score - a.score)

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? '—'

  /** Vide la file de traits, un envoi à la fois (retente sur 409/5xx/réseau). */
  const pumpStrokeQueue = async () => {
    if (strokePumpingRef.current || !room) return
    strokePumpingRef.current = true
    try {
      while (strokeQueueRef.current.length > 0) {
        const item = strokeQueueRef.current[0]
        let done = false
        for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
          try {
            const res = await fetch(`/api/online/rooms/${room.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(item),
            })
            // Refus définitif (mauvaise phase, plafond…) : on jette le trait.
            done = res.ok || (res.status !== 409 && res.status < 500)
          } catch {
            await new Promise((r) => setTimeout(r, 300))
          }
        }
        // Retrait PAR IDENTITÉ : « Tout effacer » remplace la file pendant
        // l'envoi d'un trait, et un shift() aveugle jetait alors l'effacement
        // sans l'avoir envoyé.
        const index = strokeQueueRef.current.indexOf(item)
        if (index >= 0) strokeQueueRef.current.splice(index, 1)
      }
    } finally {
      strokePumpingRef.current = false
    }
  }

  const queueStrokeAction = (item: StrokeQueueItem) => {
    strokeQueueRef.current.push(item)
    void pumpStrokeQueue()
  }

  const flashFeedback = (kind: 'wrong' | 'close') => {
    setGuessFeedback(kind)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setGuessFeedback(null), 1200)
  }

  const submitGuess = async () => {
    const text = guessText.trim()
    if (!text || busy || !user) return
    // Réponse fausse/proche : écrite (quota), son issue revient dans NOTRE vue.
    const res = await sendAction({ action: 'guess', text })
    if (!res?.ok) return
    const outcome = crobardGuessOutcome(res.data.view as CrobardClientView | undefined, user.id)
    if (outcome === 'wrong' || outcome === 'close') {
      flashFeedback(outcome)
    } else if (outcome === 'found') {
      setGuessText('')
      setGuessFeedback(null)
    }
  }

  const chooseWord = async (index: number) => {
    if (pickedWord !== null) return
    setPickedWord(index)
    const res = await sendAction({ action: 'choose-word', index })
    // Échec : les trois mots redeviennent touchables. `null` = un envoi était
    // déjà en vol (double toucher) : c'est sa réponse qui décidera.
    if (res && !res.ok) setPickedWord(null)
  }

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
            <Trophy className="h-14 w-14 text-gold" aria-hidden />
            <h2 className="font-display text-3xl font-bold text-gold">{t('victory.title', { name: nameOf(view.winnerId) })}</h2>
          </motion.div>
        }
        ranking={<RankingList players={ranking} iconOf={iconOf} cosmetics={cosmetics} className="max-w-sm" />}
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-2xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-bold tabular-nums text-gold" />
        <p className="text-sm font-semibold text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Choix du mot, dessin, bilan ──────────────────────────────────────────
  const { phase } = view
  const drawer = view.players.find((p) => p.id === view.drawerId)
  const botDrawer = Boolean(drawer?.isBot)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const iHaveGuessed = view.correctGuessers.includes(user.id)
  const foundLine = t('foundCount', crobardFoundTally(view))
  const guessesLeft = view.myGuesses?.left ?? null

  const phaseTitle =
    phase === 'choosing' ? t('phase.choosing') : phase === 'drawing' ? t('phase.drawing') : t('roundEnd.title')
  // Dessinateur bot : manche écourtée côté moteur, la barre suit sa vraie durée.
  const totalPhaseMs =
    phase === 'choosing' ? CROBARD_CHOOSING_MS : botDrawer ? CROBARD_BOT_DRAWER_ROUND_MS : CROBARD_DRAWING_MS
  const dangerMs = phase === 'choosing' ? CHOOSING_DANGER_MS : botDrawer ? 0 : DRAWING_DANGER_MS

  const turnHint: ReactNode = view.isDrawer
    ? phase === 'choosing'
      ? t('choosing.pickWord')
      : (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-bold uppercase tracking-wide">{t('yourWord')}</span>
            <span className="break-words font-display text-2xl font-bold leading-tight">{view.word}</span>
          </span>
        )
    : botDrawer
      ? t('botDrawer')
      : phase === 'choosing'
        ? t('choosing.getReady')
        : t('drawing.guessHint')

  // Pendant le dessin, aucun bandeau ne s'insère AU-DESSUS de la toile : elle
  // glissait de 40 px en plein trait et le trait en cours sautait d'autant.
  // Le refus d'un coup passe dans la ligne d'état de la barre (au-dessus du
  // bouton qui l'a provoqué), l'attente d'un joueur parti sous la toile.
  const drawingNow = phase === 'drawing'
  const errorStatus: ReactNode = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : null
  const leftNotice = leftPlayer?.leftAt ? (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
      <WifiOff className="h-4 w-4 shrink-0 text-gold" aria-hidden />
      <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
        {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
      </PhaseCountdown>
    </div>
  ) : null

  // ── Barre du bas : l'action du moment, selon la phase et le rôle ──────────
  let barStatus: ReactNode = null
  let barContent: ReactNode = null
  let flowPadding = 'pb-6'

  if (phase === 'choosing' && view.isDrawer && view.wordChoices) {
    barStatus = errorStatus ?? t('choosing.autoPick')
    flowPadding = CHOOSING_BAR_PADDING
    barContent = (
      <div className="flex flex-col gap-2">
        {view.wordChoices.map((word, i) => {
          const sending = pickedWord === i
          return (
            <Button
              key={word}
              variant="quiet"
              size="gameLg"
              onClick={() => void chooseWord(i)}
              disabled={pickedWord !== null && !sending}
              aria-busy={sending || undefined}
              className={cn(
                'w-full gap-2 whitespace-normal break-words font-display text-lg leading-tight',
                sending && 'pointer-events-none border-gold bg-gold/20'
              )}
            >
              {sending && <Loader2 className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />}
              {word}
            </Button>
          )
        })}
      </div>
    )
  } else if (phase === 'drawing' && view.isDrawer) {
    barStatus = errorStatus ?? foundLine
    flowPadding = TOOLS_BAR_PADDING
    barContent = (
      <PartyCanvasTools
        tool={tool}
        hasStrokes={view.strokes.length > 0}
        onUndo={() => queueStrokeAction({ action: 'undo-stroke' })}
        onClear={() => {
          // L'effacement rend caducs les traits encore en file.
          strokeQueueRef.current = [{ action: 'clear' }]
          void pumpStrokeQueue()
        }}
      />
    )
  } else if (phase === 'drawing') {
    flowPadding = onlineActionBarPadding('tall')
    barStatus = errorStatus ?? (guessFeedback ? (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-bold',
          guessFeedback === 'close' ? 'text-gold' : 'text-red-300'
        )}
      >
        {guessFeedback === 'wrong' && <X className="h-4 w-4" aria-hidden />}
        {guessFeedback === 'close' ? t('feedback.close') : t('feedback.wrong')}
      </span>
    ) : !iHaveGuessed && guessesLeft !== null && guessesLeft > 0 && guessesLeft <= 5 ? (
      t('guessesLeft', { count: guessesLeft })
    ) : (
      foundLine
    ))
    barContent = iHaveGuessed ? (
      <p className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 text-base font-bold text-emerald-300">
        <Check className="h-5 w-5 shrink-0" aria-hidden />
        {t('youFoundIt')}
      </p>
    ) : guessesLeft === 0 ? (
      <p className="flex min-h-[3rem] items-center justify-center rounded-2xl border border-cream/[0.25] bg-black/20 px-4 py-2 text-center text-base font-semibold text-cream/80">
        {t('noGuessesLeft')}
      </p>
    ) : (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submitGuess()
        }}
      >
        {/* Jamais désactivé pendant l'envoi : un champ désactivé perd le
            focus et le clavier du téléphone se refermait à chaque essai. */}
        <input
          value={guessText}
          onChange={(e) => setGuessText(e.target.value)}
          maxLength={CROBARD_GUESS_MAX_LEN}
          placeholder={t('guessPlaceholder')}
          aria-label={t('guessLabel')}
          autoComplete="off"
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-xl border border-cream/[0.25] bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        {/* mousedown sans effet : toucher « Envoyer » ne retire pas le
            focus du champ, le clavier reste ouvert pour l'essai suivant. */}
        <Button
          type="submit"
          variant="primary"
          size="game"
          disabled={busy || !guessText.trim()}
          onMouseDown={(e) => e.preventDefault()}
          className="shrink-0 gap-1.5"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Send className="h-5 w-5" aria-hidden />
          )}
          {tc('send')}
        </Button>
      </form>
    )
  } else if (phase === 'roundEnd') {
    barStatus = errorStatus
    flowPadding = onlineActionBarPadding(errorStatus ? 'tall' : 'default')
    barContent = (
      <Button
        variant="primary"
        size="gameLg"
        onClick={() => void sendAction({ action: 'continue' })}
        disabled={busy}
        className="w-full gap-2"
      >
        {busy && <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden />}
        {view.round >= view.totalRounds ? t('roundEnd.seeResult') : t('roundEnd.continue')}
      </Button>
    )
  }
  const barShown = barContent !== null || barStatus !== null

  return (
    <>
      <div className={cn('flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg', flowPadding)}>
        <PhaseHeader
          round={t('round', { round: view.round, total: view.totalRounds })}
          phase={phaseTitle}
          endsAt={phase === 'roundEnd' ? null : view.phaseEndsAt}
          total={totalPhaseMs}
          dangerMs={dangerMs}
          right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        />

        {phase !== 'roundEnd' && (
          <TurnBanner
            mine={view.isDrawer}
            name={drawer?.name}
            avatar={drawer ? <PlayerAvatarGlyph value={iconOf(drawer)} /> : undefined}
            hint={turnHint}
          />
        )}

        {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s.
            Quand la barre du bas est là, il passe dans sa ligne d'état. */}
        {actionError && !barShown && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300"
          >
            {actionError}
          </div>
        )}

        {!drawingNow && leftNotice}

        {drawingNow && (
          <div ref={canvasBoxRef} className={cn(view.isDrawer && DRAWER_CANVAS_SCROLL_MARGIN)}>
            <PartyCanvas
              strokes={view.strokes}
              readOnly={!view.isDrawer}
              tool={tool}
              onStrokeComplete={(stroke: Stroke) => queueStrokeAction({ action: 'draw-stroke', stroke })}
            />
          </div>
        )}

        {drawingNow && leftNotice}

        {phase === 'roundEnd' ? (
          <>
            <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4 text-center">
              {view.lastRoundWord && (
                <>
                  <p className="text-sm font-semibold text-cream/80">{t('roundEnd.wordLabel')}</p>
                  <p className="mt-1 break-words font-display text-4xl font-bold leading-tight text-gold">
                    {view.lastRoundWord}
                  </p>
                </>
              )}
              <p className="mt-2 text-sm font-semibold text-cream/80">{foundLine}</p>
            </section>
            <RankingList players={ranking.slice(0, 5)} iconOf={iconOf} cosmetics={cosmetics} />
          </>
        ) : (
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {view.players.map((p) => {
              const isDrawer = p.id === view.drawerId
              const found = view.correctGuessers.includes(p.id)
              return (
                <li
                  key={p.id}
                  className={cn(
                    'flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold',
                    isDrawer
                      ? 'border-gold/60 bg-gold/10 text-gold'
                      : found
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-gold/20 bg-felt-deep/70 text-cream',
                    p.leftAt && 'opacity-40'
                  )}
                >
                  <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <span className="min-w-0 truncate">
                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                  </span>
                  {isDrawer && (
                    <>
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="sr-only">{t('players.drawing')}</span>
                    </>
                  )}
                  {found && (
                    <>
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="sr-only">{t('players.found')}</span>
                    </>
                  )}
                  {p.leftAt && (
                    <>
                      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="sr-only">{t('players.away')}</span>
                    </>
                  )}
                  <span className="shrink-0 tabular-nums text-cream/70">· {p.score}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {barShown && (
        <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
          {barContent}
        </OnlineActionBar>
      )}

      <AnimatePresence>
        {tutorial.open && <GameTutorialModal gameId="crobard" onClose={tutorial.close} />}
      </AnimatePresence>
    </>
  )
}

/** Classement (bilan de manche, écran de fin) : rang, avatar, nom, score. */
function RankingList({
  players,
  iconOf,
  cosmetics,
  className,
}: {
  players: CrobardPlayerView[]
  iconOf: (p: CrobardPlayerView) => string
  cosmetics: ReturnType<typeof useMemberCosmetics>
  className?: string
}) {
  return (
    <ol className={cn('flex w-full flex-col gap-1.5', className)}>
      {players.map((p, i) => (
        <li
          key={p.id}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-2 text-left',
            i === 0 ? 'border-gold/40 bg-gold/10' : 'border-gold/20 bg-felt-deep/70'
          )}
        >
          <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-cream/70">{i + 1}</span>
          <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-cream">
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-gold">{p.score}</span>
        </li>
      ))}
    </ol>
  )
}
