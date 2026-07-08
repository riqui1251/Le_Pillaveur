"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import { cn } from '@/lib/utils'
import { RankCrest } from '@/components/online/OnlinePlayerTag'
import { JoinQR } from './JoinQR'
import { TvAvatar } from './tv-shared'

/** Contenu TV en salle d'attente : code géant + QR pour rejoindre + liste des joueurs. */
export function TvLobby({ room, joinUrl }: { room: TvRoomDto; joinUrl: string }) {
  const t = useTranslations('tv')
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-8 py-8 lg:flex-row lg:gap-16">
      <div className="flex flex-col items-center gap-5">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/40">{t('scanToJoin')}</p>
        <JoinQR url={joinUrl} size={240} />
        <p className="font-mono text-6xl font-black tracking-[0.35em] text-violet-200">{room.code}</p>
        <p className="text-lg text-white/50">{t('waiting')}</p>
      </div>

      <div className="w-full max-w-md">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-300/60">
          {t('players')} · {room.members.length}
        </p>
        <div className="space-y-3">
          {room.members.map((m, i) => (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <RankCrest role={m.role} size="lg" />
              <TvAvatar name={m.displayName} index={i} size={44} />
              <span className="flex-1 truncate text-xl font-bold">{m.displayName}</span>
              {m.isHost && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">HOST</span>
              )}
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold',
                  m.isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40',
                )}
              >
                {m.isReady ? t('ready') : t('notReady')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
