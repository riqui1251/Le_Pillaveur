"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Swords, Trophy } from 'lucide-react'
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
  DEGAINE_DEFAULT_SETTINGS,
  DEGAINE_FORMATS,
  DEGAINE_ROUND_OPTIONS,
  type DegaineSettings,
} from '@/lib/degaine/engine'
import Game from './components/game'

const RULE_KEYS = ['setup', 'ready', 'fire', 'decoys', 'drinks', 'tournament'] as const
/** Règles qui parlent de gorgées : leur variante Sans alcool vit sous `soft.page.rules`. */
const SOFT_RULE_KEYS: ReadonlySet<string> = new Set(['drinks'])

export default function DegainePage() {
  const t = useTranslations('games.degaine')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode: ambianceNow } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [settings, setSettings] = useState<DegaineSettings>(DEGAINE_DEFAULT_SETTINGS)
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
    <LocalGamePrelobby gameId="degaine" players={selectedPlayers} onStart={start}>
      <PrelobbySection label={t('page.format')}>
        <div className="grid grid-cols-2 gap-2">
          {DEGAINE_FORMATS.map(value => (
            <PrelobbyChoice
              key={value}
              active={settings.format === value}
              onClick={() => setSettings(s => ({ ...s, format: value }))}
              icon={value === 'tournament'
                ? <Trophy className="h-5 w-5 text-gold" />
                : <Swords className="h-5 w-5 text-gold" />}
              title={t(`page.formats.${value}.label`)}
              description={t(`page.formats.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.decoys')}>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map(value => (
            <PrelobbyChoice
              key={String(value)}
              active={settings.decoys === value}
              onClick={() => setSettings(s => ({ ...s, decoys: value }))}
              title={t(`page.decoyModes.${value ? 'on' : 'off'}.label`)}
              description={t(`page.decoyModes.${value ? 'on' : 'off'}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.rounds')}>
        <div className="grid grid-cols-2 gap-2">
          {DEGAINE_ROUND_OPTIONS.map(value => (
            <PrelobbyChoice
              key={value}
              active={settings.roundsPerDuel === value}
              onClick={() => setSettings(s => ({ ...s, roundsPerDuel: value }))}
              title={t(`page.roundModes.${value === 1 ? 'one' : 'bestOf3'}.label`)}
              description={t(`page.roundModes.${value === 1 ? 'one' : 'bestOf3'}.desc`)}
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
