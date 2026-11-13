"use client"

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Flag, RotateCcw } from 'lucide-react'
import type { Player } from '@/lib/players'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { EndActionDock } from '@/components/game/EndActionDock'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import {
  BjEngineError,
  canDouble,
  canSplit,
  createBjState,
  currentBjHand,
  reduceBj,
  toBjClientView,
  type BjAction,
  type BjState,
} from '@/lib/blackjack/engine'
import { BjStakePicker, useBjUnits } from './blackjack-ui'
import { BjResultsList, BjTable } from './blackjack-table'
import { BjLandscapeButton, BjLandscapeHint, BjLandscapeShell, useLandscapeSwitch, usePhoneLandscape } from './landscape'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { BjTally } from './blackjack-tally'

type GameProps = {
  players: Player[]
  onGameEnd: () => void
  updatePlayerStats: (id: string, game: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

const SAVE_ID = 'blackjack'
const SAVE_VERSION = 1

type BlackjackSave = { playerIds: string[]; state: BjState }

// Barre d'action à 2 rangées (Tirer/Rester puis Doubler/Séparer) + zone sûre.
const ACTIONS_PADDING = 'pb-[calc(10rem+env(safe-area-inset-bottom,0px))]'

function newGame(players: Player[]): BjState {
  return createBjState(
    players.map((p) => ({ id: p.id, name: p.name })),
    `${Date.now()}-${Math.random()}`
  )
}

export default function Game({ players, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.blackjack')
  const tCommon = useTranslations('common')
  const [confirmDialog, confirm] = useConfirmAction()
  const [state, setState] = useState<BjState | null>(null)
  const [ended, setEnded] = useState(false)
  const session = useResumableLocalGame<BlackjackSave>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const countedRef = useRef(false)
  const landscape = usePhoneLandscape()
  const units = useBjUnits()
  const switcher = useLandscapeSwitch()

  // Tant qu'une reprise est proposée, on ne distribue rien.
  useEffect(() => {
    if (!session.ready || session.pending || state || players.length < 1) return
    setState(newGame(players))
  }, [session.ready, session.pending, state, players])

  useEffect(() => {
    if (!state || ended) return
    session.save({ playerIds: players.map((p) => p.id), state })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ended])

  const resume = () => {
    const saved = session.accept()
    if (!saved || !isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    setState(saved.state)
  }

  const dispatch = (action: BjAction) => {
    setState((prev) => {
      if (!prev) return prev
      try {
        return reduceBj(prev, action)
      } catch (e) {
        // Double toucher sur un bouton déjà dépassé : on ignore.
        if (e instanceof BjEngineError) return prev
        throw e
      }
    })
  }

  const creditGame = () => {
    if (countedRef.current || !state) return
    countedRef.current = true
    players.forEach((p) => {
      const tally = state.totals[p.id]
      updatePlayerStats(p.id, 'blackjack', { gamesPlayed: 1, totalDrinks: tally?.drunk ?? 0, wins: tally?.wins ?? 0 })
    })
  }

  const played = Boolean(state && Object.values(state.totals).some((x) => x.hands > 0))

  const quit = () => {
    if (played) creditGame()
    session.clear()
    onGameEnd()
  }

  const askFinish = async () => {
    if (!played) {
      quit()
      return
    }
    const ok = await confirm({
      title: t('endConfirm.title'),
      description: units.soft ? t('soft.endDescription') : t('endConfirm.description'),
      confirmLabel: t('endConfirm.confirm'),
      cancelLabel: t('endConfirm.cancel'),
      tone: 'primary',
    })
    if (!ok) return
    creditGame()
    session.clear()
    setEnded(true)
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tCommon('confirmRestart.title'),
      description: tCommon('confirmRestart.description'),
      confirmLabel: tCommon('confirmRestart.confirm'),
      cancelLabel: tCommon('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    if (played) creditGame()
    countedRef.current = false
    setState(newGame(players))
  }

  const replay = () => {
    countedRef.current = false
    setEnded(false)
    setState(newGame(players))
  }

  if (!session.ready) return null
  if (players.length < 1) return <div className="p-6 text-center text-red-300">{t('minPlayers')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resume} onDiscard={session.discard} />
  if (!state) return null

  const byId = new Map(players.map((p) => [p.id, p]))

  if (ended) {
    return (
      <GameShell title={t('title')} onBack={quit} maxWidth={576} contentClassName="gap-4">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <GameIconById id="blackjack" surface="felt" className="h-12 w-12" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('finishedTitle')}</h2>
          <p className="text-sm text-cream/80">{t('roundsPlayed', { count: state.phase === 'results' ? state.round : state.round - 1 })}</p>
        </div>
        <BjTally
          rows={players.map((p) => ({
            id: p.id,
            name: <PlayerName player={p} />,
            avatar: <PlayerIcon player={p} size="md" className="h-10 w-10 text-xl" />,
            tally: state.totals[p.id],
          }))}
        />
        <EndActionDock voiceGutter={false} feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="blackjack" />}>
          <Button variant="primary" size="gameLg" className="w-full" onClick={replay}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tCommon('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" onClick={quit}>
            {tCommon('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  const current = currentBjHand(state)
  const bettor = state.phase === 'betting' ? state.players.find((p) => p.stake === null) : undefined
  const bettorPlayer = bettor ? byId.get(bettor.id) : undefined

  // Morceaux communs aux deux mises en page (portrait sous le pouce, paysage en colonne).
  const prompt = current
    ? current.player.hands.length > 1
      ? t('turnHand', { name: current.player.name, index: state.turn!.hand + 1, count: current.player.hands.length })
      : t('turnOf', { name: current.player.name })
    : bettor
      ? t('stakeFor', { name: bettor.name })
      : state.phase === 'results'
        ? t('phase.results')
        : ''

  const moveButtons = current ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="primary" size={landscape ? 'game' : 'gameLg'} onClick={() => dispatch({ type: 'HIT', playerId: current.player.id })}>
        {t('actions.hit')}
      </Button>
      <Button variant="quiet" size={landscape ? 'game' : 'gameLg'} onClick={() => dispatch({ type: 'STAND', playerId: current.player.id })}>
        {t('actions.stand')}
      </Button>
      <Button
        variant="quiet"
        size="game"
        className={landscape ? 'px-1 text-xs' : undefined}
        disabled={!canDouble(current.hand)}
        onClick={() => dispatch({ type: 'DOUBLE', playerId: current.player.id })}
      >
        {t('actions.double')}
      </Button>
      <Button
        variant="quiet"
        size="game"
        className={landscape ? 'px-1 text-xs' : undefined}
        disabled={!canSplit(current.player, current.hand)}
        onClick={() => dispatch({ type: 'SPLIT', playerId: current.player.id })}
      >
        {t('actions.split')}
      </Button>
    </div>
  ) : null

  const picker = bettor ? (
    <BjStakePicker
      label={t('stakeLabel')}
      chipsOnly={landscape}
      onPick={(stake) => dispatch({ type: 'BET', playerId: bettor.id, stake })}
    />
  ) : null

  const nextButton =
    state.phase === 'results' ? (
      <Button
        variant="primary"
        size={landscape ? 'game' : 'gameLg'}
        className="w-full"
        onClick={() => dispatch({ type: 'NEXT_ROUND', playerId: state.players[0].id })}
      >
        {t('nextRound')}
      </Button>
    ) : null

  const table = (
    <BjTable
      variant={landscape ? 'tv' : 'phone'}
      dealer={toBjClientView(state).dealer}
      dealerBlackjack={state.dealerBlackjack}
      showResults={state.phase === 'results'}
      seats={state.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        avatar: <PlayerAvatarGlyph value={byId.get(p.id)?.preferences.icon ?? '👤'} />,
        stake: p.stake,
        hands: p.hands,
        results: p.results,
        activeHand: state.turn?.player === i ? state.turn.hand : null,
      }))}
    />
  )

  const liveStatus = (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {prompt}
    </p>
  )

  if (landscape) {
    return (
      <>
        {confirmDialog}
        {liveStatus}
        <BjLandscapeShell
          table={table}
          onExit={() => void switcher.exit()}
          status={
            <>
              <span className="block text-gold">{t('round', { count: state.round })}</span>
              <span className="flex items-center justify-center gap-1.5 text-sm text-cream">
                {bettorPlayer && <PlayerAvatarGlyph value={bettorPlayer.preferences.icon ?? '👤'} />}
                {prompt}
              </span>
            </>
          }
          extra={
            <Button
              variant="ghost"
              size="gameIcon"
              onClick={() => void askFinish()}
              aria-label={t('endConfirm.title')}
              title={t('endConfirm.title')}
              className="border border-gold/20 bg-black/20 text-cream/80 hover:text-gold"
            >
              <Flag aria-hidden className="h-5 w-5" />
            </Button>
          }
          actions={moveButtons ?? picker ?? nextButton}
        />
      </>
    )
  }

  const actionBar =
    moveButtons || picker ? (
      <div className="flex w-full flex-col gap-2">
        <p
          className={
            bettor
              ? 'flex items-center justify-center gap-2 text-center font-display text-lg font-bold text-cream'
              : 'text-center text-sm text-cream/80'
          }
        >
          {bettorPlayer && <PlayerAvatarGlyph value={bettorPlayer.preferences.icon ?? '👤'} />}
          {prompt}
        </p>
        {moveButtons ?? picker}
      </div>
    ) : (
      nextButton ?? undefined
    )

  return (
    <>
      {confirmDialog}
      <BjLandscapeHint show={switcher.hint} />
      <GameShell
        title={t('title')}
        headerSubtitle={<span className="text-xs text-cream/70">{t('round', { count: state.round })}</span>}
        onBack={() => void askFinish()}
        maxWidth={700}
        headerRight={
          <div className="flex items-center gap-2">
            <BjLandscapeButton onClick={() => void switcher.enter()} />
            <Button
              variant="ghost"
              size="gameIcon"
              onClick={() => void askRestart()}
              aria-label={tCommon('confirmRestart.confirm')}
              title={tCommon('confirmRestart.confirm')}
              className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
            >
              <RotateCcw aria-hidden className="h-5 w-5" />
            </Button>
          </div>
        }
        actionBar={actionBar}
        contentClassName={current || bettor ? ACTIONS_PADDING : undefined}
      >
        <div className="space-y-3 text-cream">
          {table}
          {liveStatus}
          {state.phase === 'results' && (
            <BjResultsList
              rows={state.players.map((p) => ({
                id: p.id,
                name: p.name,
                avatar: <PlayerAvatarGlyph value={byId.get(p.id)?.preferences.icon ?? '👤'} />,
                results: p.results,
              }))}
            />
          )}
          <p className="text-center text-xs text-cream/60">{t('shoe', { count: state.shoe.length })}</p>
        </div>
      </GameShell>
    </>
  )
}
