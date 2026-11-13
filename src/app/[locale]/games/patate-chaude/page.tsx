"use client"

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { CaseSensitive, Infinity as InfinityIcon, Shuffle, Tags, Type } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode, type AmbianceMode } from '@/components/providers/AmbianceAttribute'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import { OnlineGameSkeleton } from '@/components/online/OnlineGameSkeleton'
import { OnlineGameStage } from '@/components/online/OnlineGameStage'
import { GameShowcase } from '@/components/online/GameShowcase'
import { Button } from '@/components/ui/button'
import {
  PC_CHALLENGE_MODES,
  PC_DEFAULT_SETTINGS,
  PC_FUSE_RANGES_S,
  PC_FUSES,
  PC_MIN_PLAYERS,
  PC_ROUNDS_OPTIONS,
  PC_UNLIMITED_ROUNDS,
  type PcChallengeMode,
  type PcChallengeSource,
  type PcSettings,
} from '@/lib/patate-chaude/engine'
import { loadPcBank } from '@/lib/patate-chaude/load'

// Le jeu local (un téléphone qui fait le tour de la table) et sa version en ligne (lobby,
// briefing, partie serveur) sont chargés À LA DEMANDE selon le mode, comme Purple et le 1220 :
// le morceau local est précaché hors ligne, le morceau en ligne ne l'est pas.
const PatateChaudeOnline = dynamic(
  () => import('@/components/online/PatateChaudeOnline').then((m) => m.PatateChaudeOnline),
  { loading: () => <OnlineGameSkeleton gameId="patate-chaude" /> }
)
const Game = dynamic(() => import('./components/game'), {
  loading: () => <OnlineGameSkeleton gameId="patate-chaude" />,
})

const CHALLENGE_ICONS: Record<PcChallengeMode, typeof Shuffle> = {
  mix: Shuffle,
  theme: Tags,
  letter: Type,
  syllable: CaseSensitive,
}

/** Règles affichées au pré-lobby ; celles qui parlent de gorgées ont leur variante Soft. */
const RULE_KEYS = ['challenge', 'pass', 'reject', 'boom', 'end'] as const
const SOFT_RULE_KEYS: ReadonlySet<string> = new Set(['reject', 'boom'])

export default function PatateChaudePage() {
  const t = useTranslations('games.patate-chaude')
  const format = useFormatter()
  const locale = useLocale()
  const { user, loading } = useAuth()
  const online = user?.playMode === 'online'
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode: ambianceMode } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  const [settings, setSettings] = useState<PcSettings>(PC_DEFAULT_SETTINGS)
  // Figée au clic « Commencer » : useAmbianceMode() vaut « alcool » au premier rendu.
  const [ambiance, setAmbiance] = useState<AmbianceMode>('alcool')
  const [showRules, setShowRules] = useState(false)
  const [bank, setBank] = useState<PcChallengeSource | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // Défis de la langue de la page, chargés dès le pré-lobby : « Commencer » attend qu'ils soient là.
  // En ligne, le serveur tire les défis : rien à charger ici.
  useEffect(() => {
    if (online) return
    let alive = true
    setBank(null)
    setLoadFailed(false)
    loadPcBank(locale)
      .then((loaded) => {
        if (alive) setBank(loaded)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [locale, loadAttempt, online])

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id))

  // Compte pas encore connu : la vitrine du jeu (le HTML du build, celui que lit Googlebot).
  if (loading) return <GameShowcase gameId="patate-chaude" pending />

  // Mode en ligne : lobby + partie serveur-autoritaire, indépendants du flux local.
  if (online) {
    return (
      <OnlineGameStage>
        <PatateChaudeOnline />
      </OnlineGameStage>
    )
  }

  if (gameStarted && bank && selectedPlayers.length >= PC_MIN_PLAYERS) {
    return (
      <Game
        players={selectedPlayers}
        settings={settings}
        ambiance={ambiance}
        bank={bank}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const soft = ambianceMode === 'soft'
  const update = (patch: Partial<PcSettings>) => setSettings((current) => ({ ...current, ...patch }))
  const start = () => {
    setAmbiance(ambianceMode)
    setGameStarted(true)
  }

  return (
    <LocalGamePrelobby
      gameId="patate-chaude"
      players={selectedPlayers}
      onStart={start}
      startDisabled={!bank}
    >
      {loadFailed && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-300/40 bg-suit-red/20 p-4 text-sm text-cream"
        >
          <p>{t('page.loadFailed')}</p>
          <Button variant="quiet" size="game" className="self-start" onClick={() => setLoadAttempt((n) => n + 1)}>
            {t('page.retry')}
          </Button>
        </div>
      )}

      <PrelobbySection label={t('page.challenge')}>
        <div className="grid grid-cols-2 gap-2">
          {PC_CHALLENGE_MODES.map((value) => {
            const Icon = CHALLENGE_ICONS[value]
            return (
              <PrelobbyChoice
                key={value}
                active={settings.challenge === value}
                onClick={() => update({ challenge: value })}
                icon={<Icon className="h-5 w-5 text-gold" />}
                title={t(`page.challenges.${value}.label`)}
                description={t(`page.challenges.${value}.desc`)}
              />
            )
          })}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.fuse')}>
        <div className="grid grid-cols-3 gap-2">
          {PC_FUSES.map((value) => (
            <PrelobbyChoice
              key={value}
              active={settings.fuse === value}
              onClick={() => update({ fuse: value })}
              title={t(`page.fuses.${value}`)}
              description={t('page.fuseRange', { min: PC_FUSE_RANGES_S[value].min, max: PC_FUSE_RANGES_S[value].max })}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-cream/70">{t('page.fuseSecret')}</p>
      </PrelobbySection>

      <PrelobbySection label={t('page.rounds')}>
        <div className="grid grid-cols-3 gap-2">
          {PC_ROUNDS_OPTIONS.map((value) =>
            value === PC_UNLIMITED_ROUNDS ? (
              <PrelobbyChoice
                key={value}
                active={settings.rounds === value}
                onClick={() => update({ rounds: value })}
                icon={<InfinityIcon className="h-5 w-5 text-gold" />}
                title={t('page.unlimited')}
                description={t('page.unlimitedDesc')}
              />
            ) : (
              <PrelobbyChoice
                key={value}
                active={settings.rounds === value}
                onClick={() => update({ rounds: value })}
                title={format.number(value)}
                description={t('page.roundsUnit', { count: value })}
              />
            )
          )}
        </div>
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules((v) => !v)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULE_KEYS.map((key) => (
            <p key={key}>{t(soft && SOFT_RULE_KEYS.has(key) ? `soft.rules.${key}` : `page.rules.${key}`)}</p>
          ))}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
