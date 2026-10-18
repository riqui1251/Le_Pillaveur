import type { BotTrait, BotTraits } from '@/lib/online/bot-personas'
import { mostSuspect, pick, speechSuspicion, type BotSpeech } from '@/lib/online/bot-speech'
import { ESPION_LOCATION_IDS, espionLocationIdOf, type EspionLocationId } from './data'
import {
  ESPION_ANY,
  ESPION_QUESTION_IDS,
  espionQuestionValues,
  type EspionAnswer,
  type EspionAttributes,
  type EspionQuestionId,
  type EspionValue,
} from './data/questions'
import {
  espionMajority,
  espionQuestionAsked,
  espionRoundSpeech,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_SAME_QUESTION_MAX,
  type EspionClientView,
  type EspionSpeech,
  type EspionSpeechKind,
} from './engine'
import { espionElapsed, espionHash01, espionIsSolo, espionQuestionsOver, ESPION_LAST_CALL_MS } from './bot-tick'

/**
 * Cerveau des bots de l'Espion — PUR, aléa injecté.
 *
 * CONTRAT ANTI-TRICHE, tenu par le type : chaque fonction reçoit l'esprit
 * d'UN bot (EspionMind) — sa vue CLIENT (`toEspionClientView(state, botId)` :
 * son lieu, null s'il est l'espion ; le fil public ; l'accusation publique ;
 * aucun rôle avant la révélation), ses traits de persona et l'instant —, plus
 * le carnet en dépendance (`deps.attrsOf`), prêté par l'adaptateur serveur,
 * seul à l'importer. Jamais l'état brut : un bot sait ce que sait un humain
 * assis à sa place, plus le carnet, qui tient lieu de connaissance du monde.
 * L'équipier y lit SON lieu ; l'espion le parcourt en entier, sans jamais
 * connaître le lieu tiré.
 *
 * Aucune mémoire : tout se recalcule à partir du fil, à chaque tick. Les
 * tirages décisifs sont inscrits par le coup qu'ils produisent (réponse,
 * soutien ou refus, question, accusation, devinette) : aucun dé n'est relancé.
 */

export type EspionBotDeps = {
  /** Les réponses d'un lieu à chaque question, `any` quand elles dépendent de la personne ; null si inconnu. */
  attrsOf: (id: EspionLocationId) => Readonly<EspionAttributes> | null
}

export type EspionMind = {
  /** La vue CLIENT de ce bot, et d'aucun autre. */
  view: EspionClientView
  botId: string
  traits: BotTraits
  now: number
}

// ─── Réglages (src/lib/espion/simulation.test.ts les verrouille : on règle le cerveau, jamais le carnet) ───

/**
 * « Ça dépend » d'un équipier sur une case précise, par trait, sans dépendre
 * du chrono : indexé sur t, le « premier tiers » d'une manche de 5 min
 * couvrait deux fois plus de réponses que celui d'une manche de 3 min, et le
 * bruit qu'il jetait sur les soupçons faisait tomber les accusations à faux.
 */
export const ESPION_CREW_ANY: Record<BotTrait, number> = { prudent: 0.25, farceur: 0.15, suiveur: 0, agressif: 0 }
/**
 * Protection du lieu : un équipier tait (« ça dépend ») la réponse qui ne
 * laisserait plus que ESPION_PROTECT_MAX lieux en tête pour l'espion, qui lit
 * tout le fil. Sans elle, l'espion bot devinait juste dans plus d'une manche
 * sur deux. L'agressif répond cash, d'où les rares devinettes qui restent.
 */
export const ESPION_PROTECT_MAX = 3
export const ESPION_PROTECTORS: Record<BotTrait, boolean> = { prudent: true, farceur: true, suiveur: true, agressif: false }
/** Le bot espion se couvre d'un « ça dépend » à sa 1re réponse avec une chance de 0,5 × (1 − audace). */
export const ESPION_SPY_FIRST_ANY = 0.5
/** Il répète la valeur entendue avec une chance de 0,6 + 0,3 × (1 − audace). */
export const ESPION_PARROT_BASE = 0.6
export const ESPION_PARROT_SHY = 0.3
/** Score des lieux pour l'espion : réponse compatible +1, incompatible −2. */
export const ESPION_SCORE_MATCH = 1
export const ESPION_SCORE_CLASH = -2
/** Devinette volontaire : 6 réponses précises entendues, marge de 5 − round(2 × audace), jamais dans les 20 dernières secondes. */
export const ESPION_GUESS_MIN_HEARD = 6
export const ESPION_GUESS_MARGIN_BASE = 5
export const ESPION_GUESS_MARGIN_AUDACE = 2
export const ESPION_GUESS_QUIET_END_MS = 20_000
/** Soupçon d'un équipier : réponse incompatible selon le trait, « ça dépend » sur une case précise, copie, réponse juste. */
export const ESPION_SUSPICION_CLASH: Record<BotTrait, number> = { prudent: 2, farceur: 3, suiveur: 3, agressif: 4 }
export const ESPION_SUSPICION_VAGUE = 0.5
export const ESPION_SUSPICION_COPY = 0.5
export const ESPION_SUSPICION_MATCH = -1
/** +2 à qui a accusé ou soutenu en vain un joueur blanchi (une réponse juste suffit à blanchir). */
export const ESPION_SUSPICION_FALSE_ACCUSER = 2
export const ESPION_CLEAN_SCORE = -1
/** Accusation sur preuves : score ≥ 3 − t, jamais sous 2 ; agressif −1, prudent +1. */
export const ESPION_ACCUSE_BASE = 3
export const ESPION_ACCUSE_SLOPE = 1
export const ESPION_ACCUSE_FLOOR = 2
export const ESPION_ACCUSE_LEAD = 1
export const ESPION_ACCUSE_TRAIT: Record<BotTrait, number> = { prudent: 1, farceur: 0, suiveur: 0, agressif: -1 }
/**
 * Une seule réponse de la cible suffit, à plusieurs comme en solo : à deux,
 * l'espion avait le temps d'entendre de quoi deviner avant d'être pris.
 */
