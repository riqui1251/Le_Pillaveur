"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Check, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameIconById } from '@/components/hub/GameIconById'
import { BRIEFING_TIMEOUT_MS } from '@/lib/online/briefing'
import type { RoomDto } from '@/lib/online-room'
import type { TutorialStep } from './GameTutorialModal'
import { cn } from '@/lib/utils'

/**
 * Briefing tuto synchronisé (salon en statut 'briefing') : chaque joueur lit
 * les règles à son rythme puis se déclare prêt — la partie ne démarre que
 * quand TOUT LE MONDE a fini (ou au timeout de 90 s, filet anti-AFK envoyé
 * par tous les clients, même principe que le tick `advance` des phases).
 */
export function GameBriefing({ room, gameId }: { room: RoomDto; gameId: string }) {
  const { user } = useAuth()
  const { refreshRoom } = useOnlineRoom()
  const t = useTranslations('briefing')
  const tTutorial = useTranslations(`games.${gameId}.tutorial`)
  let steps: TutorialStep[] = []
  try {
    const raw = tTutorial.raw('steps') as TutorialStep[] | undefined
    if (Array.isArray(raw)) steps = raw
  } catch {
    // Jeu sans tuto : on passe directement au bouton « prêt ».
  }
  const [idx, setIdx] = useState(0)
  const [sending, setSending] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const timeoutSentRef = useRef(false)

  const acks = room.briefing?.acks ?? []
  const startedAt = room.briefing?.startedAt ?? Date.now()
  const hasAcked = Boolean(user && acks.includes(user.id))
  const deadline = startedAt + BRIEFING_TIMEOUT_MS
  const timeLeftMs = Math.max(0, deadline - clock)

  const postAck = useCallback(
    async (timeout: boolean) => {
      if (sending) return
      setSending(true)
      try {
        await fetch(`/api/online/rooms/${room.id}/briefing-ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(timeout ? { timeout: true } : {}),
        })
        await refreshRoom(room.id)
      } finally {
        setSending(false)
      }
    },
    [room.id, refreshRoom, sending]
  )

  // Barre de temps + tick timeout (tous les clients l'envoient, le serveur
  // vérifie l'échéance — la partie démarre même si un joueur reste AFK).
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const delay = Math.max(250, deadline - Date.now() + 300 + Math.random() * 700)
    const timer = setTimeout(() => {
      if (timeoutSentRef.current) return
      timeoutSentRef.current = true
      void fetch(`/api/online/rooms/${room.id}/briefing-ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timeout: true }),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [deadline, room.id])

  const step = steps[idx]
  const isLast = idx >= steps.length - 1

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-amber-400/25 bg-white/5 p-6 shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/30">
            <GameIconById id={gameId} className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              <BookOpen className="h-3.5 w-3.5" /> {t('title')}
            </p>
            <p className="text-sm text-white/60">{t('subtitle')}</p>
          </div>
        </div>

        {/* Barre des 90 s avant démarrage automatique */}
        <div className="mb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 15_000 ? 'bg-red-400' : 'bg-amber-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / BRIEFING_TIMEOUT_MS) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-white/40">
            {t('autoStart', { s: Math.ceil(timeLeftMs / 1000) })}
          </p>
        </div>

        {hasAcked ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-300" />
            <p className="mt-2 text-sm font-bold text-emerald-100">{t('youAreReady')}</p>
          </div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className="min-h-[7rem] rounded-2xl border border-white/10 bg-gray-900/60 p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                  {t('stepCounter', { n: idx + 1, total: steps.length })}
                </p>
                <h3 className="mt-1 text-base font-black text-white">{step?.title}</h3>
                <p className="mt-1.5 text-sm leading-snug text-white/70">{step?.body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    i === idx ? 'bg-amber-400' : 'bg-white/15'
                  )}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {idx > 0 && (
                <Button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  variant="outline"
                  className="rounded-2xl border-white/15 bg-white/5 px-3 py-5 text-white/70 hover:bg-white/10"
                  aria-label={t('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              {isLast ? (
                <Button
                  onClick={() => void postAck(false)}
                  disabled={sending}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 py-5 text-base font-bold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500"
                >
                  <Check className="mr-2 h-5 w-5" /> {t('ready')}
                </Button>
              ) : (
                <Button
                  onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold text-white shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-500"
                >
                  {t('next')} <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              )}
            </div>

            {!isLast && (
              <button
                onClick={() => void postAck(false)}
                disabled={sending}
                className="mt-2 w-full rounded-xl py-2 text-center text-xs font-semibold text-white/45 transition-colors hover:text-white/70"
              >
                {t('skip')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Qui a fini de lire */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur-md">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
          <Users className="h-3.5 w-3.5" />
          {t('waitingCount', { n: acks.length, total: room.members.length })}
        </p>
        <ul className="space-y-1.5">
          {room.members.map((m) => {
            const ready = acks.includes(m.userId)
            return (
              <li
                key={m.userId}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  ready ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-white/8 bg-white/4'
                )}
              >
                <span aria-hidden>{m.preferences?.icon ?? '👤'}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-white/85">
                  {m.displayName}
                  {m.isSelf && <span className="text-white/40"> {t('you')}</span>}
                </span>
                {ready ? (
                  <span className="shrink-0 text-[10px] font-bold text-emerald-300">✓ {t('done')}</span>
                ) : (
                  <span className="shrink-0 text-[10px] text-white/35">{t('reading')}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
