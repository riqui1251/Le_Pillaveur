import { createRng } from '@/lib/petit-buveur/rng'
import { botTraitsFor, personaForBotName, type BotTrait, type BotTraits } from './bot-personas'

/**
 * SOCLE DE PAROLE DES BOTS — briques pures partagées par les jeux à débat
 * (Loup-Garou, puis l'Imposteur). Extrait du planificateur du Loup-Garou à
 * comportement constant (golden de 200 parties : src/lib/loup-garou/
 * debate-golden.test.ts) : ce ne sont QUE des helpers, chaque jeu garde sa
 * politique — l'ordre de ses coups, ses branches propres (la voyante, le
 * maire…) — et compose ces pièces. Un planificateur générique à crochets
 * aurait figé la politique d'un jeu dans celle de l'autre.
 *
 * Aucun import d'un jeu : les paroles sont structurées (`BotSpeech<K>`), le
 * texte vit dans le catalogue i18n de chaque jeu. Les kinds partagés portent
 * le même sens partout — `suspect`, `rally`, `doubt`, `ally`, `defend`, `ask`
 * — c'est ce qui permet un score de soupçon commun. `rand` et `now` sont
 * toujours injectés ; aucun curseur : l'avancement se déduit du fil.
 */

/** Prise de parole PUBLIQUE d'un joueur, structurée pour être localisée côté client. */
export type BotSpeech<K extends string> = {
  playerId: string
  kind: K
  targetId: string | null
  round: number
}

/** Une parole à émettre : le jeu la traduit en action de son moteur. */
export type SpeechMove<K extends string> = Omit<BotSpeech<K>, 'round'>

/** Ce que le socle lit d'un joueur : un mort ne parle plus, un humain déclenche les réactions. */
export type SpeechPlayer = { id: string; name: string; isBot: boolean; alive: boolean }

/** Temps de débat sous lequel on n'interpelle plus un humain silencieux. */
export const ASK_MIN_REMAINING_MS = 20_000
/** Interpellations max par manche (deux en une minute, ce serait du harcèlement). */
export const ASK_MAX_PER_ROUND = 2
/** Remarques d'ouverture (« je l'avais dit », « je me suis planté ») max par manche. */
export const REMARKS_MAX_PER_ROUND = 2
/** Paroles de bots max en réaction à UNE parole humaine (l'accusé + un autre). */
export const REACTIONS_PER_HUMAN_SPEECH = 2
/** Au-delà de cette loyauté (strict), un bot n'abonde jamais contre l'allié qu'il s'est choisi. */
export const STANDS_BY_MIN_LOYAUTE = 0.5
/** Sous cette audace, un bot qui a déjà répondu à un humain ne revient jamais à la charge. */
export const SECOND_REACTION_MIN_AUDACE = 0.4

export type SpeechTable<K extends string, P extends SpeechPlayer = SpeechPlayer> = {
  /** Paroles de la manche courante, dans l'ordre du fil. */
  speech: BotSpeech<K>[]
  byId: Map<string, P>
  alive: P[]
  bots: P[]
  humans: P[]
  traits: (b: P) => BotTraits
  isRemark: (kind: K) => boolean
  isAsk: (kind: K) => boolean
  count: (id: string) => number
  /** A pris la parole ce round, remarque d'ouverture exclue. */
  opened: (id: string) => boolean
  /**
   * A déjà répondu à un humain ce round : deux paroles hors remarque et
   * interpellation, soit son ouverture et une réaction — ou, accusé avant
   * d'ouvrir, deux réactions.
   */
  reacted: (id: string) => boolean
  spokeAfter: (id: string, index: number) => boolean
  /** Paroles max de ce bot dans la manche : son bavardage, borné par le plafond moteur. */
  cap: (id: string) => number
  underCap: (id: string) => boolean
  /** Le bot s'est allié à `targetId` ce round, de sa propre voix. */
  alliedTo: (id: string, targetId: string) => boolean
}

