"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Ban, Check, Hand, Hourglass, Loader2, LogOut, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { ConfirmActionDialog } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  pbcContestThreshold,
  pbcIsValid,
  pbcRevealLeaderId,
  PBC_REVEAL_MS,
  PBC_WRITE_MS,
  type PbcClientView,
} from '@/lib/petit-bac/engine'
import {
  pbcEnterAction,
  pbcKeyboardInset,
  PBC_NO_KEYBOARD,
  type PbcKeyboardInset,
} from '@/lib/petit-bac/write-ui'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { useDeadline } from '@/hooks/useDeadline'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'

/**
 * PETIT BAC en ligne (serveur-autoritaire). Chacun tape ses cinq réponses en
 * local ; le premier qui a tout rempli crie STOP et gèle la table (les autres
 * clients envoient leur brouillon dans la fenêtre de flush). Comptage
 * automatique, contestations à la majorité au reveal.
 */

function parseView(json: string | null | undefined): PbcClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PbcClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Ancêtre qui défile : la scène OnlineGameStage. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

/** Le champ de la copie qui a le focus, s'il y en a un. */
function focusedFieldIn(fields: readonly (HTMLInputElement | null)[]): HTMLInputElement | null {
  const el = document.activeElement
  return el instanceof HTMLInputElement && fields.includes(el) ? el : null
}

/**
 * Clavier virtuel ouvert pendant l'écriture : de combien remonter la barre
 * STOP et descendre l'en-tête collant (cf. pbcKeyboardInset). Une mesure par
 * image au plus, un re-rendu seulement quand la valeur change.
 */
function useKeyboardInset(active: boolean, rootRef: RefObject<HTMLElement | null>): PbcKeyboardInset {
  const [inset, setInset] = useState<PbcKeyboardInset>(PBC_NO_KEYBOARD)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const stage = scrollParentOf(rootRef.current)
        if (!stage) return
        const rect = stage.getBoundingClientRect()
        const next = pbcKeyboardInset({
          stageTop: rect.top,
          stageBottom: rect.bottom,
          viewportTop: vv.offsetTop,
          viewportHeight: vv.height,
          scale: vv.scale,
        })
        setInset((cur) => (cur.bottom === next.bottom && cur.top === next.top ? cur : next))
      })
    }
    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
      setInset(PBC_NO_KEYBOARD)
    }
  }, [active, rootRef])
  return active ? inset : PBC_NO_KEYBOARD
}

