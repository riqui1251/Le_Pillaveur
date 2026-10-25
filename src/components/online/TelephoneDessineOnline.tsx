"use client"

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  Loader2,
  PenLine,
  Pencil,
  Send,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PartyCanvas } from './PartyCanvas'
import { Button } from '@/components/ui/button'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { cn } from '@/lib/utils'
import {
  TELEPHONE_BOT_REVEAL_CHAIN_MS,
  TELEPHONE_BOT_REVEAL_LINK_MS,
  TELEPHONE_DRAW_MS,
  TELEPHONE_REVEAL_LINK_MS,
  TELEPHONE_REVEAL_MS,
  TELEPHONE_TEXT_MAX_LEN,
  TELEPHONE_WRITE_MS,
  type TelephoneClientView,
  type TelephoneContribution,
  type TelephoneRevealChain,
} from '@/lib/telephone-dessine/engine'
import { drawHistoryReducer, EMPTY_DRAW_HISTORY } from '@/lib/telephone-dessine/draw-history'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction, type GameActionResult } from '@/hooks/useGameAction'
import { useDeadline } from '@/hooks/useDeadline'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { serverNow } from '@/hooks/server-clock'

/**
 * TÉLÉPHONE DESSINÉ en ligne (serveur-autoritaire). Chaque joueur ne voit
 * QUE le maillon qui lui est assigné cette manche (`received`), jamais les
 * chaînes complètes avant `reveal`. Pas de score : c'est un jeu de rigolade
 * collective. Réutilise PartyCanvas tel quel pour les manches de dessin.
 */

function parseView(json: string | null | undefined): TelephoneClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as TelephoneClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Nouvel essai du dépôt automatique après un raté réseau — l'ancienne cadence d'horloge. */
const AUTO_SUBMIT_RETRY_MS = 400

/**
 * Le bouton du meneur reste inerte un court instant après chaque cran : un
 * double toucher sur « Dévoiler la suite » sautait sinon la chute de la
 * chaîne, qui arrive au même endroit sous le libellé « Chaîne suivante ».
 */
const REVEAL_TAP_GUARD_MS = 800

/** Délai au-delà duquel un dessin révélé s'affiche même si l'animation de retournement n'a pas signalé sa fin. */
const REVEAL_FLIP_FALLBACK_MS = 1_500

/** Dessins de la révélation et du maillon à deviner : 34vh de haut au plus (4:3), pour en voir plus d'un à la fois. */
const DRAWING_MAX_WIDTH = 'mx-auto w-full max-w-[45vh]'

const FIELD_CLASS =
  'h-12 min-w-0 flex-1 rounded-xl border border-cream/[0.25] bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40'

type SendAction = (body: Record<string, unknown>) => Promise<GameActionResult | null>

