/**
 * Ce que la page affichée demande au fond animé du site (SiteBackdrop) : la
 * teinte d'un jeu, la version renforcée. Une seule page à la fois en a la
 * main ; sans page qui la prend, le fond garde ses couleurs par défaut.
 */
export type BackdropOptions = { accent?: string; strong?: boolean }

export const DEFAULT_BACKDROP: BackdropOptions = {}

let current: BackdropOptions = DEFAULT_BACKDROP
let owner: symbol | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeBackdrop(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readBackdrop(): BackdropOptions {
  return current
}

/**
 * La page qui s'affiche prend la main sur le fond ; la fonction rendue la lui
 * retire — sans effet si une autre page l'a prise entre-temps (navigation :
 * l'ancienne page peut se démonter après que la nouvelle s'est montée).
 */
export function claimBackdrop(options: BackdropOptions): () => void {
  const token = Symbol('backdrop')
  owner = token
  current = options
  emit()
  return () => {
    if (owner !== token) return
    owner = null
    current = DEFAULT_BACKDROP
    emit()
  }
}
