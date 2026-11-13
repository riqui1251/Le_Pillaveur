"use client"

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Shuffle } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  CAP_LEVEL_SETTINGS,
  CAP_THEMES,
  mixesAllCapThemes,
  toggleAllCapThemes,
  toggleCapTheme,
  type CapLevelSetting,
  type CapSettings,
  type CapTheme,
} from '@/lib/cap-ou-pas-cap/engine'
import Game from './components/game'

const RULES = ['turn', 'cap', 'refuse', 'joker', 'table', 'end'] as const
/** Règles qui parlent de gorgées : leur variante Sans alcool vit sous `soft.page.rules`. */
const SOFT_RULES: ReadonlySet<string> = new Set(['cap', 'refuse', 'joker'])

export default function CapOuPasCapPage() {
  const t = useTranslations('games.cap-ou-pas-cap')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [level, setLevel] = useState<CapLevelSetting>('soiree')
  // « Tout mélanger » activé par défaut : les six thèmes.
  const [themes, setThemes] = useState<CapTheme[]>(() => [...CAP_THEMES])
  // Figée au clic « Commencer » : useAmbianceMode vaut 'alcool' au premier rendu.
  const [ambiance, setAmbiance] = useState<AmbianceMode>('alcool')
  const [showRules, setShowRules] = useState(false)
  const settings = useMemo<CapSettings>(() => ({ level, themes }), [level, themes])

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Même seuil que GAMES.localMinPlayers : protège si la table change en cours de route.
  if (gameStarted && selectedPlayers.length >= 2 && themes.length > 0) {
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

  const soft = mode === 'soft'
  const noTheme = themes.length === 0

  const start = () => {
    if (noTheme) return
    setAmbiance(mode)
    // Premier son DANS le geste : iOS ne réveille l'audio que depuis un toucher.
    playGameSound('turn')
    setGameStarted(true)
  }

  return (
    <LocalGamePrelobby
      gameId="cap-ou-pas-cap"
      players={selectedPlayers}
      onStart={start}
      startDisabled={noTheme}
    >
      <PrelobbySection label={t('page.level')}>
        <div className="grid grid-cols-2 gap-2">
          {CAP_LEVEL_SETTINGS.map(value => (
            <PrelobbyChoice
              key={value}
              active={level === value}
              onClick={() => setLevel(value)}
              title={t(`levels.${value}`)}
              description={t(`page.levelDescs.${value}`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection
        label={t('page.themes')}
        action={
          <span className="text-xs text-cream/70">
            {t('page.themesCount', { count: themes.length, total: CAP_THEMES.length })}
          </span>
        }
      >
        <PrelobbyChoice
          className="mb-2 rounded-2xl px-4"
          active={mixesAllCapThemes(themes)}
          onClick={() => setThemes(prev => toggleAllCapThemes(prev))}
          icon={<Shuffle className="h-5 w-5 text-gold" />}
          title={t('page.mixAll')}
          description={t('page.mixAllDesc')}
        />
        <div className="grid grid-cols-2 gap-2">
          {CAP_THEMES.map(theme => (
            <PrelobbyChoice
              key={theme}
              active={themes.includes(theme)}
              onClick={() => setThemes(prev => toggleCapTheme(prev, theme))}
              title={t(`themes.${theme}`)}
              description={t(`page.themeDescs.${theme}`)}
            />
          ))}
        </div>
        {/* Toujours montée : une région créée avec son texte est souvent tue. */}
        <p role="status" aria-live="polite" className={cn('text-sm font-semibold text-red-300', noTheme && 'mt-3')}>
          {noTheme ? t('page.noTheme') : ''}
        </p>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules(v => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULES.map(rule => (
            <p key={rule}>{t(soft && SOFT_RULES.has(rule) ? `soft.page.rules.${rule}` : `page.rules.${rule}`)}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
