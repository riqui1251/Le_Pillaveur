import { createRng } from '@/lib/petit-buveur/rng'
import { personaForBotName } from '@/lib/online/bot-personas'
import { readSpeechTable, remarkOf, type SpeechTable } from '@/lib/online/bot-speech'
import {
  espionAskBlock,
  espionFreeSpeechLeft,
  espionHumanSeated,
  espionMajority,
  espionQuestionCap,
  espionRoundSpeech,
  isEspionFreeSpeech,
  pendingEspionQuestion,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_ASKS_PER_PLAYER,
  ESPION_HUMAN_ASK_PRIORITY_MS,
  ESPION_QUESTION_TIMEOUT_MS,
  ESPION_REMARK_KINDS,
  ESPION_REVEAL_MIN_MS,
  ESPION_SPEECH_CAP,
  type EspionAccusation,
  type EspionPhase,
  type EspionSpeech,
  type EspionSpeechKind,
} from './engine'

/**
 * CALENDRIER DES BOTS DE L'ESPION — public, pur, sans aucune donnée : le
 * client (EspionOnline → useBotReferee, rand = Math.random) et le filet
 * serveur (serviceTick du registre, rand = 1) en tirent le MÊME délai, et le
 * planificateur (bot-speech.ts) y lit ce qui est dû. Il n'importe ni le carnet
 * ni les lieux (data/attributes.test.ts, G5) : tout se lit dans la vue
 * publique — le fil, l'accusation, les joueurs.
 *
 * Chaque échéance est un instant DÉTERMINISTE, haché par (bot, ancre) : le
 * client et le serveur calculent le même. Aucune n'est « au cas où » : une
 * échéance listée produit toujours une écriture quand elle tombe (un refus
 * casserait la chaîne, puisque chaque version n'est tentée qu'une fois).
 *   • decide   — un bot pas encore décidé sur l'accusation en cours (soutien
 *                ou refus), à début + tempo ;
 *   • answer   — le bot interrogé répond, à la question + tempo ;
 *   • turn     — la question suivante, à la Spyfall : la main revient à qui
 *                vient de répondre (pause de 3,5 à 6,5 s), 12 s de priorité à
 *                un humain, 25 s pour une question restée sans réponse, 4 s à
 *                l'ouverture ; jamais pendant une accusation ni dans les 10
 *                dernières secondes ;
 *   • lastCall — le bot le plus audacieux accuse, à T − 40 s ou dès que les
 *                questions sont épuisées, si aucun bot n'a accusé depuis 30 s ;
 *   • speak    — une parole que la table publique suffit à décider : le bot
 *                qu'un humain accuse se défend (à l'accusation + tempo), et
 *                les remarques d'ouverture sur l'espion de la manche d'avant.
 * Les coups qui dépendent d'un secret (devinette de l'espion, accusation sur
 * preuves, réaction à une réponse humaine jugée d'après SON lieu) n'ont pas
 * d'échéance propre : ils passent devant une question ou un dernier appel
 * dus, qui garantissent l'écriture. Aucune parole de bot dans les 10
 * dernières secondes.
 */

/** Avance tolérée sur l'horloge du client : une échéance à moins de 1,5 s est déjà due. */
export const ESPION_BOT_EARLY_SLACK_MS = 1_500
/** Plancher du délai : un état reçu en retard ne tire pas « à froid ». */
export const ESPION_BOT_TICK_FLOOR_MS = 250
/** Tirage ajouté au délai : le serveur (rand = 1) passe toujours après un client éveillé. */
export const ESPION_BOT_TICK_JITTER_MS = 400
/** Lecture de la révélation menée par un bot, table sans humain assis. */
export const ESPION_REVEAL_BOT_TICK_MS = 2_500
/**
 * Avec un humain assis : le plancher de lecture du moteur + 1 s de marge, pour
 * qu'il n'oppose jamais READING_TIME au tick (la révélation n'a pas
 * d'échéance, un tick refusé la figerait).
 */
