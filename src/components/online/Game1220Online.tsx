"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, RefreshCw, Dices } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Band1220, Parity1220 } from '@/lib/game-1220'
import { TOTAL_MAX, TOTAL_MIN } from '@/lib/game-1220'
import type { Game1220SyncedState } from '@/lib/online-game-state'
import { botEmojiFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/** 1220 en ligne : jeu simultané (pas de tour). Chaque joueur règle ses
 * paris en phase setup, puis n'importe qui déclenche un lancer partagé
 * évalué contre les paris de tout le monde. Aucune info cachée. */

function parseView(json: string | null | undefined): Game1220SyncedState | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Game1220SyncedState
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const BAND_KEYS: Band1220[] = ['2-10', '11-20', '21-30']

export function Game1220Online() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.1220')
  const [busy, setBusy] = useState(false)

  const inGame = room?.gameId === '1220' && room.status === 'playing'
  const tutorial = useGameTutorial('1220', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])

  const numberOptions = useMemo(
    () => Array.from({ length: TOTAL_MAX - TOTAL_MIN + 1 }, (_, i) => TOTAL_MIN + i),
    []
  )

  // Référent (premier humain présent) : envoie les ticks « joueur parti → bot ».
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    if (!view.players.some((p) => !p.isBot && p.leftAt)) return
    const expectedVersion = room.stateVersion
    const check = () => {
      const expired = view.players.some(
        (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
      )
      if (expired) {
        void fetch(`/api/online/rooms/${room.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'replace-left', expectedVersion }),
        })
      }
    }
    check()
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [view, user, room])

  const [clock, setClock] = useState(() => Date.now())
  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'
  useEffect(() => {
    if (!someoneLeft) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [someoneLeft])

  if (!inGame) {
    return <GameOnlineLobby gameId="1220" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
      </div>
    )
  }

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
    } finally {
      setBusy(false)
    }
  }

  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botEmojiFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length

  const reasonLabel = (id: string, cfg: { band: Band1220; parity: Parity1220; giveNumber: number }) => {
    if (id === 'band') return t(`bands.${cfg.band}`)
    if (id === 'parity') return cfg.parity === 'pair' ? t('pair') : t('impair')
    if (id === 'giveNum') return String(cfg.giveNumber)
    return id
  }

  // ── Écran de fin ──────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Dices className="h-14 w-14 text-teal-400" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
          <p className="text-sm text-white/60">{t('online.totalRolls', { count: view.history.length })}</p>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          {humanCount > 1 ? (
            <Button
              onClick={() => void voteRematch()}
              disabled={iVotedRematch}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {iVotedRematch
                ? t('online.rematchWaiting', { count: rematchVotes.length, total: humanCount })
                : t('online.replay')}
            </Button>
          ) : (
            <Button
              onClick={() => void voteRematch()}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {t('online.replay')}
            </Button>
          )}
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('online.backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Phase setup : chacun règle ses paris ─────────────────────────────────
  if (view.phase === 'setup') {
    const myDraft = view.draft[user.id]
    const iAmReady = view.setupReady.includes(user.id)
    return (
      <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="flex justify-end">
          <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
        </div>
        {tutorial.open && <GameTutorialModal gameId="1220" onClose={tutorial.close} />}

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">
          {t('online.waitingSetup')}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {view.players.map((p) => {
            const ready = view.setupReady.includes(p.id)
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-3 py-2',
                  ready ? 'border-teal-400/40 bg-teal-500/10' : 'border-white/10 bg-white/5'
                )}
              >
                <RankCrest role={cosmetics.get(p.id)?.role} />
                <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate text-xs font-bold" />
                <span className={cn('text-xs', ready ? 'text-teal-300' : 'text-white/35')}>{ready ? '✓' : '⏳'}</span>
              </div>
            )
          })}
        </div>

        {myDraft && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('online.myBets')}</p>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('parityLabel')}</p>
              <div className="flex gap-2">
                {(['pair', 'impair'] as Parity1220[]).map((v) => (
                  <button
                    key={v}
                    disabled={iAmReady}
                    onClick={() => void sendAction({ action: 'set-draft', choices: { parity: v } })}
                    className={cn(
                      'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
                      myDraft.parity === v
                        ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
                        : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'
                    )}
                  >
                    {v === 'pair' ? t('pair') : t('impair')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{t('bandLabel')}</p>
              <div className="grid grid-cols-3 gap-2">
                {BAND_KEYS.map((b) => (
                  <button
                    key={b}
                    disabled={iAmReady}
                    onClick={() => void sendAction({ action: 'set-draft', choices: { band: b } })}
                    className={cn(
                      'rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
                      myDraft.band === b
                        ? 'border-gold/50 bg-gold/15 text-gold'
                        : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08]'
                    )}
                  >
                    {t(`bands.${b}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-400/70">{t('drinkNumber')}</p>
                <Select
                  value={String(myDraft.drinkNumber)}
                  onValueChange={(v) => void sendAction({ action: 'set-draft', choices: { drinkNumber: Number(v) } })}
                  disabled={iAmReady}
                >
                  <SelectTrigger className="border-teal-500/30 bg-teal-500/10 text-teal-200 focus:ring-teal-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {numberOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">{t('giveNumber')}</p>
                <Select
                  value={String(myDraft.giveNumber)}
                  onValueChange={(v) => void sendAction({ action: 'set-draft', choices: { giveNumber: Number(v) } })}
                  disabled={iAmReady}
                >
                  <SelectTrigger className="border-amber-500/30 bg-amber-500/10 text-amber-200 focus:ring-amber-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {numberOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {myDraft.drinkNumber === myDraft.giveNumber && (
              <p className="text-xs font-medium text-amber-400">{t('clashWarning')}</p>
            )}

            <Button
              onClick={() => void sendAction({ action: 'ready' })}
              disabled={busy || iAmReady || myDraft.drinkNumber === myDraft.giveNumber}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold disabled:opacity-40"
            >
              {iAmReady ? t('online.readyDone') : t('online.ready')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ── Phase play : lancer partagé ──────────────────────────────────────────
  const lastRoll = view.lastRoll
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="flex justify-end">
        <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
      </div>
      {tutorial.open && <GameTutorialModal gameId="1220" onClose={tutorial.close} />}

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('online.waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}

      {/* Récap des paris */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.configs?.map((cfg) => {
            const p = view.players.find((pl) => pl.id === cfg.playerId)
            return (
              <div key={cfg.playerId} className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <RankCrest role={cosmetics.get(cfg.playerId)?.role} size="sm" />
                  {p && <span className="text-xs" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>}
                  <OnlinePlayerName name={cfg.name} cosmetics={cosmetics.get(cfg.playerId)} className="truncate text-xs font-semibold" />
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-white/45">
                    {cfg.parity === 'pair' ? t('pair') : t('impair')}
                  </span>
                  <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-white/45">{t(`bands.${cfg.band}`)}</span>
                  <span className="rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-teal-400">🍺{cfg.drinkNumber}</span>
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">🎁{cfg.giveNumber}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Résultat du dernier lancer */}
      <AnimatePresence mode="wait">
        {lastRoll && (
          <motion.div
            key={`${lastRoll.d12}-${lastRoll.d20}-${view.history.length}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex items-center justify-center gap-4">
              <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-2xl font-black text-amber-200">{lastRoll.d12}</span>
              <span className="text-white/30">+</span>
              <span className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-2xl font-black text-teal-200">{lastRoll.d20}</span>
              <span className="text-white/30">=</span>
              <span className="text-3xl font-black">{lastRoll.d12 + lastRoll.d20}</span>
            </div>
            <div className="space-y-2">
              {lastRoll.results.map((r) => {
                const p = view.players.find((pl) => pl.id === r.playerId)
                const cfg = view.configs?.find((c) => c.playerId === r.playerId)
                const lines: string[] = []
                if (r.drinkSips > 0 && cfg) lines.push(t('outcomes.drink', { number: cfg.drinkNumber }))
                if (r.giveReasons.length > 0 && cfg) {
                  for (const id of r.giveReasons) {
                    lines.push(t('outcomes.give', { label: reasonLabel(id, cfg) }))
                  }
                  if (r.partialHit) {
                    lines.push(t('outcomes.partialGive', { numbers: r.partialNumbers.join(', '), count: r.giveEffective }))
                  } else {
                    lines.push(t('outcomes.totalGive', { count: r.giveEffective }))
                  }
                } else if (r.partialHit) {
                  lines.push(t('outcomes.partialNothing', { numbers: r.partialNumbers.join(', ') }))
                }
                if (lines.length === 0) lines.push(t('outcomes.nothing'))
                const allGood = lines.length === 1 && lines[0] === t('outcomes.nothing')
                return (
                  <div
                    key={r.playerId}
                    className={cn(
                      'rounded-xl border px-3 py-2.5',
                      allGood ? 'border-white/[0.06] bg-white/[0.02]' : 'border-teal-500/20 bg-teal-500/5'
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      {p && <span className="text-sm" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>}
                      <OnlinePlayerName name={r.name} cosmetics={cosmetics.get(r.playerId)} className="text-sm font-semibold text-white/90" />
                    </div>
                    <ul className="space-y-0.5 pl-6">
                      {lines.map((line, i) => (
                        <li key={i} className={cn('text-xs', allGood ? 'text-white/35' : 'text-white/70')}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Historique */}
      {view.history.length > 1 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <details>
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/60">
              <span>{t('history', { count: view.history.length - 1 })}</span>
            </summary>
            <div className="max-h-48 overflow-y-auto border-t border-white/[0.06] px-4 pb-3 pt-2">
              {view.history.slice(1).map((h, idx) => (
                <div key={idx} className="flex items-center gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
                  <span className="font-mono text-xs text-white/50">{view.history.length - 1 - idx}.</span>
                  <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-amber-300">{h.d12}</span>
                  <span className="text-xs text-white/20">+</span>
                  <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-teal-300">{h.d20}</span>
                  <span className="text-xs text-white/20">=</span>
                  <span className="text-sm font-bold text-white/70">{h.d12 + h.d20}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      <p className="text-center text-[11px] text-white/35">{t('online.anyoneRolls')}</p>

      <div className="sticky bottom-3 flex gap-2">
        <Button
          onClick={() => void sendAction({ action: 'roll' })}
          disabled={busy}
          className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-base font-bold shadow-[0_8px_24px_rgba(217,164,65,0.3)] disabled:opacity-40"
        >
          {t('rollDice')}
        </Button>
        <Button
          onClick={() => void sendAction({ action: 'end' })}
          disabled={busy}
          variant="outline"
          className="rounded-2xl border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          {t('online.endGame')}
        </Button>
      </div>
    </div>
  )
}