export function TelephoneDessineOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.telephone-dessine.game')
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const [text, setText] = useState('')
  const [drawing, dispatchDrawing] = useReducer(drawHistoryReducer, EMPTY_DRAW_HISTORY)
  const myStrokes = drawing.strokes
  // Brouillons accessibles depuis les effets (dépôt auto au chrono).
  const textRef = useRef('')
  const strokesRef = useRef(myStrokes)
  useEffect(() => {
    textRef.current = text
  }, [text])
  useEffect(() => {
    strokesRef.current = myStrokes
  }, [myStrokes])

  const inGame = room?.gameId === 'telephone-dessine' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('telephone-dessine', inGame)
  const cosmetics = useMemberCosmetics(room)

  useEffect(() => {
    setText('')
    dispatchDrawing({ type: 'reset' })
  }, [view?.round])

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

  // Dépôt AUTOMATIQUE du brouillon 2 s avant l'échéance (phrase OU dessin) :
  // sans lui, un maillon non « Envoyé » partait blanc au timeout. Sans verrou
  // de version, retenté à chaque version serveur tant que le dépôt n'est pas
  // confirmé (même filet que le flush du Petit Bac). Le réveil à T-2 s vient
  // de useDeadline : un seul re-rendu, pas d'horloge à 400 ms.
  const autoSubmitDue = useDeadline(view && view.phaseEndsAt !== null ? view.phaseEndsAt - 2_000 : null)
  const autoSubmitRef = useRef<string | null>(null)
  // Raté réseau : l'effet ne se relance que sur une version serveur, et rien
  // ne garantit qu'il en arrive une dans les deux dernières secondes. Ce
  // compteur le réveille 400 ms plus tard tant que la phase n'est pas close —
  // un rendu par nouvel essai, en cas d'échec seulement.
  const [autoSubmitRetry, retryAutoSubmit] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!view || !room || !user) return
    if (view.phase !== 'contributing' || view.haveISubmitted) return
    const me = view.players.find((p) => p.id === user.id)
    if (!me || me.leftAt) return
    if (view.phaseEndsAt === null || !autoSubmitDue) return
    const phaseEndsAt = view.phaseEndsAt
    const key = `${view.round}:${view.phaseSeq}:${room.stateVersion}`
    if (autoSubmitRef.current === key) return
    autoSubmitRef.current = key
    const body =
      view.actionType === 'draw'
        ? { action: 'submit', strokes: strokesRef.current }
        : { action: 'write', text: textRef.current.trim() }
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    void fetch(`/api/online/rooms/${room.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }).catch(() => {
      autoSubmitRef.current = null
      if (serverNow() < phaseEndsAt) retryTimer = setTimeout(retryAutoSubmit, AUTO_SUBMIT_RETRY_MS)
    })
    return () => clearTimeout(retryTimer)
  }, [view, room, user, autoSubmitDue, autoSubmitRetry])

  // Ticks « arbitre » (bots + remplacement), avec secours par rang.
  const pendingBot =
    view?.phase === 'contributing' && !view.haveISubmitted
      ? view.players.find((p) => p.isBot)
      : undefined
  const revealActorIsBot = Boolean(
    view?.phase === 'reveal' && view.players.find((p) => p.id === room?.currentTurnUserId)?.isBot
  )
  const revealChainShown = Boolean(
    view?.revealChain && view.revealChain.links.length >= view.revealChain.linkCount
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      pendingBot || revealActorIsBot
        ? {
            body: { action: 'bot' },
            delayMs:
              view?.phase === 'reveal'
                ? revealChainShown
                  ? TELEPHONE_BOT_REVEAL_CHAIN_MS
                  : TELEPHONE_BOT_REVEAL_LINK_MS
                : botTickDelayMs(pendingBot?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="telephone-dessine" />
  }

  if (!view || !user || !room || (view.phase === 'reveal' && !view.revealChain)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 aria-hidden className="h-8 w-8 text-gold motion-safe:animate-spin" />
      </div>
    )
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (view.phase === 'finished') {
    return (
      <OnlineEndScreen
        // Le moteur tient ses votes « Rejouer » et la relance est celle de
        // tous les jeux (processRematchVote) : l'écran de fin n'avait
        // simplement jamais eu le bouton.
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <div className="flex flex-col items-center gap-2 text-center">
            <Sparkles aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('victory.title')}</h2>
            <p className="text-sm text-cream/70">{t('victory.subtitle')}</p>
          </div>
        }
        // Jeu vitrine par lequel arrivent les nouveaux : c'est le pire
        // endroit où laisser la boucle de progression muette.
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-cream">
        <p className="font-display text-xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-amber-200" />
        <p className="text-sm font-semibold text-cream/70">{t('countdown.hint')}</p>
      </div>
    )
  }

  const tutorialButton = <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
  const tutorialModal = (
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="telephone-dessine" onClose={tutorial.close} />}
    </AnimatePresence>
  )

  // ── Révélation des chaînes ────────────────────────────────────────────────
  if (view.phase === 'reveal' && view.revealChain) {
    return (
      <>
        <TelephoneReveal
          view={view}
          chain={view.revealChain}
          leaderId={room.currentTurnUserId}
          userId={user.id}
          busy={busy}
          actionError={actionError}
          sendAction={sendAction}
          right={tutorialButton}
        />
        {tutorialModal}
      </>
    )
  }

  // ── Manche de contribution (écriture ou dessin) ──────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const isDraw = view.actionType === 'draw'
  const totalMs = isDraw ? TELEPHONE_DRAW_MS : TELEPHONE_WRITE_MS
  const submitted = new Set(view.submittedIds ?? [])
  const canAct = !view.haveISubmitted
  const PhaseIcon = isDraw ? Pencil : PenLine
  const phaseLabel = view.round === 0 ? t('phase.write') : isDraw ? t('phase.draw') : t('phase.guess')

  const submitText = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    await sendAction({ action: 'write', text: trimmed })
  }

  const barStatus = view.haveISubmitted
    ? t('sentStatus', { count: view.submittedCount, total: view.totalToSubmit })
    : t('submittedCount', { count: view.submittedCount, total: view.totalToSubmit })

  return (
    <>
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          onlineActionBarPadding('tall')
        )}
      >
        <PhaseHeader
          round={t('tv.round', { current: view.round + 1, total: view.totalRounds })}
          phase={
            <span className="flex items-center gap-2">
              <PhaseIcon aria-hidden className="h-5 w-5 shrink-0" />
              {phaseLabel}
            </span>
          }
          endsAt={view.phaseEndsAt}
          total={totalMs}
          dangerMs={15_000}
          timerColorClassName="bg-teal-400"
          right={tutorialButton}
        />

        {leftPlayer?.leftAt && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-semibold text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        {view.haveISubmitted ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-[#24201A]">
              <Check aria-hidden className="h-6 w-6" />
            </span>
            <p className="font-display text-lg font-bold text-gold">{t('sentTitle')}</p>
            <p className="text-sm text-cream/70">{t('waitingOthers')}</p>
          </div>
        ) : view.round === 0 ? (
          <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4 text-center">
            <PenLine aria-hidden className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-2 font-display text-xl font-bold text-cream">{t('writeInitial')}</p>
            <p className="mt-1 text-sm text-cream/70">{t('writeHint')}</p>
          </div>
        ) : !isDraw ? (
          <section className="space-y-2">
            <p className="text-sm font-semibold text-cream/70">{t('youReceived')}</p>
            <ReceivedContribution received={view.received} />
            <p className="pt-1 text-center font-display text-xl font-bold text-cream">{t('guessInstruction')}</p>
          </section>
        ) : (
          <section className="space-y-3">
            {/* Consigne DANS la carte de la phrase : à 667 px de haut, chaque
                ligne gagnée rapproche les outils de dessin du pli. */}
            <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('drawInstruction')}</p>
              <p className="mt-1 break-words font-display text-xl font-bold leading-snug text-cream">
                {view.received?.type === 'text' && view.received.text.trim() ? (
                  view.received.text
                ) : (
                  <span className="text-base font-normal italic text-cream/60">{t('reveal.blank')}</span>
                )}
              </p>
            </div>
            {/* Dessin 100 % LOCAL : personne ne le regarde en direct (maillon
                secret) — le dessin complet part en UNE action au SUBMIT. Le
                streaming trait par trait perdait des traits (verrou busy +
                conflits de version) → dessins amputés à l'étape suivante. */}
            <PartyCanvas
              strokes={myStrokes}
              readOnly={false}
              onStrokeComplete={(stroke) => dispatchDrawing({ type: 'stroke', stroke })}
              onUndo={() => dispatchDrawing({ type: 'undo' })}
              onClear={() => dispatchDrawing({ type: 'clear' })}
            />
          </section>
        )}

        <ul className="flex flex-wrap items-center justify-center gap-2" aria-label={t('playersLabel')}>
          {view.players.map((p) => {
            const done = submitted.has(p.id)
            const left = Boolean(p.leftAt)
            return (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold',
                  done ? 'border-gold/50 bg-gold/10 text-cream' : 'border-gold/20 bg-felt-deep/70 text-cream/80',
                  left && 'opacity-40'
                )}
              >
                <span aria-hidden>
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                {left ? (
                  <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
                ) : done ? (
                  <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <PhaseIcon aria-hidden className="h-4 w-4 shrink-0 text-cream/60" />
                )}
                <span className="sr-only">
                  {left ? t('player.left') : done ? t('player.done') : t('player.pending')}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Montée toute la manche : sa région live annonce le compte des
          maillons rendus ; seule la saisie du moment va et vient. Un refus
          prend la place de ce compte : un encadré de plus faisait déborder
          la barre sur sa réserve, et la liste des joueurs passait dessous. */}
      <OnlineActionBar
        status={actionError ? <span className="font-semibold text-red-300">{actionError}</span> : barStatus}
        maxWidthClass="max-w-lg"
      >
        {canAct && !isDraw && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void submitText()
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={TELEPHONE_TEXT_MAX_LEN}
              placeholder={t('writePlaceholder')}
              aria-label={view.round === 0 ? t('writeInitial') : t('guessInstruction')}
              autoComplete="off"
              enterKeyHint="send"
              // Jamais désactivé pendant l'envoi : un champ qui perd le focus
              // ferme le clavier, et un refus du serveur obligerait à le rouvrir.
              // text-base : sous 16 px, iOS zoome sur le champ au toucher.
              className={FIELD_CLASS}
            />
            <Button
              type="submit"
              variant="primary"
              size="game"
              disabled={busy || !text.trim()}
              aria-label={t('sendPhrase')}
              className="shrink-0 px-4"
            >
              {busy ? (
                <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <Send aria-hidden className="mr-1.5 h-4 w-4" />
              )}
              {t('sendShort')}
            </Button>
          </form>
        )}
        {canAct && isDraw && (
          // Une feuille blanche n'est pas un dessin : le maillon vide part
          // seul à l'échéance, pas sur un toucher égaré.
          <Button
            variant="primary"
            size="gameLg"
            className="w-full"
            disabled={busy || myStrokes.length === 0}
            onClick={() => void sendAction({ action: 'submit', strokes: myStrokes })}
          >
            {busy ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
            ) : (
              <Check aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            )}
            <span className="truncate">{t('submitDrawing')}</span>
          </Button>
        )}
      </OnlineActionBar>
      {tutorialModal}
    </>
  )
}

/** Le maillon reçu à deviner : un dessin (alternance stricte), une phrase par sécurité. */
function ReceivedContribution({ received }: { received: TelephoneContribution | null }) {
  const t = useTranslations('games.telephone-dessine.game')
  if (received?.type === 'draw') {
    return (
      <>
        <PartyCanvas strokes={received.strokes} readOnly className={DRAWING_MAX_WIDTH} />
        {received.strokes.length === 0 && (
          <p className="text-center text-sm italic text-cream/60">{t('reveal.blank')}</p>
        )}
      </>
    )
  }
  return (
    <p className="break-words rounded-2xl border border-gold/20 bg-felt-deep/70 p-4 text-center font-display text-xl font-bold leading-snug text-cream">
      {received?.type === 'text' ? received.text : ''}
    </p>
  )
}

/**
 * RÉVÉLATION, maillon par maillon. Un seul meneur (le premier joueur encore
 * en jeu) dévoile la suite pour toute la table, depuis la barre du bas : d'un
 * bloc, la chaîne de six maillons faisait plus de mille pixels, chacun lisait
 * la chute à son rythme et le meneur cherchait son bouton tout en bas. Le
 * serveur n'envoie que les maillons dévoilés (`links`) et la longueur totale
 * (`linkCount`).
 */
function TelephoneReveal({
  view,
  chain,
  leaderId,
  userId,
  busy,
  actionError,
  sendAction,
  right,
}: {
  view: TelephoneClientView
  chain: TelephoneRevealChain
  leaderId: string | null
  userId: string
  busy: boolean
  actionError: string | null
  sendAction: SendAction
  right: ReactNode
}) {
  const t = useTranslations('games.telephone-dessine.game')
  const reduceMotion = useReducedMotion()
  const isLeader = leaderId === userId
  const leaderName = view.players.find((p) => p.id === leaderId)?.name ?? ''
  const shown = chain.links.length
  const complete = shown >= chain.linkCount
  const lastChain = view.revealIdx + 1 >= view.revealOrder.length

  // Inerte DÈS le rendu qui montre le nouveau cran : un drapeau remis à vrai
  // par un effet laissait le bouton actif pendant une image, celle où arrive
  // le second toucher. `phaseKey` change à chaque cran, même sur une chaîne
  // déjà vue.
  const stepKey = view.phaseKey
  const [armedKey, setArmedKey] = useState<string | null>(null)
  useEffect(() => {
    const id = setTimeout(() => setArmedKey(stepKey), REVEAL_TAP_GUARD_MS)
    return () => clearTimeout(id)
  }, [stepKey])
  const guarded = armedKey !== stepKey

  // Le maillon qui arrive est amené à l'écran ; une nouvelle chaîne repart du haut.
  const topRef = useRef<HTMLDivElement>(null)
  const newestRef = useRef<HTMLLIElement>(null)
  const chainRef = useRef(view.revealIdx)
  useEffect(() => {
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'
    if (chainRef.current !== view.revealIdx) {
      chainRef.current = view.revealIdx
      topRef.current?.scrollIntoView({ block: 'start', behavior })
      return
    }
    if (shown > 1) newestRef.current?.scrollIntoView({ block: 'nearest', behavior })
  }, [view.revealIdx, shown, reduceMotion])

  const nextLabel = !complete ? t('reveal.nextLink') : lastChain ? t('reveal.finish') : t('reveal.nextChain')
  const NextIcon = complete ? ArrowRight : Eye

  // « Voir la fin » sort TOUTE la table des chaînes, sans retour possible :
  // un toucher de trop après la dernière chute coupait le fou rire final.
  const [confirmDialog, confirm] = useConfirmAction()
  const goNext = async () => {
    if (complete && lastChain) {
      const ok = await confirm({
        title: t('reveal.finishConfirm.title'),
        description: t('reveal.finishConfirm.description'),
        confirmLabel: t('reveal.finish'),
        tone: 'primary',
      })
      if (!ok) return
    }
    // La clé du cran VU part avec le geste : si l'échéance a déjà fait
    // avancer la table, le serveur refuse au lieu d'avancer d'un cran de
    // plus (la chute ne s'affichait alors qu'un instant).
    await sendAction({ action: 'continue', phaseKey: stepKey })
  }

  return (
    <>
      {confirmDialog}
      <div
        ref={topRef}
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          onlineActionBarPadding(isLeader ? 'tall' : 'default')
        )}
      >
        <PhaseHeader
          round={t('reveal.title', { current: view.revealIdx + 1, total: view.revealOrder.length })}
          phase={t('reveal.chainOf', { name: chain.ownerName })}
          endsAt={view.phaseEndsAt}
          total={complete ? TELEPHONE_REVEAL_MS : TELEPHONE_REVEAL_LINK_MS}
          dangerMs={5_000}
          timerColorClassName="bg-teal-400"
          right={right}
          status={t('reveal.progress', { current: shown, total: chain.linkCount })}
        />

        {/* Région live : le maillon qui arrive est lu sans que le lecteur
            d'écran ait à parcourir la chaîne à chaque cran. */}
        <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
          {chain.links.map((link, i) => (
            <RevealCard
              key={`${view.revealIdx}-${i}`}
              cardRef={i === shown - 1 ? newestRef : undefined}
              link={link}
              index={i}
              newest={i === shown - 1 && shown > 1}
              reduceMotion={Boolean(reduceMotion)}
            />
          ))}
        </ol>
      </div>

      <OnlineActionBar
        status={
          actionError ? (
            <span className="font-semibold text-red-300">{actionError}</span>
          ) : isLeader ? (
            t('reveal.leaderHint')
          ) : (
            t('reveal.waitingLeader', { name: leaderName })
          )
        }
        maxWidthClass="max-w-lg"
      >
        {isLeader && (
          <div className="flex gap-2">
            {view.revealIdx > 0 && (
              <Button
                variant="quiet"
                size="gameLg"
                className="w-14 shrink-0 px-0"
                disabled={busy}
                aria-label={t('reveal.previousChain')}
                title={t('reveal.previousChain')}
                onClick={() => void sendAction({ action: 'previous', phaseKey: stepKey })}
              >
                <ChevronLeft aria-hidden className="h-6 w-6" />
              </Button>
            )}
            <Button
              variant="primary"
              size="gameLg"
              className="min-w-0 flex-1"
              disabled={busy || guarded}
              onClick={() => void goNext()}
            >
              {busy ? (
                <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
              ) : (
                <NextIcon aria-hidden className="mr-2 h-5 w-5 shrink-0" />
              )}
              <span className="truncate">{nextLabel}</span>
              {!complete && (
                <span aria-hidden className="ml-2 shrink-0 rounded-full bg-[#24201A]/10 px-2 py-0.5 text-sm tabular-nums">
                  {t('reveal.linkCounter', { current: shown, total: chain.linkCount })}
                </span>
              )}
            </Button>
          </div>
        )}
      </OnlineActionBar>
    </>
  )
}

/**
 * Un maillon qui arrive en se retournant. Son dessin n'est peint qu'une fois
 * la carte à plat : PartyCanvas dimensionne sa toile sur la boîte AFFICHÉE,
 * et à -80° elle ne fait qu'un sixième de sa largeur — le dessin restait
 * flou et écrasé, la toile ne se remesurant pas quand la rotation finit.
 */
function RevealCard({
  link,
  index,
  newest,
  reduceMotion,
  cardRef,
}: {
  link: TelephoneContribution
  index: number
  newest: boolean
  reduceMotion: boolean
  cardRef?: Ref<HTMLLIElement>
}) {
  const [flat, setFlat] = useState(false)
  // Filet si la fin d'animation ne venait jamais : la chute doit s'afficher.
  useEffect(() => {
    const id = setTimeout(() => setFlat(true), REVEAL_FLIP_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [])
  return (
    <motion.li
      ref={cardRef}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotateY: -80 }}
      animate={{ opacity: 1, rotateY: 0 }}
      transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 170, damping: 22 }}
      onAnimationComplete={() => setFlat(true)}
      style={{ transformPerspective: 900 }}
      className={cn('rounded-2xl border bg-felt-deep/70 p-3', newest ? 'border-gold/60' : 'border-gold/20')}
    >
      <RevealLink link={link} index={index} drawingReady={flat || reduceMotion} />
    </motion.li>
  )
}

function RevealLink({
  link,
  index,
  drawingReady,
}: {
  link: TelephoneContribution
  index: number
  drawingReady: boolean
}) {
  const t = useTranslations('games.telephone-dessine.game')
  const blank = <p className="text-sm italic text-cream/60">{t('reveal.blank')}</p>
  return (
    <>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        {link.type === 'text' ? (
          <PenLine aria-hidden className="h-4 w-4 shrink-0" />
        ) : (
          <Pencil aria-hidden className="h-4 w-4 shrink-0" />
        )}
        {t('reveal.step', { n: index + 1 })}
      </p>
      {link.type === 'text' ? (
        link.text.trim() ? (
          <p className="break-words font-display text-xl font-bold leading-snug text-cream">{link.text}</p>
        ) : (
          blank
        )
      ) : link.strokes.length > 0 ? (
        drawingReady ? (
          <PartyCanvas strokes={link.strokes} readOnly className={DRAWING_MAX_WIDTH} />
        ) : (
          // Feuille vierge aux mêmes mesures que la toile : rien ne bouge quand le dessin apparaît.
          <div className={DRAWING_MAX_WIDTH}>
            <div aria-hidden className="aspect-[4/3] w-full rounded-2xl border border-gold/30 bg-cream shadow-inner" />
          </div>
        )
      ) : (
        blank
      )}
    </>
  )
}
