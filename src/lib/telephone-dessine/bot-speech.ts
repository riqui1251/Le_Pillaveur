import { pick, readSpeechTable, type SpeechPlayer } from '@/lib/online/bot-speech'
import {
  telephoneChainIntact,
  telephoneSpeechRound,
  TELEPHONE_SPEECH_CAP,
  type TelephoneClientView,
  type TelephoneSayMove,
  type TelephoneSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU TÉLÉPHONE DESSINÉ. Ses bots sont des déserteurs
 * convertis (la partie ne se lance pas avec des bots : un maillon tenu par
 * un bot dès le départ casserait la surprise finale). Ils se taisent pendant
 * les manches — chacun écrit ou dessine, rien à commenter qui ne trahirait
 * pas un maillon — et ne parlent qu'au moment qui fait tout le jeu : la
 * chute d'une chaîne, quand elle est ENTIÈRE à l'écran. Une bulle au plus
 * par chaîne :
 *   • intact — la phrase d'arrivée est celle de départ (« Transmission
 *     parfaite ! ») : rare, elle passe avant tout ;
 *   • encore — la dernière chaîne vient de tomber, une fois sur deux ;
 *   • mine — c'était SA chaîne (« rendez-moi ma phrase ! ») ;
 *   • laugh — on s'esclaffe devant celle d'un autre.
 * La cible est le propriétaire de la chaîne quand c'est un humain présent
 * (son nom est à l'écran), sinon un humain présent tiré au sort — chacun a
 * mis la main à chaque chaîne.
 *
 * CE QUE LE BOT A LE DROIT DE SAVOIR : le planificateur ne lit que la vue
 * PUBLIQUE (spectateur) et ne parle que si la chaîne affichée est complète
 * (`links` ne porte que les maillons dévoilés) ; pendant les manches, rien.
 * Le moteur refuse d'ailleurs toute parole avant la chute.
 *
 * PUR : `rand` injecté.
 */

/** Chance de réagir à la chute, par point de bavardage (un converti, 2 : deux fois sur trois). */
export const TELEPHONE_TALK_PER_BAVARDAGE = 1 / 3
/** À la dernière chaîne, part des réactions qui en redemandent plutôt que de rire. */
export const TELEPHONE_ENCORE_SHARE = 0.5

export function telephoneBotSay(view: TelephoneClientView, rand: () => number): TelephoneSayMove[] {
  const chain = view.revealChain
  if (view.phase !== 'reveal' || !chain || chain.links.length < chain.linkCount) return []
  const round = telephoneSpeechRound(view)
  const seats: SpeechPlayer[] = view.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, alive: !p.leftAt }))
  const table = readSpeechTable<TelephoneSpeechKind, SpeechPlayer>({
    players: seats,
    speech: view.speech ?? [],
    round,
    engineCap: TELEPHONE_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
  if (table.humans.length === 0 || table.speech.length > 0) return []
  const ownerId = view.revealOrder[view.revealIdx]
  const owner = table.humans.find((h) => h.id === ownerId)
  const intact = telephoneChainIntact(chain.links)
  const last = view.revealIdx === view.revealOrder.length - 1
  const start = Math.min(table.bots.length - 1, Math.floor(rand() * table.bots.length))
  const order = [...table.bots.slice(start), ...table.bots.slice(0, start)]
  for (const bot of order) {
    if (!table.underCap(bot.id)) continue
    if (rand() >= table.traits(bot).bavardage * TELEPHONE_TALK_PER_BAVARDAGE) continue
    const kind: TelephoneSpeechKind = intact
      ? 'intact'
      : last && rand() < TELEPHONE_ENCORE_SHARE
        ? 'encore'
        : bot.id === ownerId
          ? 'mine'
          : 'laugh'
    const target = owner && kind !== 'mine' ? owner : pick(table.humans, rand)
    return [{ playerId: bot.id, kind, targetId: target.id }]
  }
  return []
}
