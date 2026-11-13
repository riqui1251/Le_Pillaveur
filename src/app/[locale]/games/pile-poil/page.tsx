"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Shuffle, Target } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { playGameSound } from '@/lib/sound/game-sounds'
import {
  PILE_POIL_DEFAULT_SETTINGS,
  PILE_POIL_LEVELS,
  PILE_POIL_ROUND_COUNTS,
  PILE_POIL_TARGET_MODES,
  type PilePoilSettings,
} from '@/lib/pile-poil/engine'
import Game from './components/game'

const RULE_KEYS = ['goal', 'play', 'rank', 'furthest', 'bullseye', 'end', 'variant'] as const
/** Règles qui changent en Sans alcool (gorgées, points) : leur variante vit sous `soft.page.rules`. */
const SOFT_RULE_KEYS: ReadonlySet<string> = new Set(['furthest', 'bullseye', 'end'])

export default function PilePoilPage() {
  const t = useTranslations('games.pile-poil')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode: ambianceNow } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [settings, setSettings] = useState<PilePoilSettings>(PILE_POIL_DEFAULT_SETTINGS)
  const [ambiance, setAmbiance] = useState<AmbianceMode>('alcool')
  const [showRules, setShowRules] = useState(false)

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Même seuil que GAMES.localMinPlayers : protège si la table change en cours de route.
  if (gameStarted && selectedPlayers.length >= 2) {
    return (
      <Game
        players={selectedPlayers}
        settings={settings}
        ambiance={ambiance}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const start = () => {
    // Ambiance figée au clic : useAmbianceMode() vaut 'alcool' au premier rendu,
    // et la partie ne doit pas changer de barème en route.
    setAmbiance(ambianceNow)
    // Premier son DANS le geste : iOS n'ouvre l'audio que sur un toucher.
    playGameSound('step')
    setGameStarted(true)
  }

  const ruleText = (key: (typeof RULE_KEYS)[number]) =>
    ambianceNow === 'soft' && SOFT_RULE_KEYS.has(key) ? t(`soft.page.rules.${key}`) : t(`page.rules.${key}`)

  return (
    <LocalGamePrelobby gameId="pile-poil" players={selectedPlayers} onStart={start}>
      <PrelobbySection label={t('page.level')}>
        <div className="grid grid-cols-2 gap-2">
          {PILE_POIL_LEVELS.map(value => (
            <PrelobbyChoice
              key={value}
              active={settings.level === value}
              onClick={() => setSettings(s => ({ ...s, level: value }))}
              icon={value === 'normal'
                ? <Eye className="h-5 w-5 text-gold" />
                : <EyeOff className="h-5 w-5 text-gold" />}
              title={t(`page.levels.${value}.label`)}
              description={t(`page.levels.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.target')}>
        <div className="grid grid-cols-2 gap-2">
          {PILE_POIL_TARGET_MODES.map(value => (
            <PrelobbyChoice
              key={value}
              active={settings.targetMode === value}
              onClick={() => setSettings(s => ({ ...s, targetMode: value }))}
              icon={value === 'fixed'
                ? <Target className="h-5 w-5 text-gold" />
                : <Shuffle className="h-5 w-5 text-gold" />}
              title={t(`page.targets.${value}.label`)}
              description={t(`page.targets.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.rounds')}>
        <div className="grid grid-cols-3 gap-2">
          {PILE_POIL_ROUND_COUNTS.map(value => (
            <PrelobbyChoice
              key={value}
              className="items-center text-center"
              active={settings.rounds === value}
              onClick={() => setSettings(s => ({ ...s, rounds: value }))}
              title={t('page.roundsCount', { count: value })}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules(v => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULE_KEYS.map(key => (
            <p key={key}>{ruleText(key)}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
