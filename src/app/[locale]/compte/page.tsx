"use client"

import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative container mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {loading ? (
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
