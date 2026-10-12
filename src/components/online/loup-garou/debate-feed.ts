import type { LGDebateSpeech } from '@/lib/loup-garou/engine'
import {
  DEFAULT_BOT_EMOJI,
  botGenreFor,
  personaForBotName,
  type BotTicPosition,
  type SpeechGenre,
} from '@/lib/online/bot-personas'
import { hashSeed } from '@/lib/petit-buveur/rng'

/**
 * FIL DU DÉBAT DU LOUP-GAROU — logique pure, sans React, partagée par la
 * carte téléphone (LoupGarouOnline) et l'écran TV (TvLoupGarou).
 *
 * Le fil ne montre que la manche en cours ; la TV n'en garde que les
 * dernières paroles. La clé d'un item est sa position dans `speeches`, pas
 * dans la fenêtre affichée : quand la fenêtre TV glisse, les bulles déjà à
 * l'écran gardent leur clé et seule la nouvelle apparaît. `debateSpeech` ne
 * fait que grandir pendant une manche (il n'est élagué qu'à la tombée de la
 * nuit, hors débat), donc la position est stable tant que le fil est visible.
 * Cette clé, identique sur tous les écrans, sert aussi de graine au tirage
 * de la variante de phrase (lgBotLine) : même clé partout, même bulle partout.
 */

export type DebateFeedItem = {
  key: string
  speech: LGDebateSpeech
  /** La parole vise le spectateur local : bulle surlignée, « Me défendre ». */
  aimsAtMe: boolean
  /**
   * Première parole de son auteur dans la manche : la seule qui porte son tic
   * de langage (une fois par manche, pas à chaque bulle). Posé sur le fil
   * entier, avant la fenêtre TV, pour que TV et téléphones s'accordent.
   */
  firstOfAuthor: boolean
}

/** Paroles gardées à l'écran de la TV : le début de la manche sort du champ. */
export const LG_TV_FEED_SIZE = 4

export function lgDebateFeedItems(
  speeches: readonly LGDebateSpeech[],
  round: number,
  meId: string | null | undefined,
  limit?: number
): DebateFeedItem[] {
  const items: DebateFeedItem[] = []
  const spoken = new Set<string>()
  speeches.forEach((speech, index) => {
    if (speech.round !== round) return
    items.push({
      key: `${speech.playerId}-${index}`,
      speech,
      aimsAtMe: Boolean(meId) && speech.targetId === meId,
      firstOfAuthor: !spoken.has(speech.playerId),
    })
    spoken.add(speech.playerId)
  })
  return limit !== undefined && items.length > limit ? items.slice(items.length - limit) : items
}

type FeedPerson = { name: string; isBot: boolean }
type FeedAuthor = FeedPerson | undefined

/**
 * Genre d'un joueur du fil, valeur des `{speaker, select, …}` et
 * `{target, select, …}` du catalogue : celui du persona d'un bot de naissance
 * (« je me suis plantée », « elle nous cache un truc »), `other` — la branche
 * neutre, obligatoire en ICU — pour un humain (même au pseudo d'un persona),
 * un converti ou une cible absente : un pseudo ne dit pas son genre, la
 * phrase reste épicène.
 */
export function lgGenreOf(p: FeedAuthor): SpeechGenre {
  return p?.isBot ? botGenreFor(p.name) : 'other'
}

/** Variantes max d'une phrase : `<clé>`, `<clé>_2` … `<clé>_9` ; borne de la recherche au catalogue. */
export const LG_SAY_VARIANTS_MAX = 9

/**
 * La variante d'une phrase pour une graine : `base`, `base_2`, `base_3`…
 * Un hash, jamais Math.random : tous les téléphones et la TV reçoivent la
 * même graine — la clé de l'item du fil — et rendent donc la MÊME bulle. Ne
 * comptent que les variantes présentes ET contiguës dans le catalogue : un
 * onglet ouvert avant un déploiement qui ignore `_3` tire parmi ce qu'il
 * connaît, sans jamais renvoyer une clé absente (clé brute à l'écran). Sans
 * graine, la base.
 */
export function lgSayVariantKey(base: string, seed: string | undefined, has: (key: string) => boolean): string {
  let count = 1
  while (count < LG_SAY_VARIANTS_MAX && has(`${base}_${count + 1}`)) count += 1
  if (seed === undefined || count === 1) return base
  const pick = hashSeed(seed) % count
  return pick === 0 ? base : `${base}_${pick + 1}`
}

/**
 * Clé de la phrase d'une parole : la variante au ton du persona de son auteur
 * (`botSayTrait.<trait>.<kind>`, Raoul aboie, Huguette hésite) quand le
 * catalogue la connaît, sinon la phrase de base `botSay.<kind>` — un converti
 * sans persona, un humain ou un kind sans variante parlent d'une voix neutre.
 * Avec une graine, l'une des variantes `_2`, `_3`… de cette clé
 * (lgSayVariantKey) pour que deux accusations ne se ressemblent pas.
 * Null si même la base manque à cet onglet (kind inconnu, ouvert avant un
 * déploiement) : la bulle est masquée plutôt que rendue en clé brute.
 */
