import type { BotTraits } from './bot-personas'
import { pick, readSpeechTable, type BotSpeech, type SpeechMove, type SpeechPlayer, type SpeechTable } from './bot-speech'

/**
 * PAROLES DE RÉACTION — briques pures des jeux à bots SANS débat (Tabou,
 * Crobard, Mots Codés). Un bot n'y prend jamais la parole de lui-même : il
 * RÉAGIT à un fait que toute la table vient de voir (un mot trouvé, un tabou
 * buzzé, une tuile retournée, une manche qui commence ou s'achève). La parole
 * est écrite par l'adaptateur dans la même réduction que le coup auquel elle
 * répond : aucun tick, aucun curseur.
 *
 * Une réaction au plus par fait, quel que soit le nombre de bots : le jeu
 * propose ses options par priorité (« on passe devant » avant « bravo »),
 * chacune tire UN orateur parmi ses bots éligibles puis UN dé de parole — une
 * table de huit bots ne parle pas plus souvent que celle d'un seul. Le dé :
 * `base × bavardage / 2`, borné à REACTION_TALK_MAX ; un déserteur converti
 * (bavardage 2 par défaut) parle au taux de base, Germaine (1) deux fois
 * moins, Josiane (3) moitié plus. Plafonds : min(cap moteur, bavardage) par
 * bot et par manche (readSpeechTable), `roundMax` pour toute la table.
 *
 * Personne à qui parler (aucun humain assis), rien : une table de bots se tait.
 * Les phrases ne pèsent jamais sur le jeu : les bots ne lisent pas le fil.
 */

/** Même le plus bavard se tait parfois : une réaction n'est jamais systématique. */
export const REACTION_TALK_MAX = 0.95

export function reactionTalkChance(base: number, traits: Pick<BotTraits, 'bavardage'>): number {
  return Math.min(REACTION_TALK_MAX, Math.max(0, (base * traits.bavardage) / 2))
}

/** Les jeux à réactions n'ont ni remarque d'ouverture ni interpellation. */
const never = () => false

/** La table lue par le socle, pour un jeu à réactions : la manche `round` du fil, rien d'autre. */
export function readReactionTable<K extends string, P extends SpeechPlayer>(
  players: readonly P[],
  speech: readonly BotSpeech<K>[],
  round: number,
  engineCap: number
): SpeechTable<K, P> {
  return readSpeechTable({ players, speech, round, engineCap, isRemark: never, isAsk: never })
}

export type ReactionOption<K extends string, P extends SpeechPlayer> = {
  /** Orateurs possibles ; seuls parlent les bots vivants sous leur plafond, jamais à eux-mêmes. */
  speakers: readonly P[]
  /** Le kind, ou le kind selon l'orateur tiré (son camp, son trait). */
  kind: K | ((speaker: P) => K)
  /** La cible, ou la cible selon l'orateur tiré ; une cible partie fait taire l'option. */
  targetId: string | ((speaker: P) => string)
  /** Chance de parler d'un bot de bavardage 2. */
  base: number
}

/**
 * La réaction de la table à un fait : la première option dont l'orateur tiré
 * passe son dé de parole, ou null. Deux tirages de `rand` par option
 * examinée (l'orateur, puis le dé), aucun pour une option sans orateur.
 */
export function reactionSay<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  options: readonly ReactionOption<K, P>[],
  roundMax: number,
  rand: () => number
): SpeechMove<K> | null {
  if (table.humans.length === 0 || table.speech.length >= roundMax) return null
  for (const option of options) {
    const targetOf = (b: P) => (typeof option.targetId === 'function' ? option.targetId(b) : option.targetId)
    const speakers = option.speakers.filter((b) => {
      const target = table.byId.get(targetOf(b))
      return b.isBot && b.alive && table.underCap(b.id) && Boolean(target?.alive) && target?.id !== b.id
    })
    if (speakers.length === 0) continue
    const speaker = pick(speakers, rand)
    if (rand() >= reactionTalkChance(option.base, table.traits(speaker))) continue
    const kind = typeof option.kind === 'function' ? option.kind(speaker) : option.kind
    return { playerId: speaker.id, kind, targetId: targetOf(speaker) }
  }
  return null
}