export const ESPION_ACCUSE_ANSWERS = 1
/** 20 s entre deux accusations de bots, deux par manche, une par bot. */
export const ESPION_BOT_ACCUSE_GAP_MS = 20_000
export const ESPION_BOT_ACCUSATIONS_PER_ROUND = 2
/** Le bot espion accuse une fois, s'il ose (audace ≥ 0,6), entre 40 % et 85 % du chrono. */
export const ESPION_SPY_ACCUSE_MIN_AUDACE = 0.6
export const ESPION_SPY_ACCUSE_FROM = 0.4
export const ESPION_SPY_ACCUSE_TO = 0.85
/** Seuil de soutien d'un équipier, × (1 − t) ; un suiveur suit plus volontiers un humain. */
export const ESPION_SUPPORT_THRESHOLD: Record<BotTrait, number> = { prudent: 2, farceur: 1, agressif: 1, suiveur: 1 }
export const ESPION_SUIVEUR_HUMAN_THRESHOLD = 0.5
/**
 * Au dernier appel le seuil tombe, mais pas jusqu'à suivre une accusation
 * contre un joueur qui a répondu juste deux fois : à plusieurs humains, c'est
 * ce qui faisait passer les accusations à faux.
 */
export const ESPION_LAST_CALL_SUPPORT = -0.5
/** Le bot espion soutient avec une chance de 0,5 + 0,5 × audace. */
export const ESPION_SPY_SUPPORT_BASE = 0.5
export const ESPION_SPY_SUPPORT_AUDACE = 0.5
/** Sous cette audace, l'espion pose sa question au hasard plutôt que de trier ses candidats. */
export const ESPION_SPY_SMART_ASK_AUDACE = 0.5
/**
 * En solo, une question sur deux posée à l'humain en reprend une déjà
 * répondue : l'équipier compare, l'espion humain a de quoi se couvrir
 * (sinon il ne pouvait que répondre « ça dépend » et tombait à coup sûr).
 */
export const ESPION_SOLO_COMPARE = 0.5
/**
 * Poids de la parole publique (speechSuspicion du socle) dans le soupçon d'un
 * équipier : la moitié, pour qu'une accusation et ses premiers soutiens
 * comptent sans faire basculer seuls toute la table (effet de troupeau).
 */
export const ESPION_SPEECH_WEIGHT = 0.5
/** Approbation d'une réponse humaine cohérente : une chance de 0,15 + 0,3 × loyauté. */
export const ESPION_ALLY_SHARE_MIN = 0.15
export const ESPION_ALLY_SHARE_SPAN = 0.3
/** L'espion bot juge cohérente une réponse que partagent la moitié au moins de ses lieux en tête. */
export const ESPION_SPY_MATCH_COVER = 0.5
/** Un équipier abonde à un « je trouve ça louche » humain quand la cible est son premier suspect, à 1,5 au moins. */
export const ESPION_FOLLOW_SUSPECT_MIN = 1.5

// ─── Lectures du fil ─────────────────────────────────────────────────────────

const answersOf = (view: EspionClientView): EspionSpeech[] =>
  espionRoundSpeech(view).filter((sp) => sp.kind === 'answer' && sp.questionId && sp.value)

const othersAnswers = (mind: EspionMind) => answersOf(mind.view).filter((sp) => sp.playerId !== mind.botId)

/** Les autres joueurs présents, dans l'ordre de table. */
function othersOf(mind: EspionMind): string[] {
  return mind.view.players.filter((p) => !p.leftAt && p.id !== mind.botId).map((p) => p.id)
}

function elapsedOf(mind: EspionMind): number {
  return espionElapsed(mind.view, mind.now)
}

function myAttrs(mind: EspionMind, deps: EspionBotDeps): Readonly<EspionAttributes> | null {
  if (!mind.view.location) return null
  const id = espionLocationIdOf(mind.view.location)
  return id ? deps.attrsOf(id) : null
}

/** Réponses données par un joueur dans la manche. */
export function espionAnswerCount(view: EspionClientView, playerId: string): number {
  return answersOf(view).filter((sp) => sp.playerId === playerId).length
}

/**
 * Départage public : le moins de réponses données dans la manche (le moins
 * blanchi), puis un hachage propre au bot — jamais un rôle.
 */
export function espionBreakTie(mind: EspionMind, ids: readonly string[]): string | null {
  if (ids.length === 0) return null
  return [...ids].sort(
    (a, b) =>
      espionAnswerCount(mind.view, a) - espionAnswerCount(mind.view, b) ||
      espionHash01(`${mind.botId}-${a}-${mind.view.round}`) - espionHash01(`${mind.botId}-${b}-${mind.view.round}`)
  )[0]
}

