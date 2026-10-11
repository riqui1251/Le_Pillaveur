/**
 * Détection de la coquille mobile Capacitor (l'app charge le site en mode
 * server.url et injecte le pont `window.Capacitor` dans la page).
 * À appeler côté client uniquement, après montage.
 *
 * Deux signes, l'un OU l'autre :
 * - le pont natif, injecté dans le HTML par le serveur local de Capacitor ;
 * - la marque que l'app ajoute à son user-agent (`appendUserAgent` dans
 *   mobile/capacitor.config.json). Elle tient même sans pont — page servie
 *   depuis le cache du service worker par un APK qui ne relaie pas les
 *   requêtes du worker — pour que l'app ne se prenne jamais pour le site :
 *   entrée « Application mobile » du menu, carte d'installation, bouton
 *   plein écran et ambiance par défaut suivent cette détection.
 */
export const APP_USER_AGENT_MARKER = 'LePillaveurApp'

export function isCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  if (w.Capacitor?.isNativePlatform?.()) return true
  return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.includes(APP_USER_AGENT_MARKER)
}
