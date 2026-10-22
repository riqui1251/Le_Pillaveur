import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import { pick, readSpeechTable, type SpeechPlayer } from '@/lib/online/bot-speech'
import {
  purpleSpeechRound,
  PURPLE_BET_META,
  PURPLE_SPEECH_CAP,
  type PurpleBet,
  type PurpleSay,
  type PurpleSpeechKind,
  type toPurpleClientView,
} from './engine'

/**
 * PAROLES DES BOTS DU PURPLE : au plus une bulle par coup, écrite dans la
 * même écriture que le coup qui la provoque — celui d'un bot comme celui
 * d'un humain. Aucun tick de plus.
 *
 * ANTI-FUITE : le planificateur ne lit que la vue CLIENT (paquet restant
 * masqué, sans la graine) avant et après le coup : il ne connaît pas la
 * carte suivante, et aucune phrase n'en parle (test sur les 4 langues).
 *
 *   • le coup d'un bot : panache (pari d'au moins deux cartes, gagné),
 *     dare (il continue, la cagnotte déjà chargée), handOff (il passe la
 *     main et la cagnotte au suivant) ;
 *   • la mauvaise pioche : le perdant, s'il est bot, se lamente (lament) ;
 *     UN autre bot, tiré au sort, chambre celui qui boit (mock).
 * La réaction qui vise un humain passe devant : c'est elle qu'il vient lire.
 *
 * Sobriété : chance par point de bavardage, audace et trait, plafond
 * min(2, bavardage) par bot et par fenêtre de tours (purpleSpeechRound). Une
 * table sans humain présent se tait. Les bots ne lisent jamais le fil : le
 * jeu est inchangé.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler, par point de bavardage, selon le kind. */
export const PURPLE_TALK_PER_BAVARDAGE: Record<PurpleSpeechKind, number> = {
  panache: 0.08,
  dare: 0.06,
  handOff: 0.06,
  lament: 0.08,
  mock: 0.06,
}
/** Jamais systématique : même le plus bavard se tait parfois. */
export const PURPLE_TALK_MAX = 0.85
/** Cagnotte à partir de laquelle continuer devient un défi, et boire un spectacle. */
export const PURPLE_BIG_POT = 3

export type PurplePublicView = Pick<
  ReturnType<typeof toPurpleClientView>,
  'players' | 'currentPlayer' | 'drinkCounter' | 'amountToDrink' | 'isCorrect' | 'pendingReveal' | 'turn' | 'speech'
>

export type PurpleSpeechEvent =
  | { type: 'bet'; playerId: string; bet: PurpleBet }
  | { type: 'continue'; playerId: string }
  | { type: 'pass'; playerId: string }

export function purpleTalkChance(kind: PurpleSpeechKind, traits: BotTraits, pot = 0): number {
  let chance = traits.bavardage * PURPLE_TALK_PER_BAVARDAGE[kind]
  const { trait, audace } = traits
  if (kind === 'panache' || kind === 'dare') chance += 0.25 * audace
  if (kind === 'mock' && (trait === 'farceur' || trait === 'agressif')) chance += 0.1
  if (kind === 'lament' && trait === 'prudent') chance += 0.1
  if ((kind === 'mock' || kind === 'handOff') && pot >= PURPLE_BIG_POT) chance += 0.1
  return Math.min(PURPLE_TALK_MAX, chance)
}

/** Le joueur suivant encore à table après `fromId`, comme le moteur passe la main. */
function nextActive(view: PurplePublicView, fromId: string): string | null {
  const n = view.players.length
  const at = view.players.findIndex((p) => p.id === fromId)
  if (at < 0) return null
  for (let step = 1; step < n; step += 1) {
    const p = view.players[(at + step) % n]
    if (!p.leftAt) return p.id
  }
  return null
}

type Candidate = { say: PurpleSay; chance: number }

/** La parole jointe au coup `event`, lue sur les vues `before` → `after`, ou rien. */
export function purpleBotSpeech(
  before: PurplePublicView,
  after: PurplePublicView,
  event: PurpleSpeechEvent,
  rand: () => number
): PurpleSay[] {
  if (!after.players.some((p) => !p.isBot && !p.leftAt)) return []
  const seats: SpeechPlayer[] = after.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, alive: !p.leftAt }))
  const table = readSpeechTable({
    players: seats,
    speech: after.speech ?? [],
    round: purpleSpeechRound(after),
    engineCap: PURPLE_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
  const candidate = (playerId: string, kind: PurpleSpeechKind, targetId: string | null, pot = 0): Candidate | null => {
    const author = table.byId.get(playerId)
    if (!author?.isBot || !author.alive || !targetId || targetId === playerId || !table.byId.has(targetId)) return null
    if (!table.underCap(playerId)) return null
    return { say: { playerId, kind, targetId }, chance: purpleTalkChance(kind, botTraitsFor(author.name), pot) }
  }

  const actorId = event.playerId
  const out: Candidate[] = []
  const push = (c: Candidate | null) => {
    if (c) out.push(c)
  }
  if (event.type === 'bet' && after.isCorrect === true) {
    if (PURPLE_BET_META[event.bet].cards >= 2) push(candidate(actorId, 'panache', nextActive(after, actorId)))
  } else if (event.type === 'bet' && after.pendingReveal) {
    const pot = after.amountToDrink
    push(candidate(actorId, 'lament', nextActive(after, actorId)))
    const mockers = after.players
      .map((p) => candidate(p.id, 'mock', actorId, pot))
      .filter((c): c is Candidate => c !== null)
    if (mockers.length > 0) push(pick(mockers, rand))
  } else if (event.type === 'continue' && before.drinkCounter >= PURPLE_BIG_POT) {
    push(candidate(actorId, 'dare', nextActive(after, actorId), before.drinkCounter))
  } else if (event.type === 'pass') {
    const holder = after.players[after.currentPlayer]?.id ?? null
    push(candidate(actorId, 'handOff', holder, after.drinkCounter))
  }

  const aimsHuman = (c: Candidate) => (table.byId.get(c.say.targetId)?.isBot === false ? 1 : 0)
  const ordered = [...out].sort((a, b) => aimsHuman(b) - aimsHuman(a))
  for (const { say, chance } of ordered) {
    if (rand() < chance) return [say]
  }
  return []
}
