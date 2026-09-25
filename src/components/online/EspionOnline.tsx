"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Siren, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { Button } from '@/components/ui/button'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import type { EspionClientView } from '@/lib/espion/engine'
import { getEspionLocations } from '@/lib/espion/data'
import { botEmojiFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * QUI EST L'ESPION ? en ligne (serveur-autoritaire). `location` est null
 * pour l'espion tant que la manche n'est pas révélée ; `activeAccusation`
 * est PUBLIC en temps réel (contrairement au vote secret des autres jeux) —
 * cohérent avec une partie qui se joue à voix haute au vocal.
 */

function parseView(json: string | null | undefined): EspionClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EspionClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function EspionOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.espion.game')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [showAccuseGrid, setShowAccuseGrid] = useState(false)
  const [showGuessGrid, setShowGuessGrid] = useState(false)
  const locations = useMemo(() => getEspionLocations(user?.locale ?? 'fr'), [user?.locale])

  const inGame = room?.gameId === 'espion' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('espion', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » générique (résout aussi une
  // accusation expirée en priorité, cf. moteur). Se recale sur la PLUS
  // PROCHE des deux échéances (accusation en cours ou timer principal).
  // Arbitré par rang (cf. useAdvanceTick) : plus de rafale de 409.
  const nextDeadline =
    view && view.phaseEndsAt !== null
      ? view.activeAccusation
        ? Math.min(view.activeAccusation.endsAt, view.phaseEndsAt)
        : view.phaseEndsAt
      : null
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance: view && nextDeadline !== null ? { phaseKey: view.phaseKey, dueAt: nextDeadline } : null,
  })

  // Ticks « arbitre » (bots en attente + remplacement), avec secours par rang.
  const supportBot =
    view?.phase === 'discussion' && view.activeAccusation
      ? view.players.find((p) => p.isBot)
      : undefined
  const revealActorIsBot = Boolean(
    view?.phase === 'reveal' && view.players.find((p) => p.id === room?.currentTurnUserId)?.isBot
  )
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      supportBot || revealActorIsBot
        ? {
            body: { action: 'bot' },
            delayMs: view?.phase === 'reveal' ? 2500 : botTickDelayMs(supportBot?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  useEffect(() => {
    setShowAccuseGrid(false)
    setShowGuessGrid(false)
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="espion" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const activePlayers = view.players.filter((p) => !p.leftAt)
  const majorityNeeded = Math.floor(activePlayers.length / 2) + 1

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const totalPhaseMs = view.discussionMs
  const iSupported = view.activeAccusation?.supporters.includes(user.id) ?? false
  const iAmAccused = view.activeAccusation?.targetId === user.id

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const crewWon = view.winnerTeam === 'crew'
    const won = me?.role === view.winnerTeam
    return (
      <OnlineEndScreen
        confetti
        won={Boolean(won)}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className="h-14 w-14 text-gold" />
            <h2 className={cn('font-display text-3xl font-bold', crewWon ? 'text-cyan-200' : 'text-slate-200')}>
              {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
            </h2>
            <p className="text-sm text-white/60">
              {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
            </p>
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
        <p className="font-display text-sm font-bold uppercase tracking-widest text-gold/80">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-bold tabular-nums text-gold" />
        {view.location ? (
          <PlayingCard suit="spade" rank="Q" className="w-full max-w-xs">
            <div className="px-6 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('yourLocation')}</p>
              <p className="truncate font-display text-2xl font-bold tracking-wide text-[#24201A]">{view.location}</p>
            </div>
          </PlayingCard>
        ) : (
          <div className="w-full max-w-xs rounded-2xl border border-slate-400/30 bg-felt-deep/80 px-4 py-3 text-center">
            <p className="font-display text-sm font-bold text-slate-200">{t('youAreSpy')}</p>
          </div>
        )}
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Révélation de manche ─────────────────────────────────────────────────
  if (view.phase === 'reveal' && reveal) {
    const outcomeText =
      reveal.outcome === 'spy-caught'
        ? t('reveal.outcome.spyCaught', { name: nameOf(reveal.spyId) })
        : reveal.outcome === 'accusation-failed'
          ? t('reveal.outcome.accusationFailed')
          : reveal.outcome === 'spy-guessed-right'
            ? t('reveal.outcome.spyGuessedRight', { name: nameOf(reveal.spyId) })
            : reveal.outcome === 'spy-guessed-wrong'
              ? t('reveal.outcome.spyGuessedWrong')
              : t('reveal.outcome.timeout', { name: nameOf(reveal.spyId) })
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <Siren className={cn('h-10 w-10', reveal.winner === 'crew' ? 'text-cyan-300' : 'text-slate-300')} />
        <p className="font-display text-2xl font-bold text-gold">{outcomeText}</p>
        <p className="text-sm text-white/60">{t('reveal.location', { location: reveal.location })}</p>
        <p className="text-sm font-bold text-cyan-200">
          {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
        </p>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold hover:from-amber-400 hover:to-amber-500"
        >
          {view.roundWins.spy >= view.roundsToWin || view.roundWins.crew >= view.roundsToWin
            ? t('reveal.seeResult')
            : t('reveal.continue')}
        </Button>
      </div>
    )
  }

  // ── Discussion en cours ───────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-cream/85">
            {t('score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-gold">
              {t('phaseDiscussion')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {view.phaseEndsAt !== null && (
          <PhaseCountdown
            variant="bar"
            endsAt={view.phaseEndsAt}
            total={totalPhaseMs}
            dangerMs={30_000}
            colorClassName="bg-gold"
            dangerClassName="bg-suit-red"
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

      {/* Lieu (carte à jouer crème) ou statut espion (feutre) */}
      {view.location ? (
        <PlayingCard suit="spade" rank="Q">
          <div className="px-6 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('yourLocation')}</p>
            <p className="font-display text-xl font-bold tracking-wide text-[#24201A]">{view.location}</p>
          </div>
        </PlayingCard>
      ) : (
        <div className="rounded-2xl border border-slate-400/30 bg-felt-deep/80 px-4 py-3 text-center">
          <p className="font-display text-sm font-bold text-slate-200">{t('youAreSpy')}</p>
          <p className="mt-0.5 text-xs text-white/40">{t('spyHint')}</p>
        </div>
      )}

      {/* Accusation en cours */}
      <AnimatePresence>
        {view.activeAccusation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2 rounded-2xl border border-suit-red/40 bg-suit-red/10 p-3 text-center"
          >
            <p className="text-sm font-black">
              {t('accusation.title', { accuser: nameOf(view.activeAccusation.accuserId), target: nameOf(view.activeAccusation.targetId) })}
            </p>
            <p className="text-xs text-white/60">
              {t('accusation.support', { count: view.activeAccusation.supporters.length, needed: majorityNeeded })}
            </p>
            <PhaseCountdown
              variant="bar"
              endsAt={view.activeAccusation.endsAt}
              total={15_000}
              className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
              barClassName="h-full rounded-full bg-red-400"
            />
            {!iSupported && !iAmAccused && (
              <Button
                onClick={() => void sendAction({ action: 'support' })}
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-suit-red to-red-700 py-3 text-sm font-bold"
              >
                {t('accusation.supportButton')}
              </Button>
            )}
            {iSupported && <p className="text-xs font-semibold text-emerald-300">{t('accusation.supported')}</p>}
            {iAmAccused && <p className="text-xs font-semibold text-red-200">{t('accusation.youAreAccused')}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions : accuser / deviner */}
      {!view.activeAccusation && (
        <div className="flex flex-col gap-2">
          {!showAccuseGrid ? (
            <Button
              onClick={() => setShowAccuseGrid(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold hover:from-amber-400 hover:to-amber-500"
            >
              {t('accuseButton')}
            </Button>
          ) : (
            <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
              <p className="text-center text-xs font-semibold text-white/60">{t('accuseWho')}</p>
              <div className="grid grid-cols-2 gap-2">
                {activePlayers
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void sendAction({ action: 'accuse', targetId: p.id })}
                      disabled={busy}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream px-3 py-2 text-left text-[#24201A] transition-all',
                        'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)] hover:-translate-y-0.5 active:scale-95',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep'
                      )}
                    >
                      <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">{p.name}</span>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setShowAccuseGrid(false)}
                className="w-full text-center text-[11px] font-semibold text-white/40"
              >
                {t('cancel')}
              </button>
            </div>
          )}

          {!view.location && !showGuessGrid && (
            <Button
              onClick={() => setShowGuessGrid(true)}
              variant="outline"
              className="w-full rounded-2xl border-slate-400/30 bg-slate-600/10 py-4 text-sm font-bold text-white/80 hover:bg-slate-600/20"
            >
              {t('guessButton')}
            </Button>
          )}
          {!view.location && showGuessGrid && (
            <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
              <p className="text-center text-xs font-semibold text-white/60">{t('guessWhich')}</p>
              <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
                {locations.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => void sendAction({ action: 'guess-location', location: loc })}
                    disabled={busy}
                    className="rounded-lg border border-[#D8CCAE] bg-cream px-2 py-1.5 text-[11px] font-semibold text-[#24201A] shadow-[0_4px_10px_-6px_rgba(0,0,0,0.5)] transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep active:scale-95"
                  >
                    {loc}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowGuessGrid(false)}
                className="w-full text-center text-[11px] font-semibold text-white/40"
              >
                {t('cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-gold/15 bg-felt-deep/60 px-3 py-1 text-xs font-bold text-cream/80',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="espion" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
