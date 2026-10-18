import { botTraitsFor } from '@/lib/online/bot-personas'
import {
  botsByTempo,
  lastHumanSpeech,
  reactionBudget,
  reactionDare,
  standsBy,
  type SpeechTable,
} from '@/lib/online/bot-speech'
import { ESPION_ANY } from './data/questions'
import {
  espionActive,
  espionAskError,
  espionFreeSpeechLeft,
  espionRoundSpeech,
  pendingEspionQuestion,
  reduceEspion,
  toEspionClientView,
  toEspionSpectatorView,
  type EspionAction,
  type EspionClientView,
  type EspionSpeech,
  type EspionSpeechKind,
  type EspionState,
} from './engine'
import {
  espionAllyShare,
  espionAnswerVerdict,
  espionBotAccusation,
  espionBotAnswer,
  espionDesperateGuess,
  espionFollowUp,
  espionLastCallTarget,
  espionPickQuestion,
  espionPickTarget,
  espionSupports,
  espionVoluntaryGuess,
  type EspionBotDeps,
  type EspionMind,
} from './bot-brain'
import {
  espionAskTargets,
  espionAccusedOnTheBrink,
  espionBotsMaySpeak,
  espionDueBotEvents,
  espionHash01,
  espionSpeechTable,
  type EspionSpeechSeat,
} from './bot-tick'

/**
 * PLANIFICATEUR DES BOTS DE L'ESPION : un tick = UNE écriture.
 *
 * Il n'agit que quand une échéance publique du calendrier (bot-tick.ts) est
 * due, et toute échéance due produit un coup, dans cet ordre :
 *   (1) l'espion bot accusé, à une voix de tomber, tente le lieu ;
 *   (2) les bots dont l'instant de décision est échu soutiennent ou refusent
 *       l'accusation, d'un seul coup, avec au plus une bulle affichée (les
 *       suivantes attendent le tick d'après) ;
 *   (3) le bot interrogé répond ;
 *   (4) l'espion bot, assez sûr de lui, devine ;
 *   (5) un bot accuse sur preuves (ou l'espion, en diversion) ;
 *   (6) dernier appel : le bot le plus audacieux accuse ;
 *   (R) une réaction que seule la vue d'un bot peut décider : la réponse
 *       d'un humain jure avec son lieu (« on parle bien du même endroit ? »)
 *       ou la reprend (« bien répondu ! »), la suite d'un « je trouve ça
 *       louche » humain ;
 *   (7) la question suivante, posée par le bot qui a la main ;
 *   (8) les paroles que la table publique décide (`speak`) : le bot accusé
 *       par un humain se défend, les remarques d'ouverture sur l'espion de
 *       la manche d'avant ;
 *   (9) sinon rien : NOT_BOT_TURN.
 * (4), (5) et (R) dépendent d'un secret : ils n'ont pas d'échéance propre et
 * passent devant (6) ou (7), qui garantissent l'écriture. Les réactions
 * viennent après les coups du lot 3 ; (R) seule passe devant la question,
 * faute de quoi elle n'aurait jamais de tick à elle.
 *
 * Parcimonie : une parole libre de bot reste sous min(ESPION_SPEECH_CAP,
 * bavardage) — sauf la défense de l'accusé, sous le seul plafond du moteur —,
 * une seule réaction par réponse humaine, une approbation au plus par humain
 * et par manche, deux réponses au plus à un « je trouve ça louche », et
 * aucune parole dans les 10 dernières secondes.
 *
 * ANTI-TRICHE : l'état brut ne sert qu'à bâtir la vue publique (le calendrier,
 * la table des paroles) et la vue CLIENT de chaque bot ; chaque décision ne
 * lit que celle-ci, ses traits et le carnet prêté (deps). Le planificateur ne
 * lit jamais un rôle ni le lieu : c'est la vue d'un bot qui lui dit s'il est
 * l'espion.
 *
 * PUR : `rand` et `now` injectés, aucun curseur — tout se relit dans le fil.
 * Il rend la liste des actions de l'écriture (plusieurs pour la décision
 * groupée), que l'adaptateur applique dans l'ordre.
 */

