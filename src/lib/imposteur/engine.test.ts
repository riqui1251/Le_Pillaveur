import { describe, expect, it } from 'vitest'
import {
  createImposteurState,
  currentImposteurActorId,
  imposteurAlive,
  imposteurCountFor,
  isValidClue,
  maxImposteurCount,
  reduceImposteur,
  toImposteurClientView,
  toImposteurSpectatorView,
  ImposteurEngineError,
  IMPOSTEUR_CLUE_MS,
  IMPOSTEUR_COUNTDOWN_MS,
  IMPOSTEUR_EMPTY_CLUE,
  IMPOSTEUR_SIPS_CIVIL_OUT,
  IMPOSTEUR_SIPS_PER_ALIVE,
  IMPOSTEUR_VOTE_MS,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const PAIRS: ImposteurWordPair[] = [
  { a: 'plage', b: 'piscine' },
  { a: 'café', b: 'thé' },
]

const T0 = 1_000_000
const FOUR = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }))

/** Partie créée puis countdown consommé : phase indice pile à T0. */
function make(n = 4, seed: string | number = 'seed'): ImposteurState {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
  }))
  const raw = createImposteurState(players, PAIRS, seed, T0 - IMPOSTEUR_COUNTDOWN_MS)
  return reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Fait donner un indice à l'acteur courant (toujours valide). */
function clueAll(state: ImposteurState, now = T0): ImposteurState {
  let s = state
  while (s.phase === 'clue') {
    const actor = s.clueOrder[s.clueTurnIdx]
    s = reduceImposteur(s, { type: 'CLUE', playerId: actor, text: 'indice', now })
  }
  return s
}

describe('createImposteurState', () => {
  it('assigne 1 imposteur (<7) puis 2 (>=7), mots par camp, reproductible', () => {
    expect(imposteurCountFor(4)).toBe(1)
    expect(imposteurCountFor(6)).toBe(1)
    expect(imposteurCountFor(7)).toBe(2)
    const s = make(4)
    const imposteurs = s.players.filter((p) => p.team === 'imposteur')
    const civils = s.players.filter((p) => p.team === 'civil')
    expect(imposteurs).toHaveLength(1)
    expect(civils).toHaveLength(3)
    // Tous les civils partagent un mot, l'imposteur a L'AUTRE mot de la paire.
    const civilWord = civils[0].word
    expect(civils.every((p) => p.word === civilWord)).toBe(true)
    expect(imposteurs[0].word).not.toBe(civilWord)
    const pair = PAIRS.find(
      (pp) =>
        (pp.a === civilWord && pp.b === imposteurs[0].word) ||
        (pp.b === civilWord && pp.a === imposteurs[0].word)
    )
    expect(pair).toBeTruthy()
    expect(make(4)).toEqual(make(4)) // même graine → même partie
    const seven = make(7)
    expect(seven.players.filter((p) => p.team === 'imposteur')).toHaveLength(2)
  })

  it('borne 3-16 joueurs, countdown au lancement puis phase indice chronométrée', () => {
    expect(() => createImposteurState(FOUR.slice(0, 2), PAIRS, 1, T0)).toThrow(
      ImposteurEngineError
    )
    expect(createImposteurState(FOUR.slice(0, 3), PAIRS, 1, T0).players).toHaveLength(3)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createImposteurState(seventeen, PAIRS, 1, T0)).toThrow(ImposteurEngineError)
    // La partie s'ouvre sur le compte à rebours, pas directement sur l'indice.
    const raw = createImposteurState(FOUR, PAIRS, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + IMPOSTEUR_COUNTDOWN_MS)
    expect(() =>
      reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    ).toThrow('NOT_EXPIRED')
    const s = make(4)
    expect(s.phase).toBe('clue')
    expect(s.phaseEndsAt).toBe(T0 + IMPOSTEUR_CLUE_MS)
    expect(s.clueOrder).toHaveLength(4)
  })
})