export const ESPION_REVEAL_READ_BOT_TICK_MS = ESPION_REVEAL_MIN_MS + 1_000
/** Première question de la manche, après la lecture du lieu. */
export const ESPION_OPENING_MS = 4_000
/** Pause entre une réponse et la question suivante quand la main revient à un bot. */
export const ESPION_BOT_PAUSE_MIN_MS = 3_500
export const ESPION_BOT_PAUSE_SPAN_MS = 3_000
/** Plus aucune question dans les dernières secondes de la manche. */
export const ESPION_NO_QUESTION_END_MS = 10_000
/** Dernier appel : à T − 40 s… */
export const ESPION_LAST_CALL_MS = 40_000
/**
 * … si aucun bot n'a accusé depuis 30 s… Les accusations humaines ne comptent
 * pas : un espion humain qui accuse à la chaîne repousserait sinon le dernier
 * appel au-delà de T − 25 s, et l'attente redeviendrait payante.
 */
export const ESPION_LAST_CALL_QUIET_MS = 30_000
/** … et jamais après T − 25 s : l'accusation doit tenir avant la fin du chrono. */
export const ESPION_LAST_CALL_LATEST_MS = 25_000
/**
 * Un dernier appel prévu juste avant T − 25 s reste dû 2,5 s après son
 * instant : le tick arrive avec son tirage (≤ 400 ms), ou 1,9 s plus tard par
 * le filet serveur quand les téléphones dorment. Sans cette marge, l'échéance
 * disparaissait sous le tick et le refus figeait les bots jusqu'à la fin de la
 * manche.
 */
export const ESPION_LAST_CALL_GRACE_MS = 2_500
/** En solo, l'humain reçoit au plus 3 questions par manche… */
export const ESPION_SOLO_HUMAN_QUESTIONS_MAX = 3
/** … et au moins une sur trois. */
export const ESPION_SOLO_HUMAN_EVERY = 3
/** Les bots se taisent dans les dernières secondes de la manche : place au verdict. */
export const ESPION_SPEECH_END_MS = 10_000
/** Le temps de lire une bulle : la question suivante, ou la remarque suivante, attend d'autant. */
export const ESPION_SPEECH_PAUSE_MS = 2_500
/** Remarques d'ouverture : la première entre 1,5 et 3 s après le début de la manche… */
export const ESPION_REMARK_OPENING_MS = 1_500
export const ESPION_REMARK_SPAN_MS = 1_500
/** … et aucune passé 20 s : ce n'est plus une ouverture. */
export const ESPION_REMARK_WINDOW_MS = 20_000

const CONVERT_TEMPO_MIN_MS = 1_500
const CONVERT_TEMPO_MAX_MS = 4_000

/** Ce que le calendrier lit d'une table : la vue publique, celle d'un joueur ou de la TV suffit. */
export type EspionBotTickInput = {
  phase: EspionPhase
  round: number
  phaseEndsAt: number | null
  discussionMs: number
  speech?: EspionSpeech[]
  activeAccusation: EspionAccusation | null
  players: readonly { id: string; name: string; isBot: boolean; leftAt: number | null }[]
  /** Le reveal de la manche d'avant (public) : les remarques visent son espion. */
  lastReveal?: { round: number; spyId: string } | null
}

export type EspionBotEventKind = 'decide' | 'answer' | 'turn' | 'lastCall' | 'speak'

export type EspionBotEvent = {
  kind: EspionBotEventKind
  at: number
  botId: string
  /** La parole d'un `speak`, décidée sur la table publique. */
  say?: { kind: EspionSpeechKind; targetId: string }
}

/** Ce que la table des paroles lit d'un joueur. */
export type EspionSpeechSeat = { id: string; name: string; isBot: boolean; alive: boolean }

const isRemarkKind = (kind: EspionSpeechKind) => (ESPION_REMARK_KINDS as readonly string[]).includes(kind)

/**
 * Les paroles LIBRES de la manche, lues par le socle : le plafond d'un bot y
 * vaut min(ESPION_SPEECH_CAP, son bavardage), et seules elles y comptent —
 * questions, réponses, accusations, soutiens et refus ont leurs propres règles.
 */
export function espionSpeechTable(
  input: Pick<EspionBotTickInput, 'round' | 'speech' | 'players'>
): SpeechTable<EspionSpeechKind, EspionSpeechSeat> {
  return readSpeechTable({
    players: input.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, alive: !p.leftAt })),
    speech: (input.speech ?? []).filter((sp) => isEspionFreeSpeech(sp.kind)),
    round: input.round,
    engineCap: ESPION_SPEECH_CAP,
    isRemark: isRemarkKind,
    isAsk: () => false,
  })
}

