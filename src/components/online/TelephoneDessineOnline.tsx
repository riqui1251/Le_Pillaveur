"use client"

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence } from 'framer-motion'
import { Home, Send, Sparkles } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { PartyCanvas, type Stroke } from './PartyCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { botEmojiFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { useDeadline } from '@/hooks/useDeadline'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'

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

export function TelephoneDessineOnline() {
  const { user } = useAuth()
  const { room, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.telephone-dessine.game')
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const [text, setText] = useState('')
  const [myStrokes, setMyStrokes] = useState<Stroke[]>([])
  // Brouillons accessibles depuis les effets (dépôt auto au chrono).
  const textRef = useRef('')
  const strokesRef = useRef<Stroke[]>([])
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
    setMyStrokes([])
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
      if (Date.now() < phaseEndsAt) retryTimer = setTimeout(retryAutoSubmit, AUTO_SUBMIT_RETRY_MS)
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
            delayMs: view?.phase === 'reveal' ? 2500 : botTickDelayMs(pendingBot?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="telephone-dessine" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const submitText = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    await sendAction({ action: 'write', text: trimmed })
  }

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center text-white">
        <Sparkles className="h-14 w-14 text-teal-300" />
        <h2 className="font-display text-3xl font-bold text-gold">{t('victory.title')}</h2>
        <p className="text-sm text-white/60">{t('victory.subtitle')}</p>
        {/* Jeu vitrine par lequel arrivent les nouveaux : c'est le pire
            endroit où laisser la boucle de progression muette. */}
        <XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />
        <Button
          onClick={() => void leaveRoom()}
          variant="outline"
          className="w-full max-w-sm rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
        >
          <Home className="mr-2 h-4 w-4" /> {t('victory.backToMenu')}
        </Button>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-teal-300/80">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-teal-200" />
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Révélation des chaînes ────────────────────────────────────────────────
  if (view.phase === 'reveal' && view.revealChain) {
    // Un seul meneur (le premier joueur encore en jeu) fait défiler les
    // chaînes pour tout le monde — évite que plusieurs clics simultanés ne
    // fassent sauter des dessins avant que tout le monde ait pu les voir.
    const isLeader = room.currentTurnUserId === user.id
    const leaderName =
      view.players.find((p) => p.id === room.currentTurnUserId)?.name ?? ''
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-teal-300/80">
          {t('reveal.title', { current: view.revealIdx + 1, total: view.revealOrder.length })}
        </p>
        <p className="text-center text-lg font-black">{t('reveal.chainOf', { name: view.revealChain.ownerName })}</p>
        <div className="flex flex-col gap-3">
          {view.revealChain.links.map((link, i) => (
            <div key={`${view.revealIdx}-${i}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {t('reveal.step', { n: i + 1 })}
              </p>
              {link.type === 'text' ? (
                <p className="text-lg font-bold">
                  {link.text.trim() ? link.text : <span className="italic text-white/30">{t('reveal.blank')}</span>}
                </p>
              ) : link.strokes.length > 0 ? (
                <PartyCanvas strokes={link.strokes} readOnly />
              ) : (
                <p className="italic text-white/30">{t('reveal.blank')}</p>
              )}
            </div>
          ))}
        </div>
        {isLeader ? (
          <div className="flex gap-2">
            {view.revealIdx > 0 && (
              <Button
                onClick={() => void sendAction({ action: 'previous' })}
                disabled={busy}
                variant="outline"
                className="flex-1 rounded-2xl border-white/15 bg-white/5 py-4 text-sm font-bold text-white/80 hover:bg-white/10"
              >
                {t('reveal.previousChain')}
              </Button>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold"
            >
              {view.revealIdx + 1 >= view.revealOrder.length ? t('reveal.finish') : t('reveal.nextChain')}
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs font-semibold text-white/50">
            {t('reveal.waitingLeader', { name: leaderName })}
          </p>
        )}
      </div>
    )
  }

  // ── Manche de contribution (écriture ou dessin) ──────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const totalMs = view.actionType === 'write' ? 60_000 : 80_000

  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('submittedCount', { count: view.submittedCount, total: view.totalToSubmit })}
          </span>
          <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
        </div>
        {view.phaseEndsAt !== null && (
          <PhaseCountdown
            variant="bar"
            endsAt={view.phaseEndsAt}
            total={totalMs}
            dangerMs={15_000}
            colorClassName="bg-teal-400"
            dangerClassName="bg-red-400"
          />
        )}
      </div>

      {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s */}
      {actionError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-100">
          {actionError}
        </div>
      )}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {view.haveISubmitted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
          <p className="text-sm font-semibold text-white/60">{t('waitingOthers')}</p>
        </div>
      ) : view.round === 0 ? (
        <div className="space-y-3">
          <p className="text-center text-lg font-black">{t('writeInitial')}</p>
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitText()
              }}
              placeholder={t('writePlaceholder')}
              disabled={busy}
              className="flex-1 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
            />
            <Button
              onClick={() => void submitText()}
              disabled={busy || !text.trim()}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : view.actionType === 'write' ? (
        <div className="space-y-3">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-white/40">
            {t('youReceived')}
          </p>
          {view.received?.type === 'draw' ? (
            <PartyCanvas strokes={view.received.strokes} readOnly />
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-lg font-bold">
              {view.received && view.received.type === 'text' ? view.received.text : ''}
            </p>
          )}
          <p className="text-center text-lg font-black">{t('guessInstruction')}</p>
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitText()
              }}
              placeholder={t('writePlaceholder')}
              disabled={busy}
              className="flex-1 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
            />
            <Button
              onClick={() => void submitText()}
              disabled={busy || !text.trim()}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-lg font-bold">
            {view.received?.type === 'text' ? view.received.text : ''}
          </p>
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-white/40">
            {t('drawInstruction')}
          </p>
          {/* Dessin 100 % LOCAL : personne ne le regarde en direct (maillon
              secret) — le dessin complet part en UNE action au SUBMIT. Le
              streaming trait par trait perdait des traits (verrou busy +
              conflits de version) → dessins amputés à l'étape suivante. */}
          <PartyCanvas
            strokes={myStrokes}
            readOnly={false}
            onStrokeComplete={(stroke: Stroke) => setMyStrokes((prev) => [...prev, stroke])}
            onClear={() => setMyStrokes([])}
          />
          <Button
            onClick={() => void sendAction({ action: 'submit', strokes: myStrokes })}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold"
          >
            {t('submitDrawing')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
              view.haveISubmitted && 'opacity-90',
              'border-white/10 bg-white/5 text-white/70',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="telephone-dessine" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
