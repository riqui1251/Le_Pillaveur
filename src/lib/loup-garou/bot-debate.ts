import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import {
  lgAlive,
  lgBotEventRemark,
  lgMostSuspect,
  lgSuspicion,
  LG_REMARK_KINDS,
  LG_SPEECH_CAP,
  type LGAction,
  type LGDebateSpeech,
  type LGPlayer,
  type LGState,
  type LGTeam,
} from './engine'

/**
 * Planificateur du DÉBAT pour les bots : « un coup par tick ».
 *
 * Chaque tick bot (client 2,5-5,5 s après le dernier état, filet serveur)
 * produit AU PLUS une parole — ou le lot de DEBATE_SKIP groupé — et bumpe la
 * version, ce qui réarme le tick suivant : la chaîne s'auto-alimente et
 * s'arrête d'elle-même par les compteurs (≤ bavardage du persona, lui-même
 * ≤ LG_SPEECH_CAP, paroles par bot : une ouverture, puis une interpellation
 * ou une réaction, puis une seconde réaction que seuls les audacieux
 * s'accordent ; une remarque d'ouverture en prend une — un taiseux à une
 * parole la garde pour son ouverture, mais répond toujours à qui l'accuse,
 * sous le seul plafond moteur). Rien à faire → null, le tick répond
 * NOT_BOT_TURN jusqu'à la prochaine parole humaine, qui relance la réaction (a).
 *
 * Les cibles ne sont plus tirées au sort : l'accusation d'ouverture vise le
 * plus suspect du score PUBLIC (`lgSuspicion`, pondéré par la rancune et la
 * loyauté du persona) — celui que le village a déjà nommé, celui qui a poussé
 * un lynchage d'innocent, le marqué du Corbeau, celui qui l'a accusé hier —,
 * la voyante bot ouvre sur le loup qu'elle a vu sans jamais le dire. Un bot
 * fidèle (loyauté > 0,5) ne s'abonde pas contre l'allié qu'il s'est choisi
 * dans la manche — il doute à sa place — et, accusé par lui, se défend sans
 * le contre-accuser.
 *
 * PUR : `rand` injecté (même graine ⇒ même séquence), aucun curseur dans
 * l'état — l'avancement se déduit de `debateSpeech` + `debateSkips`, une
 * partie en cours reprend au bon point après un déploiement.
 */

/** Temps de débat sous lequel on n'interpelle plus un humain silencieux. */
export const LG_ASK_MIN_REMAINING_MS = 20_000
/** Interpellations max par manche (deux en 60 s, ce serait du harcèlement). */
export const LG_ASK_MAX_PER_ROUND = 2
/** Remarques d'ouverture (« je l'avais dit », « je me suis planté ») max par manche. */
export const LG_REMARKS_MAX_PER_ROUND = 2
/** Paroles de bots max en réaction à UNE parole humaine (l'accusé + un autre). */
const REACTIONS_PER_HUMAN_SPEECH = 2
/**
 * Part d'alliance à l'ouverture : 15 % pour un traître, 45 % pour un fidèle
 * (0,15 + 0,3 × loyauté — un converti à 0,5 retrouve les 30 % historiques).
 */
export const OPENING_ALLY_SHARE_MIN = 0.15
export const OPENING_ALLY_SHARE_SPAN = 0.3
/** Au-delà de cette loyauté (strict), un bot n'abonde jamais contre l'allié qu'il s'est choisi. */
export const STANDS_BY_ALLY_MIN_LOYAUTE = 0.5
/** Sous cette audace, un bot n'ose pas accuser le maire. */
const MAYOR_ACCUSE_MIN_AUDACE = 0.4
/** Sous cette audace, un bot qui a déjà répondu à un humain ne revient jamais à la charge. */
export const SECOND_REACTION_MIN_AUDACE = 0.4

type Kind = LGDebateSpeech['kind']

const isRemark = (kind: Kind) => (LG_REMARK_KINDS as readonly string[]).includes(kind)

