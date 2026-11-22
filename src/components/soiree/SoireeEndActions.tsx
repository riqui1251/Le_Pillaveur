"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { EndActionsOverride } from '@/components/game/EndActionDock'
import { playingRoundOf } from '@/lib/soiree/state'
import { gameIdOf } from './SoireeRoundBar'
import { useSoiree } from './useSoiree'

/** Le temps de voir l'écran de fin : le dernier tap de la partie ne doit pas filer à la manche suivante. */
const ARM_DELAY_MS = 800

function NextRoundButton({ index, last }: { index: number; last: boolean }) {
  const t = useTranslations('soireeBar')
  const router = useRouter()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <Button
      variant="primary"
      size="gameLg"
      className="w-full"
      disabled={!armed}
      // La manche se clôt à l'arrivée sur la soirée (SoireeApp) : la clore ici
      // retirerait ce bouton et remontrerait « Rejouer » le temps de partir.
      onClick={() => router.push(`/soiree?fin=${index}`)}
    >
      {last ? t('toAddition') : t('nextRound')}
      <ArrowRight aria-hidden className="ml-2 h-5 w-5" />
    </Button>
  )
}

/**
 * Fin de partie d'un jeu joué en manche de soirée : « Manche suivante »
 * remplace « Rejouer » et « Quitter » dans le dock de fin (EndActionDock).
 * Hors d'une manche de CE jeu, ou en ligne, le dock reste celui du jeu.
 */
export function SoireeEndActions({ pathname, enabled, children }: { pathname: string; enabled: boolean; children: React.ReactNode }) {
  const { soiree } = useSoiree()
  const gameId = gameIdOf(pathname)
  const round = enabled && gameId ? playingRoundOf(soiree, gameId) : null
  const index = round && soiree ? soiree.current : -1
  const last = soiree ? soiree.current >= soiree.rounds.length - 1 : false
  const override = useMemo(() => (index >= 0 ? <NextRoundButton index={index} last={last} /> : null), [index, last])
  return <EndActionsOverride.Provider value={override}>{children}</EndActionsOverride.Provider>
}
