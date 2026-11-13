import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLocalGameSave } from '@/lib/game-session'
import {
  PC_DEFAULT_SETTINGS,
  PC_FUSES,
  PC_IDLE_BOOMS,
  PC_SAVE_VERSION,
  PC_UNLIMITED_ROUNDS,
  activePlayerIds,
  contest,
  contestThreshold,
  createClosedGame,
  createGame,
  finish,
  isLastRound,
  isSamePcSettings,
  leave,
  nextHolderId,
  nextRound,
  normalizeWord,
  noteAttempt,
  parsePcSettings,
  pass,
  pcFuseRangeMs,
  pcTally,
  pcWordError,
  ranking,
  reject,
  rejoin,
  resolveIfExpired,
  restorePcSave,
  startRound,
  toPcPublicView,
  toPcSave,
  wordLetters,
  wordMatchesChallenge,
  type PcChallenge,
  type PcChallengeSource,
  type PcResult,
  type PcSettings,
  type PcState,
} from './engine'
import { PC_TICK_FASTEST_MS, PC_TICK_SLOWEST_MS, pcTickIntervalMs } from './tick'

const TABLE = ['alice', 'bob', 'chloe', 'dan']
/** Horloge FIXE : les échéances doivent rester déterministes. */
const T0 = 1_700_000_000_000

const SOURCE: PcChallengeSource = {
  themes: [
    { id: 'marques-voiture', text: 'Une marque de voiture' },
    { id: 'fruits', text: 'Un fruit' },
  ],
  letters: ['B', 'M'],
  syllables: ['TRA', 'ON'],
}

function expectOk(result: PcResult): PcState {
  if (!result.ok) throw new Error(`refus inattendu : ${result.error}`)
  return result.state
}

function expectError(result: PcResult): string {
  if (result.ok) throw new Error('le moteur aurait dû refuser')
  return result.error
}

/** Partie neuve, réglages par défaut surchargés, graine fixe. */
function game(
  settings: Partial<PcSettings> = {},
  playerIds: readonly string[] = TABLE,
  seed: string | number = 'soirée'
): PcState {
  return expectOk(createGame({ playerIds, settings: { ...PC_DEFAULT_SETTINGS, ...settings }, seed }))
}

/** Mèche allumée à T0 ; l'échéance est posée À LA MAIN quand le test en dépend. */
function lit(settings: Partial<PcSettings> = {}, playerIds: readonly string[] = TABLE): PcState {
  return expectOk(startRound(game(settings, playerIds), T0, SOURCE))
}

function burning(overrides: Partial<PcState> = {}, settings: Partial<PcSettings> = {}): PcState {
  return { ...lit(settings), explodeAt: T0 + 20_000, ...overrides }
}

/** Passe locale (mot dit à voix haute), avant l'échéance. */
function passOnce(state: PcState, now = T0 + 1_000): PcState {
  return expectOk(pass(state, { now }))
}

function explode(state: PcState): PcState {
  if (state.explodeAt === null) throw new Error('aucune mèche allumée')
  return resolveIfExpired(state, state.explodeAt)
}

/** Joue une manche complète : allumage, puis explosion à l'échéance. */
function playRound(state: PcState, now: number): PcState {
  return explode(expectOk(startRound(state, now, SOURCE)))
}

describe('patate-chaude — création', () => {
  it('la bombe attend chez le premier joueur, mèche éteinte, scores à zéro', () => {
    const s = game()
    expect(s.phase).toBe('ready')
    expect(s.holder).toBe('alice')
    expect(s.roundIndex).toBe(0)
    expect(s.challenge).toBeNull()
    expect(s.explodeAt).toBeNull()
    expect(s.explosions).toEqual({ alice: 0, bob: 0, chloe: 0, dan: 0 })
    expect(s.penalties).toEqual({ alice: 0, bob: 0, chloe: 0, dan: 0 })
  })

  it('refuse une table de moins de deux joueurs (un doublon ne compte qu’une fois)', () => {
    const result = createGame({ playerIds: ['alice', 'alice'], settings: PC_DEFAULT_SETTINGS, seed: 1 })
    expect(expectError(result)).toBe('NOT_ENOUGH_PLAYERS')
  })

  it('(en ligne) partie close d’emblée, quelle que soit la table : finie, sans manche ni score', () => {
    const closed = createClosedGame({ playerIds: ['alice'], settings: PC_DEFAULT_SETTINGS, seed: 1 })
    expect(closed).toMatchObject({ phase: 'finished', playerIds: ['alice'], holder: 'alice', roundIndex: 0 })
    expect(ranking(closed)).toEqual([{ playerId: 'alice', explosions: 0, penalties: 0, rank: 1, won: true }])
    expect(expectError(nextRound(closed))).toBe('WRONG_PHASE')
    expect(createClosedGame({ playerIds: [], settings: PC_DEFAULT_SETTINGS, seed: 1 }).phase).toBe('finished')
  })

  it('même graine → même défi et même mèche', () => {
    expect(lit()).toEqual(lit())
    const other = expectOk(startRound(game({}, TABLE, 'autre soirée'), T0, SOURCE))
    expect(other.explodeAt === lit().explodeAt && other.challenge?.value === lit().challenge?.value).toBe(false)
  })

  it('les réglages se relisent strictement', () => {
    expect(parsePcSettings({ challenge: 'letter', fuse: 'long', rounds: 0 })).toEqual({
      challenge: 'letter',
      fuse: 'long',
      rounds: PC_UNLIMITED_ROUNDS,
    })
    expect(parsePcSettings({ challenge: 'letter', fuse: 'long', rounds: 7 })).toBeNull()
    expect(parsePcSettings({ challenge: 'tout', fuse: 'normal', rounds: 5 })).toBeNull()
    expect(parsePcSettings(null)).toBeNull()
    expect(isSamePcSettings({ ...PC_DEFAULT_SETTINGS }, PC_DEFAULT_SETTINGS)).toBe(true)
    expect(isSamePcSettings({ ...PC_DEFAULT_SETTINGS, fuse: 'short' }, PC_DEFAULT_SETTINGS)).toBe(false)
  })
})

