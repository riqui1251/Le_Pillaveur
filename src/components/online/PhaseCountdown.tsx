"use client"

import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { countdownSnapshot, nextSecondTickMs, type CountdownSnapshot } from './phase-countdown'

/**
 * COMPTE À REBOURS DE PHASE — une FEUILLE qui possède sa propre horloge.
 *
 * Avant : chaque composant de jeu posait `setClock(Date.now())` sur son état
 * racine toutes les 250 à 1 000 ms, et chaque tick re-rendait l'arbre entier
 * (liste des joueurs, cosmétiques, framer-motion) pour faire avancer un
 * chiffre. Ici seule cette feuille se re-rend, et seulement quand quelque
 * chose change à l'écran :
 *  - texte : un setTimeout calé sur le prochain changement de seconde ;
 *  - barre : requestAnimationFrame, largeur écrite directement dans le DOM
 *    (pas de setState par image) et un seul re-rendu au passage en zone
 *    d'urgence ;
 *  - arrêt net une fois l'échéance passée et tant que l'onglet est caché
 *    (visibilitychange), rattrapage immédiat au retour.
 * L'échéance serveur fait foi : ce composant n'envoie rien (le tick
 * « advance » vit dans useAdvanceTick et lit `dueAt`, pas une horloge).
 *
 * Aucune bibliothèque d'animation ici : ce composant est monté sur le hub
 * (RejoinBanner), page ouverte entre chaque partie. Le grand chiffre animé
 * du lancement vit dans PhaseCountdownLaunch, importé par les seuls jeux.
 */

/** Piste de la barre des téléphones (bandeau de phase). */
const BAR_TRACK_CLASS = 'mt-2 h-1.5 overflow-hidden rounded-full bg-white/10'
/**
 * Remplissage de la barre des téléphones — la couleur vient des props. Pas de
 * transition CSS : la largeur est écrite à chaque image, et une transition de
 * 500 ms redémarrée à chaque image ne faisait que traîner d'une demi-seconde
 * derrière l'horloge.
 */
const BAR_FILL_CLASS = 'h-full rounded-full'

export type PhaseCountdownProps = {
  /** Échéance serveur (epoch ms). Absente : rien ne tourne. */
  endsAt: number | null | undefined
  /** Durée totale de la phase (ms) — nécessaire à la barre. */
  total?: number
  /**
   * `text` : les secondes restantes dans un <span> ; `bar` : barre de
   * progression. Ignoré quand `children` est fourni.
   */
  variant?: 'text' | 'bar'
  /**
   * Rendu personnalisé (phrase traduite « retour dans 42 s », compte à
   * rebours TV, chiffre animé du lancement…). Appelé à chaque changement de
   * seconde, ou à `tickMs`.
   */
  children?: (snapshot: CountdownSnapshot) => ReactNode
  /**
   * Cadence fixe du rendu personnalisé (ms). Réservé aux barres TV animées
   * par framer-motion (TvTimeBar) : elles lissent sur 0,3 s et veulent une
   * nouvelle cible avant la fin du lissage.
   */
  tickMs?: number
  /** Barre : sous ce reste (ms), `dangerClassName` remplace `colorClassName`. */
  dangerMs?: number
  /** Classes du <span> (text) ou de la piste (bar). */
  className?: string
  /** Barre : classes fixes du remplissage. */
  barClassName?: string
  /** Barre : couleur du remplissage. */
  colorClassName?: string
  /** Barre : couleur d'urgence. */
  dangerClassName?: string
}

export function PhaseCountdown({
  endsAt,
  total,
  variant = 'text',
  children,
  tickMs,
  dangerMs,
  className,
  barClassName = BAR_FILL_CLASS,
  colorClassName,
  dangerClassName,
}: PhaseCountdownProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const fillRef = useRef<HTMLDivElement>(null)
  const ownBar = variant === 'bar' && !children

  const snapshot = countdownSnapshot(endsAt, Date.now(), total)
  const danger = dangerMs !== undefined && snapshot.leftMs < dangerMs
  // Ce que CE rendu a montré. L'effet tourne quelques millisecondes après le
  // rendu : si l'échéance — ou le seuil d'urgence — tombe dans cet intervalle
  // (montage ou reconnexion pile dessus), il n'a plus rien à armer alors que
  // l'écran dit encore « 1 s » ou garde la couleur calme. Il compare donc à
  // ce qui est affiché, pas à une nouvelle lecture de l'horloge.
  const renderedRef = useRef({ expired: snapshot.expired, danger })
  renderedRef.current = { expired: snapshot.expired, danger }

  useEffect(() => {
    if (endsAt == null) return

    if (ownBar) {
      // Barre : une image = une largeur, sans passer par React. Le seul
      // re-rendu est le changement de couleur au seuil d'urgence.
      let frame = 0
      let wasDanger = renderedRef.current.danger
      const paint = () => {
        const snap = countdownSnapshot(endsAt, Date.now(), total)
        if (fillRef.current) fillRef.current.style.width = `${snap.ratio * 100}%`
        const danger = dangerMs !== undefined && snap.leftMs < dangerMs
        if (danger !== wasDanger) {
          wasDanger = danger
          rerender()
        }
        if (!snap.expired && !document.hidden) frame = requestAnimationFrame(paint)
      }
      const onVisibility = () => {
        cancelAnimationFrame(frame)
        if (!document.hidden) frame = requestAnimationFrame(paint)
      }
      frame = requestAnimationFrame(paint)
      document.addEventListener('visibilitychange', onVisibility)
      return () => {
        cancelAnimationFrame(frame)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }

    // Texte : réveil au prochain changement de seconde (ou à cadence fixe),
    // plus rien une fois l'échéance passée.
    let timer: ReturnType<typeof setTimeout> | undefined
    /** Arme le prochain réveil ; faux si l'échéance est déjà passée. */
    const schedule = () => {
      const now = Date.now()
      if (now >= endsAt) return false
      timer = setTimeout(tick, tickMs ?? nextSecondTickMs(endsAt, now))
      return true
    }
    const tick = () => {
      rerender()
      schedule()
    }
    const onVisibility = () => {
      clearTimeout(timer)
      if (!document.hidden) tick()
    }
    // Échéance franchie entre le rendu et l'armement : un dernier rendu
    // montre « 0 » au lieu de laisser la dernière seconde figée.
    if (!schedule() && !renderedRef.current.expired) rerender()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [endsAt, total, ownBar, tickMs, dangerMs])

  if (children) return <>{children(snapshot)}</>

  if (variant === 'bar') {
    return (
      <div className={className ?? BAR_TRACK_CLASS}>
        <div
          ref={fillRef}
          className={cn(barClassName, danger ? dangerClassName : colorClassName)}
          style={{ width: `${snapshot.ratio * 100}%` }}
        />
      </div>
    )
  }

  return <span className={className}>{snapshot.seconds}</span>
}
