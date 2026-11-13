"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { readCoupeOverrides, writeCoupeOverrides } from '@/lib/coupe-du-roi/custom-rules'
import {
  COUPE_CUP_MODES,
  cleanCoupeOverrides,
  type CoupeCupMode,
  type CoupeOverrides,
} from '@/lib/coupe-du-roi/engine'
import Game from './components/game'
import { RulesEditor } from './components/rules-editor'

const HOW_TO_STEPS = ['deck', 'draw', 'roles', 'kings'] as const

export default function CoupeDuRoiPage() {
  const t = useTranslations('games.coupe-du-roi')
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode: ambianceMode } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [cup, setCup] = useState<CoupeCupMode>('solo')
  // Saisies brutes (espaces compris, pour ne pas gêner la frappe) ; le moteur les nettoie.
  const [drafts, setDrafts] = useState<CoupeOverrides>({})
  const [draftsLoaded, setDraftsLoaded] = useState(false)
  const [playedAmbiance, setPlayedAmbiance] = useState<AmbianceMode>('alcool')
  const [showHowTo, setShowHowTo] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)

  // Lu après le montage : le stockage de l'appareil n'existe pas au rendu serveur.
  useEffect(() => {
    setDrafts(readCoupeOverrides())
    setDraftsLoaded(true)
  }, [])

  useEffect(() => {
    if (draftsLoaded) writeCoupeOverrides(drafts)
  }, [drafts, draftsLoaded])

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id))

  // Même seuil que GAMES.localMinPlayers : protège si la table change en cours de route.
  if (gameStarted && selectedPlayers.length >= 2) {
    return (
      <Game
        players={selectedPlayers}
        cup={cup}
        overrides={drafts}
        ambiance={playedAmbiance}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const soft = ambianceMode === 'soft'
  const modified = Object.keys(cleanCoupeOverrides(drafts)).length

  const start = () => {
    // L'ambiance est figée au départ : une bascule en pleine partie ne réécrit pas les règles.
    setPlayedAmbiance(ambianceMode)
    setGameStarted(true)
  }

  return (
    <LocalGamePrelobby gameId="coupe-du-roi" players={selectedPlayers} onStart={start}>
      <PrelobbySection label={t('page.cup')}>
        {soft ? (
          <p className="text-sm text-cream/80">{t('page.softCup')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {COUPE_CUP_MODES.map((value) => (
              <PrelobbyChoice
                key={value}
                active={cup === value}
                onClick={() => setCup(value)}
                title={t(`page.cupModes.${value}.label`)}
                description={t(`page.cupModes.${value}.desc`)}
              />
            ))}
          </div>
        )}
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.howTo')} open={showHowTo} onToggle={() => setShowHowTo((v) => !v)}>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-cream/70">
          {HOW_TO_STEPS.map((step) => (
            <li key={step}>{soft && step === 'kings' ? t('page.steps.kingsSoft') : t(`page.steps.${step}`)}</li>
          ))}
        </ol>
      </PrelobbyDisclosure>

      <PrelobbyDisclosure
        label={modified > 0 ? t('page.customizeCount', { count: modified }) : t('page.customize')}
        open={showCustomize}
        onToggle={() => setShowCustomize((v) => !v)}
      >
        {/* Replié, le volet reste dans le DOM sans être inerte : ses 13 champs seraient atteints au Tab, invisibles. */}
        {showCustomize && <RulesEditor drafts={drafts} onChange={setDrafts} cup={cup} ambiance={ambianceMode} />}
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
