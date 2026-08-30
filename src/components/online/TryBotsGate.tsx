"use client"

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Bot, LogIn, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { GAMES } from '@/lib/games'
import { validateAccountDisplayName, nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'

/**
 * « Essayer avec des bots » — le chemin le plus court entre un visiteur
 * froid (SEO, page règles, vitrine d'un jeu) et une vraie partie :
 * pseudo → compte invité → table privée créée avec les bots qui manquent →
 * lobby, prêt à lancer. Aucune inscription.
 *
 * Réservé aux jeux botsFillable ; sinon seul le bouton connexion s'affiche.
 * Navigation DOCUMENT en sortie (routeur vierge + session fraîche visible
 * du middleware — même raison que le fix d'onboarding d'AuthForm).
 */
export function TryBotsGate({
  gameId,
  accentClassName,
}: {
  gameId: string
  /** Classes du bouton principal (les pages jeux gardent leur dégradé). */
  accentClassName?: string
}) {
  const t = useTranslations('tryBots')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const { user } = useAuth()

  const game = GAMES.find((g) => g.id === gameId)
  const [open, setOpen] = useState(false)
  const [pseudo, setPseudo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!game) return null
  const canBots = Boolean(game.botsFillable && game.onlineReady && !game.hidden)
  const loginHref = `/compte?redirect=${encodeURIComponent(`/games/${gameId}`)}`

  // Déjà une session (compte ou invité) : direction le jeu, tout simplement.
  if (user) {
    return (
      <Button
        asChild
        className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
      >
        <Link href={game.path}>
          <Play className="mr-2 h-4 w-4" />
          {t('play')}
        </Link>
      </Button>
    )
  }

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = pseudo.trim()
    const validation = validateAccountDisplayName(trimmed)
    if (!validation.ok) {
      void reportProfanityIfNeeded(trimmed, validation.reason, 'guest')
      setError(tCommon(`nameValidation.${nameValidationI18nKey(validation.reason)}`))
      return
    }
    setLoading(true)
    try {
      // 1. Compte invité (session posée, playMode online).
      const guestRes = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName: trimmed, locale }),
      })
      const guestData = await guestRes.json().catch(() => null)
      if (!guestRes.ok) {
        setError(guestData?.error ?? t('error'))
        return
      }
      // 2. Table privée sur CE jeu.
      const roomRes = await fetch('/api/online/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameId, visibility: 'private' }),
      })
      const roomData = await roomRes.json().catch(() => null)
      if (!roomRes.ok || !roomData?.room?.id) {
        setError(roomData?.error ?? t('error'))
        return
      }
      // 3. Les bots qui manquent pour pouvoir lancer seul (best-effort :
      //    le callout du lobby permet de compléter en un clic au besoin).
      const missing = Math.max(0, (game.minPlayers ?? 2) - 1)
      if (missing > 0) {
        await fetch(`/api/online/rooms/${roomData.room.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ botsCount: missing }),
        }).catch(() => null)
      }
      // 4. Direction le lobby, session fraîche.
      window.location.assign(`/${locale}/games/${gameId}`)
    } catch {
      setError(t('error'))
      setLoading(false)
    }
  }

  if (!canBots) {
    return (
      <Button asChild className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}>
        <Link href={loginHref}>
          <LogIn className="mr-2 h-4 w-4" />
          {t('loginCta')}
        </Link>
      </Button>
    )
  }

  if (!open) {
    return (
      <div className="space-y-2.5">
        <Button
          onClick={() => setOpen(true)}
          className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
        >
          <Bot className="mr-2 h-4 w-4" />
          {t('cta')}
        </Button>
        <p className="text-center text-[11px] leading-snug text-white/40">{t('hint')}</p>
        <Button
          asChild
          variant="outline"
          className="w-full border-white/15 bg-transparent text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
        >
          <Link href={loginHref}>
            <LogIn className="mr-2 h-4 w-4" />
            {t('loginCta')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={start} className="space-y-3">
      <Input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value)}
        placeholder={t('pseudoPlaceholder')}
        maxLength={30}
        required
        autoFocus
        className="border-white/10 bg-white/[0.05] text-center text-white"
      />
      {error && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>}
      <Button
        type="submit"
        disabled={loading || pseudo.trim().length === 0}
        className={accentClassName ?? 'w-full rounded-2xl bg-amber-500 py-5 text-base font-bold text-black hover:bg-amber-400'}
      >
        <Bot className="mr-2 h-4 w-4" />
        {loading ? tCommon('loading') : t('go')}
      </Button>
      <p className="text-center text-[11px] leading-snug text-white/40">{t('guestHint')}</p>
    </form>
  )
}
