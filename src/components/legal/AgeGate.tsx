"use client"

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { AlertTriangle } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandLogo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AGE_VERIFIED_COOKIE, ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'

function hasCookie(name: string): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${name}=`))
}

export function AgeGate() {
  const t = useTranslations('legal.ageGate')
  const tNav = useTranslations('nav.legal')
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const [analyticsChecked, setAnalyticsChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Se réaffiche aussi pour les visiteurs d'avant le consentement analytics :
    // tant qu'aucun choix ('1' ou '0') n'est enregistré, la question se pose.
    setVisible(!hasCookie(AGE_VERIFIED_COOKIE) || !hasCookie(ANALYTICS_CONSENT_COOKIE))
  }, [])

  const handleAccept = useCallback(async () => {
    if (!checked) return
    setLoading(true)
    try {
      const res = await fetch('/api/legal/accept-age', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics: analyticsChecked }),
      })
      if (res.ok) {
        setVisible(false)
      }
    } finally {
      setLoading(false)
    }
  }, [checked, analyticsChecked])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        className="my-auto w-full max-w-md rounded-3xl border border-gold/30 bg-felt-deep p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
      >
        {/* L'entrée de la maison, pas un portique de sécurité : la marque et
            la promesse d'abord, les formalités ensuite. */}
        <div className="mb-4 text-center">
          <BrandMark className="mx-auto h-10 w-10 text-gold" />
          <p className="mt-2 font-display text-2xl font-bold text-cream">Le Pillaveur</p>
          <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-gold/80">
            ✦ {t('tagline')} ✦
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{t('promise')}</p>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <h2 id="age-gate-title" className="text-sm font-semibold text-amber-100">
            {t('title')}
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-white/55">{t('body1')}</p>

        <p className="mt-2 text-xs text-white/50">
          <strong className="text-white/70">{t('healthWarning')}</strong>{' '}
          {t('moderation')}
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
          />
          <span className="text-sm text-white/70">
            {t('checkboxPrefix')}{' '}
            <Link href="/legal/cgu" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              {tNav('cgu')}
            </Link>{' '}
            {t('checkboxAnd')}{' '}
            <Link href="/legal/confidentialite" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              {tNav('confidentialite')}
            </Link>
            {t('checkboxSuffix')}
          </span>
        </label>

        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Checkbox
            checked={analyticsChecked}
            onCheckedChange={(v) => setAnalyticsChecked(v === true)}
            className="mt-0.5 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
          />
          <span className="text-sm text-white/70">
            {t('analyticsLabel')}{' '}
            <span className="text-white/40">{t('analyticsHint')}</span>
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {loading ? t('validating') : t('enter')}
          </Button>
          <p className="text-center text-xs text-white/35">{t('minorWarning')}</p>
        </div>
      </div>
    </div>
  )
}