/** Un bot peut encore parler à `at` (ou maintenant, si l'instant est passé) : jamais dans les 10 dernières secondes. */
export function espionBotsMaySpeak(input: Pick<EspionBotTickInput, 'phaseEndsAt'>, at: number, now: number): boolean {
  return input.phaseEndsAt !== null && Math.max(at, now) < input.phaseEndsAt - ESPION_SPEECH_END_MS
}

/** Un tirage dans [0, 1) haché par sa clé : le même sur tous les écrans et au serveur. */
export function espionHash01(key: string): number {
  return createRng(key).next()
}

/** Le temps de réflexion d'un bot ancré sur un instant public (question, accusation). */
export function espionBotTempoMs(bot: { id: string; name: string }, anchorAt: number): number {
  const persona = personaForBotName(bot.name)
  const min = persona?.tempoMinMs ?? CONVERT_TEMPO_MIN_MS
  const max = persona?.tempoMaxMs ?? CONVERT_TEMPO_MAX_MS
  return Math.round(min + (max - min) * espionHash01(`${bot.id}@${anchorAt}`))
}

/** Part écoulée de la discussion, entre 0 et 1. */
export function espionElapsed(input: Pick<EspionBotTickInput, 'phaseEndsAt' | 'discussionMs'>, now: number): number {
  if (input.phaseEndsAt === null || input.discussionMs <= 0) return 0
  const start = input.phaseEndsAt - input.discussionMs
  return Math.min(1, Math.max(0, (now - start) / input.discussionMs))
}

const activeOf = (input: Pick<EspionBotTickInput, 'players'>) => input.players.filter((p) => !p.leftAt)

/** Un humain « engagé » a posé une question ou répondu dans cette manche ou la précédente. */
export function espionHumanEngaged(input: Pick<EspionBotTickInput, 'round' | 'speech'>, playerId: string): boolean {
  return (input.speech ?? []).some(
    (sp) =>
      sp.playerId === playerId &&
      (sp.kind === 'question' || sp.kind === 'answer') &&
      (sp.round === input.round || sp.round === input.round - 1)
  )
}

/** Une table avec un seul humain présent : ses règles de questions sont les siennes. */
export function espionIsSolo(input: Pick<EspionBotTickInput, 'players'>): boolean {
  return input.players.filter((p) => !p.isBot && !p.leftAt).length === 1
}

/**
 * Qui `askerId` peut interroger à `at` : les règles du moteur (sauf la
 * question elle-même), puis la politique des bots, publique elle aussi.
 *   • jamais l'interrogé d'une question restée sans réponse (on passe à quelqu'un d'autre) ;
 *   • en solo, l'humain au plus 3 fois par manche, jamais deux fois de suite,
 *     et d'office quand les deux dernières questions sont allées ailleurs ;
 *   • à plusieurs humains, seulement un humain engagé (espionHumanEngaged).
 */
export function espionAskTargets(input: EspionBotTickInput, askerId: string, at: number): string[] {
  const speech = espionRoundSpeech(input)
  const questions = speech.filter((sp) => sp.kind === 'question')
  const last = questions[questions.length - 1]
  const lastIndex = last ? speech.lastIndexOf(last) : -1
  const lastUnanswered = Boolean(last) && !speech.slice(lastIndex + 1).some((sp) => sp.kind === 'answer')
  const solo = espionIsSolo(input)
  const received = (id: string) => questions.filter((sp) => sp.targetId === id).length
  const allowed = activeOf(input).filter((p) => {
    if (espionAskBlock(input, askerId, p.id, at) !== null) return false
    if (lastUnanswered && last?.targetId === p.id) return false
    if (p.isBot) return true
    if (solo) return received(p.id) < ESPION_SOLO_HUMAN_QUESTIONS_MAX && last?.targetId !== p.id
    return espionHumanEngaged(input, p.id)
  })
  if (solo) {
    const human = allowed.find((p) => !p.isBot)
    if (human) {
      let since = 0
      for (let i = questions.length - 1; i >= 0 && questions[i].targetId !== human.id; i -= 1) since += 1
      if (since >= ESPION_SOLO_HUMAN_EVERY - 1) return [human.id]
    }
  }
  return allowed.map((p) => p.id)
}

