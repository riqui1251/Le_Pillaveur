"use client"

import { useEffect, useRef, type ReactNode } from 'react'
import { Hourglass } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { playGameSound } from '@/lib/sound/game-sounds'

export type TurnBannerProps = {
  /** C'est au joueur de CE téléphone d'agir. */
  mine: boolean
  /** Joueur attendu quand ce n'est pas `mine`. Absent : « En attente des autres joueurs ». */
  name?: string
  /** Avatar du joueur attendu (glyphe, emoji ou portrait), affiché à gauche. */
  avatar?: ReactNode
  /** Consigne sous le titre : « Désigne un suspect », « Il choisit sa carte ». */
  hint?: ReactNode
  /**
   * Son de tour et courte vibration quand le tour ARRIVE au joueur (passage
   * à `mine`, pas au montage). À laisser éteint si le jeu a déjà son flash
   * de tour (TurnOverlay), qui sonne et vibre lui-même.
   */
  alertOnMine?: boolean
  className?: string
}

/**
 * « À QUI LE TOUR » — un seul bandeau pour tous les jeux.
 *
 * Chaque jeu le disait à sa façon (bandeau qui clignote, mot de 12 px dans un
 * coin, phrase au milieu d'un panneau) : le joueur devait réapprendre où
 * regarder. Ici, d'un coup d'œil : or plein = à moi, feutre sombre = j'attends.
 * Pas de pulsation infinie — le contraste suffit et la table ne clignote pas.
 */
export function TurnBanner({ mine, name, avatar, hint, alertOnMine = false, className }: TurnBannerProps) {
  const t = useTranslations('gameUi.turn')
  // Valeur déjà vue : l'alerte part au PASSAGE à « à moi », jamais au montage
  // (retour sur l'onglet, reconnexion en plein tour).
  const wasMineRef = useRef(mine)

  useEffect(() => {
    if (mine && !wasMineRef.current && alertOnMine) {
      playGameSound('turn')
      try {
        navigator.vibrate?.(60)
      } catch {
        // vibration non supportée — silencieux
      }
    }
    wasMineRef.current = mine
  }, [mine, alertOnMine])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // min-h-[3.5rem] et non `min-h-14` : Tailwind 3.3 n'a pas l'échelle
        // d'espacement sur min-height, la classe ne générait aucun CSS.
        'flex min-h-[3.5rem] items-center gap-3 rounded-2xl px-4 py-2.5 transition-colors',
        mine
          ? 'bg-amber-500 text-[#24201A] shadow-[0_10px_22px_-12px_rgba(217,164,65,0.7)]'
          : 'border border-cream/20 bg-black/20 text-cream/80',
        className
      )}
    >
      {avatar != null && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-2xl leading-none" aria-hidden>
          {avatar}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {mine ? (
          <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">{t('mine')}</p>
        ) : (
          <p className="break-words text-base font-semibold leading-snug text-cream">
            {name ? t('of', { name }) : t('waiting')}
          </p>
        )}
        {hint != null && (
          <div className={cn('mt-0.5 text-sm leading-snug', mine ? 'font-semibold' : 'text-cream/80')}>{hint}</div>
        )}
      </div>
      {!mine && <Hourglass className="h-5 w-5 shrink-0 text-cream/70" aria-hidden />}
    </div>
  )
}
