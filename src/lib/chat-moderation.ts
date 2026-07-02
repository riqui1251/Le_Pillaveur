import { containsProfanity } from '@/lib/name-moderation'

/**
 * Filtre anti-insultes du chat : les mots injurieux sont masqués (***) mais le
 * message est délivré — on censure, on ne bloque pas la conversation.
 *
 * Réutilise le détecteur des pseudos (normalisation accents/leet + termes
 * ajoutés par la modération en DB). Vérification par mot puis par paire de
 * mots adjacents (insultes coupées en deux), mais PAS sur le message compacté
 * entier : sur une phrase longue, la compaction créerait des faux positifs
 * en collant des mots innocents.
 */

const MASK_MAX = 8

function mask(word: string): string {
  return '*'.repeat(Math.max(3, Math.min(word.length, MASK_MAX)))
}

export function censorChatMessage(text: string): { text: string; censored: boolean } {
  // Découpe en conservant les séparateurs pour reconstruire fidèlement.
  const parts = text.split(/(\s+)/)
  let censored = false

  for (let i = 0; i < parts.length; i += 1) {
    const word = parts[i]
    if (!word || /^\s+$/.test(word)) continue
    if (containsProfanity(word)) {
      parts[i] = mask(word)
      censored = true
    }
  }

  // Paires de mots adjacents (ex. insulte séparée par une espace).
  const wordSlots = parts
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w && !/^\s+$/.test(w) && !/^\*+$/.test(w))
  for (let k = 0; k + 1 < wordSlots.length; k += 1) {
    const a = wordSlots[k]
    const b = wordSlots[k + 1]
    if (containsProfanity(`${a.w}${b.w}`)) {
      parts[a.i] = mask(a.w)
      parts[b.i] = mask(b.w)
      censored = true
    }
  }

  return { text: parts.join(''), censored }
}