export function readSpeechTable<K extends string, P extends SpeechPlayer>({
  players,
  speech,
  round,
  engineCap,
  isRemark,
  isAsk,
}: {
  players: readonly P[]
  /** Le fil complet : seule la manche `round` est lue. */
  speech: readonly BotSpeech<K>[]
  round: number
  /** Plafond de paroles par joueur et par manche imposé par le moteur du jeu. */
  engineCap: number
  isRemark: (kind: K) => boolean
  isAsk: (kind: K) => boolean
}): SpeechTable<K, P> {
  const alive = players.filter((p) => p.alive)
  const roundSpeech = speech.filter((sp) => sp.round === round)
  const byId = new Map(players.map((p) => [p.id, p]))
  const traitsCache = new Map<string, BotTraits>()
  const traits = (b: P): BotTraits => {
    let t = traitsCache.get(b.id)
    if (!t) {
      t = botTraitsFor(b.name)
      traitsCache.set(b.id, t)
    }
    return t
  }
  const count = (id: string) => roundSpeech.filter((sp) => sp.playerId === id).length
  const cap = (id: string) => {
    const p = byId.get(id)
    return p ? Math.min(engineCap, traits(p).bavardage) : engineCap
  }
  return {
    speech: roundSpeech,
    byId,
    alive,
    bots: alive.filter((p) => p.isBot),
    humans: alive.filter((p) => !p.isBot),
    traits,
    isRemark,
    isAsk,
    count,
    opened: (id) => roundSpeech.some((sp) => sp.playerId === id && !isRemark(sp.kind)),
    reacted: (id) =>
      roundSpeech.filter((sp) => sp.playerId === id && !isRemark(sp.kind) && !isAsk(sp.kind)).length >= 2,
    spokeAfter: (id, index) => roundSpeech.slice(index + 1).some((sp) => sp.playerId === id),
    cap,
    underCap: (id) => count(id) < cap(id),
    alliedTo: (id, targetId) =>
      roundSpeech.some((sp) => sp.playerId === id && sp.kind === 'ally' && sp.targetId === targetId),
  }
}

export function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

/** Bots vivants triés par tempo croissant, puis ordre de table. */
export function botsByTempo<K extends string, P extends SpeechPlayer>(table: SpeechTable<K, P>): P[] {
  return table.bots
    .map((b, i) => ({ b, i, tempo: table.traits(b).tempoMinMs }))
    .sort((x, y) => x.tempo - y.tempo || x.i - y.i)
    .map((x) => x.b)
}

/** Un bot fidèle n'abonde ni ne contre-accuse l'allié qu'il s'est choisi dans la manche. */
export function standsBy<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  bot: P,
  targetId: string,
  minLoyaute: number = STANDS_BY_MIN_LOYAUTE
): boolean {
  return table.traits(bot).loyaute > minLoyaute && table.alliedTo(bot.id, targetId)
}

/** La dernière parole humaine de la manche, avec sa position dans le fil et son auteur. */
export function lastHumanSpeech<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>
): { index: number; speech: BotSpeech<K>; author: P } | null {
  for (let i = table.speech.length - 1; i >= 0; i -= 1) {
    const author = table.byId.get(table.speech[i].playerId)
    if (author && !author.isBot) return { index: i, speech: table.speech[i], author }
  }
  return null
}

/**
 * Les réponses de bots (remarques exclues) déjà reçues par la parole humaine
 * d'index `index`, et combien il en reste à donner avant `max`.
 */
export function reactionBudget<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  index: number,
  max: number = REACTIONS_PER_HUMAN_SPEECH
): { answers: BotSpeech<K>[]; left: number } {
  const answers = table.speech
    .slice(index + 1)
    .filter((sp) => table.byId.get(sp.playerId)?.isBot && !table.isRemark(sp.kind))
  return { answers, left: max - answers.length }
}

/**
 * Le dé d'une réaction à UNE parole humaine : un bot qui n'a pas encore
 * répondu ce round répond ; un engagé ne revient à la charge que s'il ose
 * (`rand() < audace`, audace ≥ `minAudace`).
 *
 * Rien n'est écrit dans l'état quand un engagé décline : sans garde, il
 * rejouerait le dé au tick suivant tant que la parole humaine n'a pas toutes
 * ses réponses. Ordre de consultation d'un tick : l'accusé (`accusedId`),
 * puis les autres par tempo — ceux consultés avant le premier répondant se
 * sont tus, ils ne relancent pas. Un seul tirage par bot et par parole.
 */
export function reactionDare<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  {
    answers,
    accusedId,
    rand,
    minAudace = SECOND_REACTION_MIN_AUDACE,
  }: {
    answers: readonly BotSpeech<K>[]
    accusedId: string | null
    rand: () => number
    minAudace?: number
  }
): (bot: P) => boolean {
  const order = botsByTempo(table)
  const rank = (id: string) => (id === accusedId ? -1 : order.findIndex((b) => b.id === id))
  const firstAnswerer = answers[0]?.playerId
  const consultedBefore = (id: string) =>
    firstAnswerer !== undefined && firstAnswerer !== accusedId && rank(id) < rank(firstAnswerer)
  return (bot) => {
    if (!table.reacted(bot.id)) return true
    if (consultedBefore(bot.id)) return false
    const { audace } = table.traits(bot)
    return audace >= minAudace && rand() < audace
  }
}

