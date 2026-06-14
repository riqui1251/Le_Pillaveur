"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AGE_VERIFIED_COOKIE } from '@/lib/auth-cookies'

function hasAgeCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${AGE_VERIFIED_COOKIE}=`))
}

export function AgeGate() {
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setVisible(!hasAgeCookie())
  }, [])

  const handleAccept = useCallback(async () => {
    if (!checked) return
    setLoading(true)
    try {
      const res = await fetch('/api/legal/accept-age', { method: 'POST', credentials: 'include' })
      if (res.ok) {
        setVisible(false)
      }
    } finally {
      setLoading(false)
    }
  }, [checked])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0b12] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <h2 id="age-gate-title" className="text-lg font-semibold text-white">
            Accès réservé aux majeurs
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-white/60">
          Le Pillaveur est un outil de divertissement festif. Les « gorgées » sont des unités
          ludiques abstraites — elles ne constituent pas une obligation de consommer de l&apos;alcool.
          Ce service ne vend ni ne distribue de boissons.
        </p>

        <p className="mt-3 text-sm text-white/50">
          <strong className="text-white/70">L&apos;abus d&apos;alcool est dangereux pour la santé.</strong>{' '}
          À consommer avec modération.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
          />
          <span className="text-sm text-white/70">
            Je certifie avoir <strong className="text-white">18 ans révolus</strong> et j&apos;accepte les{' '}
            <Link href="/legal/cgu" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              CGU
            </Link>{' '}
            et la{' '}
            <Link href="/legal/confidentialite" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {loading ? 'Validation…' : 'Entrer sur le site'}
          </Button>
          <p className="text-center text-xs text-white/35">
            Si vous avez moins de 18 ans, vous devez quitter ce site.
          </p>
        </div>
      </div>
    </div>
  )
}
