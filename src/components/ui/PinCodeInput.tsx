/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from 'react'
import { Delete, AlertCircle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PinCodeInputProps {
  onSubmit: (pin: string) => void
  error: string | null
}

const KEYS = ['1','2','3','4','5','6','7','8','9','C','0','⌫']

export function PinCodeInput({ onSubmit, error }: PinCodeInputProps) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (error) {
      setShake(true)
      setPin('')
      const t = setTimeout(() => setShake(false), 500)
      return () => clearTimeout(t)
    }
  }, [error])

  const handleKey = (key: string) => {
    if (key === 'C') { setPin(''); return }
    if (key === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length < 6) setPin(p => p + key)
  }

  const handleSubmit = () => {
    if (pin.length === 6) onSubmit(pin)
  }

  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-amber-500/15 shadow-[0_0_32px_rgba(245,158,11,0.2)]">
          <Lock className="h-7 w-7 text-amber-300" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Accès sécurisé</h1>
          <p className="mt-1 text-sm text-white/50">Entrez votre code à 6 chiffres</p>
        </div>
      </div>

      {/* Indicateur PIN */}
      <div
        className={cn(
          'mb-6 flex gap-3',
          shake && 'animate-[shake_0.4s_ease-in-out]'
        )}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-3 w-3 rounded-full border-2 transition-all duration-150',
              pin.length > i
                ? 'border-amber-400 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                : 'border-white/20 bg-transparent'
            )}
          />
        ))}
      </div>

      {/* Erreur */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Clavier */}
      <div className="mb-6 grid w-full max-w-xs grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            className={cn(
              'flex h-14 items-center justify-center rounded-2xl border text-lg font-semibold transition-all duration-100',
              'border-white/10 bg-white/[0.05] text-white',
              'hover:border-white/20 hover:bg-white/10 active:scale-95',
              key === 'C' && 'text-base text-white/50',
              key === '⌫' && 'text-base'
            )}
          >
            {key === '⌫' ? <Delete className="h-5 w-5" /> : key}
          </button>
        ))}
      </div>

      {/* Valider */}
      <button
        onClick={handleSubmit}
        disabled={pin.length !== 6}
        className={cn(
          'h-12 w-full max-w-xs rounded-2xl font-semibold transition-all duration-200',
          pin.length === 6
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_4px_20px_rgba(245,158,11,0.35)] hover:from-amber-400 hover:to-orange-400 active:scale-[0.98]'
            : 'cursor-not-allowed bg-white/[0.05] text-white/30'
        )}
      >
        Valider
      </button>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