function decideEvents(input: EspionBotTickInput, now: number): EspionBotEvent[] {
  const acc = input.activeAccusation
  if (!acc || now >= acc.endsAt) return []
  const openedAt = acc.endsAt - ESPION_ACCUSATION_WINDOW_MS
  const declined = acc.declined ?? []
  const events: EspionBotEvent[] = []
  for (const bot of activeOf(input)) {
    if (!bot.isBot || bot.id === acc.targetId || acc.supporters.includes(bot.id) || declined.includes(bot.id)) continue
    const at = openedAt + espionBotTempoMs(bot, openedAt)
    if (at < acc.endsAt) events.push({ kind: 'decide', at, botId: bot.id })
  }
  return events
}

function answerEvent(input: EspionBotTickInput, now: number): EspionBotEvent | null {
  const pending = pendingEspionQuestion(input, now)
  if (!pending) return null
  const target = activeOf(input).find((p) => p.id === pending.targetId)
  if (!target?.isBot) return null
  return { kind: 'answer', at: pending.askedAt + espionBotTempoMs(target, pending.askedAt), botId: target.id }
}

const asksOf = (questions: readonly EspionSpeech[], id: string) => questions.filter((sp) => sp.playerId === id).length

/** L'instant de la question suivante et celui qui a la main (null : un bot relaie). */
function turnBase(input: EspionBotTickInput): { at: number; hand: string | null } {
  const speech = espionRoundSpeech(input)
  const questions = speech.filter((sp) => sp.kind === 'question')
  const start = input.phaseEndsAt! - input.discussionMs
  const last = questions[questions.length - 1]
  let at: number
  let hand: string | null = null
  if (!last) {
    at = start + ESPION_OPENING_MS
  } else {
    const answer = speech.slice(speech.lastIndexOf(last) + 1).find((sp) => sp.kind === 'answer')
    const answerer = answer ? input.players.find((p) => p.id === answer.playerId && !p.leftAt) : undefined
    if (!answer) {
      // Sans réponse : on attend l'expiration, ou le départ de l'interrogé.
      const target = input.players.find((p) => p.id === last.targetId)
      at = target?.leftAt ? Math.max(last.at, target.leftAt) + ESPION_BOT_PAUSE_MIN_MS : last.at + ESPION_QUESTION_TIMEOUT_MS
    } else if (answerer?.isBot) {
      hand = answerer.id
      at = answer.at + ESPION_BOT_PAUSE_MIN_MS + ESPION_BOT_PAUSE_SPAN_MS * espionHash01(`${answerer.id}@${answer.at}`)
    } else if (answerer && asksOf(questions, answerer.id) < ESPION_ASKS_PER_PLAYER) {
      at = answer.at + ESPION_HUMAN_ASK_PRIORITY_MS
    } else {
      at = answer.at + ESPION_BOT_PAUSE_MIN_MS + ESPION_BOT_PAUSE_SPAN_MS * espionHash01(`relay@${answer.at}`)
    }
  }
  // Après une accusation, on souffle avant de reprendre les questions ; après une bulle libre, on la lit.
  for (const sp of speech) {
    if (sp.kind === 'accuse' || sp.kind === 'rally' || sp.kind === 'doubt') at = Math.max(at, sp.at + ESPION_BOT_PAUSE_MIN_MS)
    else if (isEspionFreeSpeech(sp.kind)) at = Math.max(at, sp.at + ESPION_SPEECH_PAUSE_MS)
  }
  return { at, hand }
}

/** Le bot qui pose la question suivante : celui qui a la main, sinon le bot qui a le moins posé. */
function askerAt(input: EspionBotTickInput, hand: string | null, at: number): string | null {
  const questions = espionRoundSpeech(input).filter((sp) => sp.kind === 'question')
  const canAsk = (id: string) =>
    asksOf(questions, id) < ESPION_ASKS_PER_PLAYER && espionAskTargets(input, id, at).length > 0
  if (hand && canAsk(hand)) return hand
  const relays = activeOf(input)
    .filter((p) => p.isBot && canAsk(p.id))
    .map((p) => ({ id: p.id, asked: asksOf(questions, p.id), h: espionHash01(`${p.id}@${at}`) }))
    .sort((a, b) => a.asked - b.asked || a.h - b.h)
  return relays[0]?.id ?? null
}

