"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/AuthProvider'
import { LogIn, UserPlus } from 'lucide-react'

export function AuthForm() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const err = mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName)
      if (err) setError(err)
    } finally {
      setLoading(false)
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
            : 'Un compte pour synchroniser vos joueurs et jouer en ligne.'}
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
          <label className="mb-1.5 block text-xs font-medium text-white/60">Mot de passe</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? '8 caractères minimum' : '••••••••'}
            required
            minLength={mode === 'register' ? 8 : 1}
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
          {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </Button>
      </form>
    </div>
  )
}
