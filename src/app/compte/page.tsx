"use client"

import { useAuth } from '@/hooks/useAuth'
import { PinCodeInput } from '@/components/ui/PinCodeInput'
import { AccountInfo } from '@/components/ui/AccountInfo'

export default function AccountPage() {
  const { isAuthenticated, setPinAttempt, verifyPin, logout, error } = useAuth()

  const handlePinSubmit = (pin: string) => {
    setPinAttempt(pin)
    verifyPin()
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      {/* Halos */}
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

      <div className="relative container mx-auto max-w-2xl px-4 pb-16 pt-16 sm:px-6">
        {!isAuthenticated ? (
          <PinCodeInput onSubmit={handlePinSubmit} error={error} />
        ) : (
          <AccountInfo onLogout={logout} />
        )}
      </div>
    </main>
  )
}
