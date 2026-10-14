import type { BotTrait, BotTraits } from '@/lib/online/bot-personas'
import { IMPOSTEUR_EMPTY_CLUE, isValidClue, normalizeClue } from './engine'
import { clueKey } from './clue-match'

/**
 * Choix de l'indice d'un bot — PUR, aléa injecté. Le bot ne reçoit qu'UNE
 * liste, triée du plus vague au plus précis — celle de SON mot, ou, bluff
 * informé, celle du mot des civils quand un éliminé l'a rendu public
 * (bot-brain.ts) — et les indices publics. Il ne lit ni son camp ni l'autre
 * mot, et se trahit donc comme un humain quand il est l'imposteur sans le
 * savoir.
 *
 * INVARIANT : le résultat est un élément de `clues`, un indice de `parrots`
 * (mode `blend` seulement), ou « … » si `clues` est vide. Liste épuisée, le
 * bot REDIT plutôt que de se taire : « … » vaut presque aveu à la table, et
 * sans redite les civils d'une table de 9 bots épuisaient leur liste dès la
 * deuxième manche, puis se votaient entre eux (village gagnant 1 fois sur 100).
 */

/**
 * `play` : au ton du persona (fenêtre de rangs par trait, audace, manche).
 * `blend` : se fondre — répéter un indice de la manche (perroquet) ou dire le
 * plus vague (rang 0) ; réservé au bot qui se SAIT imposteur sans connaître
 * le mot des civils (bot-brain.ts).
 */
export type BotClueMode = 'play' | 'blend'

/** Part des bluffs qui répètent un indice de la manche plutôt que le plus vague. */
export const BLEND_PARROT_CHANCE = 0.5

export type PickBotClueInput = {
  /** La liste où il puise, du plus vague au plus précis. */
  clues: readonly string[]
  /** Indices déjà donnés dans la partie (toutes manches, tous joueurs). */
  given: readonly string[]
  /** SES indices déjà donnés, du plus ancien au plus récent : la redite y puise d'abord. */
  mine?: readonly string[]
  traits: BotTraits
  round: number
  rand: () => number
  mode: BotClueMode
  /** Joueurs encore à table : borne le chœur de la manche 1 (firstRoundEchoCap). */
  alive?: number
  /** `blend` : indices donnés CETTE manche par les autres, candidats au perroquet. */
  parrots?: readonly string[]
  /** `blend` : son propre mot — on ne répète qu'un indice que le moteur lui accepterait. */
  ownWord?: string
}

/**
 * Fenêtre de rangs [lo, hi) d'un trait sur une liste de `n` indices :
 * prudent = premier tiers (vague), suiveur / farceur = tiers médian,
 * agressif = dernier tiers (précis). Jamais vide tant que n ≥ 1.
 */
export function clueRankWindow(trait: BotTrait, n: number): [number, number] {
  const third = Math.max(1, Math.ceil(n / 3))
  if (trait === 'prudent') return [0, Math.min(n, third)]
  if (trait === 'agressif') return [Math.max(0, n - third), n]
  const lo = Math.min(third, Math.max(0, n - 1))
  return [lo, Math.max(lo + 1, n - third)]
}

/**
 * Manche 1, nombre de fois qu'un indice peut déjà avoir été dit pour qu'un bot
 * le redise encore : de quoi laisser TOUTE la table dans le tiers vague
 * (⌈vivants / taille du tiers⌉), jamais moins de deux. À 5 ou 6 joueurs,
 * deux voix au plus sur un même indice ; à 16, la table entière reste vague
 * et le bas de la liste reste libre pour les manches suivantes — y compris
 * pour l'imposteur qui y apprendra le mot des civils.
 */
export function firstRoundEchoCap(alive: number, n: number): number {
  const [lo, hi] = clueRankWindow('prudent', n)
  return Math.max(2, Math.ceil(alive / Math.max(1, hi - lo)))
}

/**
 * Perroquet : un indice de la manche, dit une seule fois jusqu'ici (le
 * répéter une deuxième fois ferait un chœur suspect), que le moteur
 * accepterait de ce bot. Null si aucun ne convient.
 */
