"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { usePlayers } from '@/hooks/usePlayers'
import { useGameCatalog, useGameDrinkLevel, useGameVibes, useSoireeGameIds } from '@/hooks/useGameCatalog'
import { getGameById } from '@/lib/games'
import { useLocalizedGames } from '@/lib/games-i18n'
import { enterLocalPlay } from '@/lib/local-play-client'
import { buildProgram, SOIREE_LENGTH_ROUNDS } from '@/lib/soiree/program'
import {
  createSoiree,
  replaceUpcoming,
  setRoundTally,
  setRoundVote,
  setSoireeVote,
  skipRound,
  soireeMetric,
  type Soiree,
} from '@/lib/soiree/state'
import { closeCurrentRound, finishWithHistory, keepBande, launchCurrentRound, revancheOf, unreportedPlayers } from '@/lib/soiree/actions'
import { newSoireeId, readSoiree } from '@/lib/soiree/storage'
import { scrollPageTop, SoireeCta, SoireeShell, StepHeader } from './soiree-ui'
import { useSoiree } from './useSoiree'
import { useHiddenGamesPurge } from './useHiddenGamesPurge'
import { BandeStep, type BandeChoice } from './BandeStep'
import { AmbianceStep, type AmbianceChoice } from './AmbianceStep'
import { ProgrammeEditor } from './ProgrammeEditor'
import { RoundView } from './RoundView'
import { RoundIntro } from './RoundIntro'
import { EntracteView } from './EntracteView'
import { AdditionView } from './AdditionView'

function clampCount(raw: string | null): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 2 ? Math.min(12, Math.round(n)) : 4
}

