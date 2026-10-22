"use client"

import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { countdownSnapshot, formatCountdown, nextSecondTickMs, type CountdownSnapshot } from './phase-countdown'

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
 *  - barre chiffrée (`showDigits`) : les deux — rAF pour la barre, réveil à
 *    la seconde pour le chiffre ;
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
/** Barre chiffrée : rangée piste + chiffre (reçoit `className`). */
const DIGITS_ROW_CLASS = 'mt-2 flex items-center gap-3'
/** Barre chiffrée : piste plus haute, qui prend la place laissée par le chiffre. */
const DIGITS_TRACK_CLASS = 'h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10'
/** Chiffre « 0:23 » : chasse fixe, il ne danse pas d'une seconde à l'autre. */
const DIGITS_CLASS = 'shrink-0 text-lg font-bold leading-none tabular-nums'
/**
 * Urgence par défaut. Le rouge carreau `bg-suit-red` tombe à 2,1:1 sur la
 * piste posée sur le feutre : la barre s'effaçait au moment où elle devait
 * crier. red-400 y tient 4,6:1.
 */
const DEFAULT_DANGER_CLASS = 'bg-red-400'
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
  /**
   * Barre : affiche aussi le temps restant en chiffres (« 0:23 », crème, qui
   * passe en rouge et pulse sous `dangerMs`), à droite d'une piste plus haute.
   * Pour une barre posée sur le FEUTRE (chiffre crème). Ignoré en `text` et
   * avec `children`. Sans `endsAt`, seule la piste vide est rendue.
   */
  showDigits?: boolean
  /** Barre : sous ce reste (ms), `dangerClassName` remplace `colorClassName`. */
  dangerMs?: number
  /**
   * Classes du <span> (text) ou de la piste (bar). Avec `showDigits` : classes
   * de la RANGÉE piste + chiffre (la piste se règle par `trackClassName`).
   */
  className?: string
  /** Barre chiffrée : classes de la piste (défaut h-2.5, prend la place restante). */
  trackClassName?: string
  /** Barre : classes fixes du remplissage. */
  barClassName?: string
  /** Barre : couleur du remplissage. */
  colorClassName?: string
  /**
   * Barre : couleur d'urgence — défaut `bg-red-400`. Sur le feutre, ne pas
   * passer `bg-suit-red` (2,1:1, la barre disparaît) ; il reste lisible sur
   * une piste posée sur crème.
   */
  dangerClassName?: string
}

export function PhaseCountdown({
  endsAt,
  total,
  variant = 'text',
  children,
  tickMs,
  showDigits = false,
  dangerMs,
  className,
  trackClassName,
  barClassName = BAR_FILL_CLASS,
  colorClassName,
  dangerClassName = DEFAULT_DANGER_CLASS,
}: PhaseCountdownProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const fillRef = useRef<HTMLDivElement>(null)
  const ownBar = variant === 'bar' && !children
  // Le chiffre de la barre a besoin du réveil à la seconde, comme le texte.
  const secondTicks = !ownBar || showDigits

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
    const stops: Array<() => void> = []

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
      stops.push(() => {
        cancelAnimationFrame(frame)
        document.removeEventListener('visibilitychange', onVisibility)
      })
    }

    if (secondTicks) {
      // Texte (et chiffre de la barre) : réveil au prochain changement de
      // seconde (ou à cadence fixe), plus rien une fois l'échéance passée.
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
      stops.push(() => {
        clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisibility)
      })
    }

    return () => stops.forEach((stop) => stop())
  }, [endsAt, total, ownBar, secondTicks, tickMs, dangerMs])

  if (children) return <>{children(snapshot)}</>

  if (variant === 'bar') {
    const fill = (
      <div
        ref={fillRef}
        className={cn(barClassName, danger ? dangerClassName : colorClassName)}
        style={{ width: `${snapshot.ratio * 100}%` }}
      />
    )
    if (!showDigits) return <div className={className ?? BAR_TRACK_CLASS}>{fill}</div>
    return (
      <div className={className ?? DIGITS_ROW_CLASS}>
        {/* Le chiffre dit déjà tout : la piste n'est que du relief. */}
        <div className={trackClassName ?? DIGITS_TRACK_CLASS} aria-hidden>
          {fill}
        </div>
        {/* Sans échéance, pas de « 0:00 » rouge qui ferait croire au temps écoulé ;
            échéance passée, le chiffre reste rouge mais cesse de pulser en
            attendant le serveur. */}
        {endsAt != null && (
          <span
            role="timer"
            className={cn(
              DIGITS_CLASS,
              danger ? 'text-red-300' : 'text-cream',
              danger && !snapshot.expired && 'motion-safe:animate-pulse'
            )}
          >
            {formatCountdown(snapshot.seconds)}
          </span>
        )}
      </div>
    )
  }

  return <span className={className}>{snapshot.seconds}</span>
}