function pickParrot(
  parrots: readonly string[],
  given: readonly string[],
  ownWord: string,
  rand: () => number
): string | null {
  // Même clé que le repérage des perroquets (bot-brain.ts) : « maître-nageur »
  // et « maître nageur » comptent pour une seule répétition.
  const said = new Map<string, number>()
  for (const g of given) said.set(clueKey(g), (said.get(clueKey(g)) ?? 0) + 1)
  const seen = new Set<string>()
  const candidates = parrots.filter((text) => {
    const key = clueKey(text)
    if (text.trim() === IMPOSTEUR_EMPTY_CLUE || seen.has(key)) return false
    seen.add(key)
    return (said.get(key) ?? 0) < 2 && isValidClue(text, ownWord)
  })
  if (candidates.length === 0) return null
  return candidates[Math.min(candidates.length - 1, Math.floor(rand() * candidates.length))]
}

/**
 * Liste épuisée : d'abord un de SES indices tiré de la liste, le moins
 * récemment dit (se répéter n'est pas un perroquet : bot-brain.ts ne compte
 * que la redite d'un AUTRE) ; sinon — il n'a encore rien dit de la liste —
 * l'indice de la liste que la table a le moins entendu, au plus près du rang
 * visé.
 */
function repeatClue(
  clues: readonly string[],
  given: readonly string[],
  mine: readonly string[],
  rank: number
): string {
  const rankOf = new Map<string, number>()
  clues.forEach((c, i) => {
    if (!rankOf.has(normalizeClue(c))) rankOf.set(normalizeClue(c), i)
  })
  const lastSaid = new Map<string, number>()
  mine.forEach((text, at) => {
    if (rankOf.has(normalizeClue(text))) lastSaid.set(normalizeClue(text), at)
  })
  let oldest: string | null = null
  for (const [key, at] of lastSaid) if (oldest === null || at < (lastSaid.get(oldest) ?? 0)) oldest = key
  if (oldest !== null) return clues[rankOf.get(oldest) ?? 0]

  const heard = new Map<string, number>()
  for (const g of given) heard.set(normalizeClue(g), (heard.get(normalizeClue(g)) ?? 0) + 1)
  let best = 0
  let bestScore = Number.POSITIVE_INFINITY
  clues.forEach((c, i) => {
    // Le moins entendu d'abord ; à égalité, le plus proche du rang visé.
    const score = (heard.get(normalizeClue(c)) ?? 0) * clues.length + Math.abs(i - rank)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return clues[best]
}

export function pickBotClue({
  clues,
  given,
  mine = [],
  traits,
  round,
  rand,
  mode,
  alive = 0,
  parrots,
  ownWord,
}: PickBotClueInput): string {
  if (mode === 'blend' && parrots && parrots.length > 0 && ownWord !== undefined) {
    if (rand() < BLEND_PARROT_CHANCE) {
      const parrot = pickParrot(parrots, given, ownWord, rand)
      if (parrot) return parrot
    }
  }

  const n = clues.length
  if (n === 0) return IMPOSTEUR_EMPTY_CLUE
  const heard = new Set(given.map(normalizeClue))
  const free = (i: number) => !heard.has(normalizeClue(clues[i]))
  const firstRound = mode === 'play' && round <= 1

  let rank = 0
  if (mode === 'play') {
    // Manche 1 : personne ne sait encore s'il est l'intrus, tout le monde vise
    // le tiers vague (en tête, les indices communs aux deux mots) ; le trait ne
    // joue qu'ensuite. Sans cette prudence, l'imposteur agressif lâchait
    // d'emblée un indice précis de son mot : à 6 bots, il tombait dès la
    // manche 1 dans 86 parties sur 100 (27 avec).
    const [lo, hi] = clueRankWindow(firstRound ? 'prudent' : traits.trait, n)
    rank = lo + Math.floor(rand() * (hi - lo))
    if (rand() < traits.audace) rank += 1
    // On précise à mesure que la partie avance, comme les humains.
    if (round >= 2) rank += 1
    rank = Math.min(n - 1, Math.max(0, rank))
  }
  if (free(rank)) return clues[rank]
  if (firstRound) {
    // L'indice visé est déjà dit : en manche 1, on le redit plutôt que de se
    // découvrir avec un plus précis — sans faire de chœur.
    const said = given.filter((g) => normalizeClue(g) === normalizeClue(clues[rank])).length
    if (said < firstRoundEchoCap(alive, n)) return clues[rank]
  }

  // Repli : l'indice libre le plus proche du rang visé, vers le précis d'abord
  // (répéter ce qui a été dit n'apprend rien à la table).
  for (let d = 1; d < n; d += 1) {
    if (rank + d < n && free(rank + d)) return clues[rank + d]
    if (rank - d >= 0 && free(rank - d)) return clues[rank - d]
  }
  return repeatClue(clues, given, mine, rank)
}
