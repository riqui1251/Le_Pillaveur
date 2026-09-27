import { isCapacitorApp } from '@/lib/native-app'

/**
 * Ambiance des jeux : 'alcool' (gorgées, cul-secs) ou 'soft' (gages et points).
 *
 * Module sans React ni contexte d'auth : AuthProvider en a besoin pour
 * l'inscription, et le fournisseur d'ambiance importe déjà useAuth — le
 * laisser dans AmbianceAttribute.tsx créerait un cycle d'imports. Les routes
 * de création de compte y valident aussi le choix envoyé par le client.
 */
export type AmbianceMode = 'alcool' | 'soft'

/**
 * Repli LOCAL de l'ambiance, pour le public que le réglage vise vraiment : un
 * téléphone posé au milieu de la table, sans compte. Le mode Soft ne vivait
 * que sur `user.ambianceMode` — la bascule ne s'affichait donc que pour un
 * connecté, et le groupe qui joue sans alcool ne la voyait jamais.
 *
 * Règle : le COMPTE reste la source de vérité quand il y en a un (le réglage
 * suit le joueur d'un appareil à l'autre) ; sans compte, l'appareil se
 * souvient tout seul. On écrit dans les deux cas, pour qu'une déconnexion ne
 * fasse pas resurgir l'alcool sur une table qui n'en veut pas.
 */
export const AMBIANCE_STORAGE_KEY = 'lp-ambiance-mode'

/**
 * Le stockage ne prévient PAS l'onglet qui écrit ('storage' ne sert qu'aux
 * autres onglets) : sans cet événement maison, la bascule changerait le
 * réglage sans que l'attribut d'ambiance ni les jeux ouverts s'en aperçoivent.
 */
export const AMBIANCE_EVENT = 'lp-ambiance-change'

/** Toute valeur inconnue (stockage bricolé, ancienne version) = alcool. */
export function normalizeAmbianceMode(value: string | null | undefined): AmbianceMode {
  return value === 'soft' ? 'soft' : 'alcool'
}

/**
 * Ambiance retenue sur CET appareil.
 *
 * Sans choix mémorisé, le défaut dépend du support : 'alcool' sur le site (rien
 * ne change pour lui), 'soft' dans l'app Android — la politique alcool de
 * Google Play veut un premier lancement sans alcool ; l'alcool y reste
 * accessible par un choix explicite de la bascule, qui l'écrit ici.
 *
 * Client uniquement, APRÈS montage : isCapacitorApp() lit le pont injecté par
 * la coquille, absent du rendu serveur — c'est pourquoi useAmbianceMode garde
 * 'alcool' au premier rendu et n'appelle cette lecture qu'en effet.
 */
export function readLocalAmbianceMode(): AmbianceMode {
  if (typeof window === 'undefined') return 'alcool'
  // Défaut « sans choix » : aussi celui d'un stockage refusé, pour que l'app
  // ne bascule pas sur l'alcool faute de pouvoir relire le réglage.
  const fallback: AmbianceMode = isCapacitorApp() ? 'soft' : 'alcool'
  try {
    const stored = window.localStorage.getItem(AMBIANCE_STORAGE_KEY)
    return stored === null ? fallback : normalizeAmbianceMode(stored)
  } catch {
    // navigation privée / stockage refusé : le réglage vaut pour la session
    return fallback
  }
}

/** Mémorise l'ambiance sur l'appareil et réveille les lecteurs de la page. */
export function writeLocalAmbianceMode(mode: AmbianceMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AMBIANCE_STORAGE_KEY, mode)
  } catch {
    // rien à mémoriser : la bascule reste utilisable pour la visite en cours
  }
  window.dispatchEvent(new Event(AMBIANCE_EVENT))
}

/**
 * Ambiance demandée à la CRÉATION d'un compte (invité, inscription, Google) :
 * celle de l'appareil, pour qu'un compte né dans l'app — ou d'un visiteur qui
 * avait choisi « Sans alcool » — ne réimpose pas l'alcool dès sa création.
 * Toute autre valeur est ignorée (null) : le compte prend alors le défaut du
 * schéma, comme avant.
 */
export function parseRequestedAmbianceMode(value: unknown): AmbianceMode | null {
  return value === 'soft' || value === 'alcool' ? value : null
}
