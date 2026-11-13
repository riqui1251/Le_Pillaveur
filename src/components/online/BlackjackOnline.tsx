"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Flag, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseHeader } from './PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { TurnBanner } from '@/components/game/TurnBanner'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseBlackjackState, type BlackjackSyncedState } from '@/lib/online-game-state'
import { canDouble, canSplit } from '@/lib/blackjack/engine'
import { botAvatarFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { GameIconById } from '@/components/hub/GameIconById'
import { XpGainBanner } from './XpGainBanner'
import { OnlineEndScreen } from './OnlineEndScreen'
import { BjStakePicker, useBjUnits } from '@/app/[locale]/games/blackjack/components/blackjack-ui'
import { BjResultsList, BjTable } from '@/app/[locale]/games/blackjack/components/blackjack-table'
import {
  BjLandscapeButton,
  BjLandscapeHint,
  BjLandscapeShell,
  useLandscapeSwitch,
  usePhoneLandscape,
} from '@/app/[locale]/games/blackjack/components/landscape'
import { BjTally } from '@/app/[locale]/games/blackjack/components/blackjack-tally'

/** Black Jack en ligne : chacun contre le croupier, manches enchaînées. Aucune
 * info propre à un joueur : seule la carte fermée du croupier est cachée, à
 * tous, jusqu'à son tour. Cartes, mains et jetons viennent du jeu local. */

const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

// Barre d'action à mon tour : ligne d'état + deux rangées de boutons.
const ACTIONS_PADDING = 'pb-[calc(12rem+env(safe-area-inset-bottom,0px))]'

type Move = 'bet' | 'hit' | 'stand' | 'double' | 'split' | 'next-round' | 'end'

/** Joueur attendu : celui qui joue sa main, ou le premier qui n'a pas misé. */
function actorOf(view: BlackjackSyncedState) {
  if (view.phase === 'playing' && view.turn) return view.players[view.turn.player]
  if (view.phase === 'betting') return view.players.find((p) => !p.leftAt && p.stake === null)
  return undefined
}

export function BlackjackOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.blackjack')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [confirmDialog, confirm] = useConfirmAction()
  const reduceMotion = useReducedMotion()
  const [pending, setPending] = useState<{ move: Move; stake?: number } | null>(null)

  const inGame = room?.gameId === 'blackjack' && room.status === 'playing'
  const landscape = usePhoneLandscape()
  const units = useBjUnits()
  const switcher = useLandscapeSwitch()
  const tutorial = useGameTutorial('blackjack', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo<BlackjackSyncedState | null>(
    () => (inGame ? parseBlackjackState(room?.gameStateJson) : null),
    [inGame, room?.gameStateJson]
  )

  const turnOwner = view?.phase === 'playing' && view.turn ? view.players[view.turn.player] : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: turnOwner?.isBot ? { body: { action: 'bot' }, delayMs: botTickDelayMs(turnOwner.name) } : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  const afkTarget = view ? actorOf(view) : undefined
  const afkWatchable = Boolean(
    view &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  const turnStartedAt = useAfkTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    targetId: afkTarget?.id,
    enabled: afkWatchable,
  })
  const stateVersion = room?.stateVersion ?? -1
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  if (!inGame) return <GameOnlineLobby gameId="blackjack" />

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
      </div>
    )
  }

  const play = async (move: Move, body: Record<string, unknown>, stake?: number) => {
    setPending({ move, stake })
    try {
      await postAction({ ...body, expectedVersion: room.stateVersion })
    } finally {
      setPending(null)
    }
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const me = view.players.find((p) => p.id === user.id)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)

  if (view.phase === 'finished') {
    return (
      <OnlineEndScreen
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <GameIconById id="blackjack" surface="felt" className="h-12 w-12" />
            <h2 className="font-display text-3xl font-bold text-gold">{t('finishedTitle')}</h2>
            <p className="text-sm text-cream/70">{t('roundsPlayed', { count: view.round })}</p>
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm">
            <BjTally
              rows={view.players.map((p) => ({
                id: p.id,
                name: <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="truncate" />,
                avatar: (
                  <span className="flex items-center gap-1">
                    <RankCrest role={cosmetics.get(p.id)?.role} size="sm" />
                    <PlayerAvatarGlyph value={iconOf(p)} />
                  </span>
                ),
                tally: view.totals[p.id],
              }))}
            />
          </div>
        }
        xp={<XpGainBanner won={false} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  const myTurn = Boolean(turnOwner && turnOwner.id === user.id)
  const myHand = myTurn && view.turn ? turnOwner!.hands[view.turn.hand] : undefined
  const mustBet = view.phase === 'betting' && me && !me.leftAt && me.stake === null
  const canAdvance = view.phase === 'results' && me && !me.leftAt

  const askEnd = async () => {
    const ok = await confirm({
      title: t('online.endConfirm.title'),
      description: units.soft ? t('soft.onlineEndDescription') : t('online.endConfirm.description'),
      confirmLabel: t('online.endConfirm.confirm'),
      cancelLabel: t('online.endConfirm.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    setPending({ move: 'end' })
    try {
      const res = await postAction({ action: 'end' })
      if (res?.status === 409) await postAction({ action: 'end' })
    } finally {
      setPending(null)
    }
  }

  const phaseLabel = t(`phase.${view.phase}`)
  const barStatus =
    view.phase === 'betting'
      ? mustBet
        ? t('stakeSelf')
        : t('online.waitingBets')
      : view.phase === 'playing'
        ? myTurn
          ? t('online.yourHand')
          : t('turnOf', { name: turnOwner?.name ?? '' })
        : t('phase.results')

  // Morceaux communs au portrait (barre du bas) et au paysage (colonne de droite).
  const table = (
    <BjTable
      variant={landscape ? 'tv' : 'phone'}
      dealer={view.dealer}
      dealerBlackjack={view.dealerBlackjack}
      showResults={view.phase === 'results'}
      seats={view.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        avatar: <PlayerAvatarGlyph value={iconOf(p)} />,
        stake: p.stake,
        hands: p.hands,
        results: p.results,
        activeHand: view.turn?.player === i && view.phase === 'playing' ? view.turn.hand : null,
        isMe: p.id === user.id,
        away: Boolean(p.leftAt),
      }))}
    />
  )

  const endButton = (
    <Button
      variant="ghost"
      size="gameIcon"
      onClick={() => void askEnd()}
      disabled={busy}
      aria-label={t('online.endGame')}
      title={t('online.endGame')}
      className="border border-gold/20 bg-felt-deep/60 text-cream/80 hover:bg-gold/10 hover:text-gold"
    >
      {pending?.move === 'end' ? (
        <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
      ) : (
        <Flag aria-hidden className="h-5 w-5" />
      )}
    </Button>
  )

  const alerts = (
    <>
      {actionError && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
          {actionError}
        </div>
      )}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}
      {afkWatch && afkTarget && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
          {afkTarget.id === user.id && <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />}
          <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) =>
              afkTarget.id === user.id
                ? t('online.afkWarningSelf', { seconds })
                : t('online.afkWarning', { name: afkTarget.name, seconds })
            }
          </PhaseCountdown>
        </div>
      )}
    </>
  )

  const actions = (
    <>
      {mustBet && (
        <BjStakePicker
          label={t('stakeLabel')}
          chipsOnly={landscape}
          disabled={busy}
          pendingStake={pending?.move === 'bet' ? pending.stake : null}
          onPick={(stake) => void play('bet', { action: 'bet', stake }, stake)}
        />
      )}
      {myTurn && myHand && turnOwner && (
        <div className="grid grid-cols-2 gap-2">
          {(['hit', 'stand', 'double', 'split'] as const).map((move) => {
            const allowed =
              move === 'double' ? canDouble(myHand) : move === 'split' ? canSplit(turnOwner, myHand) : true
            const big = !landscape && (move === 'hit' || move === 'stand')
            return (
              <Button
                key={move}
                variant={move === 'hit' ? 'primary' : 'quiet'}
                size={big ? 'gameLg' : 'game'}
                disabled={busy || !allowed}
                className={cn(landscape && 'px-1 text-xs', pending?.move === move && 'disabled:opacity-100')}
                onClick={() => void play(move, { action: move })}
              >
                {pending?.move === move && <Loader2 aria-hidden className="mr-1 h-4 w-4 motion-safe:animate-spin" />}
                {t(`actions.${move}`)}
              </Button>
            )
          })}
        </div>
      )}
      {canAdvance && (
        <Button
          variant="primary"
          size={landscape ? 'game' : 'gameLg'}
          className={cn('w-full', pending?.move === 'next-round' && 'disabled:opacity-100')}
          disabled={busy}
          onClick={() => void play('next-round', { action: 'next-round' })}
        >
          {pending?.move === 'next-round' && <Loader2 aria-hidden className="mr-2 h-5 w-5 motion-safe:animate-spin" />}
          {t('nextRound')}
        </Button>
      )}
    </>
  )

  if (landscape) {
    return (
      <>
        {confirmDialog}
        {tutorial.open && <GameTutorialModal gameId="blackjack" onClose={tutorial.close} />}
        <BjLandscapeShell
          table={table}
          onExit={() => void switcher.exit()}
          extra={endButton}
          status={
            <>
              <span className="block text-gold">
                {phaseLabel} · {t('round', { count: view.round })}
              </span>
              {barStatus !== phaseLabel && (
                <span className={cn('block text-sm', myTurn ? 'font-bold text-gold' : 'text-cream')}>{barStatus}</span>
              )}
              <div className="mt-2 space-y-1 text-left [&>div]:px-2 [&>div]:py-1 [&>div]:text-xs">{alerts}</div>
            </>
          }
          actions={actions}
        />
      </>
    )
  }

  return (
    <>
      {confirmDialog}
      <BjLandscapeHint show={switcher.hint} />
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          myTurn || canAdvance || mustBet ? ACTIONS_PADDING : onlineActionBarPadding('default')
        )}
      >
        <PhaseHeader
          phase={`${phaseLabel} · ${t('round', { count: view.round })}`}
          right={
            <>
              <BjLandscapeButton onClick={() => void switcher.enter()} className="h-11 w-11" />
              {endButton}
              <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
            </>
          }
        />
        {tutorial.open && <GameTutorialModal gameId="blackjack" onClose={tutorial.close} />}

        {turnOwner && (
          <TurnBanner
            mine={myTurn}
            name={turnOwner.name}
            avatar={<PlayerAvatarGlyph value={iconOf(turnOwner)} />}
            hint={myTurn ? t('online.yourHandHint') : undefined}
            alertOnMine
          />
        )}

        {alerts}
        {table}

        {view.phase === 'results' && (
          <BjResultsList
            rows={view.players.map((p) => ({
              id: p.id,
              name: <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="truncate" />,
              avatar: <PlayerAvatarGlyph value={iconOf(p)} />,
              results: p.results,
            }))}
          />
        )}

        <p className="text-center text-xs text-cream/60">{t('shoe', { count: view.shoeCount })}</p>
      </div>

      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {actions}
      </OnlineActionBar>
    </>
  )
}