describe('nombre d’imposteurs configurable', () => {
  it('maxImposteurCount : toujours minoritaires, plafonné à 3', () => {
    expect(maxImposteurCount(3)).toBe(1)
    expect(maxImposteurCount(4)).toBe(1)
    expect(maxImposteurCount(5)).toBe(2)
    expect(maxImposteurCount(6)).toBe(2)
    expect(maxImposteurCount(7)).toBe(3)
    expect(maxImposteurCount(10)).toBe(3) // plafond, malgré floor((10-1)/2)=4
  })

  it('createImposteurState honore un imposteurCount explicite', () => {
    const s = createImposteurState(Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), PAIRS, 1, T0, 3)
    expect(s.imposteurCount).toBe(3)
    expect(s.players.filter((p) => p.team === 'imposteur')).toHaveLength(3)
  })

  it('refuse un imposteurCount hors bornes', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createImposteurState(seven, PAIRS, 1, T0, 0)).toThrow('INVALID_IMPOSTEUR_COUNT')
    expect(() => createImposteurState(seven, PAIRS, 1, T0, 4)).toThrow('INVALID_IMPOSTEUR_COUNT') // max(7)=3
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createImposteurState(four, PAIRS, 1, T0, 2)).toThrow('INVALID_IMPOSTEUR_COUNT') // max(4)=1
  })

  it('sans imposteurCount, retombe sur le défaut historique (imposteurCountFor)', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const s = createImposteurState(six, PAIRS, 1, T0)
    expect(s.imposteurCount).toBe(imposteurCountFor(6))
  })

  it('victoire imposteur généralisée : parité déclenche la victoire pour N>1 imposteurs', () => {
    // 5 joueurs, 2 imposteurs (max pour 5) : à 4 vivants (2 imp + 2 civils),
    // la parité est déjà atteinte — l'ancien seuil fixe (alive<=3) ne l'aurait pas détecté.
    const raw = createImposteurState(
      Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      PAIRS,
      'parity',
      T0 - IMPOSTEUR_COUNTDOWN_MS,
      2
    )
    const s0 = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    expect(s0.imposteurCount).toBe(2)
    const civils = s0.players.filter((p) => p.team === 'civil')
    expect(civils).toHaveLength(3)

    // Élimine un civil → 4 vivants (2 imposteurs + 2 civils) = parité.
    let s = clueAll(s0, T0)
    for (const p of imposteurAlive(s)) {
      const targetId = p.id === civils[0].id ? civils[1].id : civils[0].id
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId, now: T0 })
    }
    expect(s.lastReveal?.eliminatedId).toBe(civils[0].id)
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[0].id, now: T0 })
    expect(done.phase).toBe('finished')
    expect(done.winnerTeam).toBe('imposteur')
  })
})

describe('isValidClue', () => {
  it('refuse le vide, le trop long et son propre mot (accents inclus)', () => {
    expect(isValidClue('été', 'piscine')).toBe(true)
    expect(isValidClue('', 'piscine')).toBe(false)
    expect(isValidClue('   ', 'piscine')).toBe(false)
    expect(isValidClue('x'.repeat(31), 'piscine')).toBe(false)
    expect(isValidClue('piscine', 'piscine')).toBe(false)
    expect(isValidClue('PISCINES', 'piscine')).toBe(false) // contient le mot
    expect(isValidClue('pisc', 'piscine')).toBe(false) // fragment parlant interdit
    expect(isValidClue('la', 'plage')).toBe(true) // petit mot accidentel permis
    expect(isValidClue('cafe', 'café')).toBe(false) // accents normalisés
    expect(isValidClue(IMPOSTEUR_EMPTY_CLUE, 'piscine')).toBe(true) // « … » auto
  })
})

describe('phase indice', () => {
  it('chacun parle à son tour, puis on passe au vote', () => {
    let s = make(4)
    const first = s.clueOrder[0]
    expect(currentImposteurActorId(s)).toBe(first)
    expect(() =>
      reduceImposteur(s, { type: 'CLUE', playerId: s.clueOrder[1], text: 'x', now: T0 })
    ).toThrow('NOT_YOUR_TURN')
    s = reduceImposteur(s, { type: 'CLUE', playerId: first, text: 'soleil', now: T0 })
    expect(s.clues).toEqual([{ playerId: first, text: 'soleil', round: 1 }])
    expect(s.phase).toBe('clue')
    s = clueAll(s)
    expect(s.phase).toBe('vote')
    expect(s.clues).toHaveLength(4)
    expect(s.phaseEndsAt).toBe(T0 + IMPOSTEUR_VOTE_MS)
  })

  it("l'indice contenant son propre mot est rejeté", () => {
    const s = make(4)
    const actor = s.players.find((p) => p.id === s.clueOrder[0])!
    expect(() =>
      reduceImposteur(s, { type: 'CLUE', playerId: actor.id, text: actor.word, now: T0 })
    ).toThrow('INVALID_CLUE')
  })

  it('ADVANCE au timeout → indice automatique « … »', () => {
    const s = make(4)
    const key = phaseKey(s)
    expect(() =>
      reduceImposteur(s, { type: 'ADVANCE', claimedKey: key, now: T0 + 1000 })
    ).toThrow('NOT_EXPIRED')
    const after = reduceImposteur(s, {
      type: 'ADVANCE',
      claimedKey: key,
      now: T0 + IMPOSTEUR_CLUE_MS,
    })
    expect(after.clues[0].text).toBe(IMPOSTEUR_EMPTY_CLUE)
    expect(after.clueTurnIdx).toBe(1)
    // L'ancienne clé ne peut pas faire avancer deux fois.
    expect(() =>
      reduceImposteur(after, { type: 'ADVANCE', claimedKey: key, now: T0 + IMPOSTEUR_CLUE_MS * 2 })
    ).toThrow('PHASE_CHANGED')
  })
})

