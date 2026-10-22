import type { BotTraits } from '@/lib/online/bot-personas'
import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
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
 * d'un humain. Aucun tick de plus. Le dé et le plafond sont ceux des jeux à
 * réactions (reaction-speech.ts : reactionSay).
 *
 * ANTI-FUITE : le planificateur ne lit que la vue CLIENT (paquet restant
 * masqué, sans la graine) avant et après le coup : il ne connaît pas la
 * carte suivante, et aucune phrase ne l'annonce (test sur les 4 langues).
 *
 *   • le coup d'un bot : panache (pari d'au moins deux cartes, gagné),
 *     dare (il continue, la cagnotte déjà chargée), handOff (il passe la
 *     main et la cagnotte au suivant) ;
 *   • la mauvaise pioche : le perdant, s'il est bot, se lamente (lament) ;
 *     UN autre bot, tiré au sort, chambre celui qui boit (mock).
 * La réaction qui vise un humain passe devant : c'est elle qu'il vient lire.
 *
 * Sobriété : un dé de parole par option (PURPLE_TALK à bavardage 2, l'audace
 * pour qui prend un risque), plafond min(2, bavardage) par bot et par
 * fenêtre de tours (purpleSpeechRound). Une table sans humain présent se
 * tait. Les bots ne lisent jamais le fil : le jeu est inchangé.
 *
 * PUR : `rand` injecté.
 */

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const PURPLE_TALK: Record<PurpleSpeechKind, number> = {
  panache: 0.12,
  dare: 0.1,
  handOff: 0.1,
  lament: 0.12,
  mock: 0.12,
}
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

type Option = ReactionOption<PurpleSpeechKind, SpeechPlayer>

/**
 * La chance de base d'un orateur DÉSIGNÉ (l'auteur du coup) : l'audace pour
 * le panache et le défi, la prudence pour la lamentation, la cagnotte chargée
 * pour qui la passe.
 */
export function purpleTalkBase(kind: PurpleSpeechKind, traits: BotTraits, pot = 0): number {
  let base = PURPLE_TALK[kind]
  if (kind === 'panache' || kind === 'dare') base += 0.5 * traits.audace
  if (kind === 'lament' && traits.trait === 'prudent') base += 0.2
  if (kind === 'handOff' && pot >= PURPLE_BIG_POT) base += 0.2
  return base
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

/** La parole jointe au coup `event`, lue sur les vues `before` → `after`, ou rien. */
export function purpleBotSpeech(
  before: PurplePublicView,
  after: PurplePublicView,
  event: PurpleSpeechEvent,
  rand: () => number
): PurpleSay[] {
  const seats: SpeechPlayer[] = after.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, alive: !p.leftAt }))
  const table = readReactionTable<PurpleSpeechKind, SpeechPlayer>(
    seats,
    after.speech ?? [],
    purpleSpeechRound(after),
    PURPLE_SPEECH_CAP
  )
  const actorId = event.playerId
  const actor = table.byId.get(actorId)
  if (!actor) return []
  const own = (kind: PurpleSpeechKind, targetId: string | null, pot = 0): Option | null =>
    targetId ? { speakers: [actor], kind, targetId, base: purpleTalkBase(kind, table.traits(actor), pot) } : null

  let options: (Option | null)[] = []
  if (event.type === 'bet' && after.isCorrect === true) {
    if (PURPLE_BET_META[event.bet].cards >= 2) options = [own('panache', nextActive(after, actorId))]
  } else if (event.type === 'bet' && after.pendingReveal) {
    const big = after.amountToDrink >= PURPLE_BIG_POT
    options = [
      own('lament', nextActive(after, actorId)),
      // Un seul moqueur, tiré au sort : une grande table ne chambre pas plus qu'une petite.
      { speakers: table.bots, kind: 'mock', targetId: actorId, base: PURPLE_TALK.mock + (big ? 0.2 : 0) },
    ]
  } else if (event.type === 'continue' && before.drinkCounter >= PURPLE_BIG_POT) {
    options = [own('dare', nextActive(after, actorId))]
  } else if (event.type === 'pass') {
    options = [own('handOff', after.players[after.currentPlayer]?.id ?? null, after.drinkCounter)]
  }

  const aimsHuman = (o: Option) =>
    typeof o.targetId === 'string' && table.byId.get(o.targetId)?.isBot === false ? 1 : 0
  const ordered = options.filter((o): o is Option => o !== null).sort((a, b) => aimsHuman(b) - aimsHuman(a))
  const say = reactionSay(table, ordered, Infinity, rand)
  return say?.targetId ? [{ playerId: say.playerId, kind: say.kind, targetId: say.targetId }] : []
}
