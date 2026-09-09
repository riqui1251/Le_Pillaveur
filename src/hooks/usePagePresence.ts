"use client"

import { useEffect, useState } from 'react'

/**
 * « Le joueur a-t-il la page sous les yeux ? »
 *
 * Au repos, les sondages du header (salles ouvertes 4 s, invitations d'amis
 * 5 s, chat non lu 10 s) tournaient même onglet en arrière-plan ou téléphone
 * dans la poche : de la batterie et de la donnée brûlées pour rien, et autant
 * de requêtes inutiles sur le serveur un samedi soir. Les hooks de sondage
 * s'abonnent ici : leur effet est relancé au changement de visibilité, donc
 * l'intervalle est coupé quand le document est caché et REPARTI avec un
 * rafraîchissement immédiat au retour au premier plan.
 *
 * On part de `true` : le rendu serveur n'a pas de `document`, et un onglet
 * ouvert en arrière-plan (ctrl+clic) est corrigé dès le premier effet.
 */
export function usePagePresence(): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState !== 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return visible
}