describe('patate-chaude — allumage de la mèche', () => {
  it('tire la mèche dans la plage du réglage, bornes comprises', () => {
    for (const fuse of PC_FUSES) {
      const range = pcFuseRangeMs(fuse)
      for (let seed = 0; seed < 40; seed += 1) {
        const s = expectOk(startRound(game({ fuse }, TABLE, seed), T0, SOURCE))
        const fuseMs = (s.explodeAt ?? 0) - T0
        expect(fuseMs).toBeGreaterThanOrEqual(range.min)
        expect(fuseMs).toBeLessThanOrEqual(range.max)
      }
    }
  })

  it('sert un défi de la sorte demandée', () => {
    expect(lit({ challenge: 'theme' }).challenge).toMatchObject({ kind: 'theme' })
    expect(lit({ challenge: 'letter' }).challenge).toMatchObject({ kind: 'letter' })
    expect(lit({ challenge: 'syllable' }).challenge).toMatchObject({ kind: 'syllable' })
    const theme = lit({ challenge: 'theme' }).challenge
    expect(SOURCE.themes.some((t) => t.id === theme?.id && t.text === theme?.value)).toBe(true)
  })

  it('Mélange : les trois sortes de défi finissent par sortir', () => {
    const kinds = new Set<string>()
    for (let seed = 0; seed < 60; seed += 1) {
      const s = expectOk(startRound(game({ challenge: 'mix' }, TABLE, seed), T0, SOURCE))
      kinds.add(s.challenge?.kind ?? '')
    }
    expect([...kinds].sort()).toEqual(['letter', 'syllable', 'theme'])
  })

  it('Mélange sans lettres ni syllabes : seulement des thèmes', () => {
    const source: PcChallengeSource = { themes: SOURCE.themes, letters: [], syllables: [' '] }
    for (let seed = 0; seed < 20; seed += 1) {
      const s = expectOk(startRound(game({ challenge: 'mix' }, TABLE, seed), T0, source))
      expect(s.challenge?.kind).toBe('theme')
    }
  })

  it('ne ressert pas un défi tant qu’il en reste un autre', () => {
    let s = playRound(game({ challenge: 'theme' }), T0)
    const first = s.challenge?.id
    s = expectOk(nextRound(s))
    s = expectOk(startRound(s, T0 + 60_000, SOURCE))
    expect(s.challenge?.id).not.toBe(first)
    // Les deux thèmes servis : ils peuvent revenir plutôt que de bloquer la partie.
    s = expectOk(startRound(expectOk(nextRound(explode(s))), T0 + 120_000, SOURCE))
    expect(s.challenge?.kind).toBe('theme')
  })

  it('sans contenu pour la sorte demandée : NO_CHALLENGE, la partie ne bouge pas', () => {
    const source: PcChallengeSource = { ...SOURCE, letters: [] }
    expect(expectError(startRound(game({ challenge: 'letter' }), T0, source))).toBe('NO_CHALLENGE')
  })

  it('refuse d’allumer une mèche déjà allumée', () => {
    expect(expectError(startRound(lit(), T0 + 1, SOURCE))).toBe('WRONG_PHASE')
  })

  it('(en ligne) mèche fournie par le serveur : ramenée dans la plage, hors du flux des défis', () => {
    const range = pcFuseRangeMs('normal')
    const at = (fuseMs: number) => expectOk(startRound(game({ fuse: 'normal' }), T0, SOURCE, { fuseMs }))
    expect(at(20_000).explodeAt).toBe(T0 + 20_000)
    expect(at(1).explodeAt).toBe(T0 + range.min)
    expect(at(999_999).explodeAt).toBe(T0 + range.max)
    expect(at(Number.NaN).explodeAt).toBe(lit({ fuse: 'normal' }).explodeAt)
    // Deux mèches différentes, tout le reste identique : défi, flux et vue publique ne trahissent rien.
    const short = at(16_000)
    const long = at(44_000)
    expect(short.rngState).toBe(long.rngState)
    expect(toPcPublicView(short)).toEqual(toPcPublicView(long))
    expect(short.explodeAt).not.toBe(long.explodeAt)
  })
})

describe('patate-chaude — passes et rejets', () => {
  it('la bombe fait le tour de la table, dans l’ordre et en boucle', () => {
    let s = burning()
    const holders = [s.holder]
    for (let i = 0; i < 4; i += 1) {
      expect(nextHolderId(s)).toBe(TABLE[(i + 1) % TABLE.length])
      s = passOnce(s)
      holders.push(s.holder)
    }
    expect(holders).toEqual(['alice', 'bob', 'chloe', 'dan', 'alice'])
    expect(s.passes).toBe(4)
  })

  it('un rejet laisse la bombe au porteur ; le deuxième de suite lui coûte une pénalité', () => {
    let s = expectOk(reject(burning(), T0 + 1_000))
    expect(s.holder).toBe('alice')
    expect(s.rejectsInARow).toBe(1)
    expect(s.penalties.alice).toBe(0)
    s = expectOk(reject(s, T0 + 2_000))
    expect(s.holder).toBe('alice')
    expect(s.rejectsInARow).toBe(0)
    expect(s.penalties.alice).toBe(1)
  })

  it('une passe remet les rejets à zéro : ils comptent par porteur', () => {
    let s = expectOk(reject(burning(), T0 + 1_000))
    s = passOnce(s)
    s = expectOk(reject(s, T0 + 2_000))
    expect(s.holder).toBe('bob')
    expect(s.rejectsInARow).toBe(1)
    expect(s.penalties).toEqual({ alice: 0, bob: 0, chloe: 0, dan: 0 })
  })

  it('aucune passe ni rejet hors d’une mèche allumée', () => {
    expect(expectError(pass(game(), { now: T0 }))).toBe('WRONG_PHASE')
    expect(expectError(reject(game(), T0))).toBe('WRONG_PHASE')
    expect(expectError(pass(explode(burning()), { now: T0 + 30_000 }))).toBe('WRONG_PHASE')
  })

  it('en ligne, seul le porteur passe la bombe', () => {
    expect(expectError(pass(burning(), { now: T0 + 1_000, by: 'bob', word: 'Renault' }))).toBe('NOT_HOLDER')
    expect(expectOk(pass(burning(), { now: T0 + 1_000, by: 'alice', word: 'Renault' })).holder).toBe('bob')
  })
})

