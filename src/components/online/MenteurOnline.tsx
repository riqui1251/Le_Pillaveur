"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Beer, Eye, EyeOff, Home, Minus, Plus, RefreshCw, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isLegalRaise, type MenteurBid, type MenteurClientView } from '@/lib/menteur/engine'
import { CssDie } from '@/components/games/CssDie'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'

/**
 * LE MENTEUR en ligne (serveur-autoritaire). La vue reçue est déjà filtrée :
 * seuls MES dés arrivent au client — ceux des autres sont réduits à un compte
 * (anti-triche), sauf pendant la révélation (gobelets levés, publics).
 * Mobile-first : gros dés tactiles, enchère en steppers, bouton MENTEUR !
 */

// Le dé CSS vit dans components/games/CssDie (partagé avec l'écran TV).

function parseView(json: string | null | undefined): MenteurClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as MenteurClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/** Vivant côté vue client : les dés des autres sont masqués → compte seul. */
function aliveInView(p: { diceCount: number }): boolean {
  return p.diceCount > 0
}

/** Suggestion de relance minimale légale (préremplit les steppers). */
function minimalLegalBid(
  prev: MenteurBid | null,
  totalDice: number
): { qty: number; face: number } {
  for (let qty = 1; qty <= totalDice; qty += 1) {
    for (const face of [2, 3, 4, 5, 6, 1]) {
      if (isLegalRaise(prev, qty, face, totalDice)) return { qty, face }
    }
  }
  return { qty: 1, face: 2 }
}

const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

const Die = CssDie

