"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Home, KeyRound, RefreshCw, Send, SkipForward, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MC_CLUE_MAX_LEN, MC_CLUE_MS, MC_GUESS_MS, type MCClientView, type MCTeam } from '@/lib/mots-codes/engine'
import { botTickDelayMs } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayingCardBack } from '@/components/ui/PlayingCard'

/**
 * MOTS CODÉS en ligne (serveur-autoritaire). Vue déjà filtrée : seuls les
 * maîtres-mots reçoivent la solution ; les autres ne voient que les tuiles
 * révélées. L'indice se donne À VOIX HAUTE au vocal, le champ le fige pour
 * l'arbitrage (mot + nombre affichés à tous).
 */

function parseView(json: string | null | undefined): MCClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as MCClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const TEAM_LABEL_CLASS: Record<MCTeam, string> = {
  gold: 'text-amber-300',
  red: 'text-red-300',
}

export function MotsCodesOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.mots-codes.game')
  const [busy, setBusy] = useState(false)
  const [clueWord, setClueWord] = useState('')
  const [clueCount, setClueCount] = useState(2)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'mots-codes' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('mots-codes', inGame)
  const cosmetics = useMemberCosmetics(room)

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [view])

  // Tick « advance » : tous les clients, idempotent.
  useEffect(() => {
    if (!view || !room || view.phase === 'finished' || view.phaseEndsAt === null) return
    const expectedVersion = room.stateVersion
    const delay = Math.max(250, view.phaseEndsAt - Date.now() + 300 + Math.random() * 700)
    const timer = setTimeout(() => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance', phaseKey: view.phaseKey, expectedVersion }),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [view, room])

  // Ticks bots (maître-mot devenu bot, équipe muette) + remplacement.
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (body: Record<string, unknown>) => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const master =
      view.phase === 'clue'
        ? view.players.find((p) => p.team === view.activeTeam && p.isSpymaster)
        : undefined
    const activeGuessers =
      view.phase === 'guess'
        ? view.players.filter((p) => p.team === view.activeTeam && !p.isSpymaster && !p.leftAt)
        : null
    const masterIsBot = Boolean(master?.isBot)
    const guessersAllBots = activeGuessers !== null && activeGuessers.every((p) => p.isBot)
    if (masterIsBot || guessersAllBots) {
      botTimer = setTimeout(
        () => send({ action: 'bot' }),
        botTickDelayMs(masterIsBot ? master?.name : activeGuessers?.[0]?.name)
      )
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send({ action: 'replace-left' })
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  useEffect(() => {
    setClueWord('')
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="mots-codes" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const activeMaster = view.players.find((p) => p.team === view.activeTeam && p.isSpymaster)
  const iAmActiveMaster = activeMaster?.id === user.id
  const iCanGuess =
    view.phase === 'guess' && me && me.team === view.activeTeam && !me.isSpymaster && !me.leftAt

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Intention joueur : pas de verrou de version (le moteur valide la
        // phase et le camp au trait).
        body: JSON.stringify(body),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'clue' ? MC_CLUE_MS : MC_GUESS_MS
  const teamName = (team: MCTeam) => (team === 'gold' ? t('teamGold') : t('teamRed'))
  const clueTrimmed = clueWord.trim()
  const clueOk = clueTrimmed.length > 0 && clueTrimmed.length <= MC_CLUE_MAX_LEN && !/\s/.test(clueTrimmed)

  const tileClass = (tile: { revealed: boolean; kind: string | null }) => {
    if (tile.kind === 'assassin') return '' // rendu spécial (dos de carte)
    if (tile.kind === 'gold')
      return tile.revealed
        ? 'border-amber-500 bg-gradient-to-b from-amber-400 to-amber-600 text-[#1c1509]'
        : 'border-amber-400/60 bg-cream text-[#24201A] ring-1 ring-inset ring-amber-500/50'
    if (tile.kind === 'red')
      return tile.revealed
        ? 'border-red-800 bg-suit-red text-cream'
        : 'border-red-400/60 bg-cream text-[#24201A] ring-1 ring-inset ring-red-500/50'
    if (tile.kind === 'neutral')
      return tile.revealed
        ? 'border-white/20 bg-white/15 text-white/50'
        : 'border-[#D8CCAE] bg-cream text-[#24201A] opacity-80'
    return 'border-[#D8CCAE] bg-cream text-[#24201A]'
  }

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const won = me && view.winnerTeam === me.team
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-white">
        {windowSize.width > 0 && won && (
          <ReactConfetti width={windowSize.width} height={windowSize.height} numberOfPieces={180} recycle={false} />
        )}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Trophy className="h-14 w-14 text-amber-400" />
          <h2 className="font-display text-3xl font-bold text-gold">
            {view.winnerTeam ? t('victory.teamWins', { team: teamName(view.winnerTeam) }) : t('victory.tie')}
          </h2>
          {view.loseReason === 'assassin' && (
            <p className="text-sm font-semibold text-red-300">{t('victory.assassin')}</p>
          )}
        </motion.div>

        <XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />

        {/* Grille résolue */}
        <div className="grid w-full max-w-sm grid-cols-5 gap-1">
          {view.tiles.map((tile, i) =>
            tile.kind === 'assassin' ? (
              <div key={i} className="relative aspect-[4/3]">
                <PlayingCardBack className="h-full w-full rounded-md" />
              </div>
            ) : (
              <div
                key={i}
                className={cn(
                  'flex aspect-[4/3] items-center justify-center rounded-md border px-0.5 text-center text-[8px] font-black uppercase leading-tight',
                  tileClass({ ...tile, revealed: true })
                )}
              >
                {tile.word}
              </div>
            )
          )}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-600 to-red-700 py-5 text-base font-bold"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {iVotedRematch && humanCount > 1
              ? t('victory.rematchWaiting', { count: rematchVotes.length, total: humanCount })
              : t('victory.replay')}
          </Button>
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('victory.backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
  if (view.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-amber-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-amber-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        <p className="max-w-xs text-center text-xs font-semibold text-white/50">
          {me?.isSpymaster ? t('countdown.hintMaster') : t('countdown.hintGuesser')}
        </p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : scores + phase + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between text-sm font-bold">
          <span className={TEAM_LABEL_CLASS.gold}>◆ {t('teamGold')} · {view.remaining.gold}</span>
          <span className={cn('text-xs font-semibold uppercase tracking-wide', TEAM_LABEL_CLASS[view.activeTeam])}>
            {view.phase === 'clue'
              ? t('phaseClue', { team: teamName(view.activeTeam) })
              : t('phaseGuess', { team: teamName(view.activeTeam) })}
          </span>
          <span className={TEAM_LABEL_CLASS.red}>{view.remaining.red} · {t('teamRed')} ◆</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[11px] text-white/50">
            {me?.isSpymaster ? t('youAreMaster') : t('masterIs', { name: view.players.find((p) => p.team === me?.team && p.isSpymaster)?.name ?? '—' })}
          </p>
          <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
        </div>
        {timeLeftMs !== null && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 15_000 ? 'bg-suit-red' : 'bg-gold'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}

      {/* Indice courant */}
      {view.phase === 'guess' && view.clue && (
        <div className="flex items-baseline justify-center gap-3 rounded-2xl border border-gold/40 bg-black/30 px-4 py-2.5">
          <KeyRound className="h-4 w-4 self-center text-gold" aria-hidden />
          <span className="font-display text-xl font-bold uppercase tracking-[0.08em] text-cream">{view.clue.word}</span>
          <span className="font-display text-xl font-black text-gold">· {view.clue.count}</span>
          <span className="text-xs text-white/40">{t('guessesLeft', { count: view.guessesLeft })}</span>
        </div>
      )}

      {/* Grille 5×5 */}
      <div className="grid grid-cols-5 gap-1.5">
        {view.tiles.map((tile, i) => {
          const clickable = Boolean(iCanGuess && !tile.revealed && !busy)
          const isAssassinKnown = tile.kind === 'assassin' && (tile.revealed || view.iSeeSolution)
          if (isAssassinKnown && tile.revealed) {
            return (
              <div key={i} className="relative aspect-[4/3]">
                <PlayingCardBack className="h-full w-full rounded-lg" />
              </div>
            )
          }
          return (
            <button
              key={i}
              onClick={() => clickable && void sendAction({ action: 'guess', tile: i })}
              disabled={!clickable}
              className={cn(
                'flex aspect-[4/3] items-center justify-center rounded-lg border px-0.5 text-center text-[9px] font-black uppercase leading-tight shadow-[0_4px_10px_-6px_rgba(0,0,0,0.6)] transition-all sm:text-[10px]',
                tileClass(tile),
                isAssassinKnown && !tile.revealed && 'border-black bg-[#141210] text-cream',
                tile.revealed && 'opacity-90',
                clickable && 'hover:-translate-y-0.5 active:scale-95'
              )}
            >
              {tile.word}
            </button>
          )
        })}
      </div>
      {view.iSeeSolution && view.phase !== 'finished' && (
        <p className="text-center text-[10px] text-white/40">{t('solutionHint')}</p>
      )}

      {/* Zone d'action */}
      {view.phase === 'clue' && iAmActiveMaster && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-sm font-bold">{t('cluePrompt')}</p>
          <div className="flex gap-2">
            <input
              value={clueWord}
              onChange={(e) => setClueWord(e.target.value)}
              maxLength={MC_CLUE_MAX_LEN}
              placeholder={t('cluePlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none"
            />
            <select
              value={clueCount}
              onChange={(e) => setClueCount(Number(e.target.value))}
              aria-label={t('clueCountAria')}
              className="shrink-0 rounded-xl border border-white/15 bg-white/8 px-2 text-sm font-bold text-white focus:border-amber-400 focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n} className="bg-felt-deep">{n}</option>
              ))}
            </select>
            <Button
              onClick={() => void sendAction({ action: 'clue', word: clueTrimmed, count: clueCount })}
              disabled={busy || !clueOk}
              className="shrink-0 rounded-xl bg-gradient-to-r from-amber-600 to-red-700 px-4 font-bold"
              aria-label={t('clueSend')}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-[11px] text-white/45">{t('clueHint')}</p>
        </div>
      )}
      {view.phase === 'clue' && !iAmActiveMaster && (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white/60">
          {t('waitingClue', { name: activeMaster?.name ?? '—', team: teamName(view.activeTeam) })}
        </p>
      )}
      {view.phase === 'guess' && (
        iCanGuess ? (
          <Button
            onClick={() => void sendAction({ action: 'pass' })}
            disabled={busy}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            <SkipForward className="mr-2 h-4 w-4" /> {t('pass')}
          </Button>
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white/60">
            {t('waitingGuess', { team: teamName(view.activeTeam) })}
          </p>
        )
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              p.team === 'gold' ? 'border-amber-400/40 bg-amber-500/10 text-amber-100' : 'border-red-400/40 bg-red-500/10 text-red-100'
            )}
          >
            {p.isSpymaster && <KeyRound className="h-3 w-3" aria-hidden />}
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="mots-codes" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