describe('patate-chaude — explosion', () => {
  it('avant l’échéance, rien ne bouge (le même objet est rendu)', () => {
    const s = burning()
    expect(resolveIfExpired(s, T0 + 19_999)).toBe(s)
    expect(resolveIfExpired(game(), T0 + 999_999)).toEqual(game())
  })

  it('à l’échéance, celui qui tient la bombe À CET INSTANT explose', () => {
    let s = burning()
    s = passOnce(s, T0 + 4_000)
    s = passOnce(s, T0 + 9_000)
    const boom = resolveIfExpired(s, T0 + 20_000)
    expect(boom.phase).toBe('boom')
    expect(boom.lastBoom).toEqual({ playerId: 'chloe', round: 0, fuseMs: 20_000, passes: 2 })
    expect(boom.explosions).toEqual({ alice: 0, bob: 0, chloe: 1, dan: 0 })
    expect(boom.explodeAt).toBeNull()
  })

  it('une passe arrivée après l’échéance ne s’applique pas : la bombe explose chez son porteur', () => {
    const s = passOnce(burning(), T0 + 5_000)
    const late = expectOk(pass(s, { now: T0 + 20_500 }))
    expect(late.phase).toBe('boom')
    expect(late.holder).toBe('bob')
    expect(late.passes).toBe(1)
    expect(late.lastBoom?.playerId).toBe('bob')
  })

  it('un mot tapé en retard n’est même pas examiné', () => {
    const late = expectOk(pass(burning(), { now: T0 + 20_000, by: 'alice', word: 'x' }))
    expect(late.phase).toBe('boom')
    expect(late.words).toEqual([])
  })

  it('rejet, contestation et départ tardifs déclenchent aussi l’explosion', () => {
    expect(expectOk(reject(burning(), T0 + 20_000)).lastBoom?.playerId).toBe('alice')
    const said = expectOk(pass(burning({}, { challenge: 'theme' }), { now: T0 + 1_000, by: 'alice', word: 'Renault' }))
    expect(expectOk(contest(said, { by: 'chloe', now: T0 + 20_000 })).lastBoom?.playerId).toBe('bob')
    const left = expectOk(leave(passOnce(burning()), 'bob', T0 + 25_000))
    expect(left.lastBoom?.playerId).toBe('bob')
    expect(left.explosions.bob).toBe(1)
  })
})

describe('patate-chaude — mots tapés (en ligne)', () => {
  it('normalise : minuscules, sans accents ni ligatures, espaces réduits', () => {
    expect(normalizeWord('Éléphant')).toBe('elephant')
    expect(normalizeWord('  Crème   Brûlée ')).toBe('creme brulee')
    expect(normalizeWord('CŒUR')).toBe('coeur')
    expect(normalizeWord('L’Œil')).toBe("l'oeil")
    expect(normalizeWord('Año')).toBe('ano')
  })

  it('lettre : le mot normalisé commence par elle', () => {
    expect(wordMatchesChallenge('Bateau', { kind: 'letter', value: 'B' })).toBe(true)
    expect(wordMatchesChallenge('élan', { kind: 'letter', value: 'E' })).toBe(true)
    expect(wordMatchesChallenge('Arbre', { kind: 'letter', value: 'B' })).toBe(false)
  })

  it('syllabe : le mot normalisé la contient, d’un seul tenant', () => {
    expect(wordMatchesChallenge('Tracteur', { kind: 'syllable', value: 'TRA' })).toBe(true)
    expect(wordMatchesChallenge('ATTRAPER', { kind: 'syllable', value: 'tra' })).toBe(true)
    expect(wordMatchesChallenge('Théâtre', { kind: 'syllable', value: 'THEA' })).toBe(true)
    expect(wordMatchesChallenge('Bateau', { kind: 'syllable', value: 'TRA' })).toBe(false)
    // Ni à cheval sur deux mots, ni reconstituée en sautant la ponctuation.
    expect(wordMatchesChallenge('chat rapide', { kind: 'syllable', value: 'TRA' })).toBe(false)
    expect(wordMatchesChallenge('t.r.a.m', { kind: 'syllable', value: 'TRA' })).toBe(false)
    expect(wordMatchesChallenge('Château d’eau', { kind: 'syllable', value: 'EAU' })).toBe(true)
  })

  it('lettres seules : ponctuation, chiffres et caractères invisibles ne comptent pas', () => {
    expect(wordLetters('Banane!')).toBe('banane')
    expect(wordLetters('« banane. »')).toBe('banane')
    expect(wordLetters('B​ANA­NE﻿')).toBe('banane')
    expect(wordLetters('Ba-nane 2')).toBe('banane')
    expect(wordLetters('L’Œil')).toBe('loeil')
    expect(wordLetters('b1.')).toBe('b')
    expect(wordLetters('́́')).toBe('')
  })

  it('thème : rien de vérifiable, seul un mot vide échoue', () => {
    expect(wordMatchesChallenge('Peugeot', { kind: 'theme', id: 'marques-voiture', value: 'Une marque de voiture' })).toBe(true)
    expect(wordMatchesChallenge('   ', { kind: 'theme', value: 'Un fruit' })).toBe(false)
  })

  it('refuse un mot trop court, trop long, déjà dit, hors lettre ou sans la syllabe ; la bombe reste', () => {
    const theme = burning({ challenge: { kind: 'theme', id: 'marques-voiture', value: 'Une marque de voiture' } })
    expect(expectError(pass(theme, { now: T0 + 1_000, by: 'alice', word: ' a ' }))).toBe('WORD_TOO_SHORT')
    // Des accents seuls ne font pas un mot, même au défi Thème.
    expect(expectError(pass(theme, { now: T0 + 1_000, by: 'alice', word: '\u0301\u0301\u0301' }))).toBe('WORD_TOO_SHORT')
    expect(expectError(pass(theme, { now: T0 + 1_000, by: 'alice', word: 'x'.repeat(31) }))).toBe('WORD_TOO_LONG')
    const said = expectOk(pass(theme, { now: T0 + 1_000, by: 'alice', word: '  Citroën ' }))
    expect(said.words).toEqual([{ player: 'alice', word: 'Citroën', struck: false }])
    expect(expectError(pass(said, { now: T0 + 2_000, by: 'bob', word: 'citroen' }))).toBe('WORD_ALREADY_SAID')

    const letter = burning({ challenge: { kind: 'letter', value: 'B' } })
    expect(expectError(pass(letter, { now: T0 + 1_000, by: 'alice', word: 'Arbre' }))).toBe('WORD_WRONG_LETTER')
    const syllable = burning({ challenge: { kind: 'syllable', value: 'TRA' } })
    expect(expectError(pass(syllable, { now: T0 + 1_000, by: 'alice', word: 'Bateau' }))).toBe('WORD_MISSING_SYLLABLE')
    expect(expectOk(pass(syllable, { now: T0 + 1_000, by: 'alice', word: 'Tramway' })).holder).toBe('bob')
  })

  it('doublons déguisés et mots sans lettres refusés', () => {
    const letter = burning({ challenge: { kind: 'letter', value: 'B' } })
    for (const word of ['b.', 'b1', 'b !', '​b​', '🍌🍌']) {
      expect(pcWordError(letter, word), word).toBe('WORD_TOO_SHORT')
    }
    const said = expectOk(pass(letter, { now: T0 + 1_000, by: 'alice', word: 'Banane' }))
    for (const word of ['Banane!', 'banane.', 'B​ANANE', 'Ba-nane', 'Banane2', '« BANANE »']) {
      expect(pcWordError(said, word), word).toBe('WORD_ALREADY_SAID')
    }
    // Ce qui s'affiche est nettoyé des caractères invisibles ; chiffres et ponctuation restent lisibles.
    const theme = burning({ challenge: { kind: 'theme', id: 'marques-voiture', value: 'Une marque de voiture' } })
    const typed = expectOk(pass(theme, { now: T0 + 1_000, by: 'alice', word: ' Peu​geot  208 ' }))
    expect(typed.words[0].word).toBe('Peugeot 208')
    expect(pcWordError(typed, 'Peugeot 3008')).toBe('WORD_ALREADY_SAID')
    expect(pcWordError(typed, 'Pomme.')).toBeNull()
  })
})