function turnEvent(input: EspionBotTickInput, now: number): EspionBotEvent | null {
  if (input.activeAccusation || input.phaseEndsAt === null) return null
  const pending = pendingEspionQuestion(input, now)
  if (pending && input.players.find((p) => p.id === pending.targetId)?.isBot) return null
  const questions = espionRoundSpeech(input).filter((sp) => sp.kind === 'question')
  if (questions.length >= espionQuestionCap(activeOf(input).length)) return null
  const { at, hand } = turnBase(input)
  const latest = input.phaseEndsAt - ESPION_NO_QUESTION_END_MS
  const when = Math.max(now, at)
  if (when >= latest) return null
  const botId = askerAt(input, hand, when)
  return botId ? { kind: 'turn', at, botId } : null
}

/**
 * Plus aucune question ne viendra dans cette manche (plafond atteint, ou plus
 * personne n'a de question en réserve) : place aux accusations. Un humain qui
 * peut encore poser compte : à plusieurs, les bots à court de questions
 * n'abrègent pas la manche des humains qui jouent au vocal.
 */
export function espionQuestionsOver(input: Pick<EspionBotTickInput, 'round' | 'speech' | 'players'>): boolean {
  const questions = espionRoundSpeech(input).filter((sp) => sp.kind === 'question')
  if (questions.length >= espionQuestionCap(activeOf(input).length)) return true
  return !activeOf(input).some((p) => asksOf(questions, p.id) < ESPION_ASKS_PER_PLAYER)
}

/** L'instant de la dernière accusation lancée par un bot dans la manche, ou null. */
export function espionLastBotAccuseAt(input: EspionBotTickInput): number | null {
  let at: number | null = null
  for (const sp of espionRoundSpeech(input)) {
    if (sp.kind === 'accuse' && input.players.find((p) => p.id === sp.playerId)?.isBot) at = sp.at
  }
  return at
}

/**
 * Ce bot a-t-il quelqu'un à viser au dernier appel, c'est-à-dire un joueur
 * qu'il juge (espionTopSuspects), quel que soit son rôle ? Lu sur la seule
 * table publique, par excès de prudence :
 *   • un autre présent interrogé dans la manche ;
 *   • ou une accusation close qu'il a refusée, d'un autre présent contre un
 *     autre présent : l'équipier en charge l'auteur, l'espion en soupçonne la
 *     cible. C'est elle qui démasque l'espion humain qui accuse à la chaîne
 *     sans qu'aucune question ne soit jamais posée.
 */
function hasLastCallTarget(speech: readonly EspionSpeech[], present: ReadonlySet<string>, botId: string): boolean {
  const other = (id: string | null | undefined): id is string => typeof id === 'string' && id !== botId && present.has(id)
  if (speech.some((sp) => sp.kind === 'question' && other(sp.targetId))) return true
  return speech.some((sp, i) => {
    if (sp.kind !== 'accuse' || !other(sp.playerId) || !other(sp.targetId)) return false
    for (let j = i + 1; j < speech.length && speech[j].kind !== 'accuse'; j += 1) {
      if (speech[j].kind === 'doubt' && speech[j].playerId === botId) return true
    }
    return false
  })
}

/**
 * Le bot du dernier appel : le plus audacieux de ceux qui n'ont pas encore
 * accusé (ordre de table à égalité) et qui ont quelqu'un à viser
 * (hasLastCallTarget). Sans cette garde, l'échéance d'un bot sans cible
 * restait due sans rien écrire : plus proche que toute autre, elle avançait
 * chaque tick à 250 ms, qui était refusé, et masquait la réponse d'un bot à
 * une question posée après T − 40 s (un seul bot, des humains au vocal).
 */
export function espionLastCallBot(input: EspionBotTickInput): string | null {
  const speech = espionRoundSpeech(input)
  const accusers = new Set(speech.filter((sp) => sp.kind === 'accuse').map((sp) => sp.playerId))
  const present = new Set(activeOf(input).map((p) => p.id))
  let best: { id: string; audace: number } | null = null
  for (const p of activeOf(input)) {
    if (!p.isBot || accusers.has(p.id) || !hasLastCallTarget(speech, present, p.id)) continue
    const audace = personaForBotName(p.name)?.audace ?? 0.5
    if (!best || audace > best.audace) best = { id: p.id, audace }
  }
  return best?.id ?? null
}

