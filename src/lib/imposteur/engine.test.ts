import { describe, expect, it } from 'vitest'
import {
  cleanImposteurClue,
  isEmptyClueText,
  normalizeClue,
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
  IMPOSTEUR_REVEAL_MS,
  IMPOSTEUR_REVEAL_MIN_MS,
  IMPOSTEUR_SIPS_PER_ALIVE,
  IMPOSTEUR_VOTE_MS,
  IMPOSTEUR_SPEECH_CAP,
  imposteurCitedClue,
  type ImposteurSpeechKind,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const PAIRS: ImposteurWordPair[] = [
  { a: 'plage', b: 'piscine' },
  { a: 'café', b: 'thé' },
]

const T0 = 1_000_000

/**
 * Instant auquel le « continuer » de la révélation est recevable : le
 * plancher de lecture (F33) est toujours atteint à l'échéance de phase.
 */
function readAt(state: ImposteurState): number {
  return state.phaseEndsAt ?? T0
}
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
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[0].id, now: readAt(s) })
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

  it('un invisible, un sosie cyrillique ou grec, une forme pleine chasse ne font pas passer son mot', () => {
    for (const text of [
      'pisc\u200bine', // espace de largeur nulle
      '\u2060piscine', // gluon de mots
      'pis\u00adcine', // césure conditionnelle
      'pisc\ufeffine', // indicateur d'ordre
      'pisc\u3164ine', // remplissage hangul
      'pisc\ufe0fine', // sélecteur de variante
      'p\u0456scine', // і cyrillique
      '\u0440\u0456\u0455\u0441\u0456n\u0435', // ріѕсіnе, presque tout en cyrillique
      'P\u0399SCINE', // Ι grec
      '\uff50\uff49\uff53\uff43\uff49\uff4e\uff45', // pleine chasse
      '\u{1d429}\u{1d422}\u{1d42c}\u{1d41c}\u{1d422}\u{1d427}\u{1d41e}', // gras mathématique
    ]) {
      expect(isValidClue(text, 'piscine'), JSON.stringify(text)).toBe(false)
    }
    expect(isValidClue('c\u0430f\u0435', 'café')).toBe(false)
    expect(normalizeClue('P\u0456SC\u200bINE')).toBe('piscine')
  })

  it('un indice vide une fois nettoyé est refusé ; les vrais indices, émojis compris, passent', () => {
    for (const text of ['\u200b', '\u200b\u200d\u2060', '\u3164', '\u202e', '\u00ad']) {
      expect(isValidClue(text, 'piscine'), JSON.stringify(text)).toBe(false)
    }
    for (const text of ['été', 'soleil', 'eau chlorée', '👨\u200d🍳', '❤\ufe0f']) {
      expect(isValidClue(text, 'piscine'), text).toBe(true)
    }
  })

  it('« … » déguisé (invisible, points pleine chasse) reste un indice vide', () => {
    for (const text of ['\u200b…', '…\u2060', '\uff0e\uff0e\uff0e', '.\u200b.\u200b.']) {
      expect(isEmptyClueText(text), JSON.stringify(text)).toBe(true)
    }
    expect(isEmptyClueText('soleil')).toBe(false)
  })
})

