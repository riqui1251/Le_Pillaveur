"use client"

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/AuthProvider'
import { LogIn, UserPlus, Gamepad2 } from 'lucide-react'
import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function safeRedirect(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/joueurs'
  if (path.startsWith('/compte')) return '/joueurs'
  return path
}

export function AuthForm() {
  const { login, register } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = safeRedirect(searchParams.get('redirect'))

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState<string | null>(null)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && !acceptedTerms) {
      setError('Vous devez accepter les CGU et la politique de confidentialité.')
      return
    }
    setLoading(true)
    try {
      const err = mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName)
      if (err) {
        setError(err)
      } else {
        router.push(redirectTo)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLocalPlay = async () => {
    setLocalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/local-play', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('Impossible d\'activer le mode local')
      router.push(redirectTo)
    } catch {
      setError('Impossible d\'activer le mode local. Réessayez.')
    } finally {
      setLocalLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotMessage(null)
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erreur')
      }
      setForgotMessage(
        'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation dans quelques minutes.'
      )
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">
          Le Pillaveur
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {mode === 'login'
            ? 'Retrouvez vos joueurs sur tous vos appareils.'
            : 'Synchronisez votre liste de joueurs entre téléphone, tablette et ordinateur.'}
        </p>
      </div>

      <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(null) }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'login' ? 'bg-amber-500/20 text-amber-100' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <LogIn className="h-4 w-4" />
          Connexion
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(null) }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'register' ? 'bg-amber-500/20 text-amber-100' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Inscription
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
        {mode === 'register' && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">Pseudo</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre pseudo"
              maxLength={30}
              required
              className="border-white/10 bg-white/[0.05] text-white"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            required
            className="border-white/10 bg-white/[0.05] text-white"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-white/60">Mot de passe</label>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email)
                  setForgotOpen(true)
                  setForgotMessage(null)
                  setForgotError(null)
                }}
                className="text-xs text-amber-300/70 hover:text-amber-200"
              >
                Mot de passe oublié ?
              </button>
            )}
          </div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? 'Lettre + chiffre, 8 car. min.' : '••••••••'}
            required
            minLength={mode === 'register' ? 8 : 1}
            className="border-white/10 bg-white/[0.05] text-white"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {mode === 'register' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Checkbox
              checked={acceptedTerms}
              onCheckedChange={(v) => setAcceptedTerms(v === true)}
              className="mt-0.5 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
            />
            <span className="text-xs leading-relaxed text-white/60">
              J&apos;accepte les{' '}
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
        )}

        <Button
          type="submit"
          disabled={loading || (mode === 'register' && !acceptedTerms)}
          className="w-full bg-amber-500 text-black hover:bg-amber-400"
        >
          {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </Button>
      </form>

      <div className="space-y-3 text-center">
        <p className="text-xs text-white/35">
          Sans compte, vos joueurs restent enregistrés uniquement sur cet appareil.
        </p>
        <p className="text-xs text-white/30">
          En jouant en local, vous acceptez les{' '}
          <Link href="/legal/cgu" className="text-amber-400/80 underline underline-offset-2 hover:text-amber-300">
            CGU
          </Link>{' '}
          et la{' '}
          <Link href="/legal/confidentialite" className="text-amber-400/80 underline underline-offset-2 hover:text-amber-300">
            politique de confidentialité
          </Link>
          .
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={localLoading}
          onClick={handleLocalPlay}
          className="w-full border-white/15 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"
        >
          <Gamepad2 className="mr-2 h-4 w-4" />
          {localLoading ? 'Chargement…' : 'Jouer en local'}
        </Button>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="border-white/10 bg-[#0c0b12] text-white">
          <DialogHeader>
            <DialogTitle>Mot de passe oublié</DialogTitle>
            <DialogDescription className="text-white/50">
              Entrez votre email pour recevoir un lien de réinitialisation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <Input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              className="border-white/10 bg-white/[0.05] text-white"
            />
            {forgotError && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{forgotError}</p>
            )}
            {forgotMessage && (
              <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{forgotMessage}</p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={forgotLoading || Boolean(forgotMessage)}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                {forgotLoading ? 'Envoi…' : 'Envoyer le lien'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