function lastCallEvent(input: EspionBotTickInput, now: number): EspionBotEvent | null {
  if (input.activeAccusation || input.phaseEndsAt === null) return null
  const speech = espionRoundSpeech(input)
  const lastEntryAt = speech.length > 0 ? speech[speech.length - 1].at : input.phaseEndsAt - input.discussionMs
  let at = input.phaseEndsAt - ESPION_LAST_CALL_MS
  if (espionQuestionsOver(input)) {
    // La dernière question attend encore sa réponse : on la laisse venir.
    const pending = pendingEspionQuestion(input, now)
    at = Math.min(at, lastEntryAt + ESPION_BOT_PAUSE_MIN_MS)
    if (pending) at = Math.max(at, pending.askedAt + ESPION_QUESTION_TIMEOUT_MS)
  }
  const lastBotAccuse = espionLastBotAccuseAt(input)
  if (lastBotAccuse !== null) at = Math.max(at, lastBotAccuse + ESPION_LAST_CALL_QUIET_MS)
  const latest = input.phaseEndsAt - ESPION_LAST_CALL_LATEST_MS
  if (at > latest || now > Math.max(latest, at + ESPION_LAST_CALL_GRACE_MS)) return null
  const botId = espionLastCallBot(input)
  return botId ? { kind: 'lastCall', at, botId } : null
}

/**
 * La dernière accusation d'un humain dans la manche — formelle, ou « je
 * trouve ça louche » —, avec sa place dans le fil ; null si son auteur est
 * parti (plus personne à qui répondre).
 */
export function espionLastHumanAccusation(
  input: Pick<EspionBotTickInput, 'round' | 'speech' | 'players'>
): { index: number; entry: EspionSpeech } | null {
  const speech = espionRoundSpeech(input)
  for (let i = speech.length - 1; i >= 0; i -= 1) {
    const sp = speech[i]
    if (sp.kind !== 'accuse' && sp.kind !== 'suspect') continue
    const author = input.players.find((p) => p.id === sp.playerId)
    if (author && !author.isBot) return author.leftAt ? null : { index: i, entry: sp }
  }
  return null
}

/**
 * Le bot qu'un humain accuse se défend, contre son accusateur, à l'accusation
 * + son tempo — espion ou non, c'est ce que tout accusé ferait. Hors
 * bavardage : un taiseux qu'on accuse ne se tait pas ; seul le plafond du
 * moteur le retient.
 */
function defendEvent(input: EspionBotTickInput, now: number): EspionBotEvent | null {
  const last = espionLastHumanAccusation(input)
  if (!last?.entry.targetId) return null
  const accused = activeOf(input).find((p) => p.id === last.entry.targetId)
  if (!accused?.isBot || espionFreeSpeechLeft(input, accused.id) <= 0) return null
  const answered = espionRoundSpeech(input)
    .slice(last.index + 1)
    .some((sp) => sp.playerId === accused.id && isEspionFreeSpeech(sp.kind))
  if (answered) return null
  const at = last.entry.at + espionBotTempoMs(accused, last.entry.at)
  if (!espionBotsMaySpeak(input, at, now)) return null
  return { kind: 'speak', at, botId: accused.id, say: { kind: 'defend', targetId: last.entry.playerId } }
}

/**
 * Remarque d'ouverture sur la manche d'avant, dont l'espion est public depuis
 * le reveal : « je vous l'avais dit » pour qui l'avait accusé, soupçonné ou
 * soutenu contre lui ; « je me suis planté » envers le dernier visé à tort —
 * jamais par l'espion démasqué lui-même. Au plus deux par manche, une par
 * bot, et seulement s'il lui reste ensuite une parole (remarkOf, du socle) ;
 * la première 1,5 à 3 s après le début.
 */