type Table = {
  state: LGState
  /** Paroles de la manche courante, dans l'ordre du fil. */
  speech: LGDebateSpeech[]
  byId: Map<string, LGPlayer>
  alive: LGPlayer[]
  bots: LGPlayer[]
  humans: LGPlayer[]
  traits: (b: LGPlayer) => BotTraits
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

function speak(playerId: string, kind: Kind, targetId: string | null): LGAction {
  return { type: 'DEBATE_SPEAK', playerId, kind, targetId }
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

/** Bots triés par tempo croissant, puis ordre de table. */
function botsByTempo(table: Table): LGPlayer[] {
  return table.bots
    .map((b, i) => ({ b, i, tempo: table.traits(b).tempoMinMs }))
    .sort((x, y) => x.tempo - y.tempo || x.i - y.i)
    .map((x) => x.b)
}

function readTable(state: LGState): Table {
  const alive = lgAlive(state)
  const speech = state.debateSpeech.filter((sp) => sp.round === state.round)
  const byId = new Map(state.players.map((p) => [p.id, p]))
  const traitsCache = new Map<string, BotTraits>()
  const traits = (b: LGPlayer): BotTraits => {
    let t = traitsCache.get(b.id)
    if (!t) {
      t = botTraitsFor(b.name)
      traitsCache.set(b.id, t)
    }
    return t
  }
  const count = (id: string) => speech.filter((sp) => sp.playerId === id).length
  const cap = (id: string) => {
    const p = byId.get(id)
    return p ? Math.min(LG_SPEECH_CAP, traits(p).bavardage) : LG_SPEECH_CAP
  }
  return {
    state,
    speech,
    byId,
    alive,
    bots: alive.filter((p) => p.isBot),
    humans: alive.filter((p) => !p.isBot),
    traits,
    count,
    opened: (id) => speech.some((sp) => sp.playerId === id && !isRemark(sp.kind)),
    reacted: (id) =>
      speech.filter((sp) => sp.playerId === id && !isRemark(sp.kind) && sp.kind !== 'ask').length >= 2,
    spokeAfter: (id, index) => speech.slice(index + 1).some((sp) => sp.playerId === id),
    cap,
    underCap: (id) => count(id) < cap(id),
    alliedTo: (id, targetId) =>
      speech.some((sp) => sp.playerId === id && sp.kind === 'ally' && sp.targetId === targetId),
  }
}

/** Un bot fidèle n'abonde ni ne contre-accuse l'allié qu'il s'est choisi dans la manche. */
function standsBy(table: Table, bot: LGPlayer, targetId: string): boolean {
  return table.traits(bot).loyaute > STANDS_BY_ALLY_MIN_LOYAUTE && table.alliedTo(bot.id, targetId)
}

/** Ce que la voyante bot sait de `targetId` — null si elle ne l'a pas sondé (ou n'est pas voyante). */
function seerVerdict(table: Table, bot: LGPlayer, targetId: string): LGTeam | null {
  if (bot.role !== 'voyante') return null
  return table.state.seerPeeks.find((pk) => pk.targetId === targetId)?.team ?? null
}

export function lgBotDebateMove(
  state: LGState,
  now: number,
  rand: () => number
): LGAction[] | null {
  if (state.phase !== 'day-debate') return null
  const table = readTable(state)
  if (table.bots.length === 0) return null

  const skipAll = (): LGAction[] | null => {
    const pending = table.bots.filter((b) => !state.debateSkips.includes(b.id))
    if (pending.length === 0) return null
    return pending.map((b) => ({ type: 'DEBATE_SKIP', playerId: b.id, now }))
  }

  // (0) La majorité des humains a cliqué « Passer au vote » : les bots
  // suivent en une seule écriture, quel que soit l'état des ouvertures.
  const humanSkips = table.humans.filter((h) => state.debateSkips.includes(h.id)).length
  const majoritySkipped = table.humans.length > 0 && humanSkips >= Math.ceil(table.humans.length / 2)
  if (majoritySkipped) {
    const skip = skipAll()
    if (skip) return skip
  }

  // (a) RÉACTION à la dernière parole humaine de la manche.
  const reaction = reactionOf(table, rand)
  if (reaction) return [reaction]

  // Après le skip groupé, les bots ne font plus que réagir.
  if (majoritySkipped) return null

  // (b0) Un mot sur la manche écoulée avant d'ouvrir.
  const remark = remarkOf(table)
  if (remark) return [remark]

  // (b) OUVERTURE du prochain bot muet, par tempo croissant.
  const silent = botsByTempo(table).filter((b) => !table.opened(b.id) && table.underCap(b.id))
  for (const bot of silent) {
    const opening = openingOf(table, bot, rand)
    if (opening) return [opening]
  }
  if (silent.length > 0) return null

  // (c) INTERPELLATION d'un humain silencieux par le bot le plus audacieux.
  const ask = askOf(table, now)
  if (ask) return [ask]

  // (d) Tous ont parlé, rien n'attend : les bots passent au vote ensemble.
  return skipAll()
}

/**
 * Au plus deux bots répondent à une parole humaine : l'accusé d'abord
 * (défense ou contre-accusation selon son caractère — jamais contre l'allié
 * qu'un fidèle s'est choisi), puis un autre abonde
 * ou doute — la voyante selon ce qu'elle a vu de l'accusé, un fidèle doute
 * si l'accusé est l'allié qu'il s'est choisi ; une alliance proposée à un
 * suiveur/farceur est rendue ; une défense ne fait réagir personne. Un bot
 * qui a déjà répondu une fois ne revient à la charge que s'il ose
 * (`rand() < audace`, un seul tirage par parole humaine) ; les timides se
 * taisent, la place revient au suivant. Un bot à bout de bavardage se tait —
 * sauf l'accusé lui-même, qui répond tant que le plafond moteur le permet.
 */
function reactionOf(table: Table, rand: () => number): LGAction | null {
  const { speech, byId, traits } = table
  let index = -1
  for (let i = speech.length - 1; i >= 0; i -= 1) {
    const author = byId.get(speech[i].playerId)
    if (author && !author.isBot) {
      index = i
      break
    }
  }
  if (index < 0) return null
  const human = speech[index]
  const author = byId.get(human.playerId)
  if (!author) return null
  const answers = speech
    .slice(index + 1)
    .filter((sp) => byId.get(sp.playerId)?.isBot && !isRemark(sp.kind))
  if (answers.length >= REACTIONS_PER_HUMAN_SPEECH) return null
  const authorId = author.alive ? author.id : null

  // Rien n'est écrit dans l'état quand un bot engagé décline : sans ce garde,
  // il rejouerait le dé au tick suivant tant que la parole humaine n'a pas ses
  // deux réponses. Ordre de consultation d'un tick : l'accusé, puis les autres
  // par tempo — ceux consultés avant le premier répondant se sont tus.
  const accusedId = human.kind === 'suspect' ? human.targetId : null
  const order = botsByTempo(table)
  const rank = (id: string) => (id === accusedId ? -1 : order.findIndex((b) => b.id === id))
  const firstAnswerer = answers[0]?.playerId
  const consultedBefore = (id: string) =>
    firstAnswerer !== undefined && firstAnswerer !== accusedId && rank(id) < rank(firstAnswerer)
  const dares = (b: LGPlayer): boolean => {
    if (!table.reacted(b.id)) return true
    if (consultedBefore(b.id)) return false
    const { audace } = traits(b)
    return audace >= SECOND_REACTION_MIN_AUDACE && rand() < audace
  }

  if (human.kind === 'suspect' && human.targetId) {
    const accused = byId.get(human.targetId)
    if (!accused?.alive) return null
    // La réponse directe à une accusation échappe au bavardage du persona
    // (seul le plafond moteur tient) : un taiseux qu'on accuse ne reste pas
    // muet pendant qu'un autre bot répond à sa place.
    if (
      accused.isBot &&
      !table.spokeAfter(accused.id, index) &&
      table.count(accused.id) < LG_SPEECH_CAP &&
      dares(accused)
    ) {
      const { trait, audace } = traits(accused)
      // Accusé par l'allié qu'il s'est choisi, un fidèle se défend sans le contre-accuser.
      const betrayed = authorId !== null && standsBy(table, accused, authorId)
      if (
        authorId !== null &&
        !betrayed &&
        (trait === 'agressif' || (trait === 'farceur' && rand() < audace))
      ) {
        return speak(accused.id, 'suspect', authorId)
      }
      return speak(accused.id, 'defend', authorId)
    }
    const follower = botsByTempo(table).find(
      (b) => b.id !== accused.id && table.underCap(b.id) && !table.spokeAfter(b.id, index) && dares(b)
    )
    if (!follower) return null
    const seen = seerVerdict(table, follower, accused.id)
    if (seen === 'village') return speak(follower.id, 'doubt', accused.id)
    if (seen === 'loups') return speak(follower.id, 'rally', accused.id)
    if (standsBy(table, follower, accused.id)) return speak(follower.id, 'doubt', accused.id)
    const { trait, audace } = traits(follower)
    if (trait === 'prudent') return speak(follower.id, 'doubt', accused.id)
    if (trait === 'farceur' && rand() >= audace) return null
    // Décision PUBLIQUE : jamais lue sur les rôles secrets (un loup bot qui
    // couvrirait son complice trahirait les deux à qui connaît son trait) ;
    // son vote, lui, reste secret et évite le complice.
    return speak(follower.id, 'rally', accused.id)
  }

  if (human.kind === 'ally' && human.targetId && authorId !== null) {
    const ally = byId.get(human.targetId)
    if (!ally?.alive || !ally.isBot) return null
    if (table.spokeAfter(ally.id, index) || !table.underCap(ally.id)) return null
    const { trait } = traits(ally)
    if (trait !== 'suiveur' && trait !== 'farceur') return null
    if (!dares(ally)) return null
    return speak(ally.id, 'ally', authorId)
  }

  return null
}

/**
 * Remarque d'ouverture sur la manche écoulée (« je l'avais dit pour X »,
 * « je me suis planté sur X ») : un bot par tick, dans l'ordre de table, avant
 * sa propre ouverture, au plus LG_REMARKS_MAX_PER_ROUND par manche — et
 * seulement s'il lui reste ensuite une parole pour ouvrir.
 */
function remarkOf(table: Table): LGAction | null {
  const remarks = table.speech.filter((sp) => isRemark(sp.kind))
  if (remarks.length >= LG_REMARKS_MAX_PER_ROUND) return null
  for (const bot of table.bots) {
    if (table.opened(bot.id) || table.count(bot.id) + 1 >= table.cap(bot.id)) continue
    if (remarks.some((sp) => sp.playerId === bot.id)) continue
    const remark = lgBotEventRemark(table.state, bot.id)
    if (remark) return speak(bot.id, remark.kind, remark.targetId)
  }
  return null
}

/**
 * Ouverture : se défendre s'il est accusé ; la voyante doute d'une accusation
 * visant un villageois qu'elle a vu et accuse d'office un loup vu ; sinon
 * accuser le plus suspect du score public pondéré par son caractère — les
 * timides épargnent le maire — ou s'allier (15 à 45 % selon sa loyauté) à
 * quelqu'un que rien n'accable.
 */
function openingOf(table: Table, bot: LGPlayer, rand: () => number): LGAction | null {
  const accusation = table.speech.find(
    (sp) => sp.kind === 'suspect' && sp.targetId === bot.id && sp.playerId !== bot.id
  )
  const accuser = accusation ? table.byId.get(accusation.playerId) : undefined
  if (accuser?.alive) return speak(bot.id, 'defend', accuser.id)

  const doubted = table.speech.find(
    (sp) =>
      sp.kind === 'suspect' &&
      sp.targetId !== null &&
      table.byId.get(sp.targetId)?.alive &&
      seerVerdict(table, bot, sp.targetId) === 'village'
  )
  if (doubted?.targetId) return speak(bot.id, 'doubt', doubted.targetId)

  const traits = table.traits(bot)
  const { trait, audace, loyaute } = traits
  const score = lgSuspicion(table.state, bot.id, trait, traits)
  const pool = table.alive.filter((p) => score.has(p.id))
  if (pool.length === 0) return null
  let candidates = pool
  if (audace < MAYOR_ACCUSE_MIN_AUDACE) {
    const spared = pool.filter((p) => p.id !== table.state.mayorId)
    if (spared.length > 0) candidates = spared
  }
  const tied = lgMostSuspect(score, candidates.map((p) => p.id))
  if (seerVerdict(table, bot, tied[0]) === 'loups') return speak(bot.id, 'suspect', tied[0])
  if (rand() < OPENING_ALLY_SHARE_MIN + OPENING_ALLY_SHARE_SPAN * loyaute) {
    const calm = pool.filter((p) => (score.get(p.id) ?? 0) <= 0)
    return speak(bot.id, 'ally', pick(calm.length > 0 ? calm : pool, rand).id)
  }
  return speak(bot.id, 'suspect', pick(tied, rand))
}

/**
 * « Et toi, tu votes qui ? » : une fois par humain muet (ni parole ni skip),
 * tant qu'il reste du temps pour répondre, par le bot le plus audacieux à qui
 * il reste une parole — l'interpellation peut être sa dernière (sinon une
 * table solo sans bavard ne s'adressait jamais à l'humain) ; un taiseux qui
 * a déjà ouvert n'en a plus, et jamais deux fois le même bot dans la manche.
 */
function askOf(table: Table, now: number): LGAction | null {
  const { state, speech, humans, bots, traits, underCap } = table
  if (humans.length === 0) return null
  if (state.phaseEndsAt === null || state.phaseEndsAt - now <= LG_ASK_MIN_REMAINING_MS) return null
  if (speech.filter((sp) => sp.kind === 'ask').length >= LG_ASK_MAX_PER_ROUND) return null
  const silentHuman = humans.find(
    (h) =>
      table.count(h.id) === 0 &&
      !state.debateSkips.includes(h.id) &&
      !speech.some((sp) => sp.kind === 'ask' && sp.targetId === h.id)
  )
  if (!silentHuman) return null
  let asker: LGPlayer | null = null
  for (const bot of bots) {
    if (!underCap(bot.id)) continue
    if (speech.some((sp) => sp.kind === 'ask' && sp.playerId === bot.id)) continue
    if (!asker || traits(bot).audace > traits(asker).audace) asker = bot
  }
  return asker ? speak(asker.id, 'ask', silentHuman.id) : null
}
