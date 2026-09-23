"use client"

import { useEffect, useReducer, useRef } from 'react'

/**
 * ÉCHÉANCE FRANCHIE — un seul re-rendu, au bon moment.
 *
 * Plusieurs jeux ne se servent de leur horloge locale que pour une question
 * binaire : « le délai de STOP est-il écoulé ? », « peut-on déposer le
 * brouillon (2 s avant la fin) ? », « la fenêtre de retour du parti est-elle
 * close ? ». Une horloge à 500 ms re-rendait tout l'arbre pour rien : la
 * réponse ne change qu'UNE fois. Ce hook la calcule à la lecture et arme un
 * unique setTimeout sur l'échéance ; le composant ne se re-rend qu'au
 * franchissement. L'horloge serveur reste l'autorité (les routes revalident).
 */

/** setTimeout plafonne à 2^31-1 ms : au-delà il tirerait immédiatement. */
export const MAX_TIMEOUT_MS = 2_147_483_647

/** Vrai dès que `now` atteint l'échéance ; une échéance absente n'arrive jamais. */
export function deadlinePassed(endsAt: number | null | undefined, now: number): boolean {
  return endsAt != null && now >= endsAt
}

/** Délai à armer pour se réveiller pile à l'échéance (0 si elle est passée). */
export function deadlineDelayMs(endsAt: number, now: number): number {
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, endsAt - now))
}

/**
 * `true` une fois l'échéance (epoch ms) atteinte, `false` avant ou sans
 * échéance. Re-rend le composant au franchissement seulement — et au retour
 * d'un onglet caché, car iOS gèle les minuteurs d'une page en arrière-plan.
 */
export function useDeadline(endsAt: number | null | undefined): boolean {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const passed = deadlinePassed(endsAt, Date.now())
  // Ce que ce rendu a répondu. L'effet tourne quelques millisecondes après :
  // si l'échéance tombe dans cet intervalle (reconnexion pile dessus), il n'y
  // a plus rien à armer — mais l'écran dit encore « pas encore ». On compare
  // à ce ref plutôt que de re-rendre à l'aveugle (une échéance déjà passée au
  // montage ne mérite aucun second rendu).
  const renderedRef = useRef(passed)
  renderedRef.current = passed

  useEffect(() => {
    if (endsAt == null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      const now = Date.now()
      if (now >= endsAt) {
        if (!renderedRef.current) rerender()
        return
      }
      timer = setTimeout(() => {
        // Horloge en avance sur le minuteur (dérive) : on réarme le reliquat.
        if (Date.now() < endsAt) arm()
        else rerender()
      }, deadlineDelayMs(endsAt, now))
    }
    const onVisibility = () => {
      clearTimeout(timer)
      if (!document.hidden) arm()
    }
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [endsAt])

  return passed
}