describe('vote', () => {
  it('secret, un seul vote, ni soi-même ni un éliminé — dépouillé quand tous ont voté', () => {
    let s = clueAll(make(4))
    const [v1, v2, v3, v4] = s.players.map((p) => p.id)
    expect(() =>
      reduceImposteur(s, { type: 'VOTE', playerId: v1, targetId: v1, now: T0 })
    ).toThrow('CANNOT_VOTE_SELF')
    s = reduceImposteur(s, { type: 'VOTE', playerId: v1, targetId: v2, now: T0 })
    expect(() =>
      reduceImposteur(s, { type: 'VOTE', playerId: v1, targetId: v3, now: T0 })
    ).toThrow('ALREADY_VOTED')
    s = reduceImposteur(s, { type: 'VOTE', playerId: v2, targetId: v2 === v1 ? v3 : v1, now: T0 })
    s = reduceImposteur(s, { type: 'VOTE', playerId: v3, targetId: v2, now: T0 })
    expect(s.phase).toBe('vote')
    s = reduceImposteur(s, { type: 'VOTE', playerId: v4, targetId: v2, now: T0 })
    expect(s.phase).toBe('reveal') // dernier vote → dépouillement immédiat
    expect(s.lastReveal?.eliminatedId).toBe(v2)
    expect(s.lastReveal?.tally[v2]).toBe(3)
  })

  it('ADVANCE au timeout : les retardataires s’abstiennent', () => {
    let s = clueAll(make(4))
    const [v1, , v3] = s.players.map((p) => p.id)
    s = reduceImposteur(s, { type: 'VOTE', playerId: v1, targetId: v3, now: T0 })
    const after = reduceImposteur(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + IMPOSTEUR_VOTE_MS * 2,
    })
    expect(after.phase).toBe('reveal')
    expect(after.lastReveal?.eliminatedId).toBe(v3) // seul vote exprimé
  })

  it('égalité (ou zéro vote) → personne ne sort', () => {
    let s = clueAll(make(4))
    const [v1, v2, v3, v4] = s.players.map((p) => p.id)
    s = reduceImposteur(s, { type: 'VOTE', playerId: v1, targetId: v2, now: T0 })
    s = reduceImposteur(s, { type: 'VOTE', playerId: v2, targetId: v1, now: T0 })
    s = reduceImposteur(s, { type: 'VOTE', playerId: v3, targetId: v1, now: T0 })
    s = reduceImposteur(s, { type: 'VOTE', playerId: v4, targetId: v2, now: T0 })
    expect(s.phase).toBe('reveal')
    expect(s.lastReveal?.eliminatedId).toBeNull()
    expect(s.lastReveal?.tie).toBe(true)
    expect(imposteurAlive(s)).toHaveLength(4)
  })
})

describe('révélation, gorgées et victoires', () => {
  /** Élimine une cible précise via un vote unanime. */
  function eliminate(state: ImposteurState, targetId: string): ImposteurState {
    let s = state.phase === 'clue' ? clueAll(state, T0) : state
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      if (p.id === targetId) {
        const other = imposteurAlive(s).find((q) => q.id !== targetId)!
        s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: other.id, now: T0 })
      } else {
        s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId, now: T0 })
      }
    }
    return s
  }

  it('civil éliminé : 3 gorgées, mot+camp publics, la partie continue', () => {
    const s0 = make(5)
    const civil = s0.players.find((p) => p.team === 'civil')!
    const s = eliminate(s0, civil.id)
    expect(s.lastReveal).toMatchObject({
      eliminatedId: civil.id,
      team: 'civil',
      word: civil.word,
      sips: IMPOSTEUR_SIPS_CIVIL_OUT,
    })
    const next = reduceImposteur(s, { type: 'CONTINUE', playerId: civil.id, now: T0 })
    expect(next.phase).toBe('clue')
    expect(next.round).toBe(2)
    expect(next.clueOrder).toHaveLength(4)
    expect(next.clueOrder).not.toContain(civil.id)
    expect(next.lastReveal).toBeNull()
  })

  it('imposteur éliminé : 2 × survivants gorgées, victoire du village', () => {
    const s0 = make(4)
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!
    const s = eliminate(s0, imposteur.id)
    expect(s.lastReveal).toMatchObject({
      eliminatedId: imposteur.id,
      team: 'imposteur',
      sips: IMPOSTEUR_SIPS_PER_ALIVE * 3,
    })
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: imposteur.id, now: T0 })
    expect(done.phase).toBe('finished')
    expect(done.winnerTeam).toBe('civil')
  })

  it('table de 3 : la partie démarre (pas de victoire immédiate), imposteur gagne à 2', () => {
    const raw = createImposteurState(FOUR.slice(0, 3), PAIRS, 'trio', T0 - IMPOSTEUR_COUNTDOWN_MS)
    const s0 = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    expect(s0.phase).toBe('clue') // pas fini d'entrée de jeu
    const civil = s0.players.find((p) => p.team === 'civil')!
    const s = eliminate(s0, civil.id)
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: civil.id, now: T0 })
    expect(done.phase).toBe('finished') // 2 vivants dont l'imposteur
    expect(done.winnerTeam).toBe('imposteur')
  })

  it("l'imposteur gagne s'il atteint les 3 derniers", () => {
    const s0 = make(5) // 1 imposteur + 4 civils
    const civils = s0.players.filter((p) => p.team === 'civil')
    let s = eliminate(s0, civils[0].id)
    s = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[0].id, now: T0 })
    expect(s.phase).toBe('clue') // 4 vivants, on continue
    s = eliminate(s, civils[1].id)
    s = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[1].id, now: T0 })
    expect(s.phase).toBe('finished') // 3 vivants dont l'imposteur
    expect(s.winnerTeam).toBe('imposteur')
  })
})