describe('cleanImposteurClue', () => {
  it('retire les caractères de format (bidi compris) mais garde le liant des émojis', () => {
    expect(cleanImposteurClue('\u202eenicsip')).toBe('enicsip')
    expect(cleanImposteurClue(' so\u200bleil\u2066 ')).toBe('soleil')
    expect(cleanImposteurClue('👨\u200d🍳')).toBe('👨\u200d🍳')
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

  it('son mot coupé par un invisible ou écrit en sosies est refusé ; le texte gardé et diffusé est nettoyé', () => {
    const s = make(4)
    const actor = s.clueOrder[0]
    const word = s.players.find((p) => p.id === actor)!.word
    const sosies: Record<string, string> = { a: '\u0430', e: '\u0435', p: '\u0440', c: '\u0441', i: '\u0456', o: '\u043e' }
    for (const text of [
      `${word.slice(0, 2)}\u200b${word.slice(2)}`,
      [...word].map((ch) => sosies[ch] ?? ch).join(''),
      '\u200b\u2060',
    ]) {
      expect(() => reduceImposteur(s, { type: 'CLUE', playerId: actor, text, now: T0 }), JSON.stringify(text)).toThrow(
        'INVALID_CLUE'
      )
    }
    const next = reduceImposteur(s, { type: 'CLUE', playerId: actor, text: ' \u202esol\u200beil\u2069 ', now: T0 })
    expect(next.clues[0].text).toBe('soleil')
    for (const view of [toImposteurClientView(next, actor), toImposteurSpectatorView(next)]) {
      expect(JSON.stringify(view)).not.toMatch(/\\u20[0-6][0-9a-f]|[\u200b-\u200f\u202a-\u202e\u2060-\u2069]/i)
    }
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

  it('la révélation est chronométrée et ne dépend plus du seul premier vivant (F33)', () => {
    const s0 = make(5)
    const civil = s0.players.find((p) => p.team === 'civil')!
    const s = eliminate(s0, civil.id)
    expect(s.phase).toBe('reveal')
    expect(s.phaseEndsAt).toBe(T0 + IMPOSTEUR_REVEAL_MS)
    // Le premier impatient n'efface plus le mot et le camp de l'éliminé.
    expect(() =>
      reduceImposteur(s, {
        type: 'CONTINUE',
        playerId: civil.id,
        now: T0 + IMPOSTEUR_REVEAL_MIN_MS - 1,
      })
    ).toThrow('READING_TIME')
    expect(toImposteurClientView(s, civil.id).continueAt).toBe(T0 + IMPOSTEUR_REVEAL_MIN_MS)
    // À l'échéance, la manche repart toute seule (personne n'a cliqué).
    const auto = reduceImposteur(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + IMPOSTEUR_REVEAL_MS,
    })
    expect(auto.phase).toBe('clue')
    expect(auto.round).toBe(2)
  })

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
    const next = reduceImposteur(s, { type: 'CONTINUE', playerId: civil.id, now: readAt(s) })
    expect(next.phase).toBe('clue')
    expect(next.round).toBe(2)
    expect(next.clueOrder).toHaveLength(4)
    expect(next.clueOrder).not.toContain(civil.id)
    expect(next.lastReveal).toBeNull()
  })

  it('previousReveal : la révélation de la manche d’avant survit à l’ouverture de la suivante', () => {
    const s0 = make(5)
    expect(s0.previousReveal).toBeNull()
    const civil = s0.players.find((p) => p.team === 'civil')!
    const s1 = eliminate(s0, civil.id)
    const reveal1 = s1.lastReveal
    expect(s1.previousReveal).toBeNull()
    const r2 = reduceImposteur(s1, { type: 'CONTINUE', playerId: civil.id, now: readAt(s1) })
    expect(r2.round).toBe(2)
    expect(r2.lastReveal).toBeNull()
    expect(r2.previousReveal).toEqual(reveal1)
    // Manche 2 sans un seul vote : sa révélation (vide) remplace la précédente.
    let s2 = clueAll(r2)
    s2 = reduceImposteur(s2, { type: 'ADVANCE', claimedKey: phaseKey(s2), now: s2.phaseEndsAt! })
    const reveal2 = s2.lastReveal
    expect(reveal2).toMatchObject({ round: 2, eliminatedId: null })
    const r3 = reduceImposteur(s2, { type: 'ADVANCE', claimedKey: phaseKey(s2), now: s2.phaseEndsAt! })
    expect(r3.round).toBe(3)
    expect(r3.previousReveal).toEqual(reveal2)
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
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: imposteur.id, now: readAt(s) })
    expect(done.phase).toBe('finished')
    expect(done.winnerTeam).toBe('civil')
  })

  it('un bot éliminé ne boit rien, civil comme imposteur ; un humain garde ses gorgées', () => {
    const asBot = (s: ImposteurState, id: string): ImposteurState => ({
      ...s,
      players: s.players.map((p) => (p.id === id ? { ...p, isBot: true } : p)),
    })
    const s0 = make(5)
    const civil = s0.players.find((p) => p.team === 'civil')!
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!

    const botCivil = eliminate(asBot(s0, civil.id), civil.id).lastReveal
    expect(botCivil).toMatchObject({ eliminatedId: civil.id, team: 'civil', word: civil.word, sips: 0 })
    const botImposteur = eliminate(asBot(s0, imposteur.id), imposteur.id).lastReveal
    expect(botImposteur).toMatchObject({ eliminatedId: imposteur.id, team: 'imposteur', sips: 0 })

    // Même table, mêmes votes, sièges humains : barème inchangé.
    expect(eliminate(s0, civil.id).lastReveal?.sips).toBe(IMPOSTEUR_SIPS_CIVIL_OUT)
    expect(eliminate(s0, imposteur.id).lastReveal?.sips).toBe(IMPOSTEUR_SIPS_PER_ALIVE * 4)
    // Un bot À TABLE ne change rien aux gorgées d'un humain éliminé.
    expect(eliminate(asBot(s0, imposteur.id), civil.id).lastReveal?.sips).toBe(IMPOSTEUR_SIPS_CIVIL_OUT)
  })

  it('zéro voix exprimée : ni égalité ni éliminé (l’écran dit « personne n’a voté »)', () => {
    const s = clueAll(make(4))
    const after = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    expect(after.phase).toBe('reveal')
    expect(after.lastReveal).toMatchObject({ tally: {}, eliminatedId: null, tie: false, sips: 0 })
    expect(imposteurAlive(after)).toHaveLength(4)
  })

  it('table de 3 : la partie démarre (pas de victoire immédiate), imposteur gagne à 2', () => {
    const raw = createImposteurState(FOUR.slice(0, 3), PAIRS, 'trio', T0 - IMPOSTEUR_COUNTDOWN_MS)
    const s0 = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    expect(s0.phase).toBe('clue') // pas fini d'entrée de jeu
    const civil = s0.players.find((p) => p.team === 'civil')!
    const s = eliminate(s0, civil.id)
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: civil.id, now: readAt(s) })
    expect(done.phase).toBe('finished') // 2 vivants dont l'imposteur
    expect(done.winnerTeam).toBe('imposteur')
  })

  it("l'imposteur gagne s'il atteint les 3 derniers", () => {
    const s0 = make(5) // 1 imposteur + 4 civils
    const civils = s0.players.filter((p) => p.team === 'civil')
    let s = eliminate(s0, civils[0].id)
    s = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[0].id, now: readAt(s) })
    expect(s.phase).toBe('clue') // 4 vivants, on continue
    s = eliminate(s, civils[1].id)
    s = reduceImposteur(s, { type: 'CONTINUE', playerId: civils[1].id, now: readAt(s) })
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

    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: s0.players[0].id, now: readAt(s) })
    const finalView = toImposteurSpectatorView(done)
    expect(finalView.players.every((p) => p.word !== '' && p.team !== null)).toBe(true)

    const tvBefore = toImposteurSpectatorView(s0)
    expect(tvBefore.players.every((p) => p.word === '' && p.team === null)).toBe(true)
  })

  it('previousReveal passe aux vues (public) sans rien faire fuiter', () => {
    const s0 = make(5)
    const civil = s0.players.find((p) => p.team === 'civil')!
    let s = clueAll(s0)
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const target = p.id === civil.id ? imposteurAlive(s).find((q) => q.id !== p.id)!.id : civil.id
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    const next = reduceImposteur(s, { type: 'CONTINUE', playerId: civil.id, now: readAt(s) })
    expect(next.previousReveal?.eliminatedId).toBe(civil.id)
    for (const p of imposteurAlive(next)) {
      const view = toImposteurClientView(next, p.id)
      expect(view.previousReveal).toEqual(next.previousReveal)
      const json = JSON.stringify(view)
      expect(json).not.toContain('rngState')
      expect(json).not.toContain('pendingVotes')
      expect(json).not.toContain('imposteur"')
    }
    expect(toImposteurSpectatorView(next).previousReveal).toEqual(next.previousReveal)
  })

  it('lang dans la vue ; l’AUTRE mot de la paire absent pour un vivant, les deux absents en TV', () => {
    const raw = createImposteurState(FOUR, [{ a: 'plage', b: 'piscine' }], 'seed', T0, undefined, 'es')
    expect(raw.lang).toBe('es')
    expect(createImposteurState(FOUR, PAIRS, 'seed', T0).lang).toBe('fr')
    for (const p of raw.players) {
      const view = toImposteurClientView(raw, p.id)
      expect(view.lang).toBe('es')
      const json = JSON.stringify(view)
      const other = p.word === 'plage' ? 'piscine' : 'plage'
      expect(json).toContain(p.word)
      expect(json).not.toContain(other)
      expect(json).not.toContain('rngState')
      expect(json).not.toContain('pendingVotes')
      expect(json).not.toContain('imposteur"')
    }
    const tv = JSON.stringify(toImposteurSpectatorView(raw))
    expect(tv).not.toContain('plage')
    expect(tv).not.toContain('piscine')
  })
})

