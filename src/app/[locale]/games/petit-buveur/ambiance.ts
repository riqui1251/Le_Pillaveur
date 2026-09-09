import type { PetitBuveurT } from './case-config'

/**
 * Mode d'ambiance de la table. Le champ vit sur le compte
 * (`user.ambianceMode`, cf. AmbianceModeToggle) et pilotait jusqu'ici le seul
 * mode EN LIGNE : les jeux locaux l'ignoraient et restaient alcoolisés.
 */
export type AmbianceMode = 'alcool' | 'soft'

export function resolveAmbianceMode(mode: string | null | undefined): AmbianceMode {
  return mode === 'soft' ? 'soft' : 'alcool'
}

/**
 * Défis dont l'ÉNONCÉ lui-même parle d'alcool (« bois sans les mains »,
 * « cite 5 marques de bière »). Les 4 fichiers de messages listent les défis
 * dans le même ordre : les index sont donc stables d'une langue à l'autre.
 * En Soft on les remplace par les défis de `soft.defis` — on ne se contente
 * pas de les supprimer, sinon le mode Soft appauvrit le jeu.
 */
export const ALCOHOL_DEFI_INDEXES = [17, 33]

/** Index de la case « Tu bois 2 gorgées » sur la roue des défis. */
export const ALCOHOL_WHEEL_CHALLENGE_INDEX = 10

type DefiItem = { text: string; drinks: number; verifiableOnline?: boolean }

function safeHas(t: PetitBuveurT, key: string): boolean {
  try {
    return typeof t.has === 'function' ? t.has(key) : false
  } catch {
    return false
  }
}

/**
 * Enveloppe le `t` du jeu : en Soft, chaque clé tente d'abord sa variante
 * `soft.<clé>` et retombe sur la formulation alcoolisée si elle n'existe pas.
 * Même jeu, mêmes effets — seules les formulations « bois / cul sec / gorgées »
 * deviennent des gages et des points.
 */
export function withAmbiance(t: PetitBuveurT, ambiance: AmbianceMode): PetitBuveurT {
  if (ambiance !== 'soft') return t

  const pick = (key: string) => (safeHas(t, `soft.${key}`) ? `soft.${key}` : key)

  const wrapped = ((key: string, values?: Record<string, string | number>) =>
    t(pick(key), values)) as PetitBuveurT

  wrapped.raw = (key: string): unknown => {
    if (key === 'defis') return softDefis(t)
    if (key === 'defiWheelChallenges') return softWheelChallenges(t)
    return t.raw(pick(key))
  }
  wrapped.has = (key: string) => safeHas(t, `soft.${key}`) || safeHas(t, key)

  return wrapped
}

function softDefis(t: PetitBuveurT): DefiItem[] {
  const base = (t.raw('defis') as DefiItem[]) ?? []
  const rawReplacements = safeHas(t, 'soft.defis') ? t.raw('soft.defis') : null
  const replacements = Array.isArray(rawReplacements) ? (rawReplacements as DefiItem[]) : []
  // Tant que les défis Soft ne sont pas traduits, on garde les défis d'origine :
  // le mode Soft REFORMULE, il n'ampute jamais le jeu. Retirer les défis
  // alcoolisés sans avoir de quoi les remplacer ferait disparaître du contenu.
  if (replacements.length === 0) return base
  const kept = base.filter((_, index) => !ALCOHOL_DEFI_INDEXES.includes(index))
  return [...kept, ...replacements]
}

function softWheelChallenges(t: PetitBuveurT): string[] {
  const base = (t.raw('defiWheelChallenges') as string[]) ?? []
  if (!safeHas(t, 'soft.defiWheelChallenge')) return base
  const replacement = t('soft.defiWheelChallenge')
  // Même règle que pour les défis : pas de remplaçant lisible, pas de retrait —
  // une case de roue vide serait pire que la formulation alcoolisée.
  if (typeof replacement !== 'string' || replacement.trim() === '') return base
  return base.map((label, index) =>
    index === ALCOHOL_WHEEL_CHALLENGE_INDEX ? replacement : label
  )
}
