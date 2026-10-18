import { personaForBotName } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  MENTEUR_SPEECH_CAP,
  type MenteurClientView,
  type MenteurSpeech,
  type MenteurSpeechKind,
} from './engine'

/**
 * RÉACTIONS À LA RÉVÉLATION : quand les gobelets se lèvent, un bot du duel
 * réagit — « Je le savais ! » (gotcha), « J'aurais dû te croire » (wrongCall)
 * s'il a crié « Menteur ! », « Fallait me croire » (held) ou « Bien vu… »
 * (caught) si c'était son enchère.
 *
 * DÉRIVÉES, JAMAIS ÉCRITES : aucune action, aucun tick, aucune version. Tout
 * se lit sur la vue publique (lastReveal, le fil `speech`, les noms des
 * bots) et une graine tirée de la manche et du challenger : chaque téléphone
 * et la TV calculent la même bulle, et les dés de la vue — ceux du seul
 * spectateur — ne sont jamais lus.
 *
 * Une seule réaction par révélation : deux, et la révélation tournerait au
 * dialogue de bots. Seul un bot à persona réagit (ni humain, ni converti).
 * Priorité à la réaction qui vise un humain — c'est la sienne que le joueur
 * vient lire —, puis à l'auteur resté muet au défi : un challenger qui a déjà
 * lancé « Tu bluffes ! » avec son « Menteur ! » laisse la parole à
 * l'enchérisseur ; à égalité, le challenger d'abord, la révélation répond à
 * son défi. Chacun, dans cet ordre, parle si un tirage tombe sous
 * bavardage/3 et s'il lui reste du plafond de la manche, min(2, bavardage) ;
 * le premier qui parle clôt la révélation. Rien après un Calza : le pari
 * « pile » n'a pas d'enchérisseur démasqué à qui répondre.
 */

/** Ce que les réactions lisent : rien que du public, le même pour chaque téléphone et la TV. */
export type MenteurReactionView = Pick<MenteurClientView, 'phase' | 'round' | 'lastReveal' | 'speech'> & {
  players: readonly { id: string; name: string; isBot: boolean }[]
}

/** Les paroles qu'un « Menteur ! » porte : qui les a dites a déjà parlé au défi. */
const CHALLENGE_KINDS: readonly MenteurSpeechKind[] = ['suspect', 'again']

type Candidate = { speech: MenteurSpeech; aimsHuman: boolean; muteAtChallenge: boolean }

const rank = (c: Candidate) => (c.aimsHuman ? 2 : 0) + (c.muteAtChallenge ? 1 : 0)

/** 0 ou 1 réaction, à rendre derrière les paroles de l'état. */
export function menteurRevealReactions(view: MenteurReactionView): MenteurSpeech[] {
  const reveal = view.lastReveal
  if (view.phase !== 'reveal' || !reveal || (reveal.mode ?? 'dudo') !== 'dudo') return []
  const bidderId = reveal.bid.by
  const { challengerId, bidHeld } = reveal
  const round = view.round
  const roundSpeech = (view.speech ?? []).filter((sp) => sp.round === round)
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const aimsHuman = (targetId: string) => byId.get(targetId)?.isBot === false
  const challengerSpoke = roundSpeech.some(
    (sp) => sp.playerId === challengerId && CHALLENGE_KINDS.includes(sp.kind)
  )

  const candidates: Candidate[] = [
    {
      speech: { playerId: challengerId, kind: bidHeld ? 'wrongCall' : 'gotcha', targetId: bidderId, round },
      aimsHuman: aimsHuman(bidderId),
      muteAtChallenge: !challengerSpoke,
    },
    {
      speech: { playerId: bidderId, kind: bidHeld ? 'held' : 'caught', targetId: challengerId, round },
      aimsHuman: aimsHuman(challengerId),
      muteAtChallenge: true,
    },
  ]
  // Tri stable : à rang égal, l'ordre ci-dessus (le challenger d'abord).
  const ordered = [...candidates].sort((a, b) => rank(b) - rank(a))

  const rng = createRng(`${round}-${challengerId}`)
  for (const { speech } of ordered) {
    const author = byId.get(speech.playerId)
    const persona = author?.isBot ? personaForBotName(author.name) : null
    if (!persona || speech.playerId === speech.targetId) continue
    const said = roundSpeech.filter((sp) => sp.playerId === speech.playerId).length
    if (said >= Math.min(MENTEUR_SPEECH_CAP, persona.bavardage)) continue
    if (rng.next() < persona.bavardage / 3) return [speech]
  }
  return []
}