/**
 * Remarque d'ouverture sur la manche écoulée : un bot par appel, dans l'ordre
 * de table, avant sa propre ouverture, au plus `maxPerRound` par manche — et
 * seulement s'il lui reste ensuite une parole pour ouvrir. `remarkFor` dit ce
 * que CE bot a à dire de la manche passée (règle du jeu), null s'il n'a rien.
 */
export function remarkOf<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  remarkFor: (bot: P) => { kind: K; targetId: string } | null,
  { maxPerRound = REMARKS_MAX_PER_ROUND }: { maxPerRound?: number } = {}
): SpeechMove<K> | null {
  const remarks = table.speech.filter((sp) => table.isRemark(sp.kind))
  if (remarks.length >= maxPerRound) return null
  for (const bot of table.bots) {
    if (table.opened(bot.id) || table.count(bot.id) + 1 >= table.cap(bot.id)) continue
    if (remarks.some((sp) => sp.playerId === bot.id)) continue
    const remark = remarkFor(bot)
    if (remark) return { playerId: bot.id, kind: remark.kind, targetId: remark.targetId }
  }
  return null
}

/**
 * « Et toi, tu votes qui ? » : une fois par humain silencieux (`isSilent`,
 * règle du jeu), tant qu'il reste du temps pour répondre, par le bot le plus
 * audacieux à qui il reste une parole — l'interpellation peut être sa
 * dernière ; jamais deux fois le même bot dans la manche. Rend l'émetteur et
 * l'humain visé ; le jeu en fait sa parole `ask`.
 */
export function askOf<K extends string, P extends SpeechPlayer>(
  table: SpeechTable<K, P>,
  now: number,
  phaseEndsAt: number | null,
  {
    minRemainingMs = ASK_MIN_REMAINING_MS,
    maxPerRound = ASK_MAX_PER_ROUND,
    isSilent,
  }: { minRemainingMs?: number; maxPerRound?: number; isSilent: (human: P) => boolean }
): { playerId: string; targetId: string } | null {
  const { speech, humans, bots, traits, underCap, isAsk } = table
  if (humans.length === 0) return null
  if (phaseEndsAt === null || phaseEndsAt - now <= minRemainingMs) return null
  if (speech.filter((sp) => isAsk(sp.kind)).length >= maxPerRound) return null
  const silentHuman = humans.find(
    (h) => isSilent(h) && !speech.some((sp) => isAsk(sp.kind) && sp.targetId === h.id)
  )
  if (!silentHuman) return null
  let asker: P | null = null
  for (const bot of bots) {
    if (!underCap(bot.id)) continue
    if (speech.some((sp) => isAsk(sp.kind) && sp.playerId === bot.id)) continue
    if (!asker || traits(bot).audace > traits(asker).audace) asker = bot
  }
  return asker ? { playerId: asker.id, targetId: silentHuman.id } : null
}

/**
 * Les mieux classés d'un score, dans l'ordre de `candidates` (ordre de table :
 * égalité stable ; l'appelant départage au hasard s'il le souhaite). Un
 * candidat absent du score est ignoré.
 */
export function mostSuspect(score: Map<string, number>, candidates: readonly string[]): string[] {
  let best = -Infinity
  let tied: string[] = []
  for (const id of candidates) {
    const sc = score.get(id)
    if (sc === undefined) continue
    if (sc > best) {
      best = sc
      tied = [id]
    } else if (sc === best) {
      tied.push(id)
    }
  }
  return tied
}

/** Caractère chiffré lu par le score : rancune et loyauté ∈ [0,1]. */
export type SpeechMood = { rancune: number; loyaute: number }

/**
 * PART PUBLIQUE DU SCORE DE SOUPÇON d'un bot, tirée du seul fil de paroles —
 * chaque jeu y ajoute ses propres indices (morts révélés, maire, indices
 * donnés…). Sur les `candidates` (les autres vivants que le jeu retient) :
 *   • manche `round` : +2 par `suspect`/`rally` reçu, −1 par `doubt`, −2 par
 *     `ally`, +1 à l'accusateur visé par un `defend` ;
 *   • trait : un suiveur compte double les paroles humaines ;
 *   • rancune r : +round(3r) à qui l'a accusé ce round, +round(2r) à qui a
 *     abondé contre lui ce round ou l'avait accusé la manche précédente ;
 *   • loyauté l : −round(2l) à qui il s'est allié ce round (sa parole, pas
 *     celle qu'on lui a offerte).
 * Un id hors `candidates` (mort, soi, écarté par le jeu) n'est jamais compté.
 */