type Kind = EspionSpeechKind
type Seat = EspionSpeechSeat

/** Fenêtre d'une réaction : passé 30 s, la réponse ou la pique humaine est de l'histoire ancienne. */
export const ESPION_REACT_WINDOW_MS = 30_000

function mindOf(state: EspionState, botId: string, now: number): EspionMind {
  const bot = state.players.find((p) => p.id === botId)
  return { view: toEspionClientView(state, botId), botId, traits: botTraitsFor(bot?.name), now }
}

function speak(playerId: string, kind: Kind, targetId: string, now: number): EspionAction {
  return { type: 'SPEAK', playerId, kind, targetId, now }
}

/** Le dernier soutien et le dernier refus ont déjà leur bulle : tout ce qui suit est inscrit en silence. */
function bubblesSpent(state: EspionState): boolean {
  const speech = state.speech ?? []
  const opened = speech.map((sp) => sp.kind).lastIndexOf('accuse')
  const since = speech.slice(opened + 1)
  return since.some((sp) => sp.kind === 'rally') && since.some((sp) => sp.kind === 'doubt')
}

/** (2) Décision groupée des bots échus, dans l'ordre de leurs instants. */
function groupDecision(
  state: EspionState,
  deciders: readonly string[],
  now: number,
  rand: () => number,
  deps: EspionBotDeps
): EspionAction[] {
  const actions: EspionAction[] = []
  let current = state
  let shown = false
  for (const botId of deciders) {
    if (current.phase !== 'discussion' || !current.activeAccusation) break
    // Une seule bulle par écriture : au-delà, seules des entrées silencieuses passent encore.
    // Ces soutiens silencieux enchaînés peuvent franchir « majorité − 1 » sans
    // laisser passer la devinette désespérée (1) : rare à 5 sièges, la règle à 8.
    // Couper là rend sa chance à l'espion bot, mais fait tomber l'équipe sous les
    // bornes de la simulation (A8 38 %, A8 en 5 min 33 %, A16 16 %) : à trancher
    // avec la mesure, pas en passant.
    if (shown && !bubblesSpent(current)) break
    const supports = espionSupports(mindOf(current, botId, now), deps, rand)
    const action: EspionAction = { type: supports ? 'SUPPORT' : 'DECLINE', playerId: botId, now }
    const next = reduceEspion(current, action)
    const written = (next.speech ?? []).slice((current.speech ?? []).length)
    if (written.some((sp) => !sp.quiet)) shown = true
    actions.push(action)
    current = next
  }
  return actions
}

// ─── (R) Réactions qui dépendent de la vue de chaque bot ─────────────────────

type ReactCtx = {
  state: EspionState
  pub: EspionClientView
  table: SpeechTable<Kind, Seat>
  now: number
  rand: () => number
  deps: EspionBotDeps
  mind: (botId: string) => EspionMind
}

const isBotId = (ctx: ReactCtx, id: string) => Boolean(ctx.table.byId.get(id)?.isBot)

/** Au plus une approbation de bot par humain et par manche. */
const alliedThisRound = (ctx: ReactCtx, humanId: string) =>
  ctx.table.speech.some((sp) => sp.kind === 'ally' && sp.targetId === humanId && isBotId(ctx, sp.playerId))

/**
 * La dernière réponse PRÉCISE d'un humain présent, de moins de 30 s, que nul
 * bot n'a encore relevée (approuvée, soupçonnée ou accusée) : une seule
 * réaction par réponse.
 *   • suspect : le plus audacieux des bots pour qui elle jure avec son lieu ;
 *   • ally : sinon, le plus rapide pour qui elle colle, avec une chance de
 *     0,15 + 0,3 × loyauté — un seul dé par réponse, haché sur la réponse :
 *     un dé qui échoue n'écrit rien, il ne doit pas se relancer au tick
 *     suivant.
 */
