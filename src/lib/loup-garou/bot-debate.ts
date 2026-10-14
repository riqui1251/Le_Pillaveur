import {
  ASK_MAX_PER_ROUND,
  ASK_MIN_REMAINING_MS,
  REACTIONS_PER_HUMAN_SPEECH,
  REMARKS_MAX_PER_ROUND,
  SECOND_REACTION_MIN_AUDACE as SPEECH_SECOND_REACTION_MIN_AUDACE,
  STANDS_BY_MIN_LOYAUTE,
  askOf,
  botsByTempo,
  lastHumanSpeech,
  pick,
  reactionBudget,
  reactionDare,
  readSpeechTable,
  remarkOf,
  standsBy as speechStandsBy,
  type SpeechMove,
  type SpeechTable,
} from '@/lib/online/bot-speech'
import {
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
 *
 * La table, les compteurs, le dé des réactions, la remarque et
 * l'interpellation viennent du socle commun aux jeux à débat
 * (src/lib/online/bot-speech.ts) ; restent ici l'ordre des coups et ce qui
 * n'appartient qu'au Loup-Garou (la voyante, le maire, le skip groupé).
 */

/** Temps de débat sous lequel on n'interpelle plus un humain silencieux. */
export const LG_ASK_MIN_REMAINING_MS = ASK_MIN_REMAINING_MS
/** Interpellations max par manche (deux en 60 s, ce serait du harcèlement). */
export const LG_ASK_MAX_PER_ROUND = ASK_MAX_PER_ROUND
/** Remarques d'ouverture (« je l'avais dit », « je me suis planté ») max par manche. */
export const LG_REMARKS_MAX_PER_ROUND = REMARKS_MAX_PER_ROUND
/**
 * Part d'alliance à l'ouverture : 15 % pour un traître, 45 % pour un fidèle
 * (0,15 + 0,3 × loyauté — un converti à 0,5 retrouve les 30 % historiques).
 */
export const OPENING_ALLY_SHARE_MIN = 0.15
export const OPENING_ALLY_SHARE_SPAN = 0.3
/** Au-delà de cette loyauté (strict), un bot n'abonde jamais contre l'allié qu'il s'est choisi. */
export const STANDS_BY_ALLY_MIN_LOYAUTE = STANDS_BY_MIN_LOYAUTE
/** Sous cette audace, un bot n'ose pas accuser le maire. */
const MAYOR_ACCUSE_MIN_AUDACE = 0.4
/** Sous cette audace, un bot qui a déjà répondu à un humain ne revient jamais à la charge. */
export const SECOND_REACTION_MIN_AUDACE = SPEECH_SECOND_REACTION_MIN_AUDACE

type Kind = LGDebateSpeech['kind']

const isRemark = (kind: Kind) => (LG_REMARK_KINDS as readonly string[]).includes(kind)
const isAsk = (kind: Kind) => kind === 'ask'

type Table = SpeechTable<Kind, LGPlayer> & { state: LGState }

function speak(playerId: string, kind: Kind, targetId: string | null): LGAction {
  return { type: 'DEBATE_SPEAK', playerId, kind, targetId }
}

function speakMove(move: SpeechMove<Kind>): LGAction {
  return speak(move.playerId, move.kind, move.targetId)
}

function readTable(state: LGState): Table {
  return {
    ...readSpeechTable({
      players: state.players,
      speech: state.debateSpeech,
      round: state.round,
      engineCap: LG_SPEECH_CAP,
      isRemark,
      isAsk,
    }),
    state,
  }
}

function standsBy(table: Table, bot: LGPlayer, targetId: string): boolean {
  return speechStandsBy(table, bot, targetId, STANDS_BY_ALLY_MIN_LOYAUTE)
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
  const remark = remarkOf(table, (bot) => lgBotEventRemark(state, bot.id), {
    maxPerRound: LG_REMARKS_MAX_PER_ROUND,
  })
  if (remark) return [speakMove(remark)]

  // (b) OUVERTURE du prochain bot muet, par tempo croissant.
  const silent = botsByTempo(table).filter((b) => !table.opened(b.id) && table.underCap(b.id))
  for (const bot of silent) {
    const opening = openingOf(table, bot, rand)
    if (opening) return [opening]
  }
  if (silent.length > 0) return null

  // (c) INTERPELLATION d'un humain muet (ni parole ni skip) par le bot le plus
  // audacieux à qui il reste une parole.
  const ask = askOf(table, now, state.phaseEndsAt, {
    minRemainingMs: LG_ASK_MIN_REMAINING_MS,
    maxPerRound: LG_ASK_MAX_PER_ROUND,
    isSilent: (h) => table.count(h.id) === 0 && !state.debateSkips.includes(h.id),
  })
  if (ask) return [speak(ask.playerId, 'ask', ask.targetId)]

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
  const { byId, traits } = table
  const last = lastHumanSpeech(table)
  if (!last) return null
  const { index, speech: human, author } = last
  const { answers, left } = reactionBudget(table, index, REACTIONS_PER_HUMAN_SPEECH)
  if (left <= 0) return null
  const authorId = author.alive ? author.id : null

  // L'accusé est consulté en premier, puis les autres par tempo ; un engagé
  // qui a décliné ne rejoue pas son dé au tick suivant (reactionDare).
  const accusedId = human.kind === 'suspect' ? human.targetId : null
  const dares = reactionDare(table, { answers, accusedId, rand, minAudace: SECOND_REACTION_MIN_AUDACE })

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
