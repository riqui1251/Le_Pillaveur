"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check, Flag, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { TurnBanner } from '@/components/game/TurnBanner'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parsePurpleState, type PurpleSyncedState } from '@/lib/online-game-state'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { GameIconById } from '@/components/hub/GameIconById'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PurpleSpeechFeed } from './purple/PurpleSpeechFeed'
import {
  PURPLE_BET_META,
  PURPLE_BET_TYPES,
  PurpleBetButton,
  PurpleBetGrid,
  PurpleDrawnCards,
  PurpleHistory,
  PurplePotRow,
  PurpleVerdictDialog,
  type PurpleBetType,
} from '@/app/[locale]/games/purple/components/purple-ui'

/** Purple en ligne : jeu tour par tour, cagnotte « patate chaude ». Aucune
 * info cachée (tirage public dès qu'il a lieu). Cartes, paris et verdict
 * viennent du jeu local (purple-ui) : même allure dans les deux modes. */

/** Avertissement AFK affiché 1 min avant l'expulsion (comme les autres jeux). */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

// Barre de décision À MON TOUR : ligne d'enjeu, « Je continue » (56),
// « Passer » (48), écarts et zone sûre. Au-delà des tailles d'OnlineActionBar.
const DECISION_PADDING = 'pb-[calc(12rem+env(safe-area-inset-bottom,0px))]'

type PurpleMove = 'bet' | 'continue' | 'pass' | 'close-reveal' | 'end'

function isBetType(bet: string | null): bet is PurpleBetType {
  return bet !== null && bet in PURPLE_BET_META
}

/** Joueur qui reprendra la main : le suivant encore à table (comme le moteur). */
function nextActiveIndex(view: PurpleSyncedState): number {
  const n = view.players.length
  for (let i = 1; i <= n; i += 1) {
    const idx = (view.currentPlayer + i) % n
    if (!view.players[idx]?.leftAt) return idx
  }
  return view.currentPlayer
}

