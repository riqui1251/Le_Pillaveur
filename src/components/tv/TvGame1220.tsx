"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { Game1220SyncedState } from '@/lib/online-game-state'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvAvatar } from './tv-shared'

/**
 * 1220 sur grand écran : aucune info cachée (jeu de paris simultané) — la
 * même vue sert joueur et spectateur. Setup = qui est prêt ; play = dernier
 * lancer + paris de chacun ; finished = récap.
 */
export function TvGame1220({ room, state }: { room: TvRoomDto; state: Game1220SyncedState }) {
  const t = useTranslations('games.1220')
  const iconOf = (userId: string) => room.members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'

  if (state.phase === 'finished') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">🎲 {t('online.finishedTitle')}</p>
        <p className="text-2xl text-white/50">{t('online.totalRolls', { count: state.history.length })}</p>
      </div>
    )
  }

  if (state.phase === 'setup') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-3xl font-black uppercase tracking-widest text-teal-300/80">{t('online.waitingSetup')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {state.players.map((p, i) => {
            const ready = state.setupReady.includes(p.id)
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-5 py-3 text-2xl font-bold',
                  ready ? 'border-teal-400/50 bg-teal-500/15 text-teal-100' : 'border-white/10 bg-white/5 text-white/60'
                )}
              >
                <TvAvatar name={p.name} index={i} size={36} />
                {p.name}
                <span>{ready ? '✓' : '⏳'}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const lastRoll = state.lastRoll

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      {/* Dernier lancer */}
      {lastRoll ? (
        <div className="flex items-center justify-center gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-teal-600/10 to-transparent py-6">
          <span className="rounded-2xl border border-amber-400/40 bg-amber-500/15 px-8 py-4 text-6xl font-black text-amber-200">{lastRoll.d12}</span>
          <span className="text-4xl text-white/30">+</span>
          <span className="rounded-2xl border border-teal-400/40 bg-teal-500/15 px-8 py-4 text-6xl font-black text-teal-200">{lastRoll.d20}</span>
          <span className="text-4xl text-white/30">=</span>
          <span className="text-7xl font-black text-white">{lastRoll.d12 + lastRoll.d20}</span>
        </div>
      ) : (
        <p className="text-center text-2xl font-bold text-white/40">{t('online.anyoneRolls')}</p>
      )}

      {/* Paris + résultats */}
      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {state.configs?.map((cfg) => {
          const idx = state.players.findIndex((p) => p.id === cfg.playerId)
          const result = lastRoll?.results.find((r) => r.playerId === cfg.playerId)
          const hit = Boolean(result && (result.drinkSips > 0 || result.giveReasons.length > 0))
          return (
            <div
              key={cfg.playerId}
              className={cn(
                'flex flex-col gap-2 rounded-2xl border px-4 py-3',
                hit ? 'border-teal-400/40 bg-teal-500/10' : 'border-white/10 bg-white/5'
              )}
            >
              <div className="flex items-center gap-2">
                <TvAvatar name={cfg.name} index={idx} size={32} />
                <span className="truncate text-lg font-bold text-white">{cfg.name}</span>
                <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(cfg.playerId)} /></span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/50">
                  {cfg.parity === 'pair' ? t('pair') : t('impair')}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/50">{t(`bands.${cfg.band}`)}</span>
                <span className="rounded-full border border-teal-400/30 bg-teal-500/10 px-2 py-1 text-teal-300">🍺{cfg.drinkNumber}</span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-amber-300">🎁{cfg.giveNumber}</span>
              </div>
              {result && hit && (
                <p className="text-sm font-bold text-teal-200">
                  {result.drinkSips > 0 && `🍺 ${result.drinkSips}`}
                  {result.drinkSips > 0 && result.giveReasons.length > 0 && ' · '}
                  {result.giveReasons.length > 0 && `🎁 ${result.giveEffective}`}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
