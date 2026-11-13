"use client"

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Atom, Earth, HeartPulse, Landmark, Palette, Shuffle, Trophy, Users } from 'lucide-react'
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
import { VDN_THEMES, type VdnTheme } from '@/lib/vue-de-nez/data/types'
import {
  VDN_DEFAULT_QUESTION_COUNT,
  VDN_MIN_PLAYERS,
  VDN_QUESTION_COUNTS,
  normalizeVdnThemes,
  type VdnQuestionCount,
} from '@/lib/vue-de-nez/engine'

// Les deux versions — le jeu local (un téléphone qui tourne autour de la
// table) et la version en ligne (lobby, briefing, partie serveur) — sont
// chargées À LA DEMANDE selon le mode, comme Purple et le 1220 : le morceau
// local est précaché hors ligne, l'en ligne non.
const VueDeNezOnline = dynamic(
  () => import('@/components/online/VueDeNezOnline').then((m) => m.VueDeNezOnline),
  { loading: () => <OnlineGameSkeleton gameId="vue-de-nez" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="vue-de-nez" />,
})

const THEME_ICON_CLASS = 'h-5 w-5 text-gold'

const THEME_ICONS: Record<VdnTheme, ReactNode> = {
  corps: <HeartPulse className={THEME_ICON_CLASS} />,
  geographie: <Earth className={THEME_ICON_CLASS} />,
  histoire: <Landmark className={THEME_ICON_CLASS} />,
  sciences: <Atom className={THEME_ICON_CLASS} />,
  sport: <Trophy className={THEME_ICON_CLASS} />,
  societe: <Users className={THEME_ICON_CLASS} />,
  culture: <Palette className={THEME_ICON_CLASS} />,
}

const RULE_KEYS = ['ask', 'secret', 'reveal', 'closest', 'farthest', 'score'] as const
/** Règles qui parlent de gorgées : leur variante Sans alcool vit sous `soft.page.rules`. */
const SOFT_RULE_KEYS: readonly string[] = ['closest', 'farthest']

export default function VueDeNezPage() {
  const t = useTranslations('games.vue-de-nez')
  const { user, loading } = useAuth()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [questionCount, setQuestionCount] = useState<VdnQuestionCount>(VDN_DEFAULT_QUESTION_COUNT)
  const [themes, setThemes] = useState<VdnTheme[]>([])
  // Figée au clic « Commencer » : useAmbianceMode vaut 'alcool' au premier rendu.
  const [ambiance, setAmbiance] = useState<AmbianceMode>('alcool')
  const [showRules, setShowRules] = useState(false)

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  // Compte pas encore connu : la vitrine du jeu (le HTML que lit Googlebot) ;
  // un compte en ligne ne voit jamais l'écran local le temps que la session réponde.
  if (loading) {
    return <GameShowcase gameId="vue-de-nez" pending />
  }

  if (user?.playMode === 'online') {
    return (
      <OnlineGameStage>
        <VueDeNezOnline />
      </OnlineGameStage>
    )
  }

  if (gameStarted && selectedPlayers.length >= VDN_MIN_PLAYERS) {
    return (
      <Game
        players={selectedPlayers}
        questionCount={questionCount}
        themes={themes}
        ambiance={ambiance}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const toggleTheme = (theme: VdnTheme) => {
    setThemes(prev => normalizeVdnThemes(prev.includes(theme) ? prev.filter(x => x !== theme) : [...prev, theme]))
  }

  const start = () => {
    setAmbiance(mode)
    // Premier son DANS le geste : iOS n'ouvre l'audio qu'ainsi.
    playGameSound('turn')
    setGameStarted(true)
  }

  return (
    <LocalGamePrelobby gameId="vue-de-nez" players={selectedPlayers} onStart={start}>
      <PrelobbySection label={t('page.questions')}>
        <div className="grid grid-cols-3 gap-2">
          {VDN_QUESTION_COUNTS.map(count => (
            <PrelobbyChoice
              key={count}
              active={questionCount === count}
              onClick={() => setQuestionCount(count)}
              title={String(count)}
              className="items-center text-center font-display"
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection
        label={t('page.themes')}
        action={
          themes.length > 0 ? (
            <span className="text-xs text-cream/70">{t('page.themesPicked', { count: themes.length })}</span>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <PrelobbyChoice
            className="col-span-2"
            active={themes.length === 0}
            onClick={() => setThemes([])}
            icon={<Shuffle className={THEME_ICON_CLASS} />}
            title={t('page.themesAll')}
            description={t('page.themesAllHint')}
          />
          {VDN_THEMES.map(theme => (
            <PrelobbyChoice
              key={theme}
              active={themes.includes(theme)}
              onClick={() => toggleTheme(theme)}
              icon={THEME_ICONS[theme]}
              title={t(`themes.${theme}`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules(v => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULE_KEYS.map(key => (
            <p key={key}>
              {mode === 'soft' && SOFT_RULE_KEYS.includes(key) ? t(`soft.page.rules.${key}`) : t(`page.rules.${key}`)}
            </p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
