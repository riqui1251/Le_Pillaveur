import { personaForBotName } from '@/lib/online/bot-personas'
import { seededReactions, type ReactionCandidate } from '@/lib/online/bot-speech'
import { DIL_SPEECH_CAP, type DilClientView, type DilSpeech, type DilSpeechKind } from './engine'
import { dilMinorityChoice, dilWhoTally } from './reveal'

/**
 * RÉACTIONS À LA RÉVÉLATION DE DILEMMES : quand les votes tombent, un bot
 * réagit à ce qu'ils viennent de montrer — et à rien d'autre.
 *   • « Tu préfères » / « Je n'ai jamais » : outvoted (dans la minorité, il
 *     râle contre un humain de la majorité), teaseMinority (dans la majorité,
 *     il taquine un humain de la minorité), twin (même choix qu'un humain),
 *     spill (« Je n'ai jamais » : il a répondu jamais, un humain l'a fait) ;
 *     l'agressif et le farceur taquinent d'abord, la prudente et le suiveur
 *     cherchent d'abord un allié (twin) ;
 *   • « Qui de la table » : designated (le bot est le plus désigné, il
 *     répond à un humain qui l'a désigné), called (un humain est le plus
 *     désigné, le bot en rit).
 *
 * DÉRIVÉES, JAMAIS ÉCRITES : tout se lit sur la vue publique (lastReveal, la
 * carte, le fil `speech`) et une graine tirée de la manche et de la carte —
 * chaque téléphone et la TV rendent la même bulle. UNE réaction par
 * révélation : les cartes s'enchaînent vite, la table n'a pas le temps d'un
 * dialogue. Chaque réaction vise un humain encore à table ; rien sans lui.
 */

/** Réactions max à une révélation. */
export const DIL_REVEAL_REACTIONS_MAX = 1

/** Ce que les réactions lisent : rien que du public, le même pour chaque téléphone et la TV. */
export type DilReactionView = Pick<DilClientView, 'phase' | 'round' | 'card' | 'lastReveal' | 'speech'> & {
  players: readonly { id: string; name: string; isBot: boolean; leftAt: number | null }[]
}

export function dilRevealReactions(view: DilReactionView): DilSpeech[] {
  const reveal = view.lastReveal
  const card = view.card
  if (view.phase !== 'reveal' || !reveal || !card) return []
  const humans = view.players.filter((p) => !p.isBot && !p.leftAt)
  if (humans.length === 0) return []
  const round = view.round
  const choiceOf = (id: string) => reveal.find((r) => r.voterId === id)?.choice ?? null

  const candidates: ReactionCandidate<DilSpeechKind>[] = []
  const add = (playerId: string, kind: DilSpeechKind, targetId: string | undefined) => {
    if (!targetId || targetId === playerId) return
    candidates.push({ speech: { playerId, kind, targetId, round }, aimsHuman: true })
  }
  const bots = view.players.filter((p) => p.isBot && !p.leftAt)

  if (card.kind === 'who') {
    const tally = dilWhoTally(view.players, reveal)
    const topHuman = humans.find((h) => tally.topIds.includes(h.id))
    for (const bot of bots) {
      if (tally.topIds.includes(bot.id)) {
        const voters = tally.rows.find((r) => r.id === bot.id)?.voterIds ?? []
        add(bot.id, 'designated', humans.find((h) => voters.includes(h.id))?.id)
      }
      add(bot.id, 'called', topHuman?.id)
    }
  } else {
    const minority = dilMinorityChoice(reveal)
    for (const bot of bots) {
      const mine = choiceOf(bot.id)
      if (!mine) continue
      const humanWith = (pred: (choice: string | null) => boolean) => humans.find((h) => pred(choiceOf(h.id)))?.id
      const moves: [DilSpeechKind, string | undefined][] = []
      if (card.kind === 'never' && mine === 'B') moves.push(['spill', humanWith((c) => c === 'A')])
      if (minority && mine === minority) moves.push(['outvoted', humanWith((c) => c !== null && c !== minority)])
      if (minority && mine !== minority) moves.push(['teaseMinority', humanWith((c) => c === minority)])
      const twin: [DilSpeechKind, string | undefined] = ['twin', humanWith((c) => c === mine)]
      const trait = personaForBotName(bot.name)?.trait
      if (trait === 'prudent' || trait === 'suiveur') moves.unshift(twin)
      else moves.push(twin)
      for (const [kind, targetId] of moves) add(bot.id, kind, targetId)
    }
  }

  const label = card.kind === 'prefer' ? card.a : card.text
  return seededReactions({
    candidates,
    players: view.players,
    speech: view.speech ?? [],
    round,
    engineCap: DIL_SPEECH_CAP,
    max: DIL_REVEAL_REACTIONS_MAX,
    seed: `dilemmes#${round}#${label}`,
  })
}
