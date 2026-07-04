"use client"

import { useState, type FormEvent } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

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
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-10 bg-[#0a0812] px-6 text-white">
      <div className="text-center">
        <p className="text-6xl" aria-hidden>🍺</p>
        <h1 className="mt-2 text-3xl font-black">{t('brand')}</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col items-center gap-5">
        <label htmlFor="tv-code" className="text-lg text-white/60">{t('enterCode')}</label>
        <input
          id="tv-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder={t('enterCodePlaceholder')}
          className="w-80 rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-center font-mono text-5xl font-black tracking-[0.4em] outline-none focus:border-violet-400/60"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!valid}
          className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 px-12 py-3 text-xl font-bold text-white transition-opacity disabled:opacity-40"
        >
          {t('show')}
        </button>
      </form>
    </div>
  )
}
