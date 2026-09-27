"use client"

import { useEffect, useState } from 'react'
import { Beer, Leaf } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode, type AmbianceMode } from '@/components/providers/AmbianceAttribute'
import { isCapacitorApp } from '@/lib/native-app'
import { cn } from '@/lib/utils'

const MODES: { id: AmbianceMode; icon: typeof Beer }[] = [
  { id: 'alcool', icon: Beer },
  { id: 'soft', icon: Leaf },
]

/**
 * Bascule d'ambiance. Les deux libellés sont TOUJOURS écrits : en icônes
 * seules (une chope, une feuille), personne ne devinait ni le réglage, ni son
 * état — or il change les textes des jeux ET les couleurs du site.
 */
export function AmbianceModeToggle({ className, hint = true }: { className?: string; hint?: boolean }) {
  const t = useTranslations('hub.ambianceMode')
  const { loading } = useAuth()
  // Le réglage vise d'abord la table SANS compte (un téléphone posé au milieu) :
  // la bascule n'est plus réservée aux connectés, l'appareil se souvient pour
  // eux (cf. useAmbianceMode). On attend quand même la réponse de l'auth pour
  // ne pas afficher « Alcool » à un connecté qui a choisi Soft.
  const { mode, setMode } = useAmbianceMode()
  // App Android lue après montage : le serveur ne voit pas la coquille, et un
  // message rendu d'emblée côté client seulement casserait l'hydratation.
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])

  if (loading) return null

  // Dans l'app, l'aide de l'ambiance alcool porte aussi le message de
  // modération : c'est la condition posée pour garder l'alcool accessible
  // malgré la politique alcool de Google Play. Le site, lui, reste tel quel.
  const showModeration = hint && inApp && mode === 'alcool'

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div
        role="radiogroup"
        aria-label={t('label')}
        aria-describedby={hint ? (showModeration ? 'ambiance-hint ambiance-moderation' : 'ambiance-hint') : undefined}
        className="inline-flex w-full rounded-full border border-white/10 bg-black/30 p-1 shadow-inner"
      >
        {MODES.map(({ id, icon: Icon }) => {
          const active = mode === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (!active) setMode(id)
              }}
              className={cn(
                'flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-semibold transition-all sm:gap-2 sm:px-3 sm:text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07060b]',
                active
                  ? id === 'soft'
                    ? 'bg-emerald-400 text-black shadow-[0_0_18px_rgba(52,211,153,0.35)]'
                    : 'bg-amber-400 text-black shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                  : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{t(id)}</span>
            </button>
          )
        })}
      </div>
      {/* Ce que la bascule change vraiment, en une ligne : sans elle, le
          joueur voit le site changer de couleur sans comprendre pourquoi. */}
      {hint && (
        <p id="ambiance-hint" className="mt-1 px-2 text-[11px] leading-snug text-white/45">
          {t(mode === 'soft' ? 'hintSoft' : 'hintAlcool')}
        </p>
      )}
      {showModeration && (
        <p id="ambiance-moderation" className="mt-1 px-2 text-[11px] font-medium leading-snug text-white/70">
          {t('moderation')}
        </p>
      )}
    </div>
  )
}