export function speechSuspicion<K extends string>({
  candidates,
  speech,
  round,
  botId,
  trait,
  mood,
  isHuman,
}: {
  candidates: readonly string[]
  speech: readonly BotSpeech<K>[]
  round: number
  botId: string
  trait: BotTrait
  mood: SpeechMood
  isHuman: (id: string) => boolean
}): Map<string, number> {
  const score = new Map<string, number>(candidates.map((id) => [id, 0]))
  const add = (id: string | null, n: number) => {
    if (id && score.has(id)) score.set(id, (score.get(id) ?? 0) + n)
  }
  const grudge = (n: number) => Math.round(n * mood.rancune)
  const bond = Math.round(2 * mood.loyaute)
  for (const sp of speech) {
    const w = trait === 'suiveur' && isHuman(sp.playerId) ? 2 : 1
    if (sp.round === round) {
      if (sp.kind === 'suspect' || sp.kind === 'rally') add(sp.targetId, 2 * w)
      else if (sp.kind === 'doubt') add(sp.targetId, -w)
      else if (sp.kind === 'ally') add(sp.targetId, -2 * w)
      else if (sp.kind === 'defend') add(sp.targetId, w)
      if (sp.targetId === botId) {
        if (sp.kind === 'suspect') add(sp.playerId, grudge(3))
        else if (sp.kind === 'rally') add(sp.playerId, grudge(2))
      }
      if (sp.kind === 'ally' && sp.playerId === botId) add(sp.targetId, -bond)
    } else if (sp.round === round - 1 && sp.kind === 'suspect' && sp.targetId === botId) {
      add(sp.playerId, grudge(2))
    }
  }
  return score
}

/** Chance qu'un bot réagisse à une révélation, par point de bavardage (le tiers du Menteur). */
export const REACTION_TALK_PER_BAVARDAGE = 1 / 3

/** Une réaction possible à une révélation, proposée par le jeu. */
export type ReactionCandidate<K extends string> = {
  speech: BotSpeech<K>
  /** Elle vise un humain : elle passe devant, c'est la sienne que le joueur vient lire. */
  aimsHuman: boolean
}

/**
 * RÉACTIONS DÉRIVÉES d'une révélation, pour les jeux où les bots parlent avec
 * leur coup (Bluff, Sans Filtre, Dilemmes ; le Menteur garde sa règle) :
 * jamais écrites dans l'état, recalculées par chaque écran depuis la vue
 * publique et une graine tirée de la manche — tous les téléphones et la TV
 * rendent les mêmes bulles, sans Math.random.
 *
 * Les candidates de chaque auteur arrivent dans son ordre de préférence ;
 * celles qui visent un humain passent devant, puis les auteurs dans un ordre
 * tiré de la graine — jamais l'ordre de la table, où le premier bavard assis
 * aurait parlé à chaque révélation. L'auteur doit être un bot à persona (ni
 * humain, ni converti, qui garde son pseudo humain) à qui il reste du
 * plafond de la manche, min(engineCap, bavardage), paroles de l'état
 * comprises. Un seul tirage par auteur, sur sa première candidate : il parle
 * s'il tombe sous bavardage/3. Au plus `max` réactions.
 */
export function seededReactions<K extends string>({
  candidates,
  players,
  speech,
  round,
  engineCap,
  max,
  seed,
}: {
  candidates: readonly ReactionCandidate<K>[]
  players: readonly { id: string; name: string; isBot: boolean }[]
  /** Le fil de l'état : seule la manche `round` compte pour le plafond. */
  speech: readonly BotSpeech<K>[]
  round: number
  engineCap: number
  max: number
  seed: string
}): BotSpeech<K>[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  const said = (id: string) => speech.filter((sp) => sp.round === round && sp.playerId === id).length
  const rng = createRng(seed)
  const authors = [...new Set(candidates.map((c) => c.speech.playerId))]
  const turn = new Map(rng.shuffle(authors).map((id, i) => [id, i]))
  const turnOf = (c: ReactionCandidate<K>) => turn.get(c.speech.playerId) ?? 0
  // Tri stable : à rang et auteur égaux, l'ordre de préférence du jeu.
  const ordered = [...candidates].sort(
    (a, b) => Number(b.aimsHuman) - Number(a.aimsHuman) || turnOf(a) - turnOf(b)
  )
  const rolled = new Set<string>()
  const out: BotSpeech<K>[] = []
  for (const { speech: sp } of ordered) {
    if (out.length >= max) break
    if (rolled.has(sp.playerId) || sp.playerId === sp.targetId) continue
    const author = byId.get(sp.playerId)
    const persona = author?.isBot ? personaForBotName(author.name) : null
    if (!persona || said(sp.playerId) >= Math.min(engineCap, persona.bavardage)) continue
    rolled.add(sp.playerId)
    if (rng.next() < persona.bavardage * REACTION_TALK_PER_BAVARDAGE) out.push(sp)
  }
  return out
}
