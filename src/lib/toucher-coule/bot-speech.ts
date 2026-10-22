import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import { pick, readSpeechTable, type SpeechPlayer } from '@/lib/online/bot-speech'
import {
  otherTeam,
  tcSpeechRound,
  TC_SPEECH_CAP,
  type TCClientView,
  type TCSay,
  type TCSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU TOUCHÉ-COULÉ : au plus une bulle par tir, écrite dans
 * la même écriture que le tir — celui d'un bot comme celui d'un humain.
 * Aucun tick de plus.
 *
 * ANTI-FUITE : le planificateur ne lit que la vue SPECTATEUR qui sort du tir
 * (navires intacts réduits à leurs cases touchées, des DEUX équipes) : il ne
 * sait pas plus où sont les navires qu'un écran TV. Le bot qui parle se
 * choisit sur le résultat public du tir (lastShot) et l'ordre de table,
 * jamais sur une position, et aucune phrase ne parle d'une case, d'une ligne
 * ou d'un voisinage (test sur les 4 langues).
 *
 *   • le tireur : sunk (il coule), bomb (sa Bombe ne coule rien), hit
 *     (touché), miss (à l'eau, adressé au tireur suivant) ;
 *   • la cible : lost (son navire coulé), ouch (touché), ou, sur un tir dans
 *     l'eau, taunt par UN bot de l'équipe visée, tiré au sort.
 * La réaction qui vise un humain passe devant ; à égalité, le tireur.
 *
 * Sobriété : chance par point de bavardage et bonus de trait, plafond
 * min(2, bavardage) par bot et par fenêtre de tours (tcSpeechRound). Une
 * table sans humain présent se tait. Les bots ne lisent jamais le fil : le
 * jeu et ses tirages sont inchangés.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler, par point de bavardage, selon le kind. */
export const TC_TALK_PER_BAVARDAGE: Record<TCSpeechKind, number> = {
  sunk: 0.25,
  bomb: 0.2,
  hit: 0.06,
  miss: 0.06,
  lost: 0.15,
  ouch: 0.06,
  taunt: 0.05,
}
/** Jamais systématique : même le plus bavard se tait parfois. */
export const TC_TALK_MAX = 0.85

/** Ce que le planificateur lit : la vue spectateur qui sort du tir. */
export type TCPublicView = Pick<
  TCClientView,
  'phase' | 'players' | 'turnOrder' | 'currentTurnIndex' | 'turnCount' | 'lastShot' | 'speech'
>

export function tcTalkChance(kind: TCSpeechKind, traits: BotTraits): number {
  let chance = traits.bavardage * TC_TALK_PER_BAVARDAGE[kind]
  const { trait } = traits
  if (kind === 'sunk' && trait === 'agressif') chance += 0.15
  if (kind === 'taunt' && (trait === 'agressif' || trait === 'farceur')) chance += 0.1
  if (kind === 'bomb' && trait === 'farceur') chance += 0.1
  if (kind === 'lost') chance += 0.4 * traits.rancune
  if (kind === 'ouch') chance += 0.2 * traits.rancune
  return Math.min(TC_TALK_MAX, chance)
}

type Candidate = { say: TCSay; chance: number }

/** La parole jointe au tir qui vient d'avoir lieu (`view.lastShot`), ou rien. */
export function tcBotSpeech(view: TCPublicView, rand: () => number): TCSay[] {
  const shot = view.lastShot
  if (!shot) return []
  if (!view.players.some((p) => !p.isBot && !p.leftAt)) return []
  const seats: SpeechPlayer[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
  }))
  const table = readSpeechTable({
    players: seats,
    speech: view.speech ?? [],
    round: tcSpeechRound(view),
    engineCap: TC_SPEECH_CAP,
    isRemark: () => false,
    isAsk: () => false,
  })
  const candidate = (playerId: string | null, kind: TCSpeechKind, targetId: string | null): Candidate | null => {
    const author = playerId ? table.byId.get(playerId) : undefined
    if (!author?.isBot || !author.alive || !targetId || targetId === author.id || !table.byId.has(targetId)) return null
    if (!table.underCap(author.id)) return null
    return { say: { playerId: author.id, kind, targetId }, chance: tcTalkChance(kind, botTraitsFor(author.name)) }
  }

  const shooterId = shot.shooterId
  const shooter = view.players.find((p) => p.id === shooterId)
  if (!shooter) return []
  const ownerId = shot.shipOwnerId
  const nextShooter = view.phase === 'battle' ? (view.turnOrder[view.currentTurnIndex] ?? null) : null
  const firstEnemy = view.players.find((p) => p.team === shot.targetTeam && !p.leftAt)?.id ?? null
  const out: Candidate[] = []
  const push = (c: Candidate | null) => {
    if (c) out.push(c)
  }

  if (shot.result === 'sunk') {
    push(candidate(shooterId, 'sunk', ownerId))
    push(candidate(ownerId, 'lost', shooterId))
  } else if (shot.bombResults) {
    push(candidate(shooterId, 'bomb', ownerId ?? nextShooter ?? firstEnemy))
    if (shot.result === 'hit') push(candidate(ownerId, 'ouch', shooterId))
  } else if (shot.result === 'hit') {
    push(candidate(shooterId, 'hit', ownerId))
    push(candidate(ownerId, 'ouch', shooterId))
  } else {
    push(candidate(shooterId, 'miss', nextShooter))
    // Un seul moqueur, tiré au sort dans l'équipe visée : jamais choisi sur
    // ses navires, et une grande équipe ne chambre pas plus qu'une petite.
    const mockers = view.players
      .filter((p) => p.team === otherTeam(shooter.team))
      .map((p) => candidate(p.id, 'taunt', shooterId))
      .filter((c): c is Candidate => c !== null)
    if (mockers.length > 0) push(pick(mockers, rand))
  }

  const aimsHuman = (c: Candidate) => (table.byId.get(c.say.targetId)?.isBot === false ? 1 : 0)
  const ordered = [...out].sort((a, b) => aimsHuman(b) - aimsHuman(a))
  for (const { say, chance } of ordered) {
    if (rand() < chance) return [say]
  }
  return []
}
