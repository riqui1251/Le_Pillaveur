"use client"

import { useTranslations } from 'next-intl'
import type { TvRoomDto } from '@/lib/online-room'
import type { PurpleSyncedState, SerializedCard } from '@/lib/online-game-state'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { TvAvatar } from './tv-shared'

/**
 * Purple sur grand écran : jeu tour par tour, aucune info cachée — la même
 * vue sert joueur et spectateur. Affiche le joueur actif, la cagnotte, les
 * cartes tirées, et le récap final.
 */

function TvCard({ card }: { card: SerializedCard }) {
  const isRed = card.color === 'red'
  return (
    <div className={cn(
      'flex h-28 w-20 flex-col items-center justify-center rounded-2xl border-4 bg-white shadow-xl',
      isRed ? 'border-red-400' : 'border-gray-800'
    )}>
      <span className={cn('text-3xl font-black', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.value}</span>
      <span className={cn('text-2xl leading-tight', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.suit}</span>
    </div>
  )
}

export function TvPurple({ room, state }: { room: TvRoomDto; state: PurpleSyncedState }) {
  const t = useTranslations('games.purple')
  const iconOf = (userId: string) => room.members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'

  if (state.phase === 'finished') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
        <p className="text-5xl font-black text-white">🟣 {t('online.finishedTitle')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {state.players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
              <TvAvatar name={p.name} index={i} size={40} />
              <span className="text-2xl font-bold text-white">{p.name}</span>
              <span className="text-2xl font-black text-amber-300">{state.gameResults[p.id] ?? 0} 🍺</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const currentIdx = state.currentPlayer
  const currentActor = state.players[currentIdx]

  return (
    <div className="flex h-full w-full flex-col gap-6 p-6">
      {/* Joueur actif + cagnotte */}
      {currentActor && (
        <div className="flex items-center justify-center gap-4 rounded-3xl border border-violet-400/30 bg-violet-500/10 px-6 py-4">
          <TvAvatar name={currentActor.name} index={currentIdx} size={56} active />
          <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(currentActor.id)} /></span>
          <span className="text-3xl font-black text-white">{currentActor.name}</span>
          <span className="text-2xl text-white/30">·</span>
          <span className="text-3xl font-black text-violet-300">{state.drinkCounter} 🍺</span>
        </div>
      )}

      {/* Cartes tirées / attente */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {state.drawnCards.length > 0 ? (
          <>
            <div className="flex flex-wrap justify-center gap-4">
              {state.drawnCards.map((card, i) => <TvCard key={i} card={card} />)}
            </div>
            {state.pendingReveal && (
              <p className="text-3xl font-black text-red-300">
                {t('mustDrink', { name: currentActor?.name ?? '', count: state.amountToDrink })}
              </p>
            )}
            {state.canContinue && (
              <p className="text-2xl font-bold text-emerald-300">{t('correct', { count: state.drinkCounter })}</p>
            )}
          </>
        ) : (
          <p className="text-3xl font-bold text-white/40">{t('chooseBet')}</p>
        )}
      </div>

      {/* Cagnotte par joueur */}
      <div className="flex flex-wrap justify-center gap-3">
        {state.players.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-2xl border px-4 py-2',
              p.id === currentActor?.id ? 'border-gold/50 bg-gold/15' : 'border-white/10 bg-white/5'
            )}
          >
            <TvAvatar name={p.name} index={i} size={28} />
            <span className="text-lg font-semibold text-white/80">{p.name}</span>
            <span className="text-sm font-bold text-white/40">{state.gameResults[p.id] ?? 0} 🍺</span>
          </div>
        ))}
      </div>
    </div>
  )
}
