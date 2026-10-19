"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Crown, Hourglass } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import { cn } from '@/lib/utils'
import { crestTierForRole } from '@/lib/roles'
import { OnlinePlayerIcon, RankCrest } from '@/components/online/OnlinePlayerTag'
import { JoinQR } from './JoinQR'
import { tvRem } from './tv-shared'

type Density = 'roomy' | 'medium' | 'dense' | 'packed'

/**
 * Taille des sièges selon le nombre de joueurs : la liste doit tenir dans la
 * toile (≈ 39 rem de haut) jusqu'au plafond de la table (16 humains), sans
 * défilement — TvStage coupe ce qui déborde.
 */
function densityFor(count: number): Density {
  if (count <= 5) return 'roomy'
  if (count <= 10) return 'medium'
  if (count <= 16) return 'dense'
  return 'packed'
}

const COLUMNS: Record<Density, number> = { roomy: 1, medium: 2, dense: 2, packed: 3 }
const ROWS: Record<Density, number> = { roomy: 5, medium: 5, dense: 8, packed: 8 }
const AVATAR_CLASS: Record<Density, string> = {
  roomy: 'h-16 w-16',
  medium: 'h-14 w-14',
  dense: 'h-11 w-11',
  packed: 'h-10 w-10',
}
const NAME_CLASS: Record<Density, string> = {
  roomy: 'text-4xl',
  medium: 'text-2xl',
  dense: 'text-xl',
  packed: 'text-xl',
}
const ROW_CLASS: Record<Density, string> = {
  roomy: 'gap-4 px-5 py-3',
  medium: 'gap-3 px-4 py-2.5',
  dense: 'gap-3 px-3 py-1.5',
  packed: 'gap-2 px-3 py-1.5',
}

/**
 * Échelle du rem TV (src/styles/tv.css) rapportée aux 16 px de la toile : sert
 * aux écussons de rôle, dessinés en px par la feuille des cosmétiques du
 * téléphone, qu'on agrandit sans toucher à leur rendu là-bas.
 */
function useRemScale(): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const read = () => {
      const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
      setScale(Number.isFinite(px) && px > 0 ? px / 16 : 1)
    }
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  return scale
}

function TvRankCrest({ role, scale }: { role: string; scale: number }) {
  // Écusson large (ailes comprises) : 42 px de la toile, ailes débordant de 7 px.
  return (
    <span className="relative inline-block shrink-0" style={{ width: tvRem(42), height: tvRem(42) }}>
      <span className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
        <RankCrest role={role} size="lg" />
      </span>
    </span>
  )
}

/** Contenu TV en salle d'attente : code géant + QR pour rejoindre + sièges (prêt / hôte), comme la table du téléphone. */
export function TvLobby({ room, joinUrl }: { room: TvRoomDto; joinUrl: string }) {
  const t = useTranslations('tv')
  const tLobby = useTranslations('onlineLobby')
  const remScale = useRemScale()

  const members = room.members
  const density = densityFor(members.length)
  const capacity = COLUMNS[density] * ROWS[density]
  // Au-delà de la grille (salle sans plafond, Petit Buveur), le dernier siège
  // devient un « +N » plutôt que de pousser la liste hors de l'écran.
  const overflow = members.length > capacity ? members.length - (capacity - 1) : 0
  const shown = overflow > 0 ? members.slice(0, capacity - 1) : members
  const readyCount = members.filter((m) => m.isReady).length
  const rows = Math.min(ROWS[density], Math.ceil((shown.length + (overflow > 0 ? 1 : 0)) / COLUMNS[density]))

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-12 px-10 py-5">
      <div className="flex w-[27rem] shrink-0 flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-[#D8CCAE] bg-cream px-8 py-6 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.7)]">
          <p className="text-lg font-bold uppercase tracking-[0.3em] text-[#55503F]">{t('scanToJoin')}</p>
          <JoinQR url={joinUrl} size={224} className="shadow-none" />
          <p className="font-mono text-6xl font-black tracking-[0.3em] text-[#24201A]">{room.code}</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-black text-cream">{t('waiting')}</p>
          <p className="mt-1 text-xl text-white/80">{t('waitingHint')}</p>
        </div>
      </div>

      <div className={cn('flex min-w-0 flex-col', density === 'roomy' ? 'w-[40rem]' : 'flex-1')}>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <p className="text-xl font-bold uppercase tracking-[0.25em] text-gold/90">
            {t('players')} · {members.length}
          </p>
          {members.length > 0 && (
            <p
              className={cn(
                'rounded-full px-4 py-1 text-xl font-bold tabular-nums',
                readyCount === members.length ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'
              )}
            >
              {tLobby('readyCount', { ready: readyCount, total: members.length })}
            </p>
          )}
        </div>
        <ul
          className={cn('grid', density === 'roomy' ? 'gap-3' : 'gap-x-4 gap-y-2')}
          style={{
            gridTemplateColumns: `repeat(${COLUMNS[density]}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, auto)`,
            gridAutoFlow: 'column',
          }}
        >
          {shown.map((m) => (
            <li
              key={m.userId}
              className={cn(
                'flex min-w-0 items-center rounded-2xl border',
                ROW_CLASS[density],
                m.isReady ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-white/10 bg-white/5'
              )}
            >
              {/* Couronne sur le coin de l'icône, comme la table du téléphone : le nom garde sa largeur. */}
              <span className="relative shrink-0">
                <OnlinePlayerIcon
                  icon={m.preferences?.icon}
                  className={cn('border border-[#D8CCAE] bg-cream text-[#24201A]', AVATAR_CLASS[density])}
                />
                {m.isHost && (
                  <Crown
                    role="img"
                    aria-label={t('host')}
                    className={cn(
                      'absolute -left-2 -top-3 -rotate-12 fill-gold text-gold drop-shadow',
                      density === 'roomy' ? 'h-8 w-8' : 'h-6 w-6'
                    )}
                  />
                )}
              </span>
              {/* Trois colonnes : l'écusson prendrait la place du nom. */}
              {density !== 'packed' && m.role && crestTierForRole(m.role) && (
                <TvRankCrest role={m.role} scale={remScale} />
              )}
              <span className={cn('min-w-0 flex-1 truncate font-bold text-white', NAME_CLASS[density])}>
                {m.displayName}
              </span>
              {density === 'roomy' ? (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-4 py-1 text-xl font-bold',
                    m.isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'
                  )}
                >
                  {m.isReady ? t('ready') : t('notReady')}
                </span>
              ) : m.isReady ? (
                <Check role="img" aria-label={t('ready')} className="h-7 w-7 shrink-0 text-emerald-300" />
              ) : (
                <Hourglass role="img" aria-label={t('notReady')} className="h-6 w-6 shrink-0 text-white/70" />
              )}
            </li>
          ))}
          {overflow > 0 && (
            <li className={cn('flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 font-black text-white/80', ROW_CLASS[density], NAME_CLASS[density])}>
              +{overflow}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
