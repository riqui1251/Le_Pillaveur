import type { BotTraits } from '@/lib/online/bot-personas'
import { pick, readSpeechTable, type SpeechPlayer, type SpeechTable } from '@/lib/online/bot-speech'
import {
  QUIZ_SAY_KINDS_OF_PHASE,
  QUIZ_SPEECH_CAP,
  type QuizClientView,
  type QuizSayMove,
  type QuizSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU GRAND PILLAVEUR : une bulle au plus quand les bots
 * buzzent, une au plus à la révélation — sur une question de 15 s, deux
 * bulles se lisent, quatre se noieraient.
 *
 * CE QUE LE BOT A LE DROIT DE SAVOIR, et rien d'autre : le planificateur ne
 * lit que la vue PUBLIQUE (spectateur) de la table. Pendant la question,
 * elle ne porte ni la bonne réponse ni le choix de qui que ce soit ; la
 * fanfaronnade est tirée AVANT la réponse du bot, sur la difficulté
 * publique et son caractère. « Trop facile ! » n'est donc pas un oracle :
 * l'agressif crâne toujours, la prudente n'est sûre que sur une question
 * facile, et aucune phrase ne nomme un choix. À la révélation, tout est
 * public (lastResult) : on réagit à SON résultat, en rappelant sa propre
 * parole de la question (« trop facile »… raté : oops ; « au pif »… gagné :
 * lucky).
 *
 * Sobriété : au plus min(2, bavardage) bulles par bot et par question, une
 * seule par moment pour toute la table, et aucune sans humain présent pour
 * la lire (une table de bots ne se parle pas à elle-même). Les bots ne
 * lisent jamais le fil : les paroles ne pèsent pas sur le jeu.
 *
 * PUR : `rand` injecté.
 */

/** Chance de fanfaronner en buzzant, par point de bavardage (Josiane 3 → 30 %, Gaston 1 → 10 %). */
export const QUIZ_ANSWER_TALK_PER_BAVARDAGE = 0.1
/** Chance de réagir à la révélation, par point de bavardage (un sixième : la moitié pour un bavard). */
export const QUIZ_REVEAL_TALK_PER_BAVARDAGE = 1 / 6
/** Bulles max pour toute la table à chacun des deux moments (réponses, révélation). */
export const QUIZ_TALKERS_PER_MOMENT = 1
/** On ne chambre le meneur qu'à partir de cette question (index) : avant, un classement ne veut rien dire. */
export const QUIZ_TEASE_FROM_QIDX = 2

type Seat = SpeechPlayer & { score: number; hasAnswered: boolean }

function tableOf(view: QuizClientView): SpeechTable<QuizSpeechKind, Seat> {
  const seats: Seat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    score: p.score,
    hasAnswered: p.hasAnswered,
  }))
  return readSpeechTable({
    players: seats,
    speech: view.speech ?? [],
    round: view.qIdx,
    engineCap: QUIZ_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
}

/** Les bots dans un ordre tournant tiré au sort : personne n'a la parole d'office. */
function rotation<T>(list: readonly T[], rand: () => number): T[] {
  if (list.length === 0) return []
  const start = Math.min(list.length - 1, Math.floor(rand() * list.length))
  return [...list.slice(start), ...list.slice(0, start)]
}

/**
 * L'assurance affichée d'un bot devant une question de difficulté `diff`,
 * ou null s'il se tait. Ni la bonne réponse ni son propre choix n'entrent
 * ici : ils ne sont pas encore tirés.
 */
export function quizConfidence(traits: BotTraits, diff: 1 | 2 | 3, rand: () => number): 'sure' | 'unsure' | null {
  switch (traits.trait) {
    case 'agressif':
      return 'sure'
    case 'prudent':
      return diff === 1 ? 'sure' : diff === 3 ? 'unsure' : null
    case 'farceur':
      // Le farceur bluffe comme il respire : son audace dit s'il crâne.
      return rand() < traits.audace ? 'sure' : 'unsure'
    case 'suiveur':
    default:
      return diff === 1 ? 'sure' : 'unsure'
  }
}

/**
 * La fanfaronnade jointe aux réponses des bots `botIds` (ceux qui buzzent
 * dans ce tick), 0 ou 1 parole. Elle vise un humain qui n'a pas encore
 * répondu (« Tu sèches, Riqui ? »), à défaut un humain présent.
 */
export function quizAnswerSay(view: QuizClientView, botIds: readonly string[], rand: () => number): QuizSayMove[] {
  if (view.phase !== 'question' || !view.currentQuestion) return []
  const table = tableOf(view)
  if (table.humans.length === 0) return []
  const already = table.speech.filter((sp) => QUIZ_SAY_KINDS_OF_PHASE.question.includes(sp.kind)).length
  if (already >= QUIZ_TALKERS_PER_MOMENT) return []
  const diff = view.currentQuestion.diff
  const talkers = table.bots.filter((b) => botIds.includes(b.id))
  for (const bot of rotation(talkers, rand)) {
    if (!table.underCap(bot.id)) continue
    const traits = table.traits(bot)
    if (rand() >= traits.bavardage * QUIZ_ANSWER_TALK_PER_BAVARDAGE) continue
    const kind = quizConfidence(traits, diff, rand)
    if (!kind) continue
    const slow = table.humans.filter((h) => !h.hasAnswered)
    const target = pick(slow.length > 0 ? slow : table.humans, rand)
    return [{ playerId: bot.id, kind, targetId: target.id }]
  }
  return []
}

/** Rang d'une réaction : le rappel de sa propre parole d'abord, le classement en dernier. */
const REACTION_RANK: Record<QuizSpeechKind, number> = {
  oops: 5,
  lucky: 5,
  asleep: 4,
  knewIt: 3,
  missed: 2,
  tease: 1,
  sure: 0,
  unsure: 0,
}

/**
 * La réaction d'un bot à la révélation, s'il en a une : la meilleure de
 * celles que SON résultat et la table lui permettent.
 *   • juste : lucky s'il avait dit « au pif », sinon knewIt — à un humain
 *     qui s'est trompé (personne à taquiner : rien) ;
 *   • faux : oops s'il avait crâné (à un humain, de préférence un qui a
 *     trouvé), sinon missed — à un humain qui a trouvé (« comment tu
 *     savais ça ? ») ;
 *   • asleep : à un humain qui n'a pas répondu ;
 *   • tease : au meneur humain, seul en tête, à partir de la 3e question.
 */
function reactionOf(
  view: QuizClientView,
  table: SpeechTable<QuizSpeechKind, Seat>,
  bot: Seat,
  rand: () => number
): QuizSayMove | null {
  const perPlayer = view.lastResult?.perPlayer ?? {}
  const humans = table.humans
  const right = humans.filter((h) => perPlayer[h.id]?.correct)
  const wrong = humans.filter((h) => perPlayer[h.id] && !perPlayer[h.id].correct)
  const asleep = humans.filter((h) => perPlayer[h.id]?.choice === null)
  const said = table.speech.find(
    (sp) => sp.playerId === bot.id && QUIZ_SAY_KINDS_OF_PHASE.question.includes(sp.kind)
  )?.kind
  const mine = perPlayer[bot.id]

  const options: QuizSayMove[] = []
  const add = (kind: QuizSpeechKind, targets: readonly Seat[]) => {
    if (targets.length > 0) options.push({ playerId: bot.id, kind, targetId: pick(targets, rand).id })
  }
  if (mine && mine.choice !== null) {
    if (mine.correct) {
      if (said === 'unsure') add('lucky', wrong.length > 0 ? wrong : humans)
      else add('knewIt', wrong)
    } else if (said === 'sure') {
      add('oops', right.length > 0 ? right : humans)
    } else {
      add('missed', right)
    }
  }
  add('asleep', asleep)
  if (view.qIdx >= QUIZ_TEASE_FROM_QIDX) {
    const top = Math.max(...view.players.map((p) => p.score))
    const leaders = view.players.filter((p) => p.score === top && !p.leftAt)
    const leader = leaders.length === 1 ? humans.find((h) => h.id === leaders[0].id) : undefined
    if (leader && top > 0) add('tease', [leader])
  }
  if (options.length === 0) return null
  return options.reduce((best, o) => (REACTION_RANK[o.kind] > REACTION_RANK[best.kind] ? o : best))
}

/**
 * La réaction de la table à la révélation qui vient de s'ouvrir : 0 ou 1
 * parole. Chaque bot à qui il reste une parole propose sa meilleure
 * réaction ; les mieux classées passent d'abord (à rang égal, un ordre
 * tournant tiré au sort) et chacun parle si son dé tombe sous
 * bavardage × QUIZ_REVEAL_TALK_PER_BAVARDAGE. Le premier qui parle clôt la
 * révélation.
 */
export function quizRevealSay(view: QuizClientView, rand: () => number): QuizSayMove[] {
  if (view.phase !== 'reveal' || !view.lastResult) return []
  const table = tableOf(view)
  if (table.humans.length === 0) return []
  const reactions = table.speech.filter((sp) => QUIZ_SAY_KINDS_OF_PHASE.reveal.includes(sp.kind))
  if (reactions.length >= QUIZ_TALKERS_PER_MOMENT) return []
  const candidates = rotation(table.bots, rand)
    .filter((b) => table.underCap(b.id))
    .map((bot) => ({ bot, move: reactionOf(view, table, bot, rand) }))
    .filter((c): c is { bot: Seat; move: QuizSayMove } => c.move !== null)
    // Tri stable : à rang égal, l'ordre tournant.
    .sort((a, b) => REACTION_RANK[b.move.kind] - REACTION_RANK[a.move.kind])
  for (const { bot, move } of candidates) {
    if (rand() < table.traits(bot).bavardage * QUIZ_REVEAL_TALK_PER_BAVARDAGE) return [move]
  }
  return []
}
