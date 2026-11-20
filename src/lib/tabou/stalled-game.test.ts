import { describe, expect, it } from 'vitest'
import {
  createTabouState,
  reduceTabou,
  tabouGameIsDecided,
  tabouGameIsStalled,
  TABOU_BOT_DESCRIBER_ROUND_MS,
  TABOU_COUNTDOWN_MS,
  type TabouEntry,
  type TabouState,
} from './engine'
import { applyTabouBotAction, convertTabouPlayerToBot } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
  { word: 'Vélo', taboo: ['roue', 'pédale', 'guidon', 'chaîne'], diff: 1 },
  { word: 'Noël', taboo: ['sapin', 'cadeau', 'décembre', 'père Noël'], diff: 1 },
]
const T0 = 1_000_000
const GRACE = 180_000

/** p0 et p2 en équipe A, p1 et p3 en B ; manche 1 ouverte à T0, p0 décrit. */
function describing(n = 4): TabouState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
  }))
  const raw = createTabouState(players, WORDS, 'seed-stalled', T0 - TABOU_COUNTDOWN_MS, 20)
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const leave = (s: TabouState, playerId: string, at: number) => reduceTabou(s, { type: 'LEAVE', playerId, at })
const found = (s: TabouState, playerId: string, now: number) => reduceTabou(s, { type: 'FOUND', playerId, now })
const replaceLeft = (s: TabouState, now: number) => reduceTabou(s, { type: 'REPLACE_LEFT', now, graceMs: GRACE })
const next = (s: TabouState, playerId: string, now: number) =>
  reduceTabou(s, { type: 'CONTINUE', playerId, now })

/**
 * 2 contre 2. L'équipe A marque `pointsA`, puis p2 (A) quitte : bilan
 * immédiat. p3 (B) quitte pendant ce bilan. Il reste p0 et p1, un par équipe.
 */
function oneLeftPerTeam(pointsA: number): TabouState {
  let s = describing()
  for (let i = 0; i < pointsA; i += 1) s = found(s, 'p2', T0 + 1_000 + i)
  s = leave(s, 'p2', T0 + 10_000)
  expect(s.phase).toBe('roundEnd')
  return leave(s, 'p3', T0 + 11_000)
}

