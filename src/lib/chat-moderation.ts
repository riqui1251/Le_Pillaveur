import { containsProfanity, containsProfanityAcrossWords } from '@/lib/name-moderation'

/**
 * Filtre anti-insultes du chat : les mots injurieux sont masqués (***) mais le
 * message est délivré — on censure, on ne bloque pas la conversation.
 *
 * Réutilise le détecteur des pseudos, mot par mot : normalisation accents/leet,
 * termes ajoutés par la modération en DB, racines courtes cherchées dans le
 * mot (« grossebite », « tapute ») sauf les racines ambiguës, en début de mot
 * seulement (« question », « unique » passent), liste blanche (député,
 * cocktail, râpé…) et seconde lecture des lettres martelées (`coooonnard`,
 * `tapuuute`). S'y ajoutent deux durcissements propres au chat, dictés par
 * les contournements réellement observés :
 *
 *  1. caractères invisibles (`co<U+200B>nnard`) retirés avant analyse ;
 *  2. insulte éclatée sur plusieurs mots (`con nard`, `e n c u l e`) : on teste
 *     les fenêtres de mots ADJACENTS, mais seulement quand tous les morceaux
 *     sont courts — le propre d'un découpage volontaire. Jamais la phrase
 *     entière compactée : coller des mots normaux crée des faux positifs, et un
 *     mot innocent censuré est pire qu'une insulte passée.
 */

const MASK_MAX = 8

/** Espaces et jointures invisibles utilisés pour couper un mot sans que ça se voie. */
const INVISIBLE_RE = /[\u00ad\u200b-\u200f\u2060\ufeff]/g

/** Longueur max d'un morceau pour être considéré comme un bout d'insulte découpée. */
const FRAGMENT_MAX = 4
/** Fenêtre de mots testée — élargie quand tous les morceaux sont minuscules (`f u c k`). */
const WINDOW_MAX = 4
const WINDOW_MAX_TINY = 8
const TINY_FRAGMENT_MAX = 2
/**
 * Longueur minimale d'un terme pour être reconnu à travers un découpage.
 * Les termes courts (« pute », « cul ») sont exclus des recollages : « tu as
 * pu te voir » deviendrait une insulte, et un mot innocent censuré coûte plus
 * cher qu'une insulte laissée passer.
 */
const SPLIT_TERM_MIN = 5

function mask(word: string): string {
  return '*'.repeat(Math.max(3, Math.min(word.length, MASK_MAX)))
}

function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_RE, '')
}

export type ChatCensorFlags = {
  profanity: boolean
  /** Coordonnées personnelles masquées (e-mail, numéro de téléphone). */
  contact: boolean
}

export type ChatCensorResult = {
  text: string
  censored: boolean
  flags: ChatCensorFlags
}

/** Adresse e-mail — masquée entièrement (le chat n'est pas un carnet d'adresses). */
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
/**
 * Numéro de téléphone : au moins DIX chiffres, avec au plus un séparateur
 * entre deux chiffres. Le seuil est volontairement haut — un score, une année
 * ou un code de partie n'atteint jamais dix chiffres.
 */
const PHONE_RE = /\+?\d(?:[ .\-/]?\d){9,}/g

/**
 * Masque les coordonnées personnelles. Séparé du filtre d'insultes : ce n'est
 * pas de la grossièreté, c'est de la protection (mineurs, doxxing).
 */
export function maskContactDetails(text: string): { text: string; masked: boolean } {
  let masked = false
  const out = text
    .replace(EMAIL_RE, () => {
      masked = true
      return '***'
    })
    .replace(PHONE_RE, (match) => {
      masked = true
      return '*'.repeat(Math.min(match.length, MASK_MAX))
    })
  return { text: out, masked }
}

export function censorChatMessage(text: string): ChatCensorResult {
  const contact = maskContactDetails(text)

  // Découpe en conservant les séparateurs pour reconstruire fidèlement.
  const parts = contact.text.split(/(\s+)/)
  // Version analysée de chaque morceau : sans caractères invisibles.
  const probes = parts.map(stripInvisible)
  let profanity = false

  for (let i = 0; i < parts.length; i += 1) {
    const probe = probes[i]
    if (!probe || /^\s+$/.test(probe)) continue
    if (containsProfanity(probe)) {
      parts[i] = mask(parts[i])
      probes[i] = parts[i]
      profanity = true
    }
  }

  // Fenêtres de mots adjacents (insulte éclatée volontairement).
  const slots = probes
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w && !/^\s+$/.test(w) && !/^\*+$/.test(w))

  for (let start = 0; start < slots.length; start += 1) {
    const windowWords: string[] = []
    let allTiny = true
    for (let end = start; end < slots.length; end += 1) {
      const fragment = slots[end].w
      // Morceau déjà masqué par un tour précédent : la fenêtre s'arrête là.
      if (fragment.length > FRAGMENT_MAX || /^\*+$/.test(probes[slots[end].i])) break
      if (fragment.length > TINY_FRAGMENT_MAX) allTiny = false
      const size = end - start + 1
      if (size > (allTiny ? WINDOW_MAX_TINY : WINDOW_MAX)) break
      windowWords.push(fragment)
      if (size < 2) continue
      if (!containsProfanityAcrossWords(windowWords, SPLIT_TERM_MIN)) continue
      for (let k = start; k <= end; k += 1) {
        const slot = slots[k]
        parts[slot.i] = mask(parts[slot.i])
        probes[slot.i] = parts[slot.i]
      }
      profanity = true
      break
    }
  }

  return {
    text: parts.join(''),
    censored: profanity || contact.masked,
    flags: { profanity, contact: contact.masked },
  }
}
