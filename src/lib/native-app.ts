/**
 * Détection de la coquille mobile Capacitor (l'app charge le site en mode
 * server.url et injecte le pont `window.Capacitor` dans la page).
 * À appeler côté client uniquement, après montage.
 */
export function isCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  return Boolean(w.Capacitor?.isNativePlatform?.())
}
