"use client"

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('Lien invalide ou expiré.')
      return
    }
    if (password.length < 8) {
      setError('Mot de passe : 8 caractères minimum.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
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
      if (!res.ok) throw new Error(data.error ?? 'Erreur')
      setSuccess(true)
      setTimeout(() => router.push('/compte?reset=success'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-red-300">Lien invalide ou expiré.</p>
        <Button asChild variant="outline" className="border-white/15 text-white">
          <Link href="/compte">Retour à la connexion</Link>
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-emerald-300">Mot de passe mis à jour ! Redirection…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/60">Nouveau mot de passe</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 caractères minimum"
          required
          minLength={8}
          className="border-white/10 bg-white/[0.05] text-white"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/60">Confirmer le mot de passe</label>
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
        {loading ? 'Mise à jour…' : 'Réinitialiser le mot de passe'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-md px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">
            Le Pillaveur
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="mt-2 text-sm text-white/50">
            Choisissez un mot de passe sécurisé pour votre compte.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex justify-center py-12">
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
