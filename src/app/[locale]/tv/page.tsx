"use client"

import { useState, type FormEvent } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { BrandMark } from '@/components/brand/BrandLogo'

const CODE_RE = /^[A-Z0-9]{6}$/

/** Accueil TV : saisie du code de salle (télécommande-friendly) → écran de la salle. */
export default function TvHomePage() {
  const t = useTranslations('tv')
  const router = useRouter()
  const [code, setCode] = useState('')
  const valid = CODE_RE.test(code)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) router.push(`/tv/${code}`)
  }

  return (
    <div className="app-felt fixed inset-0 flex flex-col items-center justify-center gap-10 overflow-y-auto px-6 text-white">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-gold/40 bg-felt-deep p-3">
          <BrandMark className="h-full w-full" />
        </div>
        <h1 className="mt-4 font-display text-5xl font-bold">{t('brand')}</h1>
      </div>
      <form onSubmit={submit} className="flex w-full flex-col items-center gap-6">
        <label htmlFor="tv-code" className="text-3xl font-bold text-white/90">{t('enterCode')}</label>
        <input
          id="tv-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder={t('enterCodePlaceholder')}
          aria-describedby="tv-code-hint"
          className="w-full max-w-[34rem] rounded-3xl border-2 border-[#D8CCAE] bg-cream px-6 py-4 text-center font-mono text-6xl font-black tracking-[0.3em] text-[#24201A] outline-none placeholder:text-[#24201A]/40 focus:border-gold focus:ring-4 focus:ring-gold/50"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
        />
        <p id="tv-code-hint" className="text-xl text-white/80">{t('invalidCode')}</p>
        <button
          type="submit"
          disabled={!valid}
          className="rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-16 py-4 text-3xl font-black text-black shadow-lg transition-opacity focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80 disabled:opacity-40"
        >
          {t('show')}
        </button>
      </form>
    </div>
  )
}
