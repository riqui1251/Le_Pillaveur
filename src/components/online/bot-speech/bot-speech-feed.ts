import type { BotSpeech } from '@/lib/online/bot-speech'
import {
  DEFAULT_BOT_EMOJI,
  botGenreFor,
  personaForBotName,
  type BotTicPosition,
  type SpeechGenre,
} from '@/lib/online/bot-personas'
import { hashSeed } from '@/lib/petit-buveur/rng'

/**
 * FIL DES PAROLES DES JEUX À DÉBAT — logique pure, sans React, partagée par
 * les cartes téléphone et les écrans TV (Loup-Garou, puis l'Imposteur). Le
 * texte vit dans le catalogue de chaque jeu (`botSay`, `botSayTrait`,
 * `botTic` sous `games.<jeu>.game`) : ce module ne connaît que des kinds.
 *
 * Le fil ne montre que la manche en cours ; la TV n'en garde que les
 * dernières paroles. La clé d'un item est sa position dans `speeches`, pas
 * dans la fenêtre affichée : quand la fenêtre TV glisse, les bulles déjà à
 * l'écran gardent leur clé et seule la nouvelle apparaît. Le fil ne fait que
 * grandir pendant une manche (il n'est élagué qu'entre deux manches, hors
 * paroles), donc la position est stable tant que le fil est visible. Cette
 * clé, identique sur tous les écrans, sert aussi de graine au tirage de la
 * variante de phrase (botLine) : même clé partout, même bulle partout.
 */