describe('paroles (SPEAK)', () => {
  const speak = (s: ImposteurState, playerId: string, kind: ImposteurSpeechKind, targetId: string) =>
    reduceImposteur(s, { type: 'SPEAK', playerId, kind, targetId })

  /** Joue la manche : `outId` sort par un vote unanime, puis on ouvre la suivante. */
  function nextRoundWithout(state: ImposteurState, outId: string): ImposteurState {
    let s = clueAll(state)
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const target = p.id === outId ? imposteurAlive(s).find((q) => q.id !== outId)!.id : outId
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    return reduceImposteur(s, { type: 'CONTINUE', playerId: imposteurAlive(s)[0].id, now: readAt(s) })
  }

  it('acceptée pendant les indices et le vote : ajoutée au fil, version +1, chrono intact', () => {
    const s = make(5)
    const [a, b] = s.players.map((p) => p.id)
    const said = speak(s, a, 'suspect', b)
    expect(said.speech).toEqual([{ playerId: a, kind: 'suspect', targetId: b, round: 1 }])
    expect(said.version).toBe(s.version + 1)
    expect(said.clueTurnIdx).toBe(s.clueTurnIdx)
    expect(said.phaseEndsAt).toBe(s.phaseEndsAt)
    expect(phaseKey(said)).toBe(phaseKey(s))
    const vote = clueAll(s)
    expect(vote.phase).toBe('vote')
    expect(speak(vote, a, 'intent', b).speech).toEqual([{ playerId: a, kind: 'intent', targetId: b, round: 1 }])
  })

  it('refusée en compte à rebours, révélation et fin de partie (NOT_SPEECH_PHASE)', () => {
    const raw = createImposteurState(FOUR, PAIRS, 'seed', T0)
    expect(raw.phase).toBe('countdown')
    expect(() => speak(raw, 'a', 'suspect', 'b')).toThrow('NOT_SPEECH_PHASE')

    const s0 = make(4)
    const imposteur = s0.players.find((p) => p.team === 'imposteur')!
    let s = clueAll(s0)
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const target = p.id === imposteur.id ? imposteurAlive(s).find((q) => q.id !== imposteur.id)!.id : imposteur.id
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    expect(s.phase).toBe('reveal')
    const [x, y] = imposteurAlive(s).map((p) => p.id)
    expect(() => speak(s, x, 'suspect', y)).toThrow('NOT_SPEECH_PHASE')
    const done = reduceImposteur(s, { type: 'CONTINUE', playerId: x, now: readAt(s) })
    expect(done.phase).toBe('finished')
    expect(() => speak(done, x, 'suspect', y)).toThrow('NOT_SPEECH_PHASE')
  })

  it('un éliminé ne parle plus (ELIMINATED) ; kind inconnu (INVALID_KIND) ; joueur inconnu', () => {
    const s0 = make(5)
    const out = s0.players.find((p) => p.team === 'civil')!
    const s = nextRoundWithout(s0, out.id)
    expect(s.phase).toBe('clue')
    const alive = imposteurAlive(s).map((p) => p.id)
    expect(() => speak(s, out.id, 'suspect', alive[0])).toThrow('ELIMINATED')
    expect(() => speak(s, alive[0], 'gossip' as ImposteurSpeechKind, alive[1])).toThrow('INVALID_KIND')
    expect(() => speak(s, 'nobody', 'suspect', alive[1])).toThrow('UNKNOWN_PLAYER')
  })

  it('cible : jamais soi ni un inconnu ; un éliminé seulement pour une remarque (toldYou / wrong)', () => {
    const s0 = make(5)
    const out = s0.players.find((p) => p.team === 'civil')!
    const s = nextRoundWithout(s0, out.id)
    const [a, b] = imposteurAlive(s).map((p) => p.id)
    expect(() => speak(s, a, 'suspect', a)).toThrow('INVALID_TARGET')
    expect(() => speak(s, a, 'suspect', 'nobody')).toThrow('INVALID_TARGET')
    for (const kind of ['suspect', 'defend', 'ally', 'rally', 'doubt', 'ask', 'intent'] as const) {
      expect(() => speak(s, a, kind, out.id), kind).toThrow('INVALID_TARGET')
    }
    expect(speak(s, a, 'wrong', out.id).speech?.at(-1)).toEqual({ playerId: a, kind: 'wrong', targetId: out.id, round: 2 })
    expect(speak(s, b, 'toldYou', out.id).speech?.at(-1)?.kind).toBe('toldYou')
  })

  it(`plafond de ${IMPOSTEUR_SPEECH_CAP} paroles par joueur et par manche (ALREADY_SPOKE)`, () => {
    let s = make(5)
    const [a, b, c] = s.players.map((p) => p.id)
    s = speak(s, a, 'suspect', b)
    s = speak(s, a, 'ally', c)
    s = speak(s, a, 'doubt', b)
    expect(() => speak(s, a, 'suspect', c)).toThrow('ALREADY_SPOKE')
    // Les autres gardent les leurs.
    expect(speak(s, b, 'defend', a).speech).toHaveLength(4)
  })

  it('élagage à l’ouverture de la manche : on garde celle qui s’achève, jamais plus de deux', () => {
    const s0 = make(7, 'prune')
    const [a, b] = s0.players.map((p) => p.id)
    const civils = s0.players.filter((p) => p.team === 'civil' && p.id !== a && p.id !== b)
    let s = speak(s0, a, 'suspect', b)
    s = nextRoundWithout(s, civils[0].id)
    expect(s.round).toBe(2)
    expect(s.speech).toEqual([{ playerId: a, kind: 'suspect', targetId: b, round: 1 }])
    s = speak(s, b, 'defend', a)
    s = nextRoundWithout(s, civils[1].id)
    expect(s.round).toBe(3)
    expect(s.speech).toEqual([{ playerId: b, kind: 'defend', targetId: a, round: 2 }])
  })

  it('vues téléphone et TV : le fil passe, sans rngState, pendingVotes ni camp de vivant', () => {
    let s = make(5)
    const [a, b] = s.players.map((p) => p.id)
    s = speak(s, a, 'suspect', b)
    for (const view of [toImposteurClientView(s, a), toImposteurClientView(s, b), toImposteurSpectatorView(s)]) {
      expect(view.speech).toEqual(s.speech)
      const json = JSON.stringify(view)
      expect(json).not.toContain('rngState')
      expect(json).not.toContain('pendingVotes')
      expect(json).not.toContain('imposteur"')
    }
  })

  it('état d’avant le champ (sans speech) : on parle quand même, la manche suivante élague', () => {
    const { speech: _speech, ...legacy } = make(5)
    const old = legacy as ImposteurState
    const said = speak(old, old.players[0].id, 'suspect', old.players[1].id)
    expect(said.speech).toHaveLength(1)
    const out = old.players.find((p) => p.team === 'civil' && p.id !== old.players[0].id)!
    expect(nextRoundWithout(old, out.id).speech).toEqual([])
  })

  it('indice cité par une bulle : le dernier de la cible à la manche de la parole ou avant, « … » s’il n’a rien dit', () => {
    const clues = [
      { playerId: 'a', text: 'sable', round: 1 },
      { playerId: 'b', text: 'chlore', round: 1 },
      { playerId: 'a', text: 'vagues', round: 2 },
    ]
    expect(imposteurCitedClue(clues, 'a', 2)).toBe('vagues')
    expect(imposteurCitedClue(clues, 'a', 1)).toBe('sable')
    // Accusé en manche 2 avant d'avoir parlé : la bulle cite sa manche passée, pas « … ».
    expect(imposteurCitedClue(clues, 'b', 2)).toBe('chlore')
    expect(imposteurCitedClue(clues, 'c', 2)).toBe(IMPOSTEUR_EMPTY_CLUE)
    expect(imposteurCitedClue(clues, null, 2)).toBe(IMPOSTEUR_EMPTY_CLUE)
  })
})

describe('isEmptyClueText', () => {
  it('rien que des points, quelle que soit leur forme, est un indice vide', () => {
    for (const t of ['…', '...', ' . . . ', '..…', '.']) expect(isEmptyClueText(t)).toBe(true)
  })

  it('un vrai indice, même ponctué, ne l’est pas', () => {
    for (const t of ['soleil', 'été...', '...plage', '', '   ']) expect(isEmptyClueText(t)).toBe(false)
  })
})