export function PurpleOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [confirmDialog, confirm] = useConfirmAction()
  const reduceMotion = useReducedMotion()
  // Geste parti, en attente du serveur : roue sur le bouton touché.
  const [pending, setPending] = useState<{ move: PurpleMove; bet?: PurpleBetType } | null>(null)

  const inGame = room?.gameId === 'purple' && room.status === 'playing'
  const tutorial = useGameTutorial('purple', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo<PurpleSyncedState | null>(
    () => (inGame ? parsePurpleState(room?.gameStateJson) : null),
    [inGame, room?.gameStateJson]
  )

  // Flash « nouveau paquet mélangé » : le serveur reboucle le paquet quand il
  // est épuisé — détecté ici quand le nombre de cartes restantes REMONTE.
  const prevDeckLenRef = useRef<number | null>(null)
  const [newDeckFlash, setNewDeckFlash] = useState(false)
  const deckLen = view?.deck.length ?? null
  useEffect(() => {
    if (deckLen === null) return
    const prev = prevDeckLenRef.current
    prevDeckLenRef.current = deckLen
    if (prev !== null && deckLen > prev) {
      setNewDeckFlash(true)
      const timer = setTimeout(() => setNewDeckFlash(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [deckLen])

  // Ticks « arbitre » (avec secours par rang, cf. useBotReferee) : tour d'un
  // bot → un coup ; joueur parti depuis 3 min → remplacement. expectedVersion
  // rend les ticks concurrents inoffensifs (le serveur revalide tout).
  const activeActor = view?.players[view.currentPlayer]
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: activeActor?.isBot
      ? {
          body: { action: 'bot' },
          delayMs:
            view?.pendingReveal || view?.canContinue ? 1600 : botTickDelayMs(activeActor.name),
        }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Tick AFK : le Purple est tour par tour, un joueur parti boire sans quitter
  // bloquait la table sans limite. Surveillé seulement s'il reste un AUTRE
  // humain présent (le dernier humain n'est jamais expulsable).
  const afkTarget = view?.phase !== 'finished' ? activeActor : undefined
  const afkWatchable = Boolean(
    view &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  const turnStartedAt = useAfkTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    targetId: afkTarget?.id,
    enabled: afkWatchable,
  })

  // Avertissement AFK affiché après 2 min sans action du joueur au tour.
  const stateVersion = room?.stateVersion ?? -1
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  if (!inGame) {
    return <GameOnlineLobby gameId="purple" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
      </div>
    )
  }

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const play = async (move: PurpleMove, body: Record<string, unknown>, bet?: PurpleBetType) => {
    setPending({ move, bet })
    try {
      await sendAction(body)
    } finally {
      setPending(null)
    }
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const finished = view.phase === 'finished'
  const currentActor = view.players[view.currentPlayer]
  const isMyTurn = currentActor?.id === user.id
  const currentName = currentActor?.name ?? ''
  const nextName = view.players[nextActiveIndex(view)]?.name ?? ''

  // ── Écran de fin ──────────────────────────────────────────────────────────
  if (finished) {
    // Bilan nommé : qui a bu combien, du plus arrosé au plus sobre.
    const tally = [...view.players].sort(
      (a, b) => (view.gameResults[b.id] ?? 0) - (view.gameResults[a.id] ?? 0)
    )
    return (
      <OnlineEndScreen
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
            <GameIconById id="purple" surface="felt" className="h-12 w-12" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
            <p className="text-sm text-cream/70">{t('online.totalCards', { count: view.totalCardsDrawn })}</p>
          </motion.div>
        }
        ranking={
          <ol aria-label={t('tallyTitle')} className="grid w-full max-w-sm grid-cols-1 gap-2">
            {tally.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/70 px-3 py-2">
                <RankCrest role={cosmetics.get(p.id)?.role} size="sm" />
                <span className="text-lg leading-none" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate text-sm font-semibold" />
                <span className="shrink-0 text-sm font-bold tabular-nums text-gold">
                  {tCommon('sipsCount', { count: view.gameResults[p.id] ?? 0 })}
                </span>
              </li>
            ))}
          </ol>
        }
        // Aucune progression n'existait sur ce jeu : XP de participation.
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Phase play ────────────────────────────────────────────────────────────
  const deciding = view.isCorrect === true && view.canContinue
  const betting = !view.canContinue && !view.pendingReveal
  const lastBet = isBetType(view.lastBet) ? view.lastBet : null

  // « Terminer » termine la partie sur TOUS les téléphones : il était seul
  // collé en bas, sous le pouce, et partait au premier toucher.
  const askEnd = async () => {
    const ok = await confirm({
      title: t('online.endConfirm.title'),
      description: t('online.endConfirm.description'),
      confirmLabel: t('online.endConfirm.confirm'),
      cancelLabel: t('online.endConfirm.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    // Sans verrou de version, comme au 1220 : pendant le dialogue, bots et
    // autres joueurs font monter la version, et le 409 (muet) avalait la fin.
    // Le moteur valide déjà l'acteur et la phase. Un second envoi rattrape
    // une écriture vraiment simultanée.
    setPending({ move: 'end' })
    try {
      const res = await postAction({ action: 'end' })
      if (res?.status === 409) await postAction({ action: 'end' })
    } finally {
      setPending(null)
    }
  }

  const barStatus = view.pendingReveal
    ? t('mustDrink', { name: currentName, count: view.amountToDrink })
    : isMyTurn
      ? t('decision.stakeSelf', { count: view.drinkCounter })
      : deciding
        ? t('decision.waiting', { name: currentName })
        : t('online.waitingBet', { name: currentName })

  const turnHint = isMyTurn ? (deciding ? t('decision.hint') : betting ? t('chooseBet') : undefined) : undefined
  const soft = user.ambianceMode === 'soft'
  const speechFeed = <PurpleSpeechFeed view={view} iconOf={iconOf} meId={user.id} variant="phone" soft={soft} />

  return (
    <>
      {confirmDialog}
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          deciding && isMyTurn ? DECISION_PADDING : onlineActionBarPadding('default')
        )}
      >
        <PhaseHeader
          phase={view.pendingReveal ? t('wrongCombo') : deciding ? t('online.phaseDecision') : t('online.phaseBet')}
          right={
            <>
              <Button
                variant="ghost"
                size="gameIcon"
                onClick={() => void askEnd()}
                disabled={busy}
                aria-label={t('online.endGame')}
                title={t('online.endGame')}
                className="border border-gold/20 bg-felt-deep/60 text-cream/80 hover:bg-gold/10 hover:text-gold"
              >
                {pending?.move === 'end' ? (
                  <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
                ) : (
                  <Flag aria-hidden className="h-5 w-5" />
                )}
              </Button>
              <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
            </>
          }
        />
        {tutorial.open && <GameTutorialModal gameId="purple" onClose={tutorial.close} />}

        {/* Un seul « à qui le tour », juste sous l'en-tête : les alertes
            (refus, départ, inactivité) ne le repoussent plus vers le bas. */}
        {currentActor && (
          <TurnBanner
            mine={isMyTurn}
            name={currentActor.name}
            avatar={<PlayerAvatarGlyph value={iconOf(currentActor)} />}
            hint={turnHint}
            alertOnMine
          />
        )}

        {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s */}
        {actionError && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
            {actionError}
          </div>
        )}
        {leftPlayer?.leftAt && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        {afkWatch && afkTarget && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
            {afkTarget.id === user.id && <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />}
            <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) =>
                afkTarget.id === user.id
                  ? t('online.afkWarningSelf', { seconds })
                  : t('online.afkWarning', { name: afkTarget.name, seconds })
              }
            </PhaseCountdown>
          </div>
        )}

        <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <PurplePotRow counter={view.drinkCounter} cardsLeft={view.deck.length} newDeck={newDeckFlash} />
        </section>

        {/* ── Cartes tirées ────────────────────────────────────────────── */}
        {view.drawnCards.length > 0 && (
          <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
            <PurpleDrawnCards cards={view.drawnCards} drawKey={view.totalCardsDrawn} />
            {deciding && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-semibold text-emerald-300">
                <Check aria-hidden className="h-5 w-5 shrink-0" />
                {t('correct', { count: lastBet ? PURPLE_BET_META[lastBet].gulps : 0 })}
              </p>
            )}
          </section>
        )}

        {/* ── Paris ────────────────────────────────────────────────────── */}
        {betting && (
          <PurpleBetGrid label={t('chooseBet')}>
            {PURPLE_BET_TYPES.map((bet) => (
              <PurpleBetButton
                key={bet}
                bet={bet}
                onClick={() => void play('bet', { action: 'bet', bet }, bet)}
                disabled={busy || !isMyTurn}
                pending={pending?.move === 'bet' && pending.bet === bet}
              />
            ))}
          </PurpleBetGrid>
        )}

        {/* Paroles des bots SOUS les paris : une bulle qui arrive ne déplace
            jamais un bouton sous le doigt. Montée même vide (région aria-live). */}
        {speechFeed}

        <PurpleHistory cards={view.cardHistory} />
      </div>

      {/* L'action du tour sous le pouce. Montée toute la partie : sa ligne
          d'état (enjeu, attente) n'est annoncée que si elle change. */}
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {deciding && isMyTurn && (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="gameLg"
              className={cn('w-full', pending?.move === 'continue' && 'disabled:opacity-100')}
              disabled={busy}
              onClick={() => void play('continue', { action: 'continue' })}
            >
              {pending?.move === 'continue' && <Loader2 aria-hidden className="mr-2 h-5 w-5 motion-safe:animate-spin" />}
              {t('decision.continueSelf')}
            </Button>
            <Button
              variant="quiet"
              size="game"
              className={cn('w-full whitespace-normal leading-tight', pending?.move === 'pass' && 'disabled:opacity-100')}
              disabled={busy}
              onClick={() => void play('pass', { action: 'pass' })}
            >
              {pending?.move === 'pass' && <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />}
              {t('decision.pass', { name: nextName, count: view.drinkCounter })}
            </Button>
          </div>
        )}
      </OnlineActionBar>

      {/* ── Verdict : qui boit combien, sur tous les téléphones ──────────── */}
      <PurpleVerdictDialog
        open={view.pendingReveal}
        name={currentName}
        amount={view.amountToDrink}
        cards={view.drawnCards}
        onDismiss={isMyTurn && !busy ? () => void play('close-reveal', { action: 'close-reveal' }) : undefined}
      >
        {/* La pique du bot se lit avec le verdict : copie muette du fil (le
            fil sous les paris reste la région annoncée), les plus récentes. */}
        <div aria-hidden className="mb-3 flex max-h-[7.5rem] flex-col justify-end overflow-hidden text-left">
          {speechFeed}
        </div>
        {isMyTurn ? (
          <Button
            variant="primary"
            size="gameLg"
            className={cn('w-full whitespace-normal leading-tight', pending?.move === 'close-reveal' && 'disabled:opacity-100')}
            disabled={busy}
            onClick={() => void play('close-reveal', { action: 'close-reveal' })}
          >
            {pending?.move === 'close-reveal' && <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />}
            {t('nextTurn', { name: nextName })}
          </Button>
        ) : (
          <p className="text-sm text-cream/80">{t('online.waitingDecision', { name: currentName })}</p>
        )}
      </PurpleVerdictDialog>
    </>
  )
}
