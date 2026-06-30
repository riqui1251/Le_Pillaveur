import frMessages from '../../../messages/fr.json'

/**
 * Données canoniques du jeu Petit Buveur, indépendantes de la langue.
 *
 * Le moteur (serveur-autoritaire) a besoin du nombre de gorgées par défi pour
 * calculer les effets de façon déterministe. Le `drinks` d'un défi est identique
 * dans toutes les locales : on prend le français comme source canonique. Les
 * textes restent traduits côté client à partir du `defiIndex`.
 */

type Defi = { text: string; drinks: number; verifiableOnline?: boolean }

const defis = (frMessages.games['petit-buveur'].defis as Defi[]) ?? []

/** Nombre de gorgées par défi, indexé comme la liste i18n `defis`. */
export const DEFI_DRINKS: number[] = defis.map((d) => d.drinks)

/** Nombre total de défis. */
export const DEFI_COUNT = DEFI_DRINKS.length

/** Indique si un défi est vérifiable en ligne (utile pour le mode online sans honneur). */
export const DEFI_VERIFIABLE_ONLINE: boolean[] = defis.map((d) => d.verifiableOnline !== false)
