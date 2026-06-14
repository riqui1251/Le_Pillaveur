"use client"

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const t = useTranslations('account.reset')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError(t('invalidLink'))
      return
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('passwordRules'))
      return
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tErrors('generic'))
      setSuccess(true)
      setTimeout(() => router.push('/compte?reset=success'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors('generic'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-red-300">{t('invalidLink')}</p>
        <Button asChild variant="outline" className="border-white/15 text-white">
          <Link href="/compte">{t('backToLogin')}</Link>
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-emerald-300">{t('success')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/60">{t('newPassword')}</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordPlaceholder')}
          required
          minLength={8}
          className="border-white/10 bg-white/[0.05] text-white"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/60">{t('confirmPassword')}</label>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          required
          minLength={8}
          className="border-white/10 bg-white/[0.05] text-white"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
      )}
      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-amber-500 text-black hover:bg-amber-400"
      >
        {loading ? t('updating') : t('submit')}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  const t = useTranslations('account.reset')
  const tAccount = useTranslations('account')
  const tCommon = useTranslations('common')

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">
            {tAccount('brand')}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">{t('title')}</h1>
          <p className="mt-2 text-sm text-white/50">{t('subtitle')}</p>
        </div>

        <Suspense
          fallback={
            <div className="flex justify-center py-12" aria-label={tCommon('loading')}>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}
