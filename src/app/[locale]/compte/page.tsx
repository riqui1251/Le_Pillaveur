"use client"

import { Suspense, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { AuthForm } from '@/components/auth/AuthForm'
import { AccountInfo } from '@/components/ui/AccountInfo'

function LoadingSpinner() {
  const t = useTranslations('common')
  return (
    <div className="flex justify-center py-20" aria-label={t('loading')}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
    </div>
  )
}

export default function AccountPage() {
  const { user, loading } = useAuth()
  const locale = useLocale()

  // Un utilisateur DÉJÀ connecté qui arrive avec ?redirect= (posé par le
  // middleware quand la session n'était pas encore visible) est reconduit
  // vers sa destination — sans ça, chaque rechargement le laissait bloqué
  // sur son profil. Mêmes règles de validation que safeRedirect (AuthForm).
  const [forwarding, setForwarding] = useState(false)
  useEffect(() => {
    if (loading || !user) return
    const target = new URLSearchParams(window.location.search).get('redirect')
    if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/compte')) {
      return
    }
    setForwarding(true)
    window.location.replace(`/${locale}${target}`)
  }, [loading, user, locale])

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {loading || forwarding ? (
          <LoadingSpinner />
        ) : !user ? (
          <Suspense fallback={<LoadingSpinner />}>
            <AuthForm />
          </Suspense>
        ) : (
          <AccountInfo />
        )}
      </div>
    </main>
  )
}