/** Le Mode Soirée (jeux locaux) : la bande, l'ambiance, le programme, puis les manches jusqu'à l'addition. */
export function SoireeApp() {
  const t = useTranslations('soiree')
  const router = useRouter()
  const params = useSearchParams()
  const { soiree, ready, save } = useSoiree()
  const { user, setPlayMode } = useAuth()
  const { mode, setMode } = useAmbianceMode()
  const { updatePlayerStats } = usePlayers()
  const { hiddenIds } = useGameCatalog()
  // Le tirage suit le barème « Fait boire » réglé par l'équipe, pas celui du code.
  const heatOf = useGameDrinkLevel()
  const vibesOf = useGameVibes()
  // Les jeux de la soirée tels que l'équipe les a réglés (ajouts et retraits compris).
  const soireeIds = useSoireeGameIds()
  useHiddenGamesPurge(soiree, save)
  const [step, setStep] = useState<'bande' | 'ambiance'>('bande')
  const [choice, setChoice] = useState<BandeChoice | null>(null)
  const [ambiance, setAmbiance] = useState<AmbianceChoice>({ vibe: 'monte', soft: false, length: 'normal' })
  /** Jeu en cours d'ouverture : la page du jeu se charge, la soirée ne remontre pas la manche entre-temps. */
  const [launching, setLaunching] = useState<string | null>(null)
  /** Tuto de la prochaine manche affiché (avant d'ouvrir le jeu). */
  const [intro, setIntro] = useState(false)
  const games = useLocalizedGames()
  const softSynced = useRef(false)

  const closeRound = useCallback(
    (s: Soiree) => {
      // Ceux dont le jeu n'a rien remonté jouaient bien : leur partie compte dans leurs stats.
      const round = s.rounds[s.current]
      for (const id of unreportedPlayers(s)) updatePlayerStats(id, round.gameId, { gamesPlayed: 1 })
      save(closeCurrentRound(readSoiree() ?? s, Date.now()))
    },
    [updatePlayerStats, save]
  )

  // Arrivée depuis l'accueil (« Composer notre soirée », « On remet ça ? ») :
  // une addition déjà vue laisse la place à la nouvelle soirée demandée.
  // Arrivée depuis la fin d'un jeu (« Manche suivante », SoireeEndActions) :
  // la manche jouée se clôt ici ; son numéro écarte un vieux lien.
  // Tant que ce tri n'est pas fait, rien ne s'affiche : l'addition montée une
  // fraction de seconde lancerait ses confettis et son son.
  const freshStart = params.has('joueurs') || params.has('bande')
  const endedRound = params.get('fin')
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    if (!ready || arrived) return
    if (freshStart && soiree?.phase === 'finished') save(null)
    if (endedRound !== null && soiree?.phase === 'playing' && String(soiree.current) === endedRound) closeRound(soiree)
    setArrived(true)
  }, [ready, arrived, freshStart, endedRound, soiree, save, closeRound])

  // Chaque écran de la soirée commence en haut (le bouton d'action du précédent était en bas).
  const screenKey = soiree ? `${soiree.phase}:${soiree.current}:${intro}` : `setup:${step}`
  useEffect(() => {
    scrollPageTop()
  }, [screenKey])

  // L'ambiance du site sert de point de départ au réglage « Sans alcool ».
  useEffect(() => {
    if (softSynced.current) return
    softSynced.current = true
    setAmbiance((a) => ({ ...a, soft: mode === 'soft' }))
  }, [mode])

  const syncSiteAmbiance = (s: Soiree) => {
    if (s.soft !== (mode === 'soft')) setMode(s.soft ? 'soft' : 'alcool')
  }

  /** Lance la manche courante sur la page du vrai jeu, en mode local. */
  const launch = async (s: Soiree) => {
    // Retour visuel tout de suite : la bascule en mode local passe par le réseau.
    setLaunching(s.rounds[s.current]?.gameId ?? null)
    setIntro(false)
    if (user?.playMode === 'online') await setPlayMode('local')
    if (!user) await enterLocalPlay().catch(() => undefined)
    syncSiteAmbiance(s)
    const { soiree: started, path } = launchCurrentRound(s, Date.now())
    save(started)
    if (path) router.push(path)
    else setLaunching(null)
  }

  // Le vote revient après un aller-retour réseau : appliqué à la soirée relue,
  // et seulement si c'est toujours la même (une revanche a pu partir entre-temps).
  const saveVote = (s: Soiree, apply: (fresh: Soiree) => Soiree) => {
    const fresh = readSoiree()
    if (fresh && fresh.id === s.id) save(apply(fresh))
  }

  const correct = (s: Soiree, index: number, playerId: string, value: number) => {
    const metric = soireeMetric(s)
    const round = s.rounds[index]
    const before = round?.results[playerId]?.[metric] ?? 0
    const next = setRoundTally(s, index, playerId, metric, value)
    const after = next.rounds[index]?.results[playerId]?.[metric] ?? 0
    if (after === before) return
    // Les gorgées dites à voix haute entrent aussi dans les stats du joueur (« quel jeu fait le plus boire »).
    // Correction : la manche a souvent déjà été envoyée au classement de tout le site.
    updatePlayerStats(
      playerId,
      round.gameId,
      metric === 'drinks' ? { totalDrinks: after - before } : { wins: after - before },
      { tally: 'correction' }
    )
    save(next)
  }

  const createProgramme = () => {
    if (!choice) return
    const program =
      ambiance.length === 'carte'
        ? []
        : buildProgram({ rounds: SOIREE_LENGTH_ROUNDS[ambiance.length], vibe: ambiance.vibe, playerCount: choice.players.length, hiddenIds, heatOf, vibesOf, soireeIds })
    const created = createSoiree({
      id: newSoireeId(),
      now: Date.now(),
      bandeId: choice.bande?.id ?? null,
      bandeName: choice.bande?.name ?? '',
      players: choice.players,
      vibe: ambiance.vibe,
      soft: ambiance.soft,
      length: ambiance.length,
      program,
    })
    syncSiteAmbiance(created)
    save(created)
  }

  if (!ready || !arrived) return <SoireeShell><p className="text-cream/60">{t('loading')}</p></SoireeShell>

  if (launching) {
    const game = games.find((g) => g.id === launching)
    return (
      <SoireeShell accent={launching}>
        <p role="status" className="pt-10 text-center font-display text-2xl font-bold text-cream">
          {t('launching', { game: game?.title ?? launching })}
        </p>
      </SoireeShell>
    )
  }

  if (intro && soiree && (soiree.phase === 'programme' || soiree.phase === 'entracte') && soiree.rounds[soiree.current]) {
    return (
      <SoireeShell accent={soiree.rounds[soiree.current]?.gameId}>
        <RoundIntro
          soiree={soiree}
          onStart={() => void launch(soiree)}
          onBack={() => setIntro(false)}
          onSkip={() => {
            setIntro(false)
            save(skipRound(soiree))
          }}
        />
      </SoireeShell>
    )
  }

  if (soiree?.phase === 'programme') {
    const program = soiree.rounds.map((r) => r.gameId)
    return (
      <SoireeShell accent={program[0]}>
        <StepHeader eyebrow={t('programme.eyebrow')} title={t('programme.title')} lead={t('programme.lead')} />
        <ProgrammeEditor
          program={program}
          onChange={(next) => save(replaceUpcoming(soiree, next))}
          playerCount={soiree.playerIds.length}
          onReroll={
            soiree.length === 'carte'
              ? undefined
              : () => save(replaceUpcoming(soiree, buildProgram({ rounds: SOIREE_LENGTH_ROUNDS[soiree.length as keyof typeof SOIREE_LENGTH_ROUNDS], vibe: soiree.vibe, playerCount: soiree.playerIds.length, hiddenIds, heatOf, vibesOf, soireeIds })))
          }
        />
        <SoireeCta>
          <Button variant="primary" size="gameLg" className="w-full" disabled={program.length === 0} onClick={() => setIntro(true)}>
            {program.length === 1 ? t('programme.launchOne') : t('programme.launch')}
          </Button>
          <Button variant="quiet" size="game" onClick={() => save(null)}>
            {t('programme.restart')}
          </Button>
        </SoireeCta>
      </SoireeShell>
    )
  }

  if (soiree?.phase === 'playing') {
    const round = soiree.rounds[soiree.current]
    const path = round ? getGameById(round.gameId)?.path : null
    return (
      <SoireeShell accent={round?.gameId}>
        <RoundView
          soiree={soiree}
          onGoToGame={() => path && router.push(path)}
          onClose={() => closeRound(soiree)}
          onRestart={() => void launch(soiree)}
          onSkip={() => save(skipRound(soiree))}
        />
      </SoireeShell>
    )
  }

  if (soiree?.phase === 'entracte') {
    return (
      <SoireeShell accent={soiree.rounds[soiree.current]?.gameId}>
        <EntracteView
          key={soiree.current}
          soiree={soiree}
          onLaunchNext={() => setIntro(true)}
          onSkipNext={() => save(skipRound(soiree))}
          onFinish={() => save(finishWithHistory(soiree, Date.now()).soiree)}
          onCorrect={(index, playerId, value) => correct(soiree, index, playerId, value)}
          onEditUpcoming={(next) => save(replaceUpcoming(soiree, next))}
          onRoundVote={(index, rating) => saveVote(soiree, (s) => setRoundVote(s, index, rating))}
        />
      </SoireeShell>
    )
  }

  if (soiree?.phase === 'finished') {
    return (
      <SoireeShell>
        <AdditionView
          soiree={soiree}
          onKeepBande={(name) => save(keepBande(soiree, name, Date.now()))}
          onVote={(rating) => saveVote(soiree, (s) => setSoireeVote(s, rating))}
          onRevanche={() => save(revancheOf(soiree, Date.now(), hiddenIds, heatOf, vibesOf, soireeIds))}
          onNew={() => {
            save(null)
            setStep('bande')
          }}
        />
      </SoireeShell>
    )
  }

  return (
    <SoireeShell>
      {step === 'bande' ? (
        <BandeStep
          initialCount={clampCount(params.get('joueurs'))}
          initialBandeId={params.get('bande')}
          onDone={(c) => {
            setChoice(c)
            setStep('ambiance')
          }}
        />
      ) : (
        <>
          <button type="button" onClick={() => setStep('bande')} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-amber-200 hover:text-amber-100">
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {t('backToBande')}
          </button>
          <AmbianceStep value={ambiance} onChange={setAmbiance} onDone={createProgramme} />
        </>
      )}
    </SoireeShell>
  )
}
