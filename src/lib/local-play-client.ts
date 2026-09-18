/**
 * Pose le cookie de mode local (« jouer sans compte ») — voir
 * /api/auth/local-play. Une seule porte d'entrée pour la bascule
 * PlayModeToggle, le bouton du formulaire de compte et les liens vers
 * /joueurs du hub et des jeux : le jour où la route ou ses options bougent,
 * il n'y a qu'un endroit à suivre.
 *
 * Renvoie la réponse brute et ne juge pas l'échec : chaque appelant décide
 * (naviguer quand même, afficher une erreur, rafraîchir la page).
 */
export function enterLocalPlay(): Promise<Response> {
  return fetch('/api/auth/local-play', { method: 'POST', credentials: 'include' })
}
