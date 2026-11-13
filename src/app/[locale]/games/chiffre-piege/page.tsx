"use client"

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
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
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { playGameSound } from '@/lib/sound/game-sounds'
import {
  CHIFFRE_PIEGE_DEFAULT_RANGE,
  CHIFFRE_PIEGE_DEFAULT_ROUNDS,
  CHIFFRE_PIEGE_JOKER_PENALTY,
  CHIFFRE_PIEGE_PENALTY_CAP,
  CHIFFRE_PIEGE_RANGES,
  CHIFFRE_PIEGE_ROUND_COUNTS,
  type ChiffrePiegeRange,
  type ChiffrePiegeRoundCount,
} from '@/lib/chiffre-piege/engine'
import { useChiffrePiegeText } from './components/use-chiffre-piege-text'

// Les deux versions — le jeu local (un téléphone qui fait le tour de la
// table) et la version en ligne (lobby, briefing, partie serveur) — sont
// chargées À LA DEMANDE selon le mode, comme Purple et le 1220 : le morceau
// local part dans le précache hors ligne, le morceau en ligne jamais.
const ChiffrePiegeOnline = dynamic(
  () => import('@/components/online/ChiffrePiegeOnline').then((m) => m.ChiffrePiegeOnline),
  { loading: () => <OnlineGameSkeleton gameId="chiffre-piege" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="chiffre-piege" />,
})

const RULE_KEYS = ['trap', 'guess', 'narrow', 'boom', 'last', 'joker', 'next'] as const

export default function ChiffrePiegePage() {
  const t = useTranslations('games.chiffre-piege')
  const { user, loading } = useAuth()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode } = useAmbianceMode()
  // Règles affichées dans l'ambiance du moment (gorgées ou points).
  const tx = useChiffrePiegeText(mode)
  // Ambiance FIGÉE au clic « Commencer » : useAmbianceMode vaut 'alcool' au
  // premier rendu, et une bascule en pleine partie ne doit rien relabelliser.
  const [startedAmbiance, setStartedAmbiance] = useState<AmbianceMode | null>(null)
  const [max, setMax] = useState<ChiffrePiegeRange>(CHIFFRE_PIEGE_DEFAULT_RANGE)
  const [rounds, setRounds] = useState<ChiffrePiegeRoundCount>(CHIFFRE_PIEGE_DEFAULT_ROUNDS)
  const [showRules, setShowRules] = useState(false)

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Session pas encore connue : la vitrine du jeu (le HTML du build, celui
  // que lit Googlebot), bouton principal désactivé.
  if (loading) {
    return <GameShowcase gameId="chiffre-piege" pending />
  }

  // Mode en ligne : lobby + partie serveur-autoritaire (indépendant du flux local).
  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <ChiffrePiegeOnline />
      </OnlineGameStage>
    )
  }

  if (startedAmbiance && selectedPlayers.length >= 2) {
    return (
      <Game
        players={selectedPlayers}
        settings={{ max, rounds }}
        ambiance={startedAmbiance}
        onGameEnd={() => setStartedAmbiance(null)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const ruleValues = { cap: CHIFFRE_PIEGE_PENALTY_CAP, cost: CHIFFRE_PIEGE_JOKER_PENALTY }

  const start = () => {
    // iOS n'ouvre l'audio que dans un geste : le premier son part de ce clic.
    playGameSound('turn')
    setStartedAmbiance(mode)
  }

  return (
    <LocalGamePrelobby gameId="chiffre-piege" players={selectedPlayers} onStart={start}>
      <PrelobbySection label={t('page.range')}>
        <div className="grid grid-cols-3 gap-2">
          {CHIFFRE_PIEGE_RANGES.map(value => (
            <PrelobbyChoice
              key={value}
              active={max === value}
              onClick={() => setMax(value)}
              title={t('page.rangeOption', { max: value })}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.rounds')}>
        <div className="grid grid-cols-3 gap-2">
          {CHIFFRE_PIEGE_ROUND_COUNTS.map(value => (
            <PrelobbyChoice
              key={value}
              active={rounds === value}
              onClick={() => setRounds(value)}
              title={t('page.roundsOption', { count: value })}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules(v => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULE_KEYS.map(key => (
            <p key={key}>{tx(`page.rules.${key}`, ruleValues)}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
