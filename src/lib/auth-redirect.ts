/**
 * Destination après connexion — module PUR, partagé par le formulaire de
 * connexion (AuthForm) et la route de retour OAuth, qui redirige elle-même.
 */

/**
 * Le paramètre ?redirect= est le SEUL indice de ce qui a fait venir le
 * visiteur : la bascule « en ligne » de la vitrine y met /jeux, la porte de
 * code de table /jeux?join=XXXXXX, l'essai contre des bots /games/<jeu>, et le
 * middleware y recopie la page protégée qu'on a tenté d'ouvrir.
 *
 * Un compte fraîchement créé naît en mode LOCAL côté serveur : sans ça, le
 * visiteur venu pour jouer EN LIGNE s'inscrivait puis atterrissait sur la
 * sélection de joueurs locaux, et devait deviner une bascule pour retrouver ce
 * qui l'avait fait venir. On pose donc le mode en ligne dès l'inscription
 * quand la destination est celle du jeu en ligne.
 *
 * Le cas local reste intact : /joueurs (la valeur par défaut, et la
 * destination du joueur qu'on renvoie vers sa table de salon) ne déclenche
 * rien, et la bascule reste disponible dans les deux sens.
 */
export function impliesOnlineMode(redirect: string): boolean {
  const [path, query = ''] = redirect.split('?')
  if (query.includes('join=')) return true
  return path === '/jeux' || path.startsWith('/jeux/') || path.startsWith('/games/')
}

/** Chemin interne sans préfixe de langue ; /joueurs pour tout le reste. */
export function safeAuthRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return '/joueurs'
  if (path.startsWith('/compte')) return '/joueurs'
  return path
}