describe('patate-chaude — contestation (en ligne)', () => {
  const themeRound = (playerIds: readonly string[] = TABLE): PcState => ({
    ...expectOk(startRound(game({ challenge: 'theme' }, playerIds), T0, SOURCE)),
    explodeAt: T0 + 30_000,
  })
  const say = (state: PcState, word: string, now = T0 + 1_000): PcState =>
    expectOk(pass(state, { now, by: state.holder, word }))
  const FIVE = ['alice', 'bob', 'chloe', 'dan', 'eve']

  it('seuil : la moitié des votants (ni l’auteur, ni le porteur), deux au moins ; rien sous quatre joueurs', () => {
    expect(contestThreshold(say(themeRound(['alice', 'bob']), 'Renault'))).toBeNull()
    expect(contestThreshold(say(themeRound(['alice', 'bob', 'chloe']), 'Renault'))).toBeNull()
    expect(contestThreshold(say(themeRound(), 'Renault'))).toBe(2)
    expect(contestThreshold(say(themeRound(FIVE), 'Renault'))).toBe(2)
    expect(contestThreshold(say(themeRound(['a', 'b', 'c', 'd', 'e', 'f']), 'Renault'))).toBe(2)
    expect(contestThreshold(say(themeRound(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'Renault'))).toBe(3)
    expect(contestThreshold(say(themeRound(Array.from({ length: 12 }, (_, i) => `p${i}`)), 'Renault'))).toBe(5)
  })

  it('à deux ou trois, personne ne raye : ni le receveur seul, ni le troisième joueur', () => {
    const duo = say(themeRound(['alice', 'bob']), 'Renault')
    expect(expectError(contest(duo, { by: 'bob', now: T0 + 2_000 }))).toBe('HOLDER_CANNOT_CONTEST')
    const trio = say(themeRound(['alice', 'bob', 'chloe']), 'Renault')
    expect(expectError(contest(trio, { by: 'bob', now: T0 + 2_000 }))).toBe('HOLDER_CANNOT_CONTEST')
    expect(expectError(contest(trio, { by: 'chloe', now: T0 + 2_000 }))).toBe('CONTEST_NEEDS_MORE_PLAYERS')
    expect(trio.penalties.alice).toBe(0)
  })

  it('à quatre : le porteur ne vote pas, les deux autres raient le mot ensemble', () => {
    let s = say(themeRound(), 'Banane')
    expect(s.holder).toBe('bob')
    expect(expectError(contest(s, { by: 'bob', now: T0 + 1_500 }))).toBe('HOLDER_CANNOT_CONTEST')
    s = expectOk(contest(s, { by: 'chloe', now: T0 + 2_000 }))
    expect(s.contests).toEqual(['chloe'])
    expect(s.holder).toBe('bob')
    s = expectOk(contest(s, { by: 'dan', now: T0 + 3_000 }))
    expect(s.words).toEqual([{ player: 'alice', word: 'Banane', struck: true }])
    expect(s.holder).toBe('alice')
    expect(s.penalties.alice).toBe(1)
    expect(s.openWord).toBeNull()
    // Le mot rayé reste « déjà dit » : on ne le rejoue pas tel quel.
    expect(expectError(pass(s, { now: T0 + 4_000, by: 'alice', word: 'banane' }))).toBe('WORD_ALREADY_SAID')
  })

  it('une fois la bombe repassée, seul le nouveau mot est contestable', () => {
    let s = say(themeRound(), 'Renault')
    s = say(s, 'Fiat', T0 + 2_000)
    s = expectOk(contest(s, { by: 'dan', now: T0 + 3_000 }))
    s = expectOk(contest(s, { by: 'alice', now: T0 + 3_500 }))
    expect(s.words).toEqual([
      { player: 'alice', word: 'Renault', struck: false },
      { player: 'bob', word: 'Fiat', struck: true },
    ])
    expect(s.holder).toBe('bob')
  })

  it('tous les défis se contestent : le serveur ne sait pas si « bxx » est un mot', () => {
    for (const challenge of [
      { kind: 'letter', value: 'B' },
      { kind: 'syllable', value: 'TRA' },
    ] as const) {
      const junk = challenge.kind === 'letter' ? 'Bxx' : 'Traxx'
      let s = expectOk(pass(burning({ challenge }), { now: T0 + 1_000, by: 'alice', word: junk }))
      s = expectOk(contest(s, { by: 'chloe', now: T0 + 2_000 }))
      s = expectOk(contest(s, { by: 'dan', now: T0 + 2_500 }))
      expect(s.words[0].struck).toBe(true)
      expect(s.holder).toBe('alice')
    }
  })

  it('un vote posé ne compte plus si son auteur prend la bombe', () => {
    let s = say(themeRound(FIVE), 'Renault')
    s = expectOk(contest(s, { by: 'chloe', now: T0 + 2_000 }))
    // Bob s'en va : la bombe passe à Chloé, qui ne peut plus peser sur le mot.
    s = expectOk(leave(s, 'bob', T0 + 2_500))
    expect(s.holder).toBe('chloe')
    s = expectOk(contest(s, { by: 'dan', now: T0 + 3_000 }))
    expect(s.words[0].struck).toBe(false)
    expect(s.contests).toEqual(['dan'])
  })

  it('refus : son propre mot, deux fois, rien à contester, joueur inconnu', () => {
    const s = say(themeRound(), 'Renault')
    expect(expectError(contest(s, { by: 'alice', now: T0 + 2_000 }))).toBe('OWN_WORD')
    const once = expectOk(contest(s, { by: 'chloe', now: T0 + 2_000 }))
    expect(expectError(contest(once, { by: 'chloe', now: T0 + 2_500 }))).toBe('ALREADY_CONTESTED')
    expect(expectError(contest(s, { by: 'zoe', now: T0 + 2_000 }))).toBe('UNKNOWN_PLAYER')
    expect(expectError(contest(passOnce(themeRound()), { by: 'chloe', now: T0 + 2_000 }))).toBe('NOTHING_TO_CONTEST')
    expect(expectError(contest(game(), { by: 'chloe', now: T0 }))).toBe('WRONG_PHASE')
  })
})

describe('patate-chaude — manches et fin de partie', () => {
  it('la manche suivante commence chez le perdant, mèche éteinte', () => {
    const boom = explode(passOnce(passOnce(burning())))
    const next = expectOk(nextRound(boom))
    expect(next.phase).toBe('ready')
    expect(next.roundIndex).toBe(1)
    expect(next.holder).toBe('chloe')
    expect(next.challenge).toBeNull()
    expect(next.passes).toBe(0)
    expect(next.explosions.chloe).toBe(1)
  })

  it('fin après N manches', () => {
    let s = game({ rounds: 5 })
    for (let round = 0; round < 5; round += 1) {
      s = playRound(s, T0 + round * 100_000)
      expect(isLastRound(s)).toBe(round === 4)
      s = expectOk(nextRound(s))
    }
    expect(s.phase).toBe('finished')
    expect(Object.values(s.explosions).reduce((a, b) => a + b, 0)).toBe(5)
    expect(expectError(nextRound(s))).toBe('WRONG_PHASE')
    expect(expectError(finish(s, T0))).toBe('WRONG_PHASE')
  })

  it('illimité : aucune fin automatique, « Terminer » arrête la partie', () => {
    let s = game({ rounds: PC_UNLIMITED_ROUNDS })
    for (let round = 0; round < 12; round += 1) s = expectOk(nextRound(playRound(s, T0 + round * 100_000)))
    expect(s.phase).toBe('ready')
    expect(s.roundIndex).toBe(12)
    expect(expectOk(finish(s, T0 + 2_000_000)).phase).toBe('finished')
  })

  it('« Terminer » pendant une mèche : manche abandonnée, sauf si la mèche était au bout', () => {
    const early = expectOk(finish(burning(), T0 + 5_000))
    expect(early.phase).toBe('finished')
    expect(early.explosions.alice).toBe(0)
    expect(early.explodeAt).toBeNull()
    const late = expectOk(finish(burning(), T0 + 20_000))
    expect(late.phase).toBe('finished')
    expect(late.explosions.alice).toBe(1)
  })

  it('aucune manche suivante avant le BOUM', () => {
    expect(expectError(nextRound(game()))).toBe('WRONG_PHASE')
    expect(expectError(nextRound(burning()))).toBe('WRONG_PHASE')
  })
})

describe('patate-chaude — classement et barème', () => {
  it('le moins d’explosions gagne, puis le moins de pénalités ; rang « compétition »', () => {
    const s: PcState = {
      ...game(),
      explosions: { alice: 1, bob: 0, chloe: 0, dan: 2 },
      penalties: { alice: 0, bob: 2, chloe: 2, dan: 0 },
    }
    expect(ranking(s)).toEqual([
      { playerId: 'bob', explosions: 0, penalties: 2, rank: 1, won: true },
      { playerId: 'chloe', explosions: 0, penalties: 2, rank: 1, won: true },
      { playerId: 'alice', explosions: 1, penalties: 0, rank: 3, won: false },
      { playerId: 'dan', explosions: 2, penalties: 0, rank: 4, won: false },
    ])
  })

  it('3 gorgées par explosion et 1 par pénalité ; en Soft, 1 point chacune', () => {
    expect(pcTally({ explosions: 2, penalties: 1 }, 'alcool')).toBe(7)
    expect(pcTally({ explosions: 2, penalties: 1 }, 'soft')).toBe(3)
  })
})

describe('patate-chaude — départs (en ligne)', () => {
  it('un joueur parti est sauté à la passe, et reprend sa place à son retour', () => {
    let s = expectOk(leave(burning(), 'bob', T0 + 1_000))
    expect(nextHolderId(s)).toBe('chloe')
    s = passOnce(s)
    expect(s.holder).toBe('chloe')
    s = expectOk(rejoin(s, 'bob'))
    s = passOnce(passOnce(passOnce(s)))
    expect(s.holder).toBe('bob')
  })

  it('le porteur qui s’en va passe la bombe au suivant actif', () => {
    const s = expectOk(leave(burning(), 'alice', T0 + 1_000))
    expect(s.holder).toBe('bob')
    expect(s.phase).toBe('burning')
  })

  it('le perdant parti : la manche suivante commence chez le suivant actif', () => {
    const boom = explode(passOnce(burning()))
    const next = expectOk(nextRound(expectOk(leave(boom, 'bob', T0 + 30_000))))
    expect(next.holder).toBe('chloe')
  })

  it('moins de deux joueurs actifs : la mèche s’éteint, et l’allumage suivant est refusé', () => {
    const duo = expectOk(startRound(game({}, ['alice', 'bob']), T0, SOURCE))
    const alone = expectOk(leave(duo, 'alice', T0 + 1_000))
    // La partie n'est pas close par le départ : la route d'action la terminera (résultats, journal).
    expect(alone).toMatchObject({ phase: 'ready', challenge: null, explodeAt: null, holder: 'bob' })
    expect(expectError(startRound(alone, T0 + 2_000, SOURCE))).toBe('NOT_ENOUGH_PLAYERS')
    expect(expectOk(finish(alone, T0 + 2_000)).phase).toBe('finished')
    // Entre deux manches : l'écran du BOUM reste, la manche suivante n'a pas lieu.
    const boom = expectOk(leave(explode(duo), 'alice', T0 + 30_000))
    expect(boom.phase).toBe('boom')
    expect(expectOk(nextRound(boom)).phase).toBe('finished')
  })

  it('départ ou retour d’un inconnu refusé, départ répété sans effet', () => {
    expect(expectError(leave(burning(), 'zoe', T0))).toBe('UNKNOWN_PLAYER')
    expect(expectError(rejoin(burning(), 'zoe'))).toBe('UNKNOWN_PLAYER')
    const left = expectOk(leave(burning(), 'dan', T0 + 1_000))
    expect(expectOk(leave(left, 'dan', T0 + 2_000))).toBe(left)
  })
})

describe('patate-chaude — joueur qui ne joue plus (en ligne)', () => {
  /** Manche allumée à `now`, mèche de 20 s, puis BOUM sans que personne ne joue. */
  const silentRound = (state: PcState, now: number): PcState =>
    explode({ ...expectOk(startRound(state, now, SOURCE)), explodeAt: now + 20_000 })
  const online = (state: PcState): PcState => expectOk(nextRound(state, { skipIdle: true }))

  it('un porteur muet ne bloque pas plus d’une manche au démarrage', () => {
    const first = silentRound(game(), T0)
    expect(first.lastBoom).toMatchObject({ playerId: 'alice', passes: 0 })
    // La bombe n'a pas bougé de la manche : la suivante repart du voisin, pas d'Alice.
    expect(online(first).holder).toBe('bob')
    // Le jeu local, lui, garde sa règle : la manche repart du perdant.
    expect(expectOk(nextRound(first)).holder).toBe('alice')
  })

  it('deux explosions sans rien jouer : mis de côté, sauté, jusqu’à son retour', () => {
    let s = online(silentRound(game(), T0))
    // Bob, Chloé et Dan jouent ; Alice reçoit la bombe et n'y touche pas.
    s = expectOk(startRound(s, T0 + 60_000, SOURCE))
    s = { ...s, explodeAt: T0 + 80_000 }
    for (const now of [T0 + 61_000, T0 + 62_000, T0 + 63_000]) s = expectOk(pass(s, { now }))
    expect(s.holder).toBe('alice')
    s = explode(s)
    expect(s.lastBoom).toMatchObject({ playerId: 'alice', passes: 3 })
    s = online(s)
    expect(s.absent).toEqual(['alice'])
    expect(s.holder).toBe('bob')
    expect(activePlayerIds(s)).toEqual(['bob', 'chloe', 'dan'])
    // La table tourne sans elle…
    s = expectOk(startRound(s, T0 + 120_000, SOURCE))
    s = passOnce(passOnce(passOnce(s, T0 + 121_000), T0 + 122_000), T0 + 123_000)
    expect(s.holder).toBe('bob')
    // … et la reprend dès son retour, compteur remis à zéro.
    s = expectOk(rejoin(s, 'alice'))
    expect(s.absent).toEqual([])
    expect(passOnce(s, T0 + 124_000).holder).toBe('chloe')
    expect(passOnce(passOnce(passOnce(s, T0 + 124_000), T0 + 125_000), T0 + 126_000).holder).toBe('alice')
  })

  it('jouer remet le compteur à zéro : une explosion malchanceuse ne met personne de côté', () => {
    let s = silentRound(game(), T0)
    s = online(s)
    s = expectOk(startRound(s, T0 + 60_000, SOURCE))
    s = { ...s, explodeAt: T0 + 80_000 }
    // Bob passe ; la bombe fait le tour et Alice, revenue entre-temps, passe aussi.
    for (const now of [T0 + 61_000, T0 + 62_000, T0 + 63_000, T0 + 64_000]) s = expectOk(pass(s, { now }))
    expect(s.holder).toBe('bob')
    s = online(explode(s))
    expect(s.absent).toEqual([])
    expect(s.holder).toBe('bob')
  })

  it(`à deux, personne n’est mis de côté, même muet après ${PC_IDLE_BOOMS} explosions : la partie continue`, () => {
    let s = online(silentRound(game({}, ['alice', 'bob']), T0))
    expect(s.holder).toBe('bob')
    s = expectOk(startRound(s, T0 + 60_000, SOURCE))
    s = explode({ ...passOnce(s, T0 + 61_000), explodeAt: T0 + 80_000 })
    expect(s.lastBoom?.playerId).toBe('alice')
    expect(s.idleBooms.alice).toBe(PC_IDLE_BOOMS)
    // La mettre de côté laisserait Bob seul : la partie s'arrêterait net, au milieu.
    const next = online(s)
    expect(next.phase).toBe('ready')
    expect(next.roundIndex).toBe(2)
    expect(next.absent).toEqual([])
    // La bombe a bougé pendant la manche : la suivante repart de la perdante.
    expect(next.holder).toBe('alice')
    // Et si elle ne joue toujours pas, la règle du voisin suffit : la bombe repart de Bob.
    const stalled = online(silentRound(next, T0 + 120_000))
    expect(stalled.absent).toEqual([])
    expect(stalled.holder).toBe('bob')
  })

  it('à deux, un mot refusé puis deux BOUM chez le même joueur : la partie continue', () => {
    const J: PcChallenge = { kind: 'letter', value: 'J' }
    // Manche 1 : Bob tient la bombe ; « pomme » est refusé sur le J, son écran le signale, BOUM.
    let s: PcState = { ...expectOk(startRound(game({ rounds: 5 }, ['bob', 'alice']), T0, SOURCE)), challenge: J }
    s = { ...s, explodeAt: T0 + 24_000 }
    expect(expectError(pass(s, { now: T0 + 5_000, by: 'bob', word: 'pomme' }))).toBe('WORD_WRONG_LETTER')
    s = expectOk(noteAttempt(s, { by: 'bob', now: T0 + 5_100 }))
    s = explode(s)
    expect(s.lastBoom).toMatchObject({ playerId: 'bob', passes: 0 })
    s = online(s)
    // Bombe immobile : la manche 2 part d'Alice, qui passe ; Bob saute encore.
    expect(s.holder).toBe('alice')
    s = { ...expectOk(startRound(s, T0 + 60_000, SOURCE)), challenge: J, explodeAt: T0 + 89_000 }
    s = explode(expectOk(pass(s, { now: T0 + 61_000, by: 'alice', word: 'Jambon' })))
    expect(s.explosions.bob).toBe(2)
    s = online(s)
    expect(s.phase).toBe('ready')
    expect(s.roundIndex).toBe(2)
    expect(s.absent).toEqual([])
    expect(s.holder).toBe('bob')
  })

  it('un mot refusé compte comme un coup joué : qui cherche n’est pas mis de côté', () => {
    const B: PcChallenge = { kind: 'letter', value: 'B' }
    // Manche 1 : Alice cherche, ses mots sont refusés, la bombe n'a pas bougé quand elle saute.
    let s: PcState = { ...expectOk(startRound(game(), T0, SOURCE)), challenge: B, explodeAt: T0 + 20_000 }
    expect(expectError(pass(s, { now: T0 + 3_000, by: 'alice', word: 'Avion' }))).toBe('WORD_WRONG_LETTER')
    s = online(explode(expectOk(noteAttempt(s, { by: 'alice', now: T0 + 3_100 }))))
    expect(s.idleBooms.alice).toBe(0)
    expect(s.holder).toBe('bob')
    // Manche 2 : la bombe lui revient juste avant le BOUM, sans lui laisser le temps de jouer.
    s = { ...expectOk(startRound(s, T0 + 60_000, SOURCE)), explodeAt: T0 + 80_000 }
    for (const now of [T0 + 61_000, T0 + 62_000, T0 + 79_500]) s = expectOk(pass(s, { now }))
    expect(s.holder).toBe('alice')
    s = online(explode(s))
    // Une seule explosion « sans rien jouer » : elle reste dans l'ordre de passe.
    expect(s.idleBooms.alice).toBe(1)
    expect(s.absent).toEqual([])
  })

  it('un BOUM chez qui a joué pendant la mèche ne compte pas comme une absence', () => {
    let s = expectOk(startRound(game(), T0, SOURCE))
    s = { ...s, explodeAt: T0 + 20_000 }
    // Alice passe, la bombe fait le tour et lui revient : elle saute chez elle.
    for (const now of [T0 + 1_000, T0 + 2_000, T0 + 3_000, T0 + 4_000]) s = expectOk(pass(s, { now }))
    expect(s.holder).toBe('alice')
    expect(s.played).toEqual(['alice', 'bob', 'chloe', 'dan'])
    s = explode(s)
    expect(s.idleBooms.alice).toBe(0)
    expect(s.played).toEqual([])
  })

  it('noteAttempt : une fois par mèche, pendant la mèche seulement ; une mèche échue saute ensuite', () => {
    const s = burning()
    const noted = expectOk(noteAttempt(s, { by: 'alice', now: T0 + 1_000 }))
    expect(noted.played).toEqual(['alice'])
    // Rien de plus à noter : le même objet, que l'adaptateur n'écrit pas.
    expect(expectOk(noteAttempt(noted, { by: 'alice', now: T0 + 2_000 }))).toBe(noted)
    expect(expectError(noteAttempt(game(), { by: 'alice', now: T0 }))).toBe('WRONG_PHASE')
    expect(expectError(noteAttempt(s, { by: 'zoe', now: T0 }))).toBe('UNKNOWN_PLAYER')
    expect(expectError(noteAttempt({ ...s, absent: ['bob'] }, { by: 'bob', now: T0 }))).toBe('UNKNOWN_PLAYER')
    // Mot refusé juste avant l'échéance, signe reçu juste après : noté d'abord, puis le BOUM.
    const late = expectOk(noteAttempt({ ...s, idleBooms: { ...s.idleBooms, alice: 1 } }, { by: 'alice', now: T0 + 20_500 }))
    expect(late.phase).toBe('boom')
    expect(late.lastBoom?.playerId).toBe('alice')
    expect(late.idleBooms.alice).toBe(0)
  })
})

describe('patate-chaude — vue publique', () => {
  it('ne transmet ni l’échéance ni la graine, mais garde l’allumage pour le tic-tac', () => {
    const s = burning({ explodeAt: T0 + 23_456 })
    const view = toPcPublicView(s)
    expect(view).not.toHaveProperty('explodeAt')
    expect(view).not.toHaveProperty('rngState')
    expect(view).not.toHaveProperty('usedChallenges')
    expect(view).not.toHaveProperty('idleBooms')
    expect(view).not.toHaveProperty('played')
    expect(JSON.stringify(view)).not.toContain(String(T0 + 23_456))
    expect(view.roundStartedAt).toBe(T0)
    expect(view.holder).toBe('alice')
    expect(view.challenge).toEqual(s.challenge)
  })

  it('après le BOUM, la durée de la mèche devient publique', () => {
    const view = toPcPublicView(explode(passOnce(burning())))
    expect(view.lastBoom).toEqual({ playerId: 'bob', round: 0, fuseMs: 20_000, passes: 1 })
  })
})

describe('patate-chaude — pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let s = expectOk(startRound(game({ challenge: 'theme' }), T0, SOURCE))
    s = expectOk(pass(s, { now: T0 + 1_000, by: 'alice', word: 'Renault' }))
    s = expectOk(noteAttempt(s, { by: 'bob', now: T0 + 1_200 }))
    s = expectOk(contest(s, { by: 'chloe', now: T0 + 1_500 }))
    s = expectOk(reject(s, T0 + 2_000))
    s = expectOk(leave(s, 'dan', T0 + 2_500))
    s = expectOk(rejoin(s, 'dan'))
    s = expectOk(nextRound(explode(s)))
    expect(expectOk(finish(s, T0 + 90_000)).phase).toBe('finished')
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})