export type SpeechFeedItem<K extends string> = {
  key: string
  speech: BotSpeech<K>
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
export const TV_FEED_SIZE = 4

export function speechFeedItems<K extends string>(
  speeches: readonly BotSpeech<K>[],
  round: number,
  meId: string | null | undefined,
  limit?: number
): SpeechFeedItem<K>[] {
  const items: SpeechFeedItem<K>[] = []
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
export type FeedAuthor = FeedPerson | undefined

/**
 * Genre d'un joueur du fil, valeur des `{speaker, select, …}` et
 * `{target, select, …}` du catalogue : celui du persona d'un bot de naissance
 * (« je me suis plantée », « elle nous cache un truc »), `other` — la branche
 * neutre, obligatoire en ICU — pour un humain (même au pseudo d'un persona),
 * un converti ou une cible absente : un pseudo ne dit pas son genre, la
 * phrase reste épicène.
 */
export function genreOf(p: FeedAuthor): SpeechGenre {
  return p?.isBot ? botGenreFor(p.name) : 'other'
}

/**
 * Valeur du `{genre, select, …}` des annonces qui nomment un joueur de la
 * table (« Bernadette est éliminée », « Raoul est le maire »), de tous les
 * jeux à bots, débat ou non : le même accord que les paroles (genreOf), et
 * `other` pour un id absent — l'annonce garde alors sa tournure épicène.
 */
export function genreOfId(
  players: readonly (FeedPerson & { id: string })[],
  id: string | null | undefined
): SpeechGenre {
  return genreOf(players.find((p) => p.id === id))
}

/** Variantes max d'une phrase : `<clé>`, `<clé>_2` … `<clé>_9` ; borne de la recherche au catalogue. */
export const SAY_VARIANTS_MAX = 9

/**
 * La variante d'une phrase pour une graine : `base`, `base_2`, `base_3`…
 * Un hash, jamais Math.random : tous les téléphones et la TV reçoivent la
 * même graine — la clé de l'item du fil — et rendent donc la MÊME bulle. Ne
 * comptent que les variantes présentes ET contiguës dans le catalogue : un
 * onglet ouvert avant un déploiement qui ignore `_3` tire parmi ce qu'il
 * connaît, sans jamais renvoyer une clé absente (clé brute à l'écran). Sans
 * graine, la base.
 */
export function sayVariantKey(base: string, seed: string | undefined, has: (key: string) => boolean): string {
  let count = 1
  while (count < SAY_VARIANTS_MAX && has(`${base}_${count + 1}`)) count += 1
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
 * (sayVariantKey) pour que deux accusations ne se ressemblent pas.
 * Null si même la base manque à cet onglet (kind inconnu, ouvert avant un
 * déploiement) : la bulle est masquée plutôt que rendue en clé brute.
 */
export function botSayKey(
  kind: string,
  author: FeedAuthor,
  has: (key: string) => boolean,
  seed?: string
): string | null {
  const persona = author?.isBot ? personaForBotName(author.name) : null
  if (persona) {
    const variant = `botSayTrait.${persona.trait}.${kind}`
    if (has(variant)) return sayVariantKey(variant, seed, has)
  }
  const base = `botSay.${kind}`
  return has(base) ? sayVariantKey(base, seed, has) : null
}

/**
 * Le tic de langage d'un auteur : clé (relative au namespace du jeu) et
 * position, ou null — un humain, un converti sans persona, ou un onglet
 * d'avant le déploiement dont le catalogue ignore la clé : la phrase se
 * passe de tic plutôt que d'afficher une clé brute.
 */
export function botTic(
  author: FeedAuthor,
  has: (key: string) => boolean
): { key: string; position: BotTicPosition } | null {
  const persona = author?.isBot ? personaForBotName(author.name) : null
  if (!persona) return null
  const key = `botTic.${persona.ticKey}`
  return has(key) ? { key, position: persona.ticPosition } : null
}

/** Ce que botLine demande à next-intl : `t.has` et `t(key, values)`. */
export type LineTranslator = {
  has: (key: string) => boolean
  format: (key: string, values?: Record<string, string>) => string
}

/**
 * Tics qui trinquent (le « …tchin ! » de Marcel, « …cheers! », « …¡salud! »,
 * « …cin cin! ») : copies conformes du Loup-Garou, ils restent au catalogue.
 */
export const DRINK_TIC_KEYS: readonly string[] = ['botTic.marcel']

/**
 * Le catalogue vu d'un écran réglé Sans alcool : les phrases n'ont aucun mot
 * de boisson (vérifié par les tests de chaque catalogue), seuls les tics qui
 * trinquent se taisent — botTic ne les trouve plus et la phrase part sans tic.
 * Chaque écran suit SON ambiance, comme la consigne à boire de la TV.
 */
export function softLineTranslator(tr: LineTranslator, soft: boolean): LineTranslator {
  if (!soft) return tr
  return { ...tr, has: (key) => !DRINK_TIC_KEYS.includes(key) && tr.has(key) }
}

export type LineOptions = {
  /** Habiller la phrase du tic de l'auteur : sa première parole de la manche. */
  withTic?: boolean
  /** Graine du tirage de variante (la clé de l'item du fil) ; sans graine, la variante 1. */
  seed?: string
  /**
   * Arguments propres au jeu (l'indice cité par l'Imposteur…), passés en plus
   * de `{name, speaker, target}`, qu'ils ne peuvent pas écraser.
   */
  values?: Record<string, string>
}

/**
 * La ligne d'une bulle : la phrase au ton de l'auteur (botSayKey), accordée
 * au genre de l'auteur et de la cible (genreOf), habillée de son tic de
 * langage quand `withTic` — devant ou derrière selon le persona. Un tic qui
 * finit par une virgule enchaîne sur la phrase, qui perd alors sa majuscule
 * initiale (« Statistiquement, je trouve… ») ; elle la garde quand elle
 * s'ouvre sur le nom visé ou sur un mot d'une lettre (le « I » anglais).
 * Null quand même la phrase de base manque : bulle masquée.
 */
export function botLine(
  kind: string,
  author: FeedAuthor,
  target: FeedAuthor,
  t: LineTranslator,
  { withTic = true, seed, values }: LineOptions = {}
): string | null {
  const sayKey = botSayKey(kind, author, t.has, seed)
  if (!sayKey) return null
  // Cible hors de la table (parole sans cible, joueur parti) : un tiret, pas un trou.
  const name = target?.name ?? '—'
  // Les trois valeurs à CHAQUE appel, même pour un gabarit qui n'en lit
  // qu'une : un select dont l'argument manque jette, et next-intl affiche
  // alors la clé brute ; une valeur non lue, elle, est simplement ignorée.
  const phrase = t.format(sayKey, { ...values, name, speaker: genreOf(author), target: genreOf(target) })
  const tic = withTic ? botTic(author, t.has) : null
  if (!tic) return phrase
  const text = t.format(tic.key)
  if (tic.position === 'suffix') return `${phrase} ${text}`
  return `${text} ${text.endsWith(',') ? continueSentence(phrase, name) : phrase}`
}

export function continueSentence(phrase: string, name: string): string {
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
export function playerIcon(
  p: { id: string; name: string; isBot: boolean },
  members: readonly IconMember[]
): string {
  const persona = p.isBot ? personaForBotName(p.name) : null
  if (persona) return persona.portraitId
  const icon = members.find((m) => m.userId === p.id)?.preferences?.icon
  if (icon) return icon
  return p.isBot ? DEFAULT_BOT_EMOJI : '👤'
}
