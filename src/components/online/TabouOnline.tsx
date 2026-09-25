"use client"

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Ear, Mic, SkipForward, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TabouClientView, TabouTeam } from '@/lib/tabou/engine'
import { TABOU_ROUND_MS } from '@/lib/tabou/engine'
import { botEmojiFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * TABOU VOCAL en ligne (serveur-autoritaire). `currentWord` n'est envoyé
 * qu'au décrivant (`isDescriber`) tant que la manche est en cours ; les
 * autres ne voient que le timer et leur bouton de rôle (coéquipier =
 * TROUVÉ, adversaire = TABOU). `lastRoundWord` devient public au bilan.
 */

function parseView(json: string | null | undefined): TabouClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as TabouClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const TEAM_STYLES: Record<TabouTeam, { chip: string; card: string; text: string }> = {
  A: { chip: 'border-sky-400/25 bg-sky-500/10 text-sky-200', card: 'border-sky-400/30 bg-sky-500/10', text: 'text-sky-300' },
  B: { chip: 'border-rose-400/25 bg-rose-500/10 text-rose-200', card: 'border-rose-400/30 bg-rose-500/10', text: 'text-rose-300' },
}

export function TabouOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.tabou.game')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)

  const inGame = room?.gameId === 'tabou' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('tabou', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » générique, arbitré par rang.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots en attente au bilan + remplacement), avec secours
  // par rang (cf. useBotReferee).
  const roundEndActor =
    view?.phase === 'roundEnd'
      ? view.players.find((p) => p.id === room?.currentTurnUserId)
      : undefined
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: roundEndActor?.isBot
      ? { body: { action: 'bot' }, delayMs: botTickDelayMs(roundEndActor.name) }
      : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="tabou" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const describer = view.players.find((p) => p.id === view.describerId)
  const myTeam = me?.team
  const isTeammate = !view.isDescriber && myTeam && describer?.team === myTeam
  const isOpponent = !view.isDescriber && myTeam && describer?.team !== myTeam
  const finished = view.phase === 'finished'
  const won = finished && myTeam && view.winnerTeam === myTeam

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })


  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <OnlineEndScreen
        confetti
        won={Boolean(won)}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        rematchClassName="from-emerald-600 to-teal-500"
        header={
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className={cn('h-14 w-14', view.winnerTeam === 'A' ? 'text-sky-400' : 'text-rose-400')} />
            <h2 className="font-display text-3xl font-bold text-gold">
              {view.winnerTeam === 'A' ? t('victory.teamAWin') : t('victory.teamBWin')}
            </h2>
            <p className="text-sm text-white/60">{t('score', { a: view.scores.A, b: view.scores.B })}</p>
          </motion.div>
        }
        xp={<XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300/80">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-emerald-200" />
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Bilan de manche ───────────────────────────────────────────────────────
  if (view.phase === 'roundEnd') {
    const target = view.targetScore
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/80">{t('roundEnd.title')}</p>
        {view.lastRoundWord && (
          <p className="text-2xl font-black">{t('roundEnd.wordWas', { word: view.lastRoundWord.word })}</p>
        )}
        <div className="flex gap-4 text-sm font-bold">
          <span className="text-emerald-300">✅ {view.roundStats.found} {t('roundEnd.found')}</span>
          <span className="text-white/50">⏭ {view.roundStats.passed} {t('roundEnd.passed')}</span>
          <span className="text-red-300">🚫 {view.roundStats.taboo} {t('roundEnd.taboo')}</span>
        </div>
        <p className="text-sm font-bold text-emerald-200">{t('score', { a: view.scores.A, b: view.scores.B })}</p>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-4 text-sm font-bold"
        >
          {view.scores.A >= target || view.scores.B >= target ? t('roundEnd.seeResult') : t('roundEnd.continue')}
        </Button>
      </div>
    )
  }

  // ── Manche en cours (describing) ─────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">{t('score', { a: view.scores.A, b: view.scores.B })}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              {t('phaseDescribing')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {view.phaseEndsAt !== null && (
          <PhaseCountdown
            variant="bar"
            endsAt={view.phaseEndsAt}
            total={TABOU_ROUND_MS}
            dangerMs={15_000}
            colorClassName="bg-emerald-400"
            dangerClassName="bg-red-400"
          />
        )}
      </div>

      {/* Coup refusé (mauvaise phase, pas ton tour, expulsion…) — 3 s */}
      {actionError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-100">
          {actionError}
        </div>
      )}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {view.isDescriber && view.currentWord ? (
        <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-600/15 to-transparent p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('yourWord')}</p>
          <p className="text-3xl font-black tracking-wide">{view.currentWord.word}</p>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-300/70">{t('tabooWords')}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {view.currentWord.taboo.map((w) => (
                <span key={w} className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-200">
                  {w}
                </span>
              ))}
            </div>
          </div>
          <Button
            onClick={() => void sendAction({ action: 'pass' })}
            disabled={busy}
            variant="outline"
            className="w-full rounded-xl border-white/15 bg-white/5 py-3 text-sm font-bold text-white/80 hover:bg-white/10"
          >
            <SkipForward className="mr-2 h-4 w-4" /> {t('passButton')}
          </Button>
        </div>
      ) : isTeammate ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center">
          <Mic className="h-8 w-8 text-emerald-300" />
          <p className="text-sm font-semibold text-white/80">
            {t('teammateHint', { name: describer?.name ?? '' })}
          </p>
          <Button
            onClick={() => void sendAction({ action: 'found' })}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-6 text-lg font-black"
          >
            {t('foundButton')}
          </Button>
        </div>
      ) : isOpponent ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <Ear className="h-7 w-7 text-white/50" />
          <p className="text-sm font-semibold text-white/60">
            {t('opponentHint', { name: describer?.name ?? '' })}
          </p>
          <Button
            onClick={() => void sendAction({ action: 'taboo-called' })}
            disabled={busy}
            variant="outline"
            className="w-full rounded-xl border-red-400/30 bg-red-500/10 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20"
          >
            {t('tabooButton')}
          </Button>
        </div>
      ) : null}

      {/* Joueurs par équipe */}
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((team) => (
          <div key={team} className={cn('rounded-xl border p-2', TEAM_STYLES[team].card)}>
            <p className={cn('mb-1.5 text-[10px] font-bold uppercase tracking-wide', TEAM_STYLES[team].text)}>
              {team === 'A' ? t('teamA') : t('teamB')}
            </p>
            <div className="flex flex-wrap gap-1">
              {view.players.filter((p) => p.team === team).map((p) => (
                <span
                  key={p.id}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
                    TEAM_STYLES[team].chip,
                    p.id === view.describerId && 'ring-1 ring-white/50',
                    p.leftAt && 'opacity-40'
                  )}
                >
                  <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="tabou" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
