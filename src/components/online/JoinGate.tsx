"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { validateAccountDisplayName, nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'

/**
 * Porte d'entrée après scan d'un QR de table (?join=CODE) pour un visiteur
 * SANS session : jouer tout de suite avec un pseudo d'invité (compte
 * temporaire, purgé après la soirée) ou se connecter à un compte existant.
 * Dans les deux cas, le code reste « sous le coude » (localStorage) et le hub
 * rejoint la table automatiquement dès que la session existe — pas besoin de
 * re-scanner le QR.
 */
export function JoinGate({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const t = useTranslations('joinGate')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const { refresh } = useAuth()

  const [pseudo, setPseudo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGuest = async (e: React.FormEvent) => {
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
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName: trimmed, locale }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? t('error'))
        return
      }
      // La session invité existe : le hub consomme le code en attente et
      // rejoint la table tout seul (même mécanique qu'après une inscription).
      await refresh()
    } catch {
      setError(t('error'))
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = () => {
    router.push(`/compte?redirect=${encodeURIComponent(`/jeux?join=${code}`)}`)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gold/25 bg-felt-deep p-6 shadow-2xl">
        <p className="text-center font-display text-xl font-bold text-cream">{t('title')}</p>
        <p className="mx-auto mt-2 w-fit rounded-xl border border-[#D8CCAE] bg-cream px-4 py-1.5 font-mono text-2xl font-black tracking-[0.3em] text-[#24201A]">
          {code}
        </p>
        <p className="mt-3 text-center text-sm leading-relaxed text-white/60">{t('subtitle')}</p>

        <form onSubmit={handleGuest} className="mt-5 space-y-3">
          <Input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder={t('pseudoPlaceholder')}
            maxLength={30}
            required
            autoFocus
            className="border-white/10 bg-white/[0.05] text-center text-white"
          />
          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <Button
            type="submit"
            disabled={loading || pseudo.trim().length === 0}
            className="w-full bg-amber-500 text-black hover:bg-amber-400"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {loading ? tCommon('loading') : t('guestCta')}
          </Button>
          <p className="text-center text-[11px] leading-snug text-white/40">{t('guestHint')}</p>
        </form>

        <div className="mt-4 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-wide text-white/35">{t('or')}</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleLogin}
          className="mt-4 w-full border-white/15 bg-transparent text-white/80 hover:bg-white/[0.06] hover:text-white"
        >
          <LogIn className="mr-2 h-4 w-4" />
          {t('loginCta')}
        </Button>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full text-center text-xs text-white/35 underline underline-offset-2 hover:text-white/60"
        >
          {t('dismiss')}
        </button>
      </div>
    </div>
  )
}
