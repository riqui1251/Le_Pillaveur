"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'
import { PhaseCountdown } from './PhaseCountdown'

/**
 * Cadence du sondage. Il tournait à 5 s pour une seule raison : le serveur ne
 * renvoie que les millisecondes restantes, et rien ne les faisait défiler
 * entre deux réponses — le rebours affiché n'avançait qu'au rythme des
 * requêtes. Il est maintenant tenu en local (échéance mémorisée, secondes
 * défilées par PhaseCountdown — une feuille qui se réveille seule à chaque
 * changement de seconde, sans re-rendre la bannière) : le serveur n'est plus
 * relu que pour savoir si la place existe encore, et 15 s suffisent sur une
 * grâce de 3 min (ONLINE_REPLACE_GRACE_MS). Trois fois moins de requêtes, sur
 * une page « jeux » que tous les joueurs en ligne gardent ouverte.
 */
const POLL_MS = 15_000

type Rejoinable = {
  roomId: string
  code: string
  gameId: string
  /** Échéance du remplacement, sur l'horloge locale (calée à la réception). */
  deadlineAt: number
}

interface RejoinBannerProps {
  onJoin: (roomId: string) => void
  joining?: boolean
}

/** Bannière « partie en cours » : le joueur parti peut reprendre sa place avant d'être remplacé par un bot. */
export function RejoinBanner({ onJoin, joining }: RejoinBannerProps) {
  const { user } = useAuth()
  const t = useTranslations('onlineLobby.rejoin')
  // Le sondage ne dépend que de l'identité et du mode de jeu : l'objet `user`
  // change de référence à chaque rafraîchissement de session, pas ces deux-là.
  const userId = user?.id
  const playMode = user?.playMode
  const visible = usePagePresence()
  const [rejoinable, setRejoinable] = useState<Rejoinable | null>(null)
  const inFlightRef = useRef(false)

  const fetchRejoinable = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/online/rooms/rejoinable', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const next = data?.rejoinable
        const receivedAt = Date.now()
        setRejoinable(
          next
            ? {
                roomId: next.roomId,
                code: next.code,
                gameId: next.gameId,
                deadlineAt: receivedAt + Math.max(0, Number(next.graceLeftMs) || 0),
              }
            : null
        )
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!userId || playMode !== 'online') {
      setRejoinable(null)
      return
    }
    // Onglet caché : sondage suspendu, repris avec un rafraîchissement
    // immédiat au retour au premier plan (voir usePagePresence).
    if (!visible) return

    void fetchRejoinable()
    const timer = setInterval(fetchRejoinable, POLL_MS)
    return () => clearInterval(timer)
  }, [userId, playMode, visible, fetchRejoinable])

  if (!rejoinable) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-emerald-500/20">
          <GameIconById id={rejoinable.gameId} className="h-4 w-4 text-emerald-200" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-100">{t('title')}</p>
          {/* Rebours local : la feuille se réveille seule au changement de
              seconde et s'arrête à l'échéance — c'est le serveur qui remplace,
              à son rythme, et le prochain sondage retirera la bannière. */}
          <p className="text-xs text-emerald-200/70">
            <PhaseCountdown endsAt={rejoinable.deadlineAt}>
              {({ seconds }) => t('botCountdown', { seconds })}
            </PhaseCountdown>
          </p>
        </div>
      </div>
      <Button
        size="sm"
        disabled={joining}
        onClick={() => onJoin(rejoinable.roomId)}
        className="h-11 shrink-0 rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-500"
      >
        <Play className="mr-1 h-3.5 w-3.5" />
        {t('cta')}
      </Button>
    </div>
  )
}