export function MenteurOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.menteur.game')
  const [busy, setBusy] = useState(false)
  const [hideDice, setHideDice] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'menteur' && room.status === 'playing'
  const tutorial = useGameTutorial('menteur', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  const totalDice = useMemo(
    () => (view ? view.players.reduce((s, p) => s + p.diceCount, 0) : 0),
    [view]
  )

  // Steppers d'enchère, resynchronisés à chaque nouvel état serveur.
  const stateVersion = room?.stateVersion ?? -1
  const [bidQty, setBidQty] = useState(1)
  const [bidFace, setBidFace] = useState(2)
  const syncedVersionRef = useRef(-1)
  useEffect(() => {
    if (!view || syncedVersionRef.current === stateVersion) return
    syncedVersionRef.current = stateVersion
    // En manche Palifico avec enchère en cours, la face est verrouillée.
    if (view.palifico && view.currentBid) {
      setBidQty(view.currentBid.qty + 1)
      setBidFace(view.currentBid.face)
      return
    }
    const suggestion = minimalLegalBid(view.currentBid, totalDice)
    setBidQty(suggestion.qty)
    setBidFace(suggestion.face)
  }, [view, stateVersion, totalDice])

  // Ticks « arbitre » (premier humain présent) : tour d'un bot → un coup ;
  // joueur parti depuis 3 min → remplacement. expectedVersion rend les ticks
  // concurrents inoffensifs (le serveur revalide tout).
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (action: 'bot' | 'replace-left') => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const active = view.players.find((p) => p.id === room.currentTurnUserId)
    if (active?.isBot) {
      botTimer = setTimeout(() => send('bot'), view.phase === 'reveal' ? 2600 : 1300)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send('replace-left')
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  // Base locale des comptes à rebours AFK (l'autorité reste l'horloge serveur).
  const turnStartRef = useRef({ version: stateVersion, at: Date.now() })
  if (turnStartRef.current.version !== stateVersion) {
    turnStartRef.current = { version: stateVersion, at: Date.now() }
  }

  const afkTarget = view?.players.find((p) => p.id === room?.currentTurnUserId)
  const afkWatchable = Boolean(
    view &&
      view.phase !== 'finished' &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  useEffect(() => {
    if (!view || !user || !room || !afkWatchable) return
    if (!afkTarget || afkTarget.id === user.id) return
    const expectedVersion = room.stateVersion
    const check = () => {
      if (Date.now() - turnStartRef.current.at < ONLINE_REPLACE_GRACE_MS) return
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'replace-afk', expectedVersion }),
      })
    }
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, user, room, afkWatchable, afkTarget?.id])

  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!someoneLeft && !afkWatch) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [someoneLeft, afkWatch])

  if (!inGame) {
    return <GameOnlineLobby gameId="menteur" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const activeId = room.currentTurnUserId
  const activePlayer = view.players.find((p) => p.id === activeId)
  const isMyTurn = view.phase === 'bidding' && activeId === user.id
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const winner = view.players.find((p) => p.id === view.winnerId)
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
      // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit.
    } finally {
      setBusy(false)
    }
  }

  const bidLegal = isLegalRaise(view.currentBid, bidQty, bidFace, totalDice, view.palifico)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)

  // ── Écran de victoire ────────────────────────────────────────────────────
  if (finished) {
    const ranking = [...view.players].sort((a, b) => {
      if (a.id === view.winnerId) return -1
      if (b.id === view.winnerId) return 1
      return a.lostCount - b.lostCount
    })
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden p-6 text-white">
        {windowSize.width > 0 && (
          <ReactConfetti width={windowSize.width} height={windowSize.height} numberOfPieces={180} recycle={false} />
        )}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Trophy className="h-14 w-14 text-amber-400" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('victoryTitle', { name: winner?.name ?? '—' })}</h2>
          {!isSoft && <p className="text-sm text-white/60">{t('victoryDrinks')}</p>}
        </motion.div>

        <XpGainBanner
          won={view.winnerId === user.id}
          playerIds={view.players.map((p) => p.id)}
          className="w-full max-w-sm"
        />

        <div className="w-full max-w-sm space-y-2">
          {ranking.map((p, idx) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.id === view.winnerId
                  ? 'border-amber-400/40 bg-amber-500/10'
                  : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-6 text-center text-lg font-black text-white/50">{idx + 1}</span>
              <span className="text-xl" aria-hidden>{iconOf(p)}</span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate font-bold" />
              <span className="flex items-center gap-1 text-sm text-white/60">
                <Beer className="h-4 w-4 text-amber-300" /> {p.lostCount}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          {humanCount > 1 ? (
            <Button
              onClick={() => void voteRematch()}
              disabled={iVotedRematch}
              className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-red-500 py-5 text-base font-bold"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {iVotedRematch
                ? t('rematchWaiting', { count: rematchVotes.length, total: humanCount })
                : t('replay')}
            </Button>
          ) : (
            <Button
              onClick={() => void voteRematch()}
              className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-red-500 py-5 text-base font-bold"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {t('replay')}
            </Button>
          )}
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-40 text-white sm:mx-auto sm:w-full sm:max-w-lg sm:pb-44">
      {/* Bandeau haut : manche + dés sur la table */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <span className="text-sm font-bold text-white/80">{t('round', { n: view.round })}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/50">{t('diceOnTable', { n: totalDice })}</span>
          <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
        </span>
      </div>

      {view.palifico && (
        <div className="rounded-2xl border border-chip-blue/50 bg-chip-blue/20 px-4 py-2 text-center text-xs font-semibold text-sky-100">
          {view.currentBid ? t('palificoBadge', { face: view.currentBid.face }) : t('palificoBadgeOpen')}
        </div>
      )}

      {/* Bannières retour / AFK */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}
      {afkWatch && afkTarget && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-100">
          {afkTarget.id === user.id
            ? t('afkWarningSelf', {
                seconds: Math.max(0, Math.ceil((turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
              })
            : t('afkWarning', {
                name: afkTarget.name,
                seconds: Math.max(0, Math.ceil((turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
              })}
        </div>
      )}

      {/* Joueurs */}
      <div className="grid grid-cols-2 gap-2">
        {view.players.map((p) => {
          const isActive = p.id === activeId && view.phase === 'bidding'
          const dead = !aliveInView(p)
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-3 py-2 transition-all',
                isActive
                  ? 'border-orange-400/60 bg-orange-500/15 shadow-lg shadow-orange-500/10'
                  : 'border-white/10 bg-white/5',
                dead && 'opacity-45'
              )}
            >
              <RankCrest role={cosmetics.get(p.id)?.role} />
              <span className="text-lg" aria-hidden>{iconOf(p)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                  {p.id === user.id && <span className="text-white/40"> {t('you')}</span>}
                </p>
                <p className="text-[10px] text-white/50">
                  {dead ? t('eliminated') : `🎲 ${p.diceCount}`}
                  {p.lostCount > 0 && !dead && ` · 🍺 ${p.lostCount}`}
                </p>
              </div>
              {isActive && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-400" />}
            </div>
          )
        })}
      </div>

      {/* Enchère en cours */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-orange-600/10 to-transparent px-4 py-3 text-center">
        {view.currentBid ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {t('currentBid')} · {t('bidBy', { name: nameOf(view.currentBid.by) })}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-black">
              {view.currentBid.qty} × <Die face={view.currentBid.face} size="md" />
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold text-white/60">{t('noBid')}</p>
        )}
        <p className="mt-1 text-[10px] text-white/35">{t('pillaveurHint')}</p>
      </div>

      {/* Indicateur de tour */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view.phase}-${activeId}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={cn(
            'rounded-2xl px-4 py-2.5 text-center text-sm font-bold',
            isMyTurn
              ? 'animate-pulse bg-gradient-to-r from-orange-600 to-red-500 text-white'
              : 'border border-white/10 bg-white/5 text-white/70'
          )}
        >
          {view.phase === 'bidding' &&
            (isMyTurn ? t('yourTurn') : t('turnOf', { name: activePlayer?.name ?? '—' }))}
          {view.phase === 'reveal' && t('reveal.title')}
        </motion.div>
      </AnimatePresence>

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-amber-400/30 bg-felt-deep/80 p-4"
          >
            <p className="text-center text-sm font-bold">
              {reveal.bidHeld
                ? t('reveal.bidHeld', { count: reveal.matchCount, qty: reveal.bid.qty })
                : t('reveal.bidFailed', { count: reveal.matchCount, qty: reveal.bid.qty })}{' '}
              <Die face={reveal.bid.face} size="sm" />
            </p>
            <div className="space-y-2">
              {reveal.allDice.map(({ playerId, dice }) => (
                <div key={playerId} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-xs font-semibold text-white/70">
                    {nameOf(playerId)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {dice.map((d, i) => (
                      <span
                        key={i}
                        className={cn(
                          'transition-opacity',
                          d === reveal.bid.face || (!view.palifico && reveal.bid.face !== 1 && d === 1)
                            ? ''
                            : 'opacity-35'
                        )}
                      >
                        <Die face={d} size="sm" />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {reveal.mode === 'calza' && reveal.loserId ? (
              <p className="text-center text-sm font-bold text-red-200">
                {t(isSoft ? 'reveal.calzaLostSoft' : 'reveal.calzaLost', { name: nameOf(reveal.loserId), sips: reveal.sips })}
              </p>
            ) : reveal.mode === 'calza' && reveal.gainedId ? (
              <p className="text-center text-sm font-bold text-emerald-200">
                {t('reveal.calzaWon', { name: nameOf(reveal.gainedId) })}
              </p>
            ) : reveal.mode === 'calza' ? (
              <p className="text-center text-sm font-bold text-emerald-200">
                {t('reveal.calzaWonCapped', { name: nameOf(reveal.challengerId) })}
              </p>
            ) : (
              <p className="text-center text-sm font-bold text-red-200">
                {t(isSoft ? 'reveal.loserSoft' : 'reveal.loser', { name: nameOf(reveal.loserId), sips: reveal.sips })}
              </p>
            )}
            {reveal.eliminatedId && (
              <p className="text-center text-xs font-bold text-amber-200">
                {t('reveal.eliminatedMsg', { name: nameOf(reveal.eliminatedId) })}
              </p>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-red-500 py-4 text-sm font-bold"
            >
              {t('reveal.continue')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mon gobelet + commandes (barre basse fixe) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-gray-950/95 p-3 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg space-y-2.5">
          {/* Mes dés */}
          {me && aliveInView(me) && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {t('yourDice')}
              </span>
              <div className="flex flex-1 justify-center gap-1.5">
                {hideDice
                  ? me.dice.map((_, i) => (
                      <span
                        key={i}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/8 text-lg"
                        aria-hidden
                      >
                        🥤
                      </span>
                    ))
                  : me.dice.map((d, i) => <Die key={i} face={d} />)}
              </div>
              <button
                onClick={() => setHideDice((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10"
                aria-label={hideDice ? t('showDice') : t('hideDice')}
              >
                {hideDice ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          )}
          {me && !aliveInView(me) && (
            <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-semibold text-white/50">
              {t('spectator')}
            </p>
          )}

          {/* Commandes d'enchère (à mon tour uniquement) */}
          {isMyTurn && me && aliveInView(me) && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                {/* Quantité */}
                <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/12 bg-white/5 px-2 py-1.5">
                  <button
                    onClick={() => setBidQty((q) => Math.max(1, q - 1))}
                    className="game-grid-cell flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white transition-colors hover:bg-white/15"
                    aria-label="-1"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-xl font-black tabular-nums">{bidQty}</span>
                  <button
                    onClick={() => setBidQty((q) => Math.min(totalDice, q + 1))}
                    className="game-grid-cell flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white transition-colors hover:bg-white/15"
                    aria-label="+1"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-lg font-black text-white/40">×</span>
                {/* Face */}
                {(() => {
                  const faceLocked = view.palifico && Boolean(view.currentBid)
                  return (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6].map((face) => (
                        <button
                          key={face}
                          onClick={() => !faceLocked && setBidFace(face)}
                          disabled={faceLocked && face !== bidFace}
                          className={cn(
                            'game-grid-cell rounded-lg transition-all disabled:cursor-not-allowed',
                            bidFace === face ? 'scale-110 ring-2 ring-orange-400' : 'opacity-60',
                            faceLocked && face !== bidFace && 'opacity-20'
                          )}
                          aria-label={`${face}`}
                          aria-pressed={bidFace === face}
                        >
                          <Die face={face} size="sm" />
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => void sendAction({ action: 'bid', qty: bidQty, face: bidFace })}
                  disabled={busy || !bidLegal}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 py-4 text-sm font-bold disabled:opacity-40"
                >
                  {t('bid')}
                </Button>
                <Button
                  onClick={() => void sendAction({ action: 'dudo' })}
                  disabled={busy || !view.currentBid}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 py-4 text-sm font-black tracking-wide disabled:opacity-40"
                >
                  {t('dudo')}
                </Button>
                {view.ruleCalza && (
                  <Button
                    onClick={() => void sendAction({ action: 'calza' })}
                    disabled={busy || !view.currentBid}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-chip-blue to-blue-800 py-4 text-sm font-black tracking-wide disabled:opacity-40"
                  >
                    {t('calza')}
                  </Button>
                )}
              </div>
              {!bidLegal && (
                <p className="text-center text-[10px] font-semibold text-red-300/80">{t('illegalBid')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="menteur" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
