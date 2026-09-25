"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BLUFF_FAKE_MAX_LEN, type BluffClientView } from '@/lib/bluff/engine'
import { botEmojiFromName, botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * LE GRAND BLUFF en ligne (serveur-autoritaire). Vue déjà filtrée : les
 * bluffs des autres n'arrivent jamais avant le reveal, les candidats de vote
 * sont anonymisés (`voteOptions`, jamais `isReal`/`authorId`). `submit` et
 * `vote` sont des phases SIMULTANÉES — pas de « tour » individuel, juste une
 * échéance commune (tick `advance`).
 */

function parseView(json: string | null | undefined): BluffClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as BluffClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function BluffOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.bluff.game')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [fakeInput, setFakeInput] = useState('')

  const inGame = room?.gameId === 'bluff' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('bluff', inGame)
  const cosmetics = useMemberCosmetics(room)

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick)
  // — le rang 0 tire à l'échéance, le suivant prend le relais 4 s plus tard si
  // son téléphone est verrouillé, et la version qui bouge coupe les autres.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots en attente + remplacement), avec secours par rang
  // (cf. useBotReferee). submit/vote sont simultanés → pas d'acteur unique.
  const pendingBot =
    view?.phase === 'submit'
      ? view.players.find((p) => p.isBot && !p.hasSubmitted)
      : view?.phase === 'vote'
        ? view.players.find((p) => p.isBot && !p.hasVoted)
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
      pendingBot || revealActorIsBot
        ? {
            body: { action: 'bot' },
            delayMs: view?.phase === 'reveal' ? 2500 : botTickDelayMs(pendingBot?.name),
          }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Vide le champ de bluff à chaque nouvel état.
  useEffect(() => {
    setFakeInput('')
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="bluff" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-400/30 border-t-rose-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })

  const fakeTrimmed = fakeInput.trim()
  const fakeOk = fakeTrimmed.length > 0 && fakeTrimmed.length <= BLUFF_FAKE_MAX_LEN
  const totalPhaseMs = view.phase === 'submit' ? 45_000 : 60_000
  const submittedCount = view.players.filter((p) => p.hasSubmitted).length
  const votedCount = view.players.filter((p) => p.hasVoted).length

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const sorted = [...view.players].sort((a, b) => b.score - a.score)
    const won = view.winnerId === user.id
    return (
      <OnlineEndScreen
        confetti
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        rematchClassName="from-rose-600 to-amber-500"
        header={
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy className="h-14 w-14 text-amber-400" />
            <h2 className="font-display text-3xl font-bold text-gold">
              {view.winnerId ? t('victory.winnerIs', { name: nameOf(view.winnerId) }) : t('victory.tie')}
            </h2>
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-white/40">
              {t('victory.finalScore')}
            </p>
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.id === view.winnerId
                    ? 'border-amber-400/40 bg-amber-500/10'
                    : 'border-white/10 bg-white/5'
                )}
              >
                <span className="w-5 shrink-0 text-center text-xs font-black text-white/40">{i + 1}</span>
                <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-amber-200">{p.score}</span>
              </div>
            ))}
          </div>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-300/80">{t('countdown.title')}</p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="text-8xl font-black tabular-nums text-rose-200" />
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : manche + phase + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('round', { n: view.promptIdx + 1, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">
              {view.phase === 'submit' && t('phaseSubmit')}
              {view.phase === 'vote' && t('phaseVote')}
              {view.phase === 'reveal' && t('phaseReveal')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {view.phaseEndsAt !== null && (
          <PhaseCountdown
            variant="bar"
            endsAt={view.phaseEndsAt}
            total={totalPhaseMs}
            dangerMs={10_000}
            colorClassName="bg-rose-400"
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
      {/* Bannière retour */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}

      {/* Question */}
      {view.prompt && (
        <div className="rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-600/15 to-transparent px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{t('promptLabel')}</p>
          <p className="text-lg font-black">{view.prompt}</p>
        </div>
      )}

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-rose-400/30 bg-felt-deep/80 p-4"
          >
            <p className="text-center text-sm font-bold text-emerald-200">
              {t('reveal.realAnswer', { answer: reveal.realAnswer })}
            </p>
            <div className="space-y-1.5">
              {reveal.candidates.map((c) => (
                <div
                  key={c.candidateId}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2',
                    c.isReal ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/8 bg-white/4'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">« {c.text} »</span>
                  {!c.isReal && c.authorId && (
                    <span className="max-w-[35%] shrink-0 truncate text-xs text-white/40">{nameOf(c.authorId)}</span>
                  )}
                  {c.votes.length > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/70">
                      {c.votes.map((id) => {
                        const voter = view.players.find((p) => p.id === id)
                        return (
                          <PlayerAvatarGlyph
                            key={id}
                            value={iconOf({ id, name: voter?.name ?? '', isBot: voter?.isBot ?? false })}
                          />
                        )
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {Object.keys(reveal.pointsAwarded).length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-amber-200">
                {Object.entries(reveal.pointsAwarded)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, pts]) => (
                    <span key={id} className="rounded-full bg-amber-500/10 px-2 py-0.5 font-bold">
                      {nameOf(id)} +{pts}
                    </span>
                  ))}
              </div>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 py-4 text-sm font-bold"
            >
              {view.promptIdx + 1 >= view.totalRounds ? t('reveal.seeResult') : t('reveal.continue')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soumission du bluff */}
      {view.phase === 'submit' && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          {view.myFake ? (
            <p className="text-center text-sm font-bold text-white/70">
              {t('submitted', { count: submittedCount, total: view.players.length })}
            </p>
          ) : (
            <>
              <p className="text-center text-sm font-bold">{t('submitPrompt')}</p>
              <div className="flex gap-2">
                <input
                  value={fakeInput}
                  onChange={(e) => setFakeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fakeOk && !busy) {
                      void sendAction({ action: 'submit-fake', text: fakeTrimmed })
                    }
                  }}
                  maxLength={BLUFF_FAKE_MAX_LEN}
                  placeholder={t('submitPlaceholder')}
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-rose-400 focus:outline-none"
                />
                <Button
                  onClick={() => void sendAction({ action: 'submit-fake', text: fakeTrimmed })}
                  disabled={busy || !fakeOk}
                  className="shrink-0 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-4 font-bold"
                  aria-label={t('submitSend')}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Vote */}
      {view.phase === 'vote' && view.voteOptions && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-sm font-bold">
            {view.myVote ? t('voted', { count: votedCount, total: view.players.length }) : t('votePrompt')}
          </p>
          <div className="space-y-1.5">
            {view.voteOptions.map((opt) => {
              const chosen = view.myVote === opt.candidateId
              const disabled = Boolean(view.myVote) || busy
              return (
                <button
                  key={opt.candidateId}
                  onClick={() => void sendAction({ action: 'vote', candidateId: opt.candidateId })}
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all',
                    chosen
                      ? 'border-rose-400/70 bg-rose-500/20 ring-2 ring-rose-400'
                      : 'border-white/10 bg-white/5',
                    !disabled && 'hover:bg-white/10 active:scale-95'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">« {opt.text} »</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="bluff" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