describe('patate-chaude — reprise locale', () => {
  const roundTrip = (state: PcState): unknown =>
    parseLocalGameSave<unknown>(
      JSON.stringify({ version: PC_SAVE_VERSION, savedAt: T0, state: toPcSave(state) }),
      PC_SAVE_VERSION,
      T0 + 1_000
    )

  it('entre deux manches : reprise à l’identique', () => {
    const s = expectOk(nextRound(playRound(game({ rounds: 5 }), T0)))
    expect(restorePcSave(roundTrip(s), TABLE)).toEqual(s)
    const boom = playRound(s, T0 + 100_000)
    expect(restorePcSave(roundTrip(boom), TABLE)).toEqual(boom)
  })

  it('une mèche ne se sauvegarde pas : la manche reprend avant l’allumage, bombe chez son porteur', () => {
    const s = expectOk(reject(expectOk(reject(passOnce(passOnce(burning())), T0 + 2_000)), T0 + 3_000))
    const restored = restorePcSave(roundTrip(s), TABLE)
    expect(restored?.phase).toBe('ready')
    expect(restored?.holder).toBe('chloe')
    expect(restored?.challenge).toBeNull()
    expect(restored?.explodeAt).toBeNull()
    expect(restored?.roundStartedAt).toBeNull()
    expect(restored?.penalties.chloe).toBe(1)
    expect(restored?.roundIndex).toBe(0)
  })

  it('réglages hors défaut : la partie reprend avec LES SIENS, et « Rejouer » les garde', () => {
    const own: PcSettings = { challenge: 'letter', fuse: 'short', rounds: 5 }
    const s = expectOk(nextRound(playRound(game(own), T0)))
    const restored = restorePcSave(roundTrip(s), TABLE)
    expect(restored?.settings).toEqual(own)
    expect(restored?.roundIndex).toBe(1)
    // L'écran relance avec game.settings, pas avec le pré-lobby revenu aux défauts au rechargement.
    const replay = expectOk(createGame({ playerIds: TABLE, settings: restored?.settings ?? PC_DEFAULT_SETTINGS, seed: 'rejouer' }))
    expect(replay.settings).toEqual(own)
  })

  it('même table dans un autre ordre : l’ordre courant fait foi', () => {
    const reversed = [...TABLE].reverse()
    expect(restorePcSave(roundTrip(game()), reversed)?.playerIds).toEqual(reversed)
  })

  it('illisible ou d’une autre table → null', () => {
    const save = roundTrip(game()) as Record<string, unknown>
    expect(restorePcSave(null, TABLE)).toBeNull()
    expect(restorePcSave('partie', TABLE)).toBeNull()
    expect(restorePcSave({ ...save, settings: { ...PC_DEFAULT_SETTINGS, rounds: 3 } }, TABLE)).toBeNull()
    expect(restorePcSave(save, ['alice', 'bob', 'chloe'])).toBeNull()
    expect(restorePcSave(save, ['alice', 'bob', 'chloe', 'eve'])).toBeNull()
    expect(restorePcSave({ ...save, phase: 'burning' }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, phase: 'finished' }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, holder: 'zoe' }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, explosions: { alice: -1 } }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, roundIndex: 10 }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, phase: 'boom', lastBoom: null }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, challenge: { kind: 'rime', value: 'ON' } }, TABLE)).toBeNull()
    expect(restorePcSave({ ...save, rngState: 'graine' }, TABLE)).toBeNull()
  })
})

describe('patate-chaude — tic-tac', () => {
  it('accélère avec le temps écoulé rapporté à la borne haute, sans dépasser ses bornes', () => {
    const max = pcFuseRangeMs('normal').max
    expect(pcTickIntervalMs(0, max)).toBe(PC_TICK_SLOWEST_MS)
    expect(pcTickIntervalMs(-500, max)).toBe(PC_TICK_SLOWEST_MS)
    expect(pcTickIntervalMs(max, max)).toBe(PC_TICK_FASTEST_MS)
    expect(pcTickIntervalMs(max * 3, max)).toBe(PC_TICK_FASTEST_MS)
    let previous = Infinity
    for (let elapsed = 0; elapsed <= max; elapsed += 1_500) {
      const interval = pcTickIntervalMs(elapsed, max)
      expect(interval).toBeLessThanOrEqual(previous)
      previous = interval
    }
  })

  it('à la mèche la plus courte de la plage, le tic-tac est encore loin de sa cadence finale', () => {
    const range = pcFuseRangeMs('normal')
    expect(pcTickIntervalMs(range.min, range.max)).toBeGreaterThan(PC_TICK_FASTEST_MS * 2)
  })
})