export function lgBotSayKey(
  kind: LGDebateSpeech['kind'],
  author: FeedAuthor,
  has: (key: string) => boolean,
  seed?: string
): string | null {
  const persona = author?.isBot ? personaForBotName(author.name) : null
  if (persona) {
    const variant = `botSayTrait.${persona.trait}.${kind}`
    if (has(variant)) return lgSayVariantKey(variant, seed, has)
  }
  const base = `botSay.${kind}`
  return has(base) ? lgSayVariantKey(base, seed, has) : null
}

/**
 * Le tic de langage d'un auteur : clé (relative au namespace du jeu) et
 * position, ou null — un humain, un converti sans persona, ou un onglet
 * d'avant le déploiement dont le catalogue ignore la clé : la phrase se
 * passe de tic plutôt que d'afficher une clé brute.
 */
export function lgBotTic(
  author: FeedAuthor,
  has: (key: string) => boolean
): { key: string; position: BotTicPosition } | null {
  const persona = author?.isBot ? personaForBotName(author.name) : null
  if (!persona) return null
  const key = `botTic.${persona.ticKey}`
  return has(key) ? { key, position: persona.ticPosition } : null
}

/** Ce que lgBotLine demande à next-intl : `t.has` et `t(key, values)`. */
export type LGLineTranslator = {
  has: (key: string) => boolean
  format: (key: string, values?: Record<string, string>) => string
}

export type LGLineOptions = {
  /** Habiller la phrase du tic de l'auteur : sa première parole de la manche. */
  withTic?: boolean
  /** Graine du tirage de variante (la clé de l'item du fil) ; sans graine, la variante 1. */
  seed?: string
}

/**
 * La ligne d'une bulle : la phrase au ton de l'auteur (lgBotSayKey), accordée
 * au genre de l'auteur et de la cible (lgGenreOf), habillée de son tic de
 * langage quand `withTic` — devant ou derrière selon le persona. Un tic qui
 * finit par une virgule enchaîne sur la phrase, qui perd alors sa majuscule
 * initiale (« Statistiquement, je trouve… ») ; elle la garde quand elle
 * s'ouvre sur le nom visé ou sur un mot d'une lettre (le « I » anglais).
 * Null quand même la phrase de base manque : bulle masquée.
 */
export function lgBotLine(
  kind: LGDebateSpeech['kind'],
  author: FeedAuthor,
  target: FeedAuthor,
  t: LGLineTranslator,
  { withTic = true, seed }: LGLineOptions = {}
): string | null {
  const sayKey = lgBotSayKey(kind, author, t.has, seed)
  if (!sayKey) return null
  // Cible hors de la table (parole sans cible, joueur parti) : un tiret, pas un trou.
  const name = target?.name ?? '—'
  // Les trois valeurs à CHAQUE appel, même pour un gabarit qui n'en lit
  // qu'une : un select dont l'argument manque jette, et next-intl affiche
  // alors la clé brute ; une valeur non lue, elle, est simplement ignorée.
  const phrase = t.format(sayKey, { name, speaker: lgGenreOf(author), target: lgGenreOf(target) })
  const tic = withTic ? lgBotTic(author, t.has) : null
  if (!tic) return phrase
  const text = t.format(tic.key)
  if (tic.position === 'suffix') return `${phrase} ${text}`
  return `${text} ${text.endsWith(',') ? continueSentence(phrase, name) : phrase}`
}

function continueSentence(phrase: string, name: string): string {
  const [first, second] = [...phrase]
  if (!first || !second || phrase.startsWith(name)) return phrase
  const upper = first !== first.toLowerCase() && first === first.toUpperCase()
  const lower = second !== second.toUpperCase() && second === second.toLowerCase()
  return upper && lower ? first.toLowerCase() + phrase.slice(first.length) : phrase
}

type IconMember = { userId: string; preferences: { icon?: string | null } }

/**
 * Avatar d'un joueur de la table (valeur pour PlayerAvatarGlyph) : le
 * portrait du persona pour un bot de naissance, sinon l'icône du compte — un
 * déserteur converti en bot la garde tant qu'il est membre de la salle —,
 * sinon le 🤖 générique ou la silhouette.
 */
export function lgPlayerIcon(
  p: { id: string; name: string; isBot: boolean },
  members: readonly IconMember[]
): string {
  const persona = p.isBot ? personaForBotName(p.name) : null
  if (persona) return persona.portraitId
  const icon = members.find((m) => m.userId === p.id)?.preferences?.icon
  if (icon) return icon
  return p.isBot ? DEFAULT_BOT_EMOJI : '👤'
}
