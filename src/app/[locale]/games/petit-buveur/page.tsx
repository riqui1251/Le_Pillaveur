"use client"

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import { Home, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { motion, AnimatePresence } from 'framer-motion'
import { getSafeStorage } from '@/lib/storage'
import type { Difficulty } from './case-config'
import {
  clearGameSession,
  markGameSessionActive,
  readGameSession,
  shouldResumeFromSave,
} from '@/lib/game-session'

const GAME_ID = 'petit-buveur'
const SAVE_KEY = 'petit-buveur-save'

const difficultyKeys: Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

const difficultyActive: Record<Difficulty, string> = {
  facile: 'from-emerald-500 to-green-600 shadow-emerald-500/30',
  normal: 'from-amber-500 to-yellow-600 shadow-amber-500/30',
  difficile: 'from-orange-500 to-red-600 shadow-orange-500/30',
  extreme: 'from-red-600 to-rose-700 shadow-red-500/30',
}

export default function PetitBuveurPage() {
  const t = useTranslations('games.petit-buveur.page')
  const [gameStarted, setGameStarted] = useState(false)
  const [initialMode, setInitialMode] = useState<'new' | 'resume'>('new')
  const [sessionChecked, setSessionChecked] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [showRules, setShowRules] = useState(false)
  const [hasActiveSave, setHasActiveSave] = useState(false)
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const rules = t.raw('rules') as string[]

  useEffect(() => {
    const storage = getSafeStorage()
    setHasActiveSave(!!storage?.getItem(SAVE_KEY))
  }, [gameStarted])

  // Restaurer la partie après changement de langue (router.replace remonte la page)
  useEffect(() => {
    const session = readGameSession(GAME_ID)
    if (session?.active) {
      if (session.difficulty && difficultyKeys.includes(session.difficulty as Difficulty)) {
        setDifficulty(session.difficulty as Difficulty)
      }

      const mode = shouldResumeFromSave(SAVE_KEY) ? 'resume' : session.mode
      setInitialMode(mode)
      setGameStarted(true)
    }
    setSessionChecked(true)
  }, [])

  useEffect(() => {
    if (!gameStarted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [gameStarted])

  const handleGameEnd = () => {
    clearGameSession(GAME_ID)
    setGameStarted(false)
    setInitialMode('new')
  }

  const launchGame = (mode: 'new' | 'resume') => {
    markGameSessionActive(GAME_ID, { mode, difficulty })
    setInitialMode(mode)
    setGameStarted(true)
  }

  if (!sessionChecked) {
    return <div className="min-h-screen bg-gray-950" aria-hidden />
  }

  if (gameStarted) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-hidden bg-gray-950 sm:top-[3.75rem]">
        <Game
          players={selectedPlayers}
          onGameEnd={handleGameEnd}
          difficulty={difficulty}
          initialMode={initialMode}
        />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 py-8 pb-12">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/jeux"
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
          >
            <Home className="h-4 w-4" />
            {t('back')}
          </Link>
          <span className="text-xs font-medium text-white/30">{t('badge')}</span>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-4xl shadow-lg shadow-amber-500/30">
            🍺
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-white/50">{t('tagline')}</p>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            {t('selectedPlayers')}
          </p>
          {selectedPlayers.length === 0 ? (
            <p className="text-center text-sm text-white/35">{t('noPlayers')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map(p => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium"
                >
                  <span>{p.preferences?.icon ?? '👤'}</span>
                  <span>{p.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            {t('difficulty')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {difficultyKeys.map(value => (
              <button
                key={value}
                onClick={() => setDifficulty(value)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  difficulty === value
                    ? `border-transparent bg-gradient-to-r ${difficultyActive[value]} text-white shadow-lg`
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="block text-sm font-bold">{t(`difficulties.${value}.label`)}</span>
                <span className={`mt-0.5 block text-xs ${difficulty === value ? 'text-white/80' : 'text-white/35'}`}>
                  {t(`difficulties.${value}.desc`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
          <button
            onClick={() => setShowRules(v => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
            aria-expanded={showRules}
          >
            <span>{t('rulesTitle')}</span>
            {showRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 border-t border-white/10 px-4 py-3 text-sm text-white/55">
                  {rules.map((rule, i) => (
                    <p key={i} className={i === rules.length - 1 ? 'pt-1 text-xs text-white/30' : undefined}>
                      {rule}
                    </p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {selectedPlayers.length < 2 && (
          <p className="mb-3 text-center text-sm text-white/40">{t('needPlayers')}</p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => launchGame('new')}
            disabled={selectedPlayers.length < 2}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('start')}
          </button>
          {hasActiveSave && (
            <button
              onClick={() => launchGame('resume')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              {t('resume')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