describe('Tabou — plus aucune équipe ne peut marquer', () => {
  it('partis remplacés par des bots : le « continuer » suivant arrête la partie sur le score', () => {
    const bilan = replaceLeft(oneLeftPerTeam(2), T0 + 200_000)
    expect(tabouGameIsStalled(bilan.players)).toBe(true)
    expect(tabouGameIsDecided(bilan)).toBe(true)

    const s = next(bilan, 'p0', T0 + 201_000)

    // Sans cela : des manches de 5 s à l'infini, personne ne peut plus marquer.
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
    expect(s.scores).toEqual({ A: 2, B: 0 })
    expect(s.winnerTeam).toBe('A')
  })

  it('à égalité : la partie s’arrête sans vainqueur', () => {
    const s = next(replaceLeft(oneLeftPerTeam(0), T0 + 200_000), 'p1', T0 + 201_000)

    expect(s.phase).toBe('finished')
    expect(s.winnerTeam).toBeNull()
  })

  it('tant qu’un partant peut encore revenir, la partie continue', () => {
    const bilan = oneLeftPerTeam(2)
    expect(tabouGameIsStalled(bilan.players)).toBe(false)

    const s = next(bilan, 'p0', T0 + 20_000)

    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(T0 + 20_000 + TABOU_BOT_DESCRIBER_ROUND_MS)
    expect(s.winnerTeam).toBeNull()
  })

  it('partis depuis plus de 3 min, jamais remplacés (aucun téléphone éveillé) : la partie s’arrête quand même', () => {
    // Le remplacement par un bot est déclenché par un téléphone : sur une table
    // qui ne regarde que la TV, il n'arrive pas. Passé le délai de retour, un
    // parti compte comme perdu pour la partie.
    const bilan = oneLeftPerTeam(2)
    const graceOver = T0 + 11_000 + GRACE
    expect(tabouGameIsStalled(bilan.players, graceOver - 1)).toBe(false)
    expect(tabouGameIsStalled(bilan.players, graceOver)).toBe(true)

    const tooEarly = next(bilan, 'p0', graceOver - 1)
    expect(tooEarly.phase).toBe('describing')

    const s = next(bilan, 'p0', graceOver)
    expect(s.phase).toBe('finished')
    expect(s.winnerTeam).toBe('A')
  })

  it('un seul des deux partis a dépassé le délai : l’autre équipe peut encore se reformer, la partie continue', () => {
    let s = describing()
    s = leave(s, 'p2', T0 + 10_000)
    s = leave(s, 'p3', T0 + 100_000)

    // À T0 + 10 s + 3 min, p2 est perdu pour A ; p3, parti plus tard, peut revenir.
    const at = T0 + 10_000 + GRACE
    expect(tabouGameIsStalled(s.players, at)).toBe(false)
    expect(next(s, 'p0', at).phase).toBe('describing')
  })

  it('une seule équipe hors jeu : l’autre continue de jouer', () => {
    let s = leave(describing(), 'p2', T0 + 10_000)
    s = replaceLeft(s, T0 + 200_000)
    expect(tabouGameIsStalled(s.players)).toBe(false)

    s = next(s, 'p0', T0 + 201_000)

    expect(s.phase).toBe('describing')
    expect(s.describerId).toBe('p1')
  })

  it('à 3 contre 3, il reste deux humains dans une équipe : la partie continue', () => {
    let s = describing(6)
    // A : p0, p2, p4 — B : p1, p3, p5. A perd deux joueurs, B un seul.
    s = leave(s, 'p2', T0 + 10_000)
    s = leave(s, 'p4', T0 + 11_000)
    s = leave(s, 'p5', T0 + 12_000)
    s = replaceLeft(s, T0 + 200_000)

    expect(tabouGameIsStalled(s.players)).toBe(false)
    expect(next(s, 'p0', T0 + 201_000).phase).toBe('describing')
  })

  it('un départ ne clôt jamais la partie, même le dernier qui la condamne', () => {
    // Équipe A déjà hors jeu (p2 remplacé), puis p3 quitte : il peut revenir.
    let s = leave(describing(), 'p2', T0 + 10_000)
    s = replaceLeft(s, T0 + 200_000)

    s = leave(s, 'p3', T0 + 201_000)

    expect(s.phase).toBe('roundEnd')
    expect(s.winnerTeam).toBeNull()
  })

  it('le bot meneur du bilan clôt aussi la partie', () => {
    // p0 puis p1 deviennent des bots (remplacement) : seuls p2 et p3 restent humains… un par équipe.
    let s = describing()
    s = leave(s, 'p0', T0 + 10_000)
    s = leave(s, 'p1', T0 + 11_000)
    s = replaceLeft(s, T0 + 200_000)
    expect(s.phase).toBe('roundEnd')

    const result = applyTabouBotAction(s)

    expect(result.ok && result.state.phase).toBe('finished')
  })

  it('au bilan, un joueur présent n’est pas convertible en bot : pas de victoire offerte par une requête forgée', () => {
    // B a déjà perdu p3 (remplacé) et mène ; A a encore ses deux humains et peut remonter.
    let s = { ...describing(), scores: { A: 0, B: 3 } }
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt ?? T0 })
    s = replaceLeft(leave(s, 'p3', T0 + 61_000), T0 + 300_000)
    expect(s.phase).toBe('roundEnd')
    expect(tabouGameIsStalled(s.players)).toBe(false)

    // Le remplacement pour inactivité vise le « joueur au tour » : au bilan,
    // le premier présent, p0. Converti, il bloquait la partie… au profit de B.
    expect(convertTabouPlayerToBot(s, 'p0')).toBeNull()
    // En manche, la conversion du décrivant inactif reste possible.
    expect(convertTabouPlayerToBot(describing(), 'p0')?.players[0].isBot).toBe(true)
  })

  it('score cible atteint : le vainqueur reste celui qui l’a atteint', () => {
    let s = describing()
    s = { ...s, scores: { A: 19, B: 3 } }
    s = found(s, 'p2', T0 + 1_000)
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt ?? T0 })
    expect(tabouGameIsDecided(s)).toBe(true)

    s = next(s, 'p0', T0 + 70_000)

    expect(s.phase).toBe('finished')
    expect(s.winnerTeam).toBe('A')
  })
})