describe('acteur courant et remplacement', () => {
  it('acteur = donneur d’indice ; null pendant le vote ; premier vivant au reveal', () => {
    let s = make(4)
    expect(currentImposteurActorId(s)).toBe(s.clueOrder[0])
    s = clueAll(s)
    expect(currentImposteurActorId(s)).toBeNull()
    const [v1, v2, v3, v4] = s.players.map((p) => p.id)
    for (const [voter, target] of [
      [v1, v2],
      [v2, v1],
      [v3, v2],
      [v4, v2],
    ] as const) {
      s = reduceImposteur(s, { type: 'VOTE', playerId: voter, targetId: target, now: T0 })
    }
    expect(s.phase).toBe('reveal')
    expect(currentImposteurActorId(s)).toBe(imposteurAlive(s)[0].id)
  })

  it('LEAVE / REJOIN / REPLACE_LEFT (contrat commun)', () => {
    let s = make(4)
    const pid = s.players[0].id
    s = reduceImposteur(s, { type: 'LEAVE', playerId: pid, at: T0 })
    expect(s.players[0].leftAt).toBe(T0)
    const back = reduceImposteur(s, { type: 'REJOIN', playerId: pid })
    expect(back.players[0].leftAt).toBeNull()
    const bot = reduceImposteur(s, { type: 'REPLACE_LEFT', now: T0 + 60_000, graceMs: 30_000 })
    expect(bot.players[0].isBot).toBe(true)
  })
})

describe('vues anti-triche', () => {
  it('mon mot seul, AUCUN camp de vivant (même pas le mien), votes = booléens', () => {
    let s = make(4)
    const me = s.players[0].id
    const view = toImposteurClientView(s, me)
    expect(view.players[0].word).toBe(s.players[0].word)
    expect(view.players[1].word).toBe('')
    expect(view.players.every((p) => p.team === null)).toBe(true) // personne ne sait !
    const json = JSON.stringify(view)
    expect(json).not.toContain('rngState')
    expect(json).not.toContain('pendingVotes')
    expect(json).not.toContain('imposteur"') // aucun camp ne fuite

    s = clueAll(s)
    s = reduceImposteur(s, { type: 'VOTE', playerId: me, targetId: s.players[1].id, now: T0 })
    const v2 = toImposteurClientView(s, me)
    expect(v2.myVote).toBe(s.players[1].id)
    expect(v2.players[0].hasVoted).toBe(true)
    // Un AUTRE viewer ne voit pas pour qui j'ai voté, juste que j'ai voté.
    const other = toImposteurClientView(s, s.players[1].id)
    expect(other.myVote).toBeNull()
    expect(other.players[0].hasVoted).toBe(true)
  })

  it('éliminé = mot+camp publics ; fin de partie = révélation complète ; TV neutre', () => {
    const s0 = make(4)
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!
    let s = clueAll(s0)
    for (const p of s0.players) {
      if (s.phase !== 'vote') break
      const target = p.id === imposteur.id ? s0.players.find((q) => q.id !== p.id)!.id : imposteur.id
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    const revealView = toImposteurSpectatorView(s)
    const outed = revealView.players.find((p) => p.id === imposteur.id)!
    expect(outed.team).toBe('imposteur')
    expect(outed.word).toBe(imposteur.word)

    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: s0.players[0].id, now: T0 })
    const finalView = toImposteurSpectatorView(done)
    expect(finalView.players.every((p) => p.word !== '' && p.team !== null)).toBe(true)

    const tvBefore = toImposteurSpectatorView(s0)
    expect(tvBefore.players.every((p) => p.word === '' && p.team === null)).toBe(true)
  })
})
