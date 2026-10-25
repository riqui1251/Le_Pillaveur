import { BANDS_1220, TOTAL_MAX, TOTAL_MIN, type Choices1220, type Parity1220 } from '@/lib/game-1220'

/**
 * Validation des paris du 1220, partagée par le moteur en ligne (paris reçus
 * d'un client) et par les écrans (vue reçue du serveur). Un pari reçu tel
 * quel faisait planter l'écran de toute la table (`drinkNumber` objet rendu
 * par React), gonfler l'état (clés inconnues accumulées) ou ne jamais boire
 * (`"7"` en chaîne n'égale aucune somme).
 */

const PARITIES_1220: readonly Parity1220[] = ['pair', 'impair']
const CHOICE_KEYS = ['parity', 'band', 'drinkNumber', 'giveNumber'] as const

export function defaultChoices1220(): Choices1220 {
  return { parity: 'pair', band: '11-20', drinkNumber: 7, giveNumber: 13 }
}

function isBetNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= TOTAL_MIN && (value as number) <= TOTAL_MAX
}

function isChoiceValue(key: (typeof CHOICE_KEYS)[number], value: unknown): boolean {
  if (key === 'parity') return (PARITIES_1220 as readonly unknown[]).includes(value)
  if (key === 'band') return (BANDS_1220 as readonly unknown[]).includes(value)
  return isBetNumber(value)
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

/**
 * Modification partielle envoyée par un client : seulement les 4 clés connues,
 * chacune valide. Null au moindre écart (clé inconnue, type, borne).
 */
export function parseChoicesPatch1220(raw: unknown): Partial<Choices1220> | null {
  const record = asRecord(raw)
  if (!record) return null
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    const known = CHOICE_KEYS.find((k) => k === key)
    if (!known || !isChoiceValue(known, value)) return null
    patch[known] = value
  }
  return patch as Partial<Choices1220>
}

/** Paris complets (4 champs valides, rien d'autre) — copie, ou null. Le conflit boire/donner reste à vérifier. */
export function parseChoices1220(raw: unknown): Choices1220 | null {
  const patch = parseChoicesPatch1220(raw)
  if (!patch || CHOICE_KEYS.some((k) => patch[k] === undefined)) return null
  return { parity: patch.parity!, band: patch.band!, drinkNumber: patch.drinkNumber!, giveNumber: patch.giveNumber! }
}

/**
 * Paris lus dans un état stocké ou une vue : chaque champ invalide reprend sa
 * valeur par défaut, les clés inconnues sont écartées. Ne lève jamais.
 */
export function sanitizeChoices1220(raw: unknown): Choices1220 {
  const record = asRecord(raw) ?? {}
  const fallback = defaultChoices1220()
  const pick = <K extends (typeof CHOICE_KEYS)[number]>(key: K): Choices1220[K] =>
    isChoiceValue(key, record[key]) ? (record[key] as Choices1220[K]) : fallback[key]
  return { parity: pick('parity'), band: pick('band'), drinkNumber: pick('drinkNumber'), giveNumber: pick('giveNumber') }
}

/** Paris verrouillables : assainis, et entièrement par défaut s'ils font boire et donner sur le même chiffre. */
export function playableChoices1220(raw: unknown): Choices1220 {
  const choices = sanitizeChoices1220(raw)
  return choices.drinkNumber === choices.giveNumber ? defaultChoices1220() : choices
}
