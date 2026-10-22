"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { RefreshCw } from 'lucide-react'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { getSafeStorage } from '@/lib/storage'
import type { Difficulty, PetitBuveurT } from './case-config'
import {
  clearGameSession,
  LOCAL_GAME_SAVE_TTL_MS,
  markGameSessionActive,
  readGameSession,
  shouldResumeFromSave,
} from '@/lib/game-session'
import { resolveAmbianceMode, withAmbiance } from './ambiance'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { OnlineGameStage } from '@/components/online/OnlineGameStage'
import { GameShowcase } from '@/components/online/GameShowcase'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'

// Les deux moteurs — le plateau local (le plus gros morceau du site, avec ses
// cases, sa pièce et ses dés) et sa version en ligne (lobby, briefing) — sont
// chargés À LA DEMANDE selon le mode : la page livrait les deux et n'en
// montrait qu'un. Pas de `ssr: false` : le serveur ne rend ni l'un ni l'autre
// (session inconnue, sauvegarde pas encore lue), et le même squelette — celui
// de `sessionChecked` — tient la place le temps que le morceau arrive.
const PetitBuveurOnline = dynamic(
  () => import('@/components/online/PetitBuveurOnline').then((m) => m.PetitBuveurOnline),
  { loading: () => <OnlineGameSkeleton gameId="petit-buveur" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="petit-buveur" />,
})

const GAME_ID = 'petit-buveur'
const SAVE_KEY = 'petit-buveur-save'

const difficultyKeys: Difficulty[] = ['facile', 'normal', 'difficile', 'extreme']

/**
 * La sauvegarde locale garde son propre horodatage : on ne propose de reprendre
 * que si la partie est récente, et on purge l'entrée périmée au passage.
 * Une partie d'il y a trois jours n'a plus d'intérêt.
 */
function hasFreshSave(): boolean {
  const storage = getSafeStorage()
  if (!storage) return false
  let raw: string | null = null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch {
    return false
  }
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { timestamp?: number; gameStarted?: boolean }
    const savedAt = typeof parsed?.timestamp === 'number' ? parsed.timestamp : 0
    if (Date.now() - savedAt <= LOCAL_GAME_SAVE_TTL_MS) return true
  } catch {
    // sauvegarde illisible : même traitement qu'une sauvegarde périmée
  }
  try {
    storage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
  return false
}

export default function PetitBuveurPage() {
  const baseT = useTranslations('games.petit-buveur.page') as unknown as PetitBuveurT
  const [gameStarted, setGameStarted] = useState(false)
  const [initialMode, setInitialMode] = useState<'new' | 'resume'>('new')
  const [sessionChecked, setSessionChecked] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [showRules, setShowRules] = useState(false)
  const [hasActiveSave, setHasActiveSave] = useState(false)
  const { user, loading } = useAuth()
  // Même règle que dans la partie : en Soft, règles et niveaux se lisent en
  // gages. L'ambiance vient de useAmbianceMode : sans compte (le cas d'une
  // table locale), le réglage de l'appareil comptait pour rien.
  const { mode: ambianceMode } = useAmbianceMode()
  const t = useMemo(
    () => withAmbiance(baseT, resolveAmbianceMode(ambianceMode)),
    [baseT, ambianceMode]
  )
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))
  const rules = t.raw('rules') as string[]

  useEffect(() => {
    setHasActiveSave(hasFreshSave())
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

  // Sauvegarde pas encore lue, ou compte pas encore connu : la vitrine du jeu,
  // bouton principal désactivé — c'est le HTML rendu au build, celui que lit
  // Googlebot (le plateau local, lui, attend ses joueurs). Attendre aussi la
  // session évite à un compte en ligne de voir l'écran local une seconde.
  if (!sessionChecked || loading) {
    return <GameShowcase gameId="petit-buveur" pending />
  }

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <PetitBuveurOnline />
      </OnlineGameStage>
    )
  }

  // Partie locale : la coquille commune des jeux (GameShell, en-tête collé
  // sous la barre du site, action sous le pouce) dans le flux de la page.
  if (gameStarted) {
    return (
      <Game
        players={selectedPlayers}
        onGameEnd={handleGameEnd}
        difficulty={difficulty}
        initialMode={initialMode}
      />
    )
  }

  return (
    <LocalGamePrelobby
      gameId={GAME_ID}
      players={selectedPlayers}
      description={t('tagline')}
      onStart={() => launchGame('new')}
      secondaryAction={
        hasActiveSave ? (
          <button
            type="button"
            onClick={() => launchGame('resume')}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-gold/25 bg-black/20 py-3 text-sm font-semibold text-cream/80 transition-colors hover:bg-black/30 hover:text-cream"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {t('resume')}
          </button>
        ) : null
      }
    >
      <PrelobbySection label={t('difficulty')}>
        <div className="grid grid-cols-2 gap-2">
          {difficultyKeys.map(value => (
            <PrelobbyChoice
              key={value}
              active={difficulty === value}
              onClick={() => setDifficulty(value)}
              title={t(`difficulties.${value}.label`)}
              description={t(`difficulties.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('rulesTitle')} open={showRules} onToggle={() => setShowRules(v => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {rules.map((rule, i) => (
            <p key={i} className={i === rules.length - 1 ? 'pt-1 text-xs text-cream/70' : undefined}>
              {rule}
            </p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