function answerReactionOf(ctx: ReactCtx): EspionAction | null {
  const { table, now, deps } = ctx
  const speech = espionRoundSpeech(ctx.pub)
  let index = -1
  for (let i = speech.length - 1; i >= 0 && index < 0; i -= 1) {
    if (speech[i].kind === 'answer' && !isBotId(ctx, speech[i].playerId)) index = i
  }
  if (index < 0) return null
  const heard = speech[index]
  const author = table.byId.get(heard.playerId)
  if (!author?.alive || !heard.value || heard.value === ESPION_ANY || now - heard.at > ESPION_REACT_WINDOW_MS) return null
  const noticed = speech
    .slice(index + 1)
    .some((sp) => sp.targetId === author.id && isBotId(ctx, sp.playerId) && (sp.kind === 'suspect' || sp.kind === 'ally' || sp.kind === 'accuse'))
  if (noticed) return null
  const ready = botsByTempo(table).filter((b) => table.underCap(b.id))
  const verdict = (bot: Seat) => espionAnswerVerdict(ctx.mind(bot.id), heard, deps)
  const daring = [...ready].sort((a, b) => table.traits(b).audace - table.traits(a).audace)
  const critic = daring.find((bot) => verdict(bot) === 'clash')
  if (critic) return speak(critic.id, 'suspect', author.id, now)
  if (alliedThisRound(ctx, author.id)) return null
  const fan = ready.find((bot) => verdict(bot) === 'match')
  if (!fan) return null
  const roll = espionHash01(`${fan.id}~ally~${heard.at}`)
  return roll < espionAllyShare(table.traits(fan)) ? speak(fan.id, 'ally', author.id, now) : null
}

/**
 * La suite d'un « je trouve ça louche » humain : la cible bot se défend
 * d'abord (échéance publique), puis UN autre bot abonde ou la couvre
 * (espionFollowUp) — deux réponses au plus (reactionBudget), un bot déjà
 * engagé ne revenant qu'en osant (reactionDare). Un fidèle de la cible la
 * couvre toujours.
 */
function followUpOf(ctx: ReactCtx): EspionAction | null {
  const { table, now, rand, deps } = ctx
  const last = lastHumanSpeech(table)
  if (!last || last.speech.kind !== 'suspect' || !last.speech.targetId) return null
  if (now - (last.speech as EspionSpeech).at > ESPION_REACT_WINDOW_MS) return null
  const target = table.byId.get(last.speech.targetId)
  if (!target?.alive) return null
  const { index } = last
  // La défense de l'accusé passe d'abord : elle a son échéance, et compte dans les deux réponses.
  if (target.isBot && !table.spokeAfter(target.id, index) && espionFreeSpeechLeft(ctx.pub, target.id) > 0) return null
  const { answers, left } = reactionBudget(table, index)
  if (left <= 0) return null
  const dares = reactionDare(table, { answers, accusedId: target.isBot ? target.id : null, rand })
  for (const bot of botsByTempo(table)) {
    if (bot.id === target.id || !table.underCap(bot.id) || table.spokeAfter(bot.id, index) || !dares(bot)) continue
    const kind = standsBy(table, bot, target.id) ? 'ally' : espionFollowUp(ctx.mind(bot.id), target.id, deps)
    if (!kind) continue
    if (kind === 'ally' && !target.isBot && alliedThisRound(ctx, target.id)) continue
    return speak(bot.id, kind, target.id, now)
  }
  return null
}

function reactionOf(state: EspionState, pub: EspionClientView, now: number, rand: () => number, deps: EspionBotDeps): EspionAction | null {
  if (!espionBotsMaySpeak(pub, now, now)) return null
  const table = espionSpeechTable(pub)
  if (table.humans.length === 0 || table.bots.length === 0) return null
  const minds = new Map<string, EspionMind>()
  const ctx: ReactCtx = {
    state,
    pub,
    table,
    now,
    rand,
    deps,
    mind: (botId) => {
      let m = minds.get(botId)
      if (!m) {
        m = mindOf(state, botId, now)
        minds.set(botId, m)
      }
      return m
    },
  }
  return answerReactionOf(ctx) ?? followUpOf(ctx)
}

