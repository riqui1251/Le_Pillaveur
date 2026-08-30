"use client"

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AGE_VERIFIED_COOKIE, ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${name}=`))
}

/**
 * Portail d'entrée en deux niveaux, volontairement discret :
 *  - 'gate' (première visite, pas de cookie 18+) : petite carte bloquante —
 *    le clic sur « J'ai 18 ans ou plus — Entrer » vaut certification, la
 *    case statistiques reste optionnelle et décochée (opt-in RGPD) ;
 *  - 'cookies-only' (âge déjà validé, choix analytics absent — visiteurs
 *    d'avant le consentement) : simple bandeau bas de page Accepter/Refuser,
 *    au même niveau visuel (pas de dark pattern), le site reste utilisable.
 * Les pages /legal/* sont exemptées : les CGU et la politique de
 * confidentialité doivent être lisibles AVANT d'accepter.
 */
type GateMode = 'gate' | 'cookies-only'

export function AgeGate() {
  const t = useTranslations('legal.ageGate')
  const tNav = useTranslations('nav.legal')
  const pathname = usePathname()
  const [mode, setMode] = useState<GateMode | null>(null)
  const [analyticsChecked, setAnalyticsChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hasCookie(AGE_VERIFIED_COOKIE)) setMode('gate')
    else if (!hasCookie(ANALYTICS_CONSENT_COOKIE)) setMode('cookies-only')
    else setMode(null)
  }, [])

  const submit = useCallback(async (analytics: boolean) => {
    setLoading(true)
    try {
      const res = await fetch('/api/legal/accept-age', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics }),
      })
      if (res.ok) {
        setMode(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Le portail bloquant ne s'affiche PAS sur les pages de LECTURE (landing,
  // règles, légal) : un visiteur SEO peut lire librement, la certification
  // 18+ arrive au moment de JOUER (hub, pages jeux). Le bandeau cookies
  // discret, lui, reste possible partout.
  const readingPage =
    pathname === '/' || pathname.startsWith('/legal') || pathname.startsWith('/regles')
  if (!mode || (mode === 'gate' && readingPage)) return null
  if (mode === 'cookies-only' && pathname.startsWith('/legal')) return null

  if (mode === 'cookies-only') {
    return (
      <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-gold/25 bg-felt-deep/95 p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-sm">
        <p className="text-xs leading-relaxed text-white/70">{t('cookiesBanner')}</p>
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => void submit(true)}
            disabled={loading}
            className="h-8 flex-1 bg-amber-500 text-xs font-semibold text-black hover:bg-amber-400"
          >
            {t('accept')}
          </Button>
          <Button
            onClick={() => void submit(false)}
            disabled={loading}
            variant="outline"
            className="h-8 flex-1 border-white/20 bg-transparent text-xs text-white/70 hover:bg-white/10"
          >
            {t('refuse')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        className="my-auto w-full max-w-sm rounded-2xl border border-gold/30 bg-felt-deep p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
      >
        <h2 id="age-gate-title" className="text-center font-display text-lg font-bold text-cream">
          {t('title')}
        </h2>
        <p className="mt-2 text-center text-xs leading-relaxed text-white/55">
          <strong className="text-white/75">{t('healthWarning')}</strong> {t('moderation')}
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <Checkbox
            checked={analyticsChecked}
            onCheckedChange={(v) => setAnalyticsChecked(v === true)}
            className="border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
          />
          <span className="text-xs text-white/60">{t('analyticsLabel')}</span>
        </label>

        <Button
          onClick={() => void submit(analyticsChecked)}
          disabled={loading}
          className="mt-4 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400"
        >
          {loading ? t('validating') : t('enterAdult')}
        </Button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
          {t('termsPrefix')}{' '}
          <Link href="/legal/cgu" className="text-amber-400/90 underline underline-offset-2 hover:text-amber-300">
            {tNav('cgu')}
          </Link>{' '}
          {t('termsAnd')}
          {t('termsAnd').endsWith("'") ? '' : ' '}
          <Link href="/legal/confidentialite" className="text-amber-400/90 underline underline-offset-2 hover:text-amber-300">
            {tNav('confidentialite')}
          </Link>
          {t('termsSuffix')} {t('minorWarning')}
        </p>
      </div>
    </div>
  )
}