function remarkEvent(input: EspionBotTickInput, now: number): EspionBotEvent | null {
  const reveal = input.lastReveal
  if (!reveal || reveal.round !== input.round - 1 || input.phaseEndsAt === null) return null
  const start = input.phaseEndsAt - input.discussionMs
  const present = (id: string) => activeOf(input).some((p) => p.id === id)
  const previous = (input.speech ?? []).filter((sp) => sp.round === input.round - 1)
  const remark = remarkOf(espionSpeechTable(input), (bot) => {
    // L'espion démasqué n'a rien à regretter : ses piques étaient des diversions, et le reveal l'a dit à tous.
    if (bot.id === reveal.spyId) return null
    const aimed = previous
      .filter((sp) => sp.playerId === bot.id && sp.targetId && (sp.kind === 'accuse' || sp.kind === 'suspect' || sp.kind === 'rally'))
      .map((sp) => sp.targetId!)
    if (aimed.length === 0) return null
    const targetId = aimed.includes(reveal.spyId) ? reveal.spyId : aimed[aimed.length - 1]
    if (targetId === bot.id || !present(targetId)) return null
    return { kind: targetId === reveal.spyId ? 'toldYou' : 'wrong', targetId }
  })
  if (!remark?.targetId) return null
  const spoken = espionRoundSpeech(input).filter((sp) => isEspionFreeSpeech(sp.kind))
  let at = start + ESPION_REMARK_OPENING_MS + ESPION_REMARK_SPAN_MS * espionHash01(`${remark.playerId}@remark-${input.round}`)
  if (spoken.length > 0) at = Math.max(at, spoken[spoken.length - 1].at + ESPION_SPEECH_PAUSE_MS)
  if (at > start + ESPION_REMARK_WINDOW_MS || !espionBotsMaySpeak(input, at, now)) return null
  return { kind: 'speak', at, botId: remark.playerId, say: { kind: remark.kind, targetId: remark.targetId } }
}

/** Toutes les échéances publiques des bots à `now`, de la plus proche à la plus lointaine. */
export function espionBotEvents(input: EspionBotTickInput, now: number): EspionBotEvent[] {
  if (input.phase !== 'discussion' || input.phaseEndsAt === null) return []
  if (now >= input.phaseEndsAt) return []
  const events = [...decideEvents(input, now)]
  const answer = answerEvent(input, now)
  if (answer) events.push(answer)
  const turn = turnEvent(input, now)
  if (turn) events.push(turn)
  const lastCall = lastCallEvent(input, now)
  if (lastCall) events.push(lastCall)
  for (const speak of [defendEvent(input, now), remarkEvent(input, now)]) if (speak) events.push(speak)
  return events.sort((a, b) => a.at - b.at || a.botId.localeCompare(b.botId))
}

/** Les échéances déjà dues à `now`, avance de l'horloge du client comprise. */
export function espionDueBotEvents(input: EspionBotTickInput, now: number): EspionBotEvent[] {
  return espionBotEvents(input, now).filter((ev) => ev.at <= now + ESPION_BOT_EARLY_SLACK_MS)
}

/** L'accusé est à une voix de tomber : un espion bot doit tenter sa chance tout de suite. */
export function espionAccusedOnTheBrink(input: EspionBotTickInput): boolean {
  const acc = input.activeAccusation
  if (!acc) return false
  return acc.supporters.length >= espionMajority(activeOf(input).length) - 1
}

/**
 * Délai du tick « bot » depuis `now` : max(250 ms, prochaine échéance − now)
 * plus un tirage de 0 à 400 ms ; pour une révélation menée par un bot, 5 s
 * dès qu'un humain est assis (plancher de lecture), 2,5 s sinon ; null quand
 * aucun bot n'a d'échéance.
 */
export function espionBotTickDelayMs(input: EspionBotTickInput, now: number, rand: () => number): number | null {
  if (input.phase === 'reveal') {
    if (!activeOf(input)[0]?.isBot) return null
    const read = espionHumanSeated(input.players) ? ESPION_REVEAL_READ_BOT_TICK_MS : ESPION_REVEAL_BOT_TICK_MS
    return read + rand() * ESPION_BOT_TICK_JITTER_MS
  }
  const next = espionBotEvents(input, now)[0]
  if (!next) return null
  return Math.max(ESPION_BOT_TICK_FLOOR_MS, next.at - now) + rand() * ESPION_BOT_TICK_JITTER_MS
}