// ─── Le carnet vu par l'espion ───────────────────────────────────────────────

/** Score d'un lieu sur des réponses précises : compatible +1, incompatible −2, case « ça dépend » 0. */
function scoreOf(attrs: Readonly<EspionAttributes>, heard: readonly { q: EspionQuestionId; v: EspionAnswer }[]): number {
  let score = 0
  for (const { q, v } of heard) {
    const cell = attrs[q]
    if (cell !== ESPION_ANY) score += cell === v ? ESPION_SCORE_MATCH : ESPION_SCORE_CLASH
  }
  return score
}

const preciseOf = (speech: readonly EspionSpeech[]) =>
  speech
    .filter((sp) => sp.kind === 'answer' && sp.questionId && sp.value && sp.value !== ESPION_ANY)
    .map((sp) => ({ q: sp.questionId!, v: sp.value! }))

/**
 * Score de chaque lieu pour l'espion, tiré des réponses des AUTRES dans la
 * manche : compatible +1, incompatible −2, « ça dépend » (réponse ou case) 0.
 */
export function espionLocationScores(mind: EspionMind, deps: EspionBotDeps): Map<EspionLocationId, number> {
  const heard = preciseOf(othersAnswers(mind))
  const scores = new Map<EspionLocationId, number>()
  for (const id of ESPION_LOCATION_IDS) {
    const attrs = deps.attrsOf(id)
    if (attrs) scores.set(id, scoreOf(attrs, heard))
  }
  return scores
}

/** Les lieux en tête, à `slack` point(s) du meilleur, dans l'ordre du carnet. */
function leaders(scores: Map<EspionLocationId, number>, slack: number): EspionLocationId[] {
  let best = -Infinity
  for (const score of scores.values()) best = Math.max(best, score)
  return [...scores.entries()].filter(([, score]) => score >= best - slack).map(([id]) => id)
}

/** Combien de lieux restent en tête d'après des réponses publiques, plus une réponse hypothétique. */
function leaderCount(answers: readonly EspionSpeech[], deps: EspionBotDeps, extra?: { q: EspionQuestionId; v: EspionAnswer }): number {
  const heard = preciseOf(answers)
  if (extra && extra.v !== ESPION_ANY) heard.push(extra)
  let best = -Infinity
  let count = 0
  for (const id of ESPION_LOCATION_IDS) {
    const attrs = deps.attrsOf(id)
    if (!attrs) continue
    const score = scoreOf(attrs, heard)
    if (score > best) {
      best = score
      count = 1
    } else if (score === best) count += 1
  }
  return count
}

/**
 * Cette réponse précise, ajoutée au fil, vendrait-elle le lieu (au plus
 * ESPION_PROTECT_MAX lieux en tête, contre davantage avant elle) ? Le même
 * calcul sert à l'équipier qui se tait et à ses coéquipiers qui l'excusent.
 */
export function espionWouldGiveAway(
  prior: readonly EspionSpeech[],
  questionId: EspionQuestionId,
  value: EspionAnswer,
  deps: EspionBotDeps
): boolean {
  if (value === ESPION_ANY || leaderCount(prior, deps) <= ESPION_PROTECT_MAX) return false
  return leaderCount(prior, deps, { q: questionId, v: value }) <= ESPION_PROTECT_MAX
}

// ─── Réponses ────────────────────────────────────────────────────────────────

/**
 * La réponse d'un ÉQUIPIER bot, lue dans le carnet de SON lieu : jamais une
 * valeur incompatible. « Ça dépend » si la case l'est, si la réponse vendrait
 * le lieu (sauf l'agressif), et parfois par tempérament (prudent, farceur).
 */
export function espionCrewAnswer(
  mind: EspionMind,
  questionId: EspionQuestionId,
  rand: () => number,
  deps: EspionBotDeps
): EspionAnswer {
  const cell = myAttrs(mind, deps)?.[questionId] ?? ESPION_ANY
  if (cell === ESPION_ANY) return ESPION_ANY
  const { trait } = mind.traits
  if (ESPION_PROTECTORS[trait] && espionWouldGiveAway(answersOf(mind.view), questionId, cell, deps)) return ESPION_ANY
  const share = ESPION_CREW_ANY[trait]
  return share > 0 && rand() < share ? ESPION_ANY : cell
}

