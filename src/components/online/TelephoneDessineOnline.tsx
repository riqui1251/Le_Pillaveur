"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Send, Sparkles } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PartyCanvas, type Stroke } from './PartyCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial, type TutorialStep } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'

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

export function TelephoneDessineOnline() {
  const { user } = useAuth()
  const { room, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.telephone-dessine.game')
  const tTutorial = useTranslations('games.telephone-dessine.tutorial')
  const tutorialSteps = tTutorial.raw('steps') as TutorialStep[]
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [myStrokes, setMyStrokes] = useState<Stroke[]>([])

  const inGame = room?.gameId === 'telephone-dessine' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('telephone-dessine', inGame)
  const cosmetics = useMemberCosmetics(room)

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [view])

  useEffect(() => {
    setText('')
    setMyStrokes([])
  }, [view?.round])

  useEffect(() => {
    if (!view || !room || view.phase === 'finished' || view.phaseEndsAt === null) return
    const expectedVersion = room.stateVersion
    const delay = Math.max(250, view.phaseEndsAt - Date.now() + 300 + Math.random() * 700)
    const timer = setTimeout(() => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance', phaseKey: view.phaseKey, expectedVersion }),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [view, room])

  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (body: Record<string, unknown>) => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const pendingBots =
      view.phase === 'contributing' && view.players.some((p) => p.isBot && !view.haveISubmitted)
    const actorIsBot =
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (pendingBots || actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'reveal' ? 2500 : 3000)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send({ action: 'replace-left' })
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

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
  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
    } finally {
      setBusy(false)
    }
  }

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
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-teal-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-teal-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
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
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 15_000 ? 'bg-red-400' : 'bg-teal-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
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
          <PartyCanvas
            strokes={myStrokes}
            readOnly={false}
            onStrokeComplete={(stroke: Stroke) => {
              setMyStrokes((prev) => [...prev, stroke])
              void sendAction({ action: 'draw-stroke', stroke })
            }}
            onClear={() => {
              setMyStrokes([])
              void sendAction({ action: 'clear' })
            }}
          />
          <Button
            onClick={() => void sendAction({ action: 'submit' })}
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
            <span aria-hidden>{iconOf(p)}</span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal steps={tutorialSteps} onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
