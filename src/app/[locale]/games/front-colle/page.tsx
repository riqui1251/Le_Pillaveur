"use client"

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { MessageSquare, Shuffle, User, Users } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import {
  LocalGamePrelobby,
  PrelobbyChoice,
  PrelobbyDisclosure,
  PrelobbySection,
} from '@/components/game/LocalGamePrelobby'
import { Button } from '@/components/ui/button'
import { FC_THEMES } from '@/lib/front-colle/data/types'
import {
  FC_DURATIONS,
  FC_INSTRUCTIONS,
  FC_MIN_PLAYERS,
  FC_ROUNDS,
  FC_SAID_COST,
  FC_BEST_BONUS,
  FC_TEAM_MODES,
  extraGuessers,
  teamsOf,
  turnsPerTeam,
  wordPool,
  type FcAmbiance,
  type FcDuration,
  type FcInstructions,
  type FcRounds,
  type FcSettings,
  type FcTeamMode,
  type FcTheme,
  type FcWord,
} from '@/lib/front-colle/engine'
import { loadFcWords } from '@/lib/front-colle/load'
import Game from './components/game'

const RULES = ['phone', 'clues', 'forbidden', 'tilt', 'touch', 'end'] as const

export default function FrontCollePage() {
  const t = useTranslations('games.front-colle')
  const locale = useLocale()
  const { players, updatePlayerStats } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const { mode: ambianceMode } = useAmbianceMode()
  const [gameStarted, setGameStarted] = useState(false)
  // Figée au clic « Commencer » : useAmbianceMode() vaut 'alcool' au premier rendu.
  const [ambiance, setAmbiance] = useState<FcAmbiance>('alcool')
  const [teamMode, setTeamMode] = useState<FcTeamMode>('solo')
  const [durationSec, setDurationSec] = useState<FcDuration>(60)
  const [rounds, setRounds] = useState<FcRounds>(1)
  const [instructions, setInstructions] = useState<FcInstructions>('mix')
  const [themes, setThemes] = useState<FcTheme[]>([...FC_THEMES])
  const [showRules, setShowRules] = useState(false)
  const [words, setWords] = useState<FcWord[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // Une seule langue de mots part au navigateur : celle de la page.
  useEffect(() => {
    let alive = true
    setWords(null)
    setLoadFailed(false)
    loadFcWords(locale)
      .then((loaded) => {
        if (alive) setWords(loaded)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [locale, loadAttempt])

  const themesKey = themes.join('|')
  const settings = useMemo<FcSettings>(
    () => ({ teamMode, durationSec, rounds, instructions, themes: themesKey.split('|') as FcTheme[] }),
    [teamMode, durationSec, rounds, instructions, themesKey]
  )

  // Ordre de la table = ordre du stockage (création des joueurs), pas l'ordre de sélection.
  const selectedPlayers = players.filter((player) => selectedIds.includes(player.id))

  if (gameStarted && words && selectedPlayers.length >= FC_MIN_PLAYERS) {
    return (
      <Game
        players={selectedPlayers}
        settings={settings}
        words={words}
        ambiance={ambiance}
        onGameEnd={() => setGameStarted(false)}
        updatePlayerStats={updatePlayerStats}
      />
    )
  }

  const allThemes = themes.length === FC_THEMES.length
  const poolSize = words ? wordPool(words, themes).length : 0
  const soft = ambianceMode === 'soft'
  const tableIds = selectedPlayers.map((player) => player.id)
  const teamIds = teamsOf(tableIds)
  const nameOf = (id: string) => selectedPlayers.find((player) => player.id === id)?.name ?? ''
  const teamLines =
    teamMode === 'teams' && selectedPlayers.length > 0
      ? (['A', 'B'] as const).map((team) => ({ team, names: teamIds[team].map(nameOf).join(', ') }))
      : []
  // Équipes inégales : la plus petite joue autant de tours que l'autre, donc un des siens repasse — on le dit.
  const unevenTeams = teamMode === 'teams' && teamIds.B.length > 0 && teamIds.A.length !== teamIds.B.length
  const extraGroups: { count: number; ids: string[] }[] = []
  for (const extra of extraGuessers(tableIds, teamMode, rounds)) {
    const group = extraGroups.find((item) => item.count === extra.count)
    if (group) group.ids.push(extra.playerId)
    else extraGroups.push({ count: extra.count, ids: [extra.playerId] })
  }

  const toggleTheme = (theme: FcTheme) => {
    setThemes((current) => {
      // « Tout mélanger » actif : toucher un thème le choisit seul.
      if (current.length === FC_THEMES.length) return [theme]
      const next = current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme]
      return next.length === 0 ? [...FC_THEMES] : FC_THEMES.filter((item) => next.includes(item))
    })
  }

  const start = () => {
    setAmbiance(ambianceMode === 'soft' ? 'soft' : 'alcool')
    setGameStarted(true)
  }

  return (
    <LocalGamePrelobby
      gameId="front-colle"
      players={selectedPlayers}
      onStart={start}
      startDisabled={!words || poolSize === 0}
    >
      <PrelobbySection label={t('page.mode')}>
        <div className="grid grid-cols-2 gap-2">
          {FC_TEAM_MODES.map((value) => (
            <PrelobbyChoice
              key={value}
              active={teamMode === value}
              onClick={() => setTeamMode(value)}
              icon={value === 'solo' ? <User className="h-5 w-5 text-gold" /> : <Users className="h-5 w-5 text-gold" />}
              title={t(`page.modes.${value}.label`)}
              description={t(`page.modes.${value}.desc`)}
            />
          ))}
        </div>
        {teamLines.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-cream/80">
            {teamLines.map(({ team, names }) => (
              <li key={team}>
                {t('page.teamLine', { team: t(`teams.${team}`), names })}
              </li>
            ))}
          </ul>
        )}
        {extraGroups.map((group) => (
          <p key={group.count} className="mt-2 text-xs text-cream/70">
            {t('page.teamExtra', { players: group.ids.length, names: group.ids.map(nameOf).join(', '), count: group.count })}
          </p>
        ))}
      </PrelobbySection>

      <PrelobbySection label={t('page.duration')}>
        <div className="grid grid-cols-3 gap-2">
          {FC_DURATIONS.map((value) => (
            <PrelobbyChoice
              key={value}
              className="items-center text-center"
              active={durationSec === value}
              onClick={() => setDurationSec(value)}
              title={t('page.seconds', { count: value })}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.rounds')}>
        <div className="grid grid-cols-2 gap-2">
          {FC_ROUNDS.map((value) => (
            <PrelobbyChoice
              key={value}
              active={rounds === value}
              onClick={() => setRounds(value)}
              title={t('page.roundsCount', { count: value })}
              description={
                unevenTeams
                  ? t('page.roundsDescTeams', { count: turnsPerTeam(tableIds, value) })
                  : t('page.roundsDesc', { count: value })
              }
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection label={t('page.instructions')}>
        <div className="grid grid-cols-2 gap-2">
          {FC_INSTRUCTIONS.map((value) => (
            <PrelobbyChoice
              key={value}
              active={instructions === value}
              onClick={() => setInstructions(value)}
              icon={value === 'mix' ? <Shuffle className="h-5 w-5 text-gold" /> : <MessageSquare className="h-5 w-5 text-gold" />}
              title={t(`page.instructionModes.${value}.label`)}
              description={t(`page.instructionModes.${value}.desc`)}
            />
          ))}
        </div>
      </PrelobbySection>

      <PrelobbySection
        label={t('page.themes')}
        action={
          <span aria-live="polite" className="text-xs text-cream/70">
            {words ? t('page.wordsCount', { count: poolSize }) : loadFailed ? '' : t('page.loading')}
          </span>
        }
      >
        <PrelobbyChoice
          className="mb-2"
          active={allThemes}
          onClick={() => setThemes([...FC_THEMES])}
          icon={<Shuffle className="h-5 w-5 text-gold" />}
          title={t('page.allThemes')}
        />
        <div className="grid grid-cols-2 gap-2">
          {FC_THEMES.map((theme) => (
            <PrelobbyChoice
              key={theme}
              active={!allThemes && themes.includes(theme)}
              onClick={() => toggleTheme(theme)}
              title={t(`themes.${theme}`)}
            />
          ))}
        </div>
        {loadFailed && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="alert" className="min-w-0 flex-1 text-sm text-red-300">
              {t('page.loadError')}
            </p>
            <Button variant="quiet" size="game" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              {t('page.retry')}
            </Button>
          </div>
        )}
      </PrelobbySection>

      <PrelobbyDisclosure label={t('page.rulesTitle')} open={showRules} onToggle={() => setShowRules((open) => !open)}>
        <div className="space-y-1.5 text-sm text-cream/70">
          {RULES.map((rule) => (
            <p key={rule}>{t(`page.rules.${rule}`)}</p>
          ))}
          <p className="pt-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {soft ? t('soft.page.drinksTitle') : t('page.drinksTitle')}
          </p>
          {soft ? (
            <>
              <p>{t('soft.page.drinks.found')}</p>
              <p>{t('soft.page.drinks.passed')}</p>
              <p>{t('soft.page.drinks.said', { count: FC_SAID_COST })}</p>
              <p>{t('soft.page.drinks.best', { count: FC_BEST_BONUS })}</p>
            </>
          ) : (
            <>
              <p>{t('page.drinks.passed')}</p>
              <p>{t('page.drinks.said', { count: FC_SAID_COST })}</p>
              <p>{t('page.drinks.best', { count: FC_BEST_BONUS })}</p>
            </>
          )}
        </div>
      </PrelobbyDisclosure>
    </LocalGamePrelobby>
  )
}