/** La valeur la plus donnée par les autres à cette question dans la manche (hors « ça dépend »), la première à égalité. */
function majorityHeard(mind: EspionMind, questionId: EspionQuestionId): EspionValue | null {
  const counts = new Map<string, number>()
  for (const sp of othersAnswers(mind)) {
    if (sp.questionId !== questionId || sp.value === ESPION_ANY) continue
    counts.set(sp.value!, (counts.get(sp.value!) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [value, count] of counts) if (best === null || count > counts.get(best)!) best = value
  return best as EspionValue | null
}

/** Part des `candidates` pour qui `value` est une réponse plausible à la question. */
function coverOf(candidates: readonly EspionLocationId[], questionId: EspionQuestionId, value: string, deps: EspionBotDeps): number {
  if (candidates.length === 0) return 0
  return (
    candidates.filter((id) => {
      const cell = deps.attrsOf(id)?.[questionId]
      return cell === value || cell === ESPION_ANY
    }).length / candidates.length
  )
}

/**
 * La réponse du bot ESPION, qui ne connaît pas le lieu :
 *   • à sa première réponse de la manche, « ça dépend » par prudence ;
 *   • sinon il répète la valeur majoritaire déjà entendue à cette question ;
 *   • sinon la valeur la plus plausible pour ses candidats (lieux à 1 point
 *     ou moins du meilleur) : se taire à chaque doute l'aurait désigné.
 */
export function espionSpyAnswer(
  mind: EspionMind,
  questionId: EspionQuestionId,
  rand: () => number,
  deps: EspionBotDeps
): EspionAnswer {
  const { audace } = mind.traits
  const answeredBefore = answersOf(mind.view).some((sp) => sp.playerId === mind.botId)
  if (!answeredBefore && rand() < ESPION_SPY_FIRST_ANY * (1 - audace)) return ESPION_ANY
  const heard = majorityHeard(mind, questionId)
  if (heard && rand() < ESPION_PARROT_BASE + ESPION_PARROT_SHY * (1 - audace)) return heard
  const candidates = leaders(espionLocationScores(mind, deps), 1)
  let best: { value: EspionValue; cover: number } | null = null
  for (const value of espionQuestionValues(questionId)) {
    const cover = coverOf(candidates, questionId, value, deps)
    if (!best || cover > best.cover) best = { value, cover }
  }
  return best && best.cover > 0 ? best.value : ESPION_ANY
}

/** La réponse d'un bot à la question qui le vise, selon ce que SA vue lui dit de son rôle. */
export function espionBotAnswer(
  mind: EspionMind,
  questionId: EspionQuestionId,
  rand: () => number,
  deps: EspionBotDeps
): EspionAnswer {
  return mind.view.isSpy ? espionSpyAnswer(mind, questionId, rand, deps) : espionCrewAnswer(mind, questionId, rand, deps)
}

// ─── Devinettes de l'espion ──────────────────────────────────────────────────

/**
 * Devinette VOLONTAIRE : assez de réponses précises entendues, un seul lieu
 * en tête avec la marge voulue, et jamais dans les 20 dernières secondes (le
 * chrono lui revient de toute façon).
 */
export function espionVoluntaryGuess(mind: EspionMind, deps: EspionBotDeps): EspionLocationId | null {
  const { view, now } = mind
  if (!view.isSpy || view.phaseEndsAt === null) return null
  if (view.phaseEndsAt - now < ESPION_GUESS_QUIET_END_MS) return null
  const heard = othersAnswers(mind).filter((sp) => sp.value !== ESPION_ANY).length
  if (heard < ESPION_GUESS_MIN_HEARD) return null
  const ranked = [...espionLocationScores(mind, deps).entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return null
  const margin = ESPION_GUESS_MARGIN_BASE - Math.round(ESPION_GUESS_MARGIN_AUDACE * mind.traits.audace)
  const second = ranked.length > 1 ? ranked[1][1] : -Infinity
  return ranked[0][1] - second >= Math.max(1, margin) ? ranked[0][0] : null
}

/**
 * Devinette DÉSESPÉRÉE : accusé, à une voix de tomber (soutiens ≥ majorité −
 * 1), l'espion tente son meilleur candidat plutôt que de perdre sans jouer.
 */
export function espionDesperateGuess(mind: EspionMind, deps: EspionBotDeps, rand: () => number): EspionLocationId | null {
  const { view, botId } = mind
  const acc = view.activeAccusation
  if (!view.isSpy || !acc || acc.targetId !== botId) return null
  const active = view.players.filter((p) => !p.leftAt).length
  if (acc.supporters.length < espionMajority(active) - 1) return null
  const best = leaders(espionLocationScores(mind, deps), 0)
  return best.length > 0 ? pick(best, rand) : null
}

// ─── Soupçons ────────────────────────────────────────────────────────────────

/**
 * Soupçon d'un ÉQUIPIER bot sur les autres présents, pour la manche (les rôles
 * changent à chaque manche), lu dans le carnet de SON lieu :
 *   • réponse incompatible : +3 (prudent +2, agressif +4) ;
 *   • « ça dépend » alors que sa case est précise : +0,5, sauf quand la
 *     réponse précise aurait vendu le lieu (un équipier l'aurait tue) ;
 *   • copie exacte d'une réponse antérieure : +0,5 ;
 *   • réponse précise et compatible : −1 ; une case « ça dépend » ne juge rien ;
 *   • silence : 0 ;
 *   • +2 à l'accusateur et à chaque soutien d'une accusation close sans
 *     verdict contre un joueur blanchi, et à l'accusateur d'une accusation
 *     que j'ai refusée ;
 *   • plus ESPION_SPEECH_WEIGHT × la part publique du socle (speechSuspicion :
 *     paroles, rancune, loyauté), où une accusation compte comme un
 *     « je trouve ça louche » et où les soutiens et refus muets ne comptent pas.
 * L'espion n'a pas de lieu : il lit la rumeur publique (espionPublicSuspicion).
 */
export function espionSuspicion(mind: EspionMind, deps: EspionBotDeps): Map<string, number> {
  const cached = suspicionMemo.get(mind)
  if (cached?.deps === deps) return new Map(cached.score)
  const score = espionEvidence(mind, deps)
  if (myAttrs(mind, deps)) {
    for (const [id, n] of espionSpeechSuspicion(mind)) {
      if (score.has(id)) score.set(id, score.get(id)! + ESPION_SPEECH_WEIGHT * n)
    }
  }
  suspicionMemo.set(mind, { deps, score })
  return new Map(score)
}

const suspicionMemo = new WeakMap<EspionMind, { deps: EspionBotDeps; score: Map<string, number> }>()

/**
 * Les PREUVES d'un équipier, sans la parole publique : ses réponses jugées
 * d'après son lieu, et les accusations closes qui trahissent leurs auteurs.
 * C'est sur elles qu'un joueur est « jugé » (espionTopSuspects) : une rumeur
 * seule ne désigne personne.
 */
export function espionEvidence(mind: EspionMind, deps: EspionBotDeps): Map<string, number> {
  // Une décision relit plusieurs fois le soupçon du même esprit : on le calcule une fois.
  const cached = evidenceMemo.get(mind)
  if (cached?.deps === deps) return new Map(cached.score)
  const score = computeEvidence(mind, deps)
  evidenceMemo.set(mind, { deps, score })
  return new Map(score)
}

const evidenceMemo = new WeakMap<EspionMind, { deps: EspionBotDeps; score: Map<string, number> }>()

function computeEvidence(mind: EspionMind, deps: EspionBotDeps): Map<string, number> {
  const score = new Map<string, number>(othersOf(mind).map((id) => [id, 0]))
  const attrs = myAttrs(mind, deps)
  if (!attrs) return score
  const add = (id: string, n: number) => {
    if (score.has(id)) score.set(id, score.get(id)! + n)
  }
  const answers = answersOf(mind.view)
  answers.forEach((sp, i) => {
    if (!score.has(sp.playerId)) return
    const copied = answers
      .slice(0, i)
      .some((prev) => prev.playerId !== sp.playerId && prev.questionId === sp.questionId && prev.value === sp.value)
    if (copied && sp.value !== ESPION_ANY) add(sp.playerId, ESPION_SUSPICION_COPY)
    const cell = attrs[sp.questionId!]
    if (cell === ESPION_ANY) return
    if (sp.value !== ESPION_ANY) add(sp.playerId, sp.value === cell ? ESPION_SUSPICION_MATCH : ESPION_SUSPICION_CLASH[mind.traits.trait])
    else if (!espionWouldGiveAway(answers.slice(0, i), sp.questionId!, cell, deps)) add(sp.playerId, ESPION_SUSPICION_VAGUE)
  })
  // Les accusations closes sans verdict contre un joueur blanchi trahissent
  // leurs auteurs ; celles que j'ai refusées désignent au moins leur
  // accusateur (sans quoi un espion qui accuse à la chaîne gèlerait la manche
  // sans rien risquer).
  const base = new Map(score)
  const speech = espionRoundSpeech(mind.view)
  const live = mind.view.activeAccusation
  const lastAccuse = speech.map((e) => e.kind).lastIndexOf('accuse')
  speech.forEach((sp, i) => {
    if (sp.kind !== 'accuse' || !sp.targetId || (live !== null && i === lastAccuse)) return
    const next = speech.findIndex((e, j) => j > i && e.kind === 'accuse')
    const window = speech.slice(i + 1, next < 0 ? undefined : next)
    if ((base.get(sp.targetId) ?? 0) <= ESPION_CLEAN_SCORE) {
      add(sp.playerId, ESPION_SUSPICION_FALSE_ACCUSER)
      for (const e of window) if (e.kind === 'rally') add(e.playerId, ESPION_SUSPICION_FALSE_ACCUSER)
    } else if (window.some((e) => e.kind === 'doubt' && e.playerId === mind.botId)) {
      add(sp.playerId, ESPION_SUSPICION_FALSE_ACCUSER)
    }
  })
  return score
}

/**
 * La part publique du soupçon, celle du socle, lue sur le fil de l'Espion :
 * une accusation formelle y vaut un `suspect` (le socle ne connaît pas
 * `accuse`), et les soutiens et refus muets (au-delà du premier) n'y entrent
 * pas — sans quoi chaque bot qui suit une accusation la renforcerait d'autant.
 * L'accusation EN COURS n'y entre pas non plus, ni ses soutiens et refus :
 * elle ne peut pas se prouver elle-même ; close sans verdict, elle compte.
 */
export function espionSpeechSuspicion(mind: EspionMind): Map<string, number> {
  const { view, botId, traits } = mind
  const all = view.speech ?? []
  let liveFrom = all.length
  if (view.activeAccusation) {
    for (let i = all.length - 1; i >= 0; i -= 1) {
      if (all[i].round === view.round && all[i].kind === 'accuse') {
        liveFrom = i
        break
      }
    }
  }
  const speech: BotSpeech<EspionSpeechKind>[] = all
    .filter((sp, i) => !sp.quiet && !(i >= liveFrom && (sp.kind === 'accuse' || sp.kind === 'rally' || sp.kind === 'doubt')))
    .map((sp) => (sp.kind === 'accuse' ? { ...sp, kind: 'suspect' as const } : sp))
  return speechSuspicion({
    candidates: othersOf(mind),
    speech,
    round: view.round,
    botId,
    trait: traits.trait,
    mood: traits,
    isHuman: (id) => view.players.some((p) => p.id === id && !p.isBot),
  })
}

/**
 * Soupçon PUBLIC, celui que lit le bot espion (qui n'a pas de lieu pour juger
 * une réponse) : +1 par « ça dépend » donné, +2 par accusation reçue.
 */
export function espionPublicSuspicion(mind: EspionMind): Map<string, number> {
  const score = new Map<string, number>(othersOf(mind).map((id) => [id, 0]))
  for (const sp of espionRoundSpeech(mind.view)) {
    if (sp.kind === 'answer' && sp.value === ESPION_ANY && score.has(sp.playerId)) {
      score.set(sp.playerId, score.get(sp.playerId)! + 1)
    } else if (sp.kind === 'accuse' && sp.targetId && score.has(sp.targetId)) {
      score.set(sp.targetId, score.get(sp.targetId)! + 2)
    }
  }
  return score
}

/** Le soupçon qui guide CE bot : le carnet de son lieu s'il en a un, la rumeur publique s'il est l'espion. */
function suspicionFor(mind: EspionMind, deps: EspionBotDeps): Map<string, number> {
  return mind.view.isSpy ? espionPublicSuspicion(mind) : espionSuspicion(mind, deps)
}

/**
 * Ses premiers suspects, égalités comprises, dans l'ordre de table. Pour
 * accuser ou soutenir, seuls comptent les joueurs déjà jugés : interrogés
 * dans la manche, ou chargés par un indice — une preuve, pas une rumeur :
 * une parole seule ne juge personne. À plusieurs humains, celui qui joue au
 * vocal sans toucher aux boutons n'est ainsi jamais désigné par défaut. Pour
 * choisir qui sonder, tout le monde compte.
 */
export function espionTopSuspects(mind: EspionMind, deps: EspionBotDeps, { judgedOnly = true } = {}): string[] {
  const score = suspicionFor(mind, deps)
  if (!judgedOnly) return mostSuspect(score, othersOf(mind))
  const questioned = new Set(espionRoundSpeech(mind.view).filter((sp) => sp.kind === 'question').map((sp) => sp.targetId))
  const charged = mind.view.isSpy ? score : espionEvidence(mind, deps)
  return mostSuspect(
    score,
    othersOf(mind).filter((id) => questioned.has(id) || (charged.get(id) ?? 0) > 0)
  )
}

/** Son premier suspect jugé, départagé publiquement (espionBreakTie). */
export function espionFirstSuspect(mind: EspionMind, deps: EspionBotDeps): string | null {
  return espionBreakTie(mind, espionTopSuspects(mind, deps))
}

// ─── Réactions à la table ────────────────────────────────────────────────────

/**
 * Ce qu'un bot pense d'une réponse précise entendue, de SA place :
 *   • équipier : 'clash' si elle jure avec la case de son lieu, 'match' si
 *     elle la reprend, null si la case dépend de la personne ;
 *   • espion : il ne sait pas où l'on est — jamais 'clash' ; 'match' quand
 *     la réponse vaut pour la moitié au moins de ses lieux en tête (il
 *     approuve au jugé, et peut s'y trahir).
 * « Ça dépend » ne se juge pas.
 */
export function espionAnswerVerdict(
  mind: EspionMind,
  heard: { questionId?: EspionQuestionId; value?: EspionAnswer },
  deps: EspionBotDeps
): 'clash' | 'match' | null {
  const { questionId, value } = heard
  if (!questionId || !value || value === ESPION_ANY) return null
  if (mind.view.isSpy) {
    const candidates = leaders(espionLocationScores(mind, deps), 1)
    return coverOf(candidates, questionId, value, deps) >= ESPION_SPY_MATCH_COVER ? 'match' : null
  }
  const cell = myAttrs(mind, deps)?.[questionId]
  if (!cell || cell === ESPION_ANY) return null
  return cell === value ? 'match' : 'clash'
}

/** Chance d'approuver tout haut une réponse humaine cohérente : 0,15 + 0,3 × loyauté. */
export function espionAllyShare(traits: Pick<BotTraits, 'loyaute'>): number {
  return ESPION_ALLY_SHARE_MIN + ESPION_ALLY_SHARE_SPAN * traits.loyaute
}

/**
 * La suite qu'un bot donne au « je trouve ça louche » d'un humain contre
 * `targetId` : il la couvre ('ally') si ses réponses l'ont blanchie ; il
 * abonde ('suspect') si elle est son premier suspect, à
 * ESPION_FOLLOW_SUSPECT_MIN au moins ; sinon il se tait. L'espion, sans lieu, abonde quand la
 * rumeur publique charge déjà la cible : se fondre dans la meute.
 */
export function espionFollowUp(mind: EspionMind, targetId: string, deps: EspionBotDeps): 'suspect' | 'ally' | null {
  if (mind.view.isSpy) return (espionPublicSuspicion(mind).get(targetId) ?? 0) > 0 ? 'suspect' : null
  // Couvrir se fonde sur les réponses de la cible, que la pique humaine ne change pas.
  if ((espionEvidence(mind, deps).get(targetId) ?? 0) <= ESPION_CLEAN_SCORE) return 'ally'
  const score = espionSuspicion(mind, deps).get(targetId) ?? 0
  return score >= ESPION_FOLLOW_SUSPECT_MIN && espionTopSuspects(mind, deps).includes(targetId) ? 'suspect' : null
}

// ─── Accusations ─────────────────────────────────────────────────────────────

const roundAccusations = (view: EspionClientView) => espionRoundSpeech(view).filter((sp) => sp.kind === 'accuse')

/**
 * Les plafonds communs à toute accusation de bot : aucune en cours, une par
 * bot et par manche, deux de bots par manche, 20 s depuis la dernière d'un bot.
 */
function mayAccuse(mind: EspionMind): boolean {
  const { view, botId, now } = mind
  if (view.activeAccusation) return false
  const accusations = roundAccusations(view)
  if (accusations.some((sp) => sp.playerId === botId)) return false
  const byBots = accusations.filter((sp) => view.players.find((p) => p.id === sp.playerId)?.isBot)
  if (byBots.length >= ESPION_BOT_ACCUSATIONS_PER_ROUND) return false
  const last = byBots[byBots.length - 1]
  return !last || now - last.at >= ESPION_BOT_ACCUSE_GAP_MS
}

/** Seuil d'accusation d'un équipier à l'instant t : 3 − t, jamais sous 2, décalé par son trait. */
export function espionAccuseThreshold(trait: BotTrait, t: number): number {
  return Math.max(ESPION_ACCUSE_FLOOR, ESPION_ACCUSE_BASE - ESPION_ACCUSE_SLOPE * t) + ESPION_ACCUSE_TRAIT[trait]
}

/**
 * Accusation sur preuves d'un ÉQUIPIER bot : un premier suspect jugé unique,
 * une longueur d'avance, un score au-dessus du seuil du moment, et au moins
 * une réponse de la cible.
 */
export function espionCrewAccusation(mind: EspionMind, deps: EspionBotDeps): string | null {
  if (mind.view.isSpy || !mayAccuse(mind)) return null
  const score = espionSuspicion(mind, deps)
  const judged = new Set(espionTopSuspects(mind, deps))
  if (judged.size !== 1) return null
  const [firstId] = judged
  const first = score.get(firstId) ?? 0
  const rivals = othersOf(mind).filter((id) => id !== firstId).map((id) => score.get(id) ?? 0)
  const second = rivals.length > 0 ? Math.max(...rivals) : -Infinity
  if (first - second < ESPION_ACCUSE_LEAD) return null
  if (first < espionAccuseThreshold(mind.traits.trait, elapsedOf(mind))) return null
  return espionAnswerCount(mind.view, firstId) >= ESPION_ACCUSE_ANSWERS ? firstId : null
}

/**
 * Accusation du bot ESPION, une diversion : une fois par manche, s'il ose
 * (audace ≥ 0,6) et seulement au milieu de la manche (40 % à 85 %), contre le
 * joueur le plus soupçonné publiquement, s'il y en a un.
 */
export function espionSpyAccusation(mind: EspionMind): string | null {
  if (!mind.view.isSpy || mind.traits.audace < ESPION_SPY_ACCUSE_MIN_AUDACE || !mayAccuse(mind)) return null
  const t = elapsedOf(mind)
  if (t < ESPION_SPY_ACCUSE_FROM || t > ESPION_SPY_ACCUSE_TO) return null
  const score = espionPublicSuspicion(mind)
  const top = mostSuspect(score, othersOf(mind))
  if (top.length === 0 || (score.get(top[0]) ?? 0) <= 0) return null
  return espionBreakTie(mind, top)
}

/** L'accusation qu'un bot lance de lui-même à cet instant, ou null. */
export function espionBotAccusation(mind: EspionMind, deps: EspionBotDeps): string | null {
  return mind.view.isSpy ? espionSpyAccusation(mind) : espionCrewAccusation(mind, deps)
}

/** La cible du dernier appel : le premier suspect d'un équipier, le plus soupçonné publiquement pour l'espion. */
export function espionLastCallTarget(mind: EspionMind, deps: EspionBotDeps): string | null {
  return espionFirstSuspect(mind, deps)
}

// ─── Soutien ou refus ────────────────────────────────────────────────────────

/**
 * L'accusation en cours a été lancée à l'heure du dernier appel (T − 40 s, ou
 * plus tôt quand plus aucune question ne viendra) : soutenir ne coûte plus que
 * le chrono, qui reviendrait de toute façon à l'espion.
 */
function lastCallPeriod(view: EspionClientView): boolean {
  const acc = view.activeAccusation
  if (!acc || view.phaseEndsAt === null) return false
  if (espionQuestionsOver(view)) return true
  return acc.endsAt - ESPION_ACCUSATION_WINDOW_MS >= view.phaseEndsAt - ESPION_LAST_CALL_MS
}

/**
 * Décision d'un bot sur l'accusation en cours : true = soutien, false = refus.
 *   • Équipier : il soutient si la cible est l'un de ses premiers suspects
 *     avec un score ≥ seuil(trait) × (1 − t) — prudent 2, farceur 1,
 *     agressif 1, suiveur 1 (0,5 derrière un humain). Au dernier appel, le
 *     seuil tombe à −0,5.
 *   • Espion : il soutient avec une chance de 0,5 + 0,5 × audace ; un prudent
 *     seulement si un autre que l'accusateur a déjà soutenu.
 */
export function espionSupports(mind: EspionMind, deps: EspionBotDeps, rand: () => number): boolean {
  const { view, traits } = mind
  const acc = view.activeAccusation
  if (!acc) return false
  if (view.isSpy) {
    if (traits.trait === 'prudent' && !acc.supporters.some((id) => id !== acc.accuserId)) return false
    return rand() < ESPION_SPY_SUPPORT_BASE + ESPION_SPY_SUPPORT_AUDACE * traits.audace
  }
  if (!espionTopSuspects(mind, deps).includes(acc.targetId)) return false
  const accuserIsHuman = view.players.find((p) => p.id === acc.accuserId)?.isBot === false
  const base =
    traits.trait === 'suiveur' && accuserIsHuman ? ESPION_SUIVEUR_HUMAN_THRESHOLD : ESPION_SUPPORT_THRESHOLD[traits.trait]
  const threshold = lastCallPeriod(view) ? ESPION_LAST_CALL_SUPPORT : base * (1 - elapsedOf(mind))
  return (espionSuspicion(mind, deps).get(acc.targetId) ?? 0) >= threshold
}

// ─── Questions ───────────────────────────────────────────────────────────────

/** Part des lieux connus du carnet dont la case vaut `value` pour cette question. */
function shareOf(questionId: EspionQuestionId, value: string, deps: EspionBotDeps): number {
  let known = 0
  let same = 0
  for (const id of ESPION_LOCATION_IDS) {
    const attrs = deps.attrsOf(id)
    if (!attrs) continue
    known += 1
    if (attrs[questionId] === value) same += 1
  }
  return known === 0 ? 1 : same / known
}

/**
 * La question qu'un bot pose à `targetId` :
 *   • en solo, à l'humain, une fois sur deux une question déjà répondue
 *     (ESPION_SOLO_COMPARE) ;
 *   • sinon parmi les moins posées de la manche (deux fois au plus) ;
 *   • un équipier qui sonde l'un de ses premiers suspects, ou agressif : la
 *     plus discriminante pour son lieu (un espion y répond au jugé, et se
 *     trompe) ; prudent : la plus large ;
 *   • l'espion audacieux (≥ 0,5) : celle qui réduit le plus gros groupe de
 *     ses candidats ; sinon au hasard.
 */
export function espionPickQuestion(
  mind: EspionMind,
  deps: EspionBotDeps,
  rand: () => number,
  targetId: string | null = null
): EspionQuestionId {
  const asked = (q: EspionQuestionId) => espionQuestionAsked(mind.view, q)
  const open = ESPION_QUESTION_IDS.filter((q) => asked(q) < ESPION_SAME_QUESTION_MAX)
  const target = mind.view.players.find((p) => p.id === targetId)
  if (target && !target.isBot && espionIsSolo(mind.view)) {
    const answered = othersAnswers(mind).filter((sp) => sp.value !== ESPION_ANY).map((sp) => sp.questionId!)
    const compare = open.filter((q) => asked(q) === 1 && answered.includes(q))
    if (compare.length > 0 && rand() < ESPION_SOLO_COMPARE) return pick(compare, rand)
  }
  const fewest = Math.min(...open.map(asked))
  const pool = open.filter((q) => asked(q) === fewest)
  const byScore = (scoreOf: (q: EspionQuestionId) => number): EspionQuestionId =>
    pool.reduce((best, q) => (scoreOf(q) < scoreOf(best) ? q : best), pool[0])
  const { trait, audace } = mind.traits
  if (mind.view.isSpy) {
    if (audace < ESPION_SPY_SMART_ASK_AUDACE) return pick(pool, rand)
    const candidates = leaders(espionLocationScores(mind, deps), 1)
    // La question dont la plus grosse famille de réponses reste la plus petite.
    return byScore((q) => Math.max(...espionQuestionValues(q).map((value) => coverOf(candidates, q, value, deps))))
  }
  const attrs = myAttrs(mind, deps)
  const myShare = (q: EspionQuestionId) => {
    const cell = attrs?.[q] ?? ESPION_ANY
    return cell === ESPION_ANY ? 1 : shareOf(q, cell, deps)
  }
  const probing = targetId !== null && espionTopSuspects(mind, deps, { judgedOnly: false }).includes(targetId)
  if (probing || trait === 'agressif') return byScore(myShare)
  if (trait === 'prudent') return byScore((q) => -myShare(q))
  return pick(pool, rand)
}

/**
 * À qui un bot pose sa question, parmi les cibles permises (espionAskTargets) :
 * un équipier sonde son premier suspect avec une chance égale à son audace ;
 * sinon le joueur le moins interrogé de la manche.
 */
export function espionPickTarget(
  mind: EspionMind,
  targets: readonly string[],
  deps: EspionBotDeps,
  rand: () => number
): string | null {
  if (targets.length <= 1) return targets[0] ?? null
  if (!mind.view.isSpy && rand() < mind.traits.audace) {
    const suspects = espionTopSuspects(mind, deps, { judgedOnly: false }).filter((id) => targets.includes(id))
    const probe = espionBreakTie(mind, suspects)
    if (probe) return probe
  }
  const questions = espionRoundSpeech(mind.view).filter((sp) => sp.kind === 'question')
  const received = (id: string) => questions.filter((sp) => sp.targetId === id).length
  const fewest = Math.min(...targets.map(received))
  return pick(
    targets.filter((id) => received(id) === fewest),
    rand
  )
}