export function PetitBacOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.petit-bac.game')
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()

  const inGame = room?.gameId === 'petit-bac' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('petit-bac', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Brouillon local (jamais envoyé pendant l'écriture — anti-triche serveur).
  const [draft, setDraft] = useState<string[]>([])
  const draftRef = useRef(draft)
  draftRef.current = draft
  const roundKey = view ? `${view.round}` : ''
  useEffect(() => {
    setDraft(Array.from({ length: view?.categories.length ?? 5 }, () => ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, inGame])

  // Clavier ouvert : l'en-tête (lettre + chrono) colle en haut, la barre STOP
  // remonte au-dessus du clavier, et le champ actif reste entre les deux.
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fieldRefs = useRef<(HTMLInputElement | null)[]>([])
  const phase = view?.phase
  const inset = useKeyboardInset(phase === 'write', rootRef)
  const keepFieldVisible = useCallback((field: HTMLElement) => {
    const card = field.closest('label')
    const stage = scrollParentOf(rootRef.current)
    const bar = barRef.current?.firstElementChild
    const header = headerRef.current
    if (!card || !stage || !header || !(bar instanceof HTMLElement)) return
    const rect = card.getBoundingClientRect()
    const top = header.getBoundingClientRect().bottom + 8
    const bottom = bar.getBoundingClientRect().top - 8
    if (rect.bottom > bottom) stage.scrollTop += rect.bottom - bottom
    else if (rect.top < top) stage.scrollTop -= top - rect.top
  }, [])
  // Le clavier vient de s'ouvrir (ou la fenêtre visible a glissé) : le champ
  // actif, que le navigateur croit visible, peut être passé sous la barre.
  useEffect(() => {
    if (inset.bottom === 0) return
    const field = focusedFieldIn(fieldRefs.current)
    if (field) keepFieldVisible(field)
  }, [inset.bottom, inset.top, keepFieldVisible])
  // STOP crié (ou chrono) : les champs se verrouillent, on rend le clavier.
  useEffect(() => {
    if (phase === 'flush') focusedFieldIn(fieldRefs.current)?.blur()
  }, [phase])

  const [contestPending, setContestPending] = useState<string | null>(null)
  // « Manche suivante » en route : `busy` vaut aussi pour une contestation,
  // la roue du bouton ne doit tourner que pour lui.
  const [advancing, setAdvancing] = useState(false)
  // Contestation à confirmer, rattachée au comptage où on l'a demandée : si la
  // manche file pendant que le dialogue est ouvert (chrono, « manche
  // suivante » d'un autre), il se ferme au lieu de couvrir la nouvelle lettre
  // — et il ne ressurgit ni au comptage suivant ni à la revanche.
  const [contestAsk, setContestAsk] = useState<{
    phaseKey: string
    targetId: string
    category: number
    title: string
    description: string
    open: boolean
  } | null>(null)

  // Verrous serveur (F32 : STOP pas avant un délai d'écriture ; F33 : manche
  // suivante pas avant le temps de lecture) et fenêtre de retour du parti :
  // trois questions binaires, un seul re-rendu chacune au franchissement —
  // le chrono affiché, lui, vit dans PhaseCountdown.
  const stopUnlocked = useDeadline(view?.stopAt ?? null)
  const continueUnlocked = useDeadline(view?.continueAt ?? null)
  const goneAt = view?.players.find((p) => !p.isBot && p.leftAt)?.leftAt ?? null
  const returnWindowClosed = useDeadline(goneAt === null ? null : goneAt + ONLINE_REPLACE_GRACE_MS)

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

  // Flush : quelqu'un a crié STOP (ou chrono) → j'envoie mon brouillon tel quel.
  // PAS de verrou de version : tous les clients déposent en même temps, le
  // premier bump de version rendrait les autres périmés (409) et leurs réponses
  // seraient perdues. Le moteur valide la phase ; on retente à chaque nouvelle
  // version serveur tant que `hasSubmitted` n'est pas confirmé.
  const flushSentRef = useRef<string | null>(null)
  useEffect(() => {
    if (!view || !room || !user || view.phase !== 'flush') return
    const me = view.players.find((p) => p.id === user.id)
    if (!me || me.leftAt || me.hasSubmitted) return
    const key = `${view.round}:${view.phaseSeq}:${room.stateVersion}`
    if (flushSentRef.current === key) return
    flushSentRef.current = key
    void fetch(`/api/online/rooms/${room.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'submit', answers: draftRef.current }),
    }).catch(() => {
      // Réseau en échec → réautorise une tentative au prochain rafraîchissement.
      flushSentRef.current = null
    })
  }, [view, room, user])

  // Arbitre (avec secours par rang) : bot meneur du reveal.
  // Pas de tick replace-left au Petit Bac : un déserteur n'est PAS converti
  // en bot « copie blanche » — il reste écarté (le moteur l'exclut de tous
  // les décomptes) et peut revenir à tout moment.
  const revealActorIsBot = Boolean(
    view?.phase === 'reveal' && view.players.find((p) => p.id === pbcRevealLeaderId(view))?.isBot
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: revealActorIsBot ? { body: { action: 'bot' }, delayMs: 5000 } : null,
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="petit-bac" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot
      ? botAvatarFromName(p.name)
      : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const me = view.players.find((p) => p.id === user.id)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const catLabel = (id: string) => t(`categories.${id}`)

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    const podium = [...view.players].sort((a, b) => b.total - a.total)
    const best = podium[0]?.total ?? 0
    // Même règle que le serveur : victoire = meilleur score (ex æquo inclus).
    const won = best > 0 && (view.players.find((p) => p.id === user.id)?.total ?? 0) === best
    return (
      <OnlineEndScreen
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
            <p className="max-w-xs text-sm text-cream/80">{t('finished.subtitle')}</p>
          </motion.div>
        }
        ranking={
          <ol className="w-full max-w-sm space-y-1.5">
            {podium.map((p, i) => (
              <li
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.total === best && best > 0
                    ? 'border-gold/50 bg-gold/10'
                    : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <span className="w-5 text-center font-display text-sm font-black text-cream/70">{i + 1}</span>
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className={cn('flex-1 truncate text-sm font-bold', p.id === user.id ? 'text-gold' : 'text-cream')}>
                  {p.name}
                </span>
                <span className="font-display text-lg font-black tabular-nums text-cream">{p.total}</span>
              </li>
            ))}
          </ol>
        }
        // L'XP était déjà créditée côté serveur — elle est enfin AFFICHÉE.
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-2xl font-bold text-gold">{t('countdown.title')}</p>
        <PhaseCountdownLaunch
          endsAt={view.phaseEndsAt}
          className="font-display text-8xl font-black tabular-nums text-cream"
        />
        <p className="max-w-xs text-sm font-semibold text-cream/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  const writing = view.phase === 'write' || view.phase === 'flush'
  // STOP : MÊMES conditions que le serveur (moteur = source de vérité), sinon
  // le bouton promet une action que la route refusera — cinq cases réellement
  // remplies (bonne lettre, 2 caractères au moins) ET un délai d'écriture
  // minimal, pour qu'on ne gèle plus la table à l'instant zéro (F32).
  const validity = view.categories.map((_, i) => pbcIsValid(draft[i] ?? '', view.letter))
  const missingCount = validity.filter((ok) => !ok).length
  const stopFilled = missingCount === 0
  const stopLocked = view.stopAt !== null && !stopUnlocked
  const canStop =
    view.phase === 'write' && !me?.hasSubmitted && stopFilled && !stopLocked
  const continueLocked = view.continueAt !== null && !continueUnlocked
  const submittedCount = view.players.filter((p) => p.hasSubmitted && !p.leftAt).length
  const activeCount = view.players.filter((p) => !p.leftAt).length
  const lastField = view.categories.length - 1

  const callStop = () => void sendAction({ action: 'stop', answers: draft })

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const next = pbcEnterAction(index, validity, canStop && !busy)
    if (next.type === 'focus') fieldRefs.current[next.index]?.focus()
    else if (next.type === 'stop') callStop()
    else if (next.type === 'blur') event.currentTarget.blur()
  }

  // Une voix ne se retire pas : on la fait confirmer, réponse et seuil sous
  // les yeux, plutôt que de la laisser partir sur un toucher de travers.
  const askContest = (targetId: string, category: number, answer: string, votes: number) =>
    setContestAsk({
      phaseKey: view.phaseKey,
      targetId,
      category,
      title: t('contestConfirm.title', { name: nameOf(targetId) }),
      description: t('contestConfirm.description', {
        answer,
        category: catLabel(view.categories[category] ?? ''),
        votes,
      }),
      open: true,
    })
  const confirmContest = async (targetId: string, category: number) => {
    setContestPending(`${targetId}:${category}`)
    await sendAction({ action: 'contest', targetId, category })
    setContestPending(null)
  }
  const advance = async () => {
    setAdvancing(true)
    await sendAction({ action: 'continue' })
    setAdvancing(false)
  }
  const contestDialogOpen = Boolean(
    contestAsk?.open && view.phase === 'reveal' && contestAsk.phaseKey === view.phaseKey
  )

  const phaseTitle =
    view.phase === 'write'
      ? t('phase.write', { letter: view.letter })
      : view.phase === 'flush'
        ? view.stopperId
          ? t('stopBy', { name: nameOf(view.stopperId) })
          : t('flushHint')
        : t('phase.reveal')

  // Ligne d'état de la barre : refus du serveur d'abord, puis la copie rendue.
  let phaseStatus: ReactNode = null
  if (me?.hasSubmitted && writing) {
    phaseStatus = t('submitted', { count: submittedCount, total: activeCount })
  } else if (view.phase === 'flush' && me && !me.leftAt) {
    phaseStatus = (
      <span className="inline-flex items-center gap-2">
        <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        {t('sendingCopy')}
      </span>
    )
  }
  const barStatus = actionError ? (
    <span className="font-semibold text-red-300">{actionError}</span>
  ) : (
    phaseStatus
  )

  return (
    <>
    {contestAsk && (
      <ConfirmActionDialog
        open={contestDialogOpen}
        onOpenChange={(open) => {
          if (!open) setContestAsk((cur) => (cur ? { ...cur, open: false } : cur))
        }}
        title={contestAsk.title}
        description={contestAsk.description}
        confirmLabel={t('contest')}
        tone="danger"
        onConfirm={() => void confirmContest(contestAsk.targetId, contestAsk.category)}
      />
    )}
    <div
      ref={rootRef}
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 sm:mx-auto sm:w-full sm:max-w-lg',
        onlineActionBarPadding(barStatus ? 'tall' : 'default')
      )}
    >
      {/* En-tête collant : lettre et chrono restent à l'écran, clavier ouvert
          compris — c'est une course contre la montre. */}
      <div
        ref={headerRef}
        style={inset.top > 0 ? { top: inset.top } : undefined}
        className="sticky top-0 z-10 -mx-3 -mt-3 border-b border-gold/20 bg-felt-deep/95 px-3 py-2 shadow-[0_12px_20px_-16px_rgba(0,0,0,0.9)]"
      >
        <PhaseHeader
          className="rounded-none border-0 bg-transparent p-0"
          phase={
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 font-display text-3xl font-black leading-none text-[#24201A] shadow-[0_6px_14px_-8px_rgba(217,164,65,0.8)]"
              >
                {view.letter}
              </span>
              <span className="min-w-0">
                <span className="block font-sans text-sm font-semibold text-cream/80">
                  {t('round', { n: view.round + 1, total: view.totalRounds })}
                </span>
                <span className="line-clamp-2">{phaseTitle}</span>
              </span>
            </span>
          }
          endsAt={view.phase === 'flush' ? null : view.phaseEndsAt}
          total={view.phase === 'reveal' ? PBC_REVEAL_MS : PBC_WRITE_MS}
          dangerMs={view.phase === 'write' ? 15_000 : 10_000}
          right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        />
      </div>

      {/* Bandeau limité à la fenêtre de retour probable — un parti reste
          simplement écarté (jamais converti en bot au Petit Bac). */}
      {leftPlayer?.leftAt && !returnWindowClosed && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          {t('leftTable', { name: leftPlayer.name })}
        </div>
      )}

      {/* ── Écriture ── */}
      {writing && (
        <div className="space-y-2">
          {view.categories.map((cat, i) => {
            const value = draft[i] ?? ''
            const valid = validity[i]
            // Mauvaise lettre : signalé dès deux caractères, pas à la première
            // frappe (une seule lettre n'est jamais recevable).
            const wrong = !valid && value.trim().length >= 2
            return (
              <label
                key={cat}
                className="flex scroll-mt-24 items-center gap-3 rounded-2xl border border-[#D8CCAE] bg-cream px-3 py-1 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)] focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-gold"
              >
                <span className="w-[6.5rem] shrink-0 text-xs font-bold leading-tight text-[#6B6455]">
                  {catLabel(cat)}
                </span>
                {/* Saisie mobile : 16px sous `sm` (en dessous, iOS zoome au
                    focus et décale la page à chaque champ — insupportable ici
                    où l'on enchaîne cinq saisies contre la montre) ; Entrée
                    passe au champ suivant (iOS ne le fait pas seul), et crie
                    STOP au dernier ; correcteur et autocorrection coupés, les
                    réponses sont des noms propres (le moteur normalise la
                    casse, la majuscule est sans effet). */}
                <input
                  ref={(el) => {
                    fieldRefs.current[i] = el
                  }}
                  type="text"
                  value={value}
                  maxLength={40}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint={i < lastField ? 'next' : canStop ? 'send' : 'done'}
                  aria-invalid={wrong || undefined}
                  disabled={view.phase !== 'write' || Boolean(me?.hasSubmitted)}
                  onChange={(e) => {
                    const next = [...draft]
                    next[i] = e.target.value
                    setDraft(next)
                  }}
                  onKeyDown={(e) => onFieldKeyDown(e, i)}
                  onFocus={(e) => {
                    const field = e.currentTarget
                    requestAnimationFrame(() => keepFieldVisible(field))
                  }}
                  placeholder={`${view.letter}…`}
                  className="h-11 min-w-0 flex-1 bg-transparent text-base font-bold text-[#24201A] placeholder:font-normal placeholder:italic placeholder:text-[#6B6455] focus:outline-none sm:text-sm"
                />
                {valid ? (
                  <Check aria-hidden className="h-5 w-5 shrink-0 text-emerald-700" />
                ) : wrong ? (
                  <AlertTriangle aria-hidden className="h-5 w-5 shrink-0 text-suit-red" />
                ) : (
                  <span aria-hidden className="h-5 w-5 shrink-0" />
                )}
              </label>
            )
          })}
        </div>
      )}

      {/* ── Révélation ── */}
      {view.phase === 'reveal' && view.revealGrid && (
        <div className="space-y-3">
          {view.categories.map((cat, i) => (
            <section key={cat} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-2.5">
              <h3 className="mb-2 px-1 text-sm font-bold text-gold">{catLabel(cat)}</h3>
              <ul className="space-y-1.5">
                {(view.revealGrid?.[i] ?? []).map((cell) => {
                  const cellPlayer = view.players.find((p) => p.id === cell.playerId)
                  const answer = cell.answer.trim()
                  const mine = cell.playerId === user.id
                  // Une seule voix ne raye plus une case sur une petite table :
                  // le seuil vient du moteur (null = table trop petite). Calculé
                  // par case, comme la TV : celui d'un joueur parti pendant le
                  // reveal compte tous ceux qui restent.
                  const threshold = pbcContestThreshold(view, cell.playerId)
                  const canContest =
                    threshold !== null &&
                    !mine &&
                    cell.points > 0 &&
                    !cell.rejected &&
                    !cell.iContested
                  const pending = contestPending === `${cell.playerId}:${i}`
                  const votes =
                    cell.contestCount > 0 ? (
                      <>
                        <span aria-hidden className="tabular-nums">
                          {threshold !== null ? `${cell.contestCount}/${threshold}` : cell.contestCount}
                        </span>
                        {threshold !== null && (
                          <span className="sr-only">
                            {t('contestVotes', { count: cell.contestCount, votes: threshold })}
                          </span>
                        )}
                      </>
                    ) : null
                  return (
                    <li
                      key={cell.playerId}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border bg-cream px-2.5 py-1.5',
                        mine ? 'border-amber-500 ring-1 ring-amber-500' : 'border-[#D8CCAE]'
                      )}
                    >
                      <span aria-hidden className="shrink-0">
                        <PlayerAvatarGlyph value={iconOf({ id: cell.playerId, name: cellPlayer?.name ?? '', isBot: cellPlayer?.isBot ?? false })} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-[#6B6455]">
                          {nameOf(cell.playerId)}
                        </p>
                        <p
                          className={cn(
                            'line-clamp-2 break-words text-base font-bold leading-snug',
                            !answer
                              ? 'font-normal italic text-[#6B6455]'
                              : cell.rejected
                                ? 'text-[#6B6455] line-through decoration-suit-red decoration-2'
                                : 'text-[#24201A]'
                          )}
                        >
                          {answer || t('empty')}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'grid h-8 min-w-[2rem] shrink-0 place-items-center rounded-lg px-1.5 font-display text-base font-black tabular-nums',
                          cell.points === 2 && 'bg-amber-500 text-[#24201A]',
                          cell.points === 1 && 'bg-sky-600/20 text-sky-900',
                          cell.points === 0 && 'border border-[#6B6455]/40 text-[#6B6455]'
                        )}
                      >
                        <span aria-hidden>{cell.points}</span>
                        <span className="sr-only">{t('pointsSr', { count: cell.points })}</span>
                      </span>
                      {canContest ? (
                        <button
                          type="button"
                          disabled={busy}
                          aria-busy={pending || undefined}
                          onClick={() => {
                            if (threshold !== null) askContest(cell.playerId, i, answer, threshold)
                          }}
                          className={cn(
                            'flex h-11 shrink-0 items-center gap-1 rounded-lg border border-[#6B6455]/50 bg-white/40 px-2 text-xs font-bold text-[#24201A] transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-suit-red disabled:opacity-40',
                            // La case visée garde sa pleine lumière (et sa roue) pendant l'envoi.
                            pending && 'disabled:opacity-100'
                          )}
                        >
                          {pending ? (
                            <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                          ) : (
                            <AlertTriangle aria-hidden className="h-4 w-4" />
                          )}
                          {t('contest')}
                          {/* Un « Contester » par ligne : le lecteur d'écran
                              dit quelle réponse il vise. */}
                          <span className="sr-only">
                            {' '}
                            {t('contestTargetSr', { answer, name: nameOf(cell.playerId) })}
                          </span>
                          {votes}
                        </button>
                      ) : cell.rejected ? (
                        // Plein : le rouge en encre sur un fond teinté tombait à 4,3:1.
                        <span className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-suit-red px-2 text-xs font-bold text-cream">
                          <Ban aria-hidden className="h-4 w-4" />
                          {t('rejected')}
                        </span>
                      ) : votes ? (
                        <span className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#6B6455]/40 px-2 text-xs font-bold text-[#24201A]">
                          {cell.iContested ? (
                            <Check aria-hidden className="h-4 w-4" />
                          ) : (
                            <AlertTriangle aria-hidden className="h-4 w-4" />
                          )}
                          {t('contested')}
                          {votes}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {/* Table trop petite pour trancher : on le DIT, plutôt que de laisser
              le bouton de contestation disparaître sans explication (F32). */}
          {view.contestThreshold === null && (
            <p className="text-center text-sm font-semibold text-cream/70">
              {t('contestTooFewPlayers')}
            </p>
          )}

          {/* Totaux */}
          <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[...view.players]
                .sort((a, b) => b.total + (view.roundTotals?.[b.id] ?? 0) - (a.total + (view.roundTotals?.[a.id] ?? 0)))
                .map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 text-sm">
                    <span className={cn('font-bold', p.id === user.id ? 'text-gold' : 'text-cream/80')}>
                      {p.name}
                    </span>
                    <span className="font-display font-black tabular-nums text-cream">
                      {p.total + (view.roundTotals?.[p.id] ?? 0)}
                    </span>
                    <span className="text-sm font-semibold text-emerald-300">
                      +{view.roundTotals?.[p.id] ?? 0}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => {
          const gone = Boolean(p.leftAt)
          const handedIn = writing && p.hasSubmitted && !gone
          return (
            <span
              key={p.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold',
                handedIn
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-gold/20 bg-felt-deep/70 text-cream/80',
                gone && 'opacity-40'
              )}
            >
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className={cn(gone && 'line-through')} />
              {handedIn && (
                <>
                  <Check aria-hidden className="h-4 w-4 text-emerald-300" />
                  <span className="sr-only">{t('handedIn')}</span>
                </>
              )}
              {gone && (
                <>
                  <LogOut aria-hidden className="h-4 w-4" />
                  <span className="sr-only">{t('playerLeft')}</span>
                </>
              )}
            </span>
          )
        })}
      </div>

      {/* Clavier ouvert : la scène descend sous le clavier ; de quoi faire
          remonter la dernière case au-dessus de la barre STOP. */}
      {inset.bottom > 0 && <div aria-hidden className="shrink-0" style={{ height: inset.bottom }} />}
    </div>

    {/* Barre du pouce : STOP pendant l'écriture, la suite au comptage. Elle
        remonte au-dessus du clavier par --pbc-kb (cf. useKeyboardInset). */}
    <div ref={barRef} style={{ '--pbc-kb': `${inset.bottom}px` } as CSSProperties}>
      <OnlineActionBar
        status={barStatus}
        maxWidthClass="max-w-lg"
        className="bottom-[var(--pbc-kb,0px)]"
      >
        {view.phase === 'write' && !me?.hasSubmitted && (
          <Button
            variant={canStop ? 'primary' : 'quiet'}
            size="gameLg"
            onClick={callStop}
            disabled={!canStop || busy}
            aria-busy={(canStop && busy) || undefined}
            // Pas prêt : le libellé dit ce qui manque ; en route : la roue.
            // Dans les deux cas il doit rester lisible (seul STOP rend
            // `busy` pendant l'écriture). Le libellé long (« Faltan 2
            // casillas… ») passe sur deux lignes au lieu de déborder à 375 px.
            className="w-full whitespace-normal leading-tight disabled:opacity-100"
          >
            {busy && canStop ? (
              <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 motion-safe:animate-spin" />
            ) : stopFilled && stopLocked ? (
              <Hourglass aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            ) : (
              <Hand aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            )}
            {!stopFilled ? (
              t('stopMissing', { count: missingCount })
            ) : stopLocked ? (
              <PhaseCountdown endsAt={view.stopAt}>{({ seconds }) => t('stopLocked', { seconds })}</PhaseCountdown>
            ) : (
              t('stop')
            )}
          </Button>
        )}
        {/* Le serveur refuse l'avancement avant le temps de lecture (F33) :
            le bouton le dit au lieu de se faire rejeter. */}
        {view.phase === 'reveal' && (
          <Button
            variant={continueLocked ? 'quiet' : 'primary'}
            size="gameLg"
            onClick={() => void advance()}
            disabled={busy || continueLocked}
            aria-busy={advancing || undefined}
            className={cn('w-full', (continueLocked || advancing) && 'disabled:opacity-100')}
          >
            {continueLocked ? (
              <>
                <Hourglass aria-hidden className="mr-2 h-5 w-5" />
                <PhaseCountdown endsAt={view.continueAt}>
                  {({ seconds }) => t('nextRoundLocked', { seconds })}
                </PhaseCountdown>
              </>
            ) : (
              <>
                {advancing && <Loader2 aria-hidden className="mr-2 h-5 w-5 motion-safe:animate-spin" />}
                {view.round + 1 >= view.totalRounds ? t('seeEnd') : t('nextRound')}
              </>
            )}
          </Button>
        )}
      </OnlineActionBar>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="petit-bac" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
