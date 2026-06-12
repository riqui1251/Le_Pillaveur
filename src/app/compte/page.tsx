"use client"

import { useAuth } from '@/hooks/useAuth'
import { AuthForm } from '@/components/auth/AuthForm'
import { PlayModeSelector } from '@/components/auth/PlayModeSelector'
import { AccountInfo } from '@/components/ui/AccountInfo'

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

      <div className="relative container mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-16 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          </div>
        ) : !user ? (
          <AuthForm />
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-white/70">Mode de jeu</h2>
              <PlayModeSelector />
            </section>
            <AccountInfo />
          </>
        )}
      </div>
    </main>
  )
}