// ─── Le tick ─────────────────────────────────────────────────────────────────

export function espionBotMove(
  state: EspionState,
  now: number,
  rand: () => number,
  deps: EspionBotDeps
): EspionAction[] | null {
  if (state.phase !== 'discussion') return null
  const pub = toEspionSpectatorView(state)
  const due = espionDueBotEvents(pub, now)
  if (due.length === 0) return null
  const acc = state.activeAccusation

  // (1)
  if (acc && now < acc.endsAt && espionAccusedOnTheBrink(pub)) {
    const accused = espionActive(state).find((p) => p.id === acc.targetId)
    if (accused?.isBot) {
      const locationId = espionDesperateGuess(mindOf(state, accused.id, now), deps, rand)
      if (locationId) return [{ type: 'GUESS_LOCATION', playerId: accused.id, locationId, now }]
    }
  }

  // (2)
  const deciders = due.filter((ev) => ev.kind === 'decide').map((ev) => ev.botId)
  if (deciders.length > 0 && acc && now < acc.endsAt) {
    const actions = groupDecision(state, deciders, now, rand, deps)
    if (actions.length > 0) return actions
  }

  // (3)
  const answer = due.find((ev) => ev.kind === 'answer')
  const pending = pendingEspionQuestion(state, now)
  if (answer && pending && pending.targetId === answer.botId) {
    const value = espionBotAnswer(mindOf(state, answer.botId, now), pending.questionId, rand, deps)
    return [{ type: 'ANSWER', playerId: answer.botId, value, now }]
  }

  const turn = due.find((ev) => ev.kind === 'turn')
  const lastCall = due.find((ev) => ev.kind === 'lastCall')
  if ((turn || lastCall) && !acc) {
    const move = turnMove(state, pub, now, rand, deps, turn?.botId ?? null, lastCall?.botId ?? null)
    if (move) return move
  }

  // (8)
  const said = due.find((ev) => ev.kind === 'speak' && ev.say)
  if (said?.say) return [speak(said.botId, said.say.kind, said.say.targetId, now)]
  return null
}

/** (4) à (7) : ce qui passe quand une question ou un dernier appel sont dus. */
function turnMove(
  state: EspionState,
  pub: EspionClientView,
  now: number,
  rand: () => number,
  deps: EspionBotDeps,
  turnBotId: string | null,
  lastCallBotId: string | null
): EspionAction[] | null {
  const bots = botsByTempo(espionSpeechTable(pub))

  // (4)
  for (const bot of bots) {
    const locationId = espionVoluntaryGuess(mindOf(state, bot.id, now), deps)
    if (locationId) return [{ type: 'GUESS_LOCATION', playerId: bot.id, locationId, now }]
  }

  // (5)
  for (const bot of bots) {
    const targetId = espionBotAccusation(mindOf(state, bot.id, now), deps)
    if (targetId) return [{ type: 'ACCUSE', playerId: bot.id, targetId, now }]
  }

  // (6)
  if (lastCallBotId) {
    const targetId = espionLastCallTarget(mindOf(state, lastCallBotId, now), deps)
    if (targetId) return [{ type: 'ACCUSE', playerId: lastCallBotId, targetId, now }]
  }

  if (!turnBotId) return null

  // (R)
  const reaction = reactionOf(state, pub, now, rand, deps)
  if (reaction) return [reaction]

  // (7)
  const mind = mindOf(state, turnBotId, now)
  const targetId = espionPickTarget(mind, espionAskTargets(pub, turnBotId, now), deps, rand)
  if (!targetId) return null
  const questionId = espionPickQuestion(mind, deps, rand, targetId)
  if (espionAskError(state, turnBotId, targetId, questionId, now) !== null) return null
  return [{ type: 'ASK', playerId: turnBotId, targetId, questionId, now }]
}
